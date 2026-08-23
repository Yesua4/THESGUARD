<?php
namespace App\Services;

use Illuminate\Filesystem\Filesystem;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

// Converts an uploaded Word document to PDF via a headless LibreOffice
// install, so it can be shown through the same in-app PDF viewer used for
// native PDFs instead of forcing a download-only fallback.
//
// Uses proc_open() directly rather than Laravel's Process facade: on Windows,
// Symfony's Process component always wraps the command through `cmd /C`,
// and that wrapping made soffice.exe exit(1) with no output whenever it was
// spawned from a real web request (confirmed reproducible: identical args via
// raw proc_open() succeed instantly, every time, from the same request).
// proc_open() with an array command bypasses the shell entirely and works
// on both Windows and Linux.
class DocumentPreviewService {
    public function convertToPdf(string $storedPath): ?string {
        $binary = config('services.libreoffice_path');
        if (!$binary) {
            Log::warning('Document preview conversion skipped: no LibreOffice binary configured.');
            return null;
        }

        $sourceFullPath = Storage::disk('local')->path($storedPath);
        $outDir = storage_path('app/tmp/previews');
        if (!is_dir($outDir)) mkdir($outDir, 0755, true);

        // Each conversion gets its own LibreOffice user profile: soffice enforces a
        // single-instance lock per profile, so concurrent requests sharing the
        // default profile could otherwise fail to acquire it.
        $profileDir = storage_path('app/tmp/lo_profile_' . uniqid());
        if (!is_dir($profileDir)) mkdir($profileDir, 0755, true);
        $profileUri = 'file:///' . str_replace('\\', '/', $profileDir);

        $cmd = [
            $binary, '--headless', '--norestore', "-env:UserInstallation={$profileUri}",
            '--convert-to', 'pdf', '--outdir', $outDir, $sourceFullPath,
        ];

        [$exitCode, $output, $errorOutput] = $this->run($cmd, 60);

        (new Filesystem())->deleteDirectory($profileDir);

        if ($exitCode !== 0) {
            Log::error("Document preview conversion failed for {$storedPath}: exit={$exitCode} out=[{$output}] err=[{$errorOutput}]");
            return null;
        }

        $convertedFullPath = $outDir . DIRECTORY_SEPARATOR . pathinfo($sourceFullPath, PATHINFO_FILENAME) . '.pdf';
        if (!file_exists($convertedFullPath)) {
            Log::error("Document preview conversion produced no output for {$storedPath}");
            return null;
        }

        $previewStoredPath = 'documents/previews/' . uniqid('preview_', true) . '.pdf';
        Storage::disk('local')->put($previewStoredPath, file_get_contents($convertedFullPath));
        @unlink($convertedFullPath);

        return $previewStoredPath;
    }

    // Converts an uploaded Word document to HTML so it can be opened in the
    // in-app rich-text editor (RichTextEditor.jsx) instead of only being
    // viewable/downloadable. Returns just the <body> content, with any
    // embedded images LibreOffice extracts alongside the HTML inlined as
    // base64 data URIs — the editor's saved content has no separate asset
    // storage, so a file reference would break as soon as the temp dir is
    // cleaned up.
    public function convertToHtml(string $storedPath): ?string {
        $binary = config('services.libreoffice_path');
        if (!$binary) {
            Log::warning('Document HTML conversion skipped: no LibreOffice binary configured.');
            return null;
        }

        $sourceFullPath = Storage::disk('local')->path($storedPath);
        $outDir = storage_path('app/tmp/html_' . uniqid());
        if (!is_dir($outDir)) mkdir($outDir, 0755, true);

        $profileDir = storage_path('app/tmp/lo_profile_' . uniqid());
        if (!is_dir($profileDir)) mkdir($profileDir, 0755, true);
        $profileUri = 'file:///' . str_replace('\\', '/', $profileDir);

        $cmd = [
            $binary, '--headless', '--norestore', "-env:UserInstallation={$profileUri}",
            '--convert-to', 'html', '--outdir', $outDir, $sourceFullPath,
        ];

        [$exitCode, $output, $errorOutput] = $this->run($cmd, 60);
        (new Filesystem())->deleteDirectory($profileDir);

        if ($exitCode !== 0) {
            Log::error("Document HTML conversion failed for {$storedPath}: exit={$exitCode} out=[{$output}] err=[{$errorOutput}]");
            (new Filesystem())->deleteDirectory($outDir);
            return null;
        }

        $htmlFile = $outDir . DIRECTORY_SEPARATOR . pathinfo($sourceFullPath, PATHINFO_FILENAME) . '.html';
        if (!file_exists($htmlFile)) {
            Log::error("Document HTML conversion produced no output for {$storedPath}");
            (new Filesystem())->deleteDirectory($outDir);
            return null;
        }

        $raw = file_get_contents($htmlFile);
        $bodyHtml = $this->extractBody($raw);
        $bodyHtml = $this->inlineImages($bodyHtml, $outDir);

        (new Filesystem())->deleteDirectory($outDir);
        return $bodyHtml;
    }

    private function extractBody(string $raw): string {
        $dom = new \DOMDocument();
        libxml_use_internal_errors(true);
        $dom->loadHTML($raw, LIBXML_NOERROR | LIBXML_NOWARNING);
        libxml_clear_errors();

        $body = $dom->getElementsByTagName('body')->item(0);
        if (!$body) return '';

        $html = '';
        foreach ($body->childNodes as $child) {
            $html .= $dom->saveHTML($child);
        }
        return $html;
    }

    private function inlineImages(string $html, string $outDir): string {
        foreach (glob($outDir . DIRECTORY_SEPARATOR . '*') as $file) {
            $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            if (!in_array($ext, ['png', 'jpg', 'jpeg', 'gif'], true)) continue;

            $filename = basename($file);
            $mime = $ext === 'jpg' ? 'jpeg' : $ext;
            $dataUri = 'data:image/' . $mime . ';base64,' . base64_encode(file_get_contents($file));
            $html = str_replace('src="' . $filename . '"', 'src="' . $dataUri . '"', $html);
        }
        return $html;
    }

    private function run(array $cmd, int $timeoutSeconds): array {
        $proc = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($proc)) {
            return [1, '', 'Failed to start process.'];
        }

        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);
        $output = '';
        $errorOutput = '';
        $start = microtime(true);

        while (true) {
            $output .= stream_get_contents($pipes[1]);
            $errorOutput .= stream_get_contents($pipes[2]);

            $status = proc_get_status($proc);
            if (!$status['running']) {
                fclose($pipes[1]);
                fclose($pipes[2]);
                proc_close($proc);
                return [$status['exitcode'], $output, $errorOutput];
            }

            if (microtime(true) - $start > $timeoutSeconds) {
                proc_terminate($proc);
                fclose($pipes[1]);
                fclose($pipes[2]);
                proc_close($proc);
                return [1, $output, 'Conversion timed out.'];
            }

            usleep(100_000);
        }
    }
}
