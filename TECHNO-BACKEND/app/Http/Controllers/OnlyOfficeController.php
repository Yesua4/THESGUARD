<?php
namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesDocumentAccess;
use App\Models\Document;
use App\Models\GroupMember;
use App\Models\ProjectMember;
use App\Models\User;
use App\Services\DocumentVersionService;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Throwable;

// Word-quality editing of uploaded .docx files with a self-hosted ONLYOFFICE
// Document Server (Community Edition). Switched on by setting
// ONLYOFFICE_URL + ONLYOFFICE_JWT_SECRET (and ONLYOFFICE_BACKEND_URL, this
// backend's public address, which the Document Server calls back).
//
// Flow: the browser asks config() for a signed editor config -> the editor
// downloads the file from file() (signed, short-lived URL) -> when everyone
// has closed the editor, ONLYOFFICE posts to callback() with the edited
// file's URL -> that becomes a new version of the document. One editing
// session = one new version.
class OnlyOfficeController extends Controller {
    use AuthorizesDocumentAccess;

    private const EDITABLE = ['docx'];
    private const VIEWABLE = ['docx', 'doc', 'odt', 'rtf'];

    public static function enabled(): bool {
        return (bool) (config('services.onlyoffice.url') && config('services.onlyoffice.jwt_secret') && self::backendUrl());
    }

    private static function backendUrl(): ?string {
        $url = config('services.onlyoffice.backend_url');
        return $url ? rtrim($url, '/') : null;
    }

    public function status() {
        return response()->json([
            'enabled' => self::enabled(),
            'server_url' => self::enabled() ? rtrim(config('services.onlyoffice.url'), '/') : null,
        ]);
    }

    // Editor settings for one document, signed so the Document Server trusts them.
    public function config(Request $request, $id) {
        abort_unless(self::enabled(), 503, 'The document editor is not set up yet.');
        $user = $request->user();
        $document = Document::with('project')->findOrFail($id);
        $this->authorizeDocumentAccess($user, $document->project_id);

        $ext = strtolower(pathinfo((string) $document->file_path, PATHINFO_EXTENSION));
        abort_unless($document->file_path && in_array($ext, self::VIEWABLE, true), 422, 'Only Word documents can be opened in the editor.');

        $mode = $this->canEdit($user, $document, $ext) ? 'edit' : 'view';
        $base = self::backendUrl();
        $key = 'tg' . $document->id . '-' . substr(sha1($document->file_path . '|' . optional($document->updated_at)->timestamp), 0, 16);
        $title = (DocumentVersionService::TYPE_LABELS[$document->type] ?? 'Document') . " v{$document->version}.{$ext}";

        $config = [
            'document' => [
                'fileType' => $ext,
                'key' => $key,
                'title' => $title,
                'url' => $base . URL::temporarySignedRoute('onlyoffice.file', now()->addHours(6), ['id' => $document->id], false),
                'permissions' => [
                    'edit' => $mode === 'edit', 'download' => true, 'print' => true,
                    'comment' => false, 'review' => false, // reviewers comment in ThesisGuard
                ],
            ],
            'documentType' => 'word',
            'editorConfig' => [
                'mode' => $mode,
                'lang' => 'en',
                'callbackUrl' => $base . URL::temporarySignedRoute('onlyoffice.callback', now()->addDays(2), ['id' => $document->id], false),
                'user' => ['id' => (string) $user->id, 'name' => $user->name],
                'customization' => ['autosave' => true, 'forcesave' => false, 'compactHeader' => true, 'comments' => false, 'help' => false],
            ],
        ];
        $config['token'] = JWT::encode($config, config('services.onlyoffice.jwt_secret'), 'HS256');

        return response()->json([
            'server_url' => rtrim(config('services.onlyoffice.url'), '/'),
            'mode' => $mode,
            'config' => $config,
        ]);
    }

    // Only the students of the project edit, and only the newest version of a
    // .docx once the title is approved. Everyone else who can see it views.
    private function canEdit(User $user, Document $document, string $ext): bool {
        if (!in_array($ext, self::EDITABLE, true) || $user->role !== 'student') return false;
        if ($document->project?->title_status !== 'approved') return false;
        $isMember = ProjectMember::where('project_id', $document->project_id)->where('user_id', $user->id)->exists()
            || ($document->project?->group_id && GroupMember::where('group_id', $document->project->group_id)->where('user_id', $user->id)->exists());
        if (!$isMember) return false;
        $latest = Document::where('project_id', $document->project_id)->where('type', $document->type)->max('version');
        return (int) $latest === (int) $document->version;
    }

    // The Document Server downloads the file here (signed, expiring URL).
    public function file($id) {
        $document = Document::findOrFail($id);
        abort_unless($document->file_path && Storage::disk('local')->exists($document->file_path), 404);
        return Storage::disk('local')->download($document->file_path, basename($document->file_path));
    }

    // The Document Server reports editing status here. Status 2 = everyone
    // closed the editor and there are changes -> save as a new version.
    public function callback(Request $request, DocumentVersionService $versions, $id) {
        $secret = config('services.onlyoffice.jwt_secret');
        if (!$secret) return response()->json(['error' => 1]);

        $token = $request->input('token') ?: $request->bearerToken();
        try {
            $data = (array) json_decode(json_encode(JWT::decode((string) $token, new Key($secret, 'HS256'))), true);
        } catch (Throwable $e) {
            Log::warning("ONLYOFFICE callback for document {$id} had an invalid token: {$e->getMessage()}");
            return response()->json(['error' => 1], 403);
        }
        $data = $data['payload'] ?? $data; // header-token variant wraps the body

        $status = (int) ($data['status'] ?? 0);
        if (!in_array($status, [2, 6], true)) return response()->json(['error' => 0]);

        $document = Document::with('project')->find($id);
        $fileUrl = (string) ($data['url'] ?? '');
        if (!$document || !$document->project || !$fileUrl) return response()->json(['error' => 1]);

        // Only ever fetch from our own Document Server.
        $allowedHost = parse_url((string) config('services.onlyoffice.url'), PHP_URL_HOST);
        $fileHost = parse_url($fileUrl, PHP_URL_HOST);
        if (!$allowedHost || !$fileHost || strcasecmp($allowedHost, $fileHost) !== 0) {
            Log::warning("ONLYOFFICE callback for document {$id}: refused file URL host {$fileHost}");
            return response()->json(['error' => 1]);
        }

        // ONLYOFFICE can repeat a callback; save each editing session once.
        if (!Cache::add('onlyoffice-saved:' . ($data['key'] ?? $id), true, now()->addDays(3))) {
            return response()->json(['error' => 0]);
        }

        try {
            $res = Http::timeout(60)->get($fileUrl);
            if (!$res->successful()) throw new \RuntimeException('download failed with ' . $res->status());
            $path = "documents/{$document->project_id}/" . Str::uuid() . '.docx';
            Storage::disk('local')->put($path, $res->body());

            // Credit the student who edited (first editor in the session).
            $editorId = (int) (($data['users'][0] ?? null) ?: $document->uploaded_by);
            if (!self::userCanAccessProject(User::find($editorId) ?? new User(['role' => 'none']), $document->project_id)) {
                $editorId = (int) $document->uploaded_by;
            }

            $versions->create($document->project, $document->type, $editorId, $path,
                "Edited in ThesisGuard (from v{$document->version})", null, 'Edited');
        } catch (Throwable $e) {
            Cache::forget('onlyoffice-saved:' . ($data['key'] ?? $id));
            Log::error("ONLYOFFICE save for document {$id} failed: {$e->getMessage()}");
            return response()->json(['error' => 1]);
        }

        return response()->json(['error' => 0]);
    }
}
