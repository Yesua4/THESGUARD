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
        return (bool) (self::serverUrl() && config('services.onlyoffice.jwt_secret') && self::backendUrl());
    }

    // Where the Document Server is right now: the address the defense laptop
    // registered (it changes each time the laptop starts the editor, and
    // lapses on its own if the laptop goes offline), else ONLYOFFICE_URL.
    public static function serverUrl(): ?string {
        $url = \App\Models\AppSetting::get('onlyoffice_url') ?: config('services.onlyoffice.url');
        return $url ? rtrim($url, '/') : null;
    }

    // The defense laptop's start/stop scripts call this with a short-lived
    // token signed with the shared ONLYOFFICE secret. url = null switches the
    // editor off. The address lapses after 15 minutes unless refreshed (the
    // start script refreshes it every few minutes while it runs).
    public function register(Request $request) {
        $secret = config('services.onlyoffice.jwt_secret');
        abort_unless($secret, 503, 'The editor secret is not set up on the server.');
        try {
            $data = (array) JWT::decode((string) $request->input('token'), new Key($secret, 'HS256'));
        } catch (Throwable $e) {
            return response()->json(['message' => 'Invalid token.'], 403);
        }
        abort_unless(($data['purpose'] ?? null) === 'register', 403, 'Invalid token.');
        // Must be a fresh, short-lived token (no long-lived replays).
        abort_unless(isset($data['exp']) && (int) $data['exp'] - time() <= 600, 403, 'Invalid token.');
        $url = $data['url'] ?? null;
        if ($url !== null) {
            abort_unless(is_string($url) && preg_match('#^https://[a-z0-9.-]+(:\d+)?/?$#i', $url), 422, 'The editor address must be an https:// address.');
            \App\Models\AppSetting::put('onlyoffice_url', rtrim($url, '/'), now()->addMinutes(15));
        } else {
            \App\Models\AppSetting::put('onlyoffice_url', null);
        }
        return response()->json(['enabled' => self::enabled(), 'server_url' => self::serverUrl()]);
    }

    private static function backendUrl(): ?string {
        $url = config('services.onlyoffice.backend_url');
        return $url ? rtrim($url, '/') : null;
    }

    public function status() {
        return response()->json([
            'enabled' => self::enabled(),
            'server_url' => self::enabled() ? self::serverUrl() : null,
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
            'server_url' => self::serverUrl(),
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
        $document = Document::with('project')->find($id);
        if (!$document || !$document->project) return response()->json(['error' => 1]);
        return $this->saveFromCallback($request, $versions, "document {$id}",
            fn () => [$document->project, $document->type, (int) $document->uploaded_by, "Edited in ThesisGuard (from v{$document->version})", 'Edited']);
    }

    // "Write in the Word editor": a blank thesis page (A4, 1.5" left margin,
    // Arial 12) that becomes the next version of this chapter when saved.
    // Nothing is created until the student actually writes something.
    public function configNew(Request $request, $projectId) {
        abort_unless(self::enabled(), 503, 'The document editor is not set up yet.');
        $user = $request->user();
        $data = $request->validate(['type' => 'required|in:' . implode(',', array_keys(DocumentVersionService::TYPE_LABELS))]);
        $project = \App\Models\Project::findOrFail($projectId);
        abort_unless($user->role === 'student' && self::userCanAccessProject($user, $project->id), 403, 'Only the students of this project can write its documents.');
        abort_unless($project->title_status === 'approved', 403, 'Title must be approved before writing documents.');

        $base = self::backendUrl();
        $label = DocumentVersionService::TYPE_LABELS[$data['type']];
        $config = [
            'document' => [
                'fileType' => 'docx',
                'key' => 'tgnew' . $project->id . '-' . Str::random(20),
                'title' => "{$label} (new).docx",
                'url' => $base . URL::temporarySignedRoute('onlyoffice.template', now()->addHours(6), [], false),
                'permissions' => ['edit' => true, 'download' => true, 'print' => true, 'comment' => false, 'review' => false],
            ],
            'documentType' => 'word',
            'editorConfig' => [
                'mode' => 'edit',
                'lang' => 'en',
                'callbackUrl' => $base . URL::temporarySignedRoute('onlyoffice.callback-new', now()->addDays(2), ['project' => $project->id, 'type' => $data['type'], 'user' => $user->id], false),
                'user' => ['id' => (string) $user->id, 'name' => $user->name],
                'customization' => ['autosave' => true, 'forcesave' => false, 'compactHeader' => true, 'comments' => false, 'help' => false],
            ],
        ];
        $config['token'] = JWT::encode($config, config('services.onlyoffice.jwt_secret'), 'HS256');
        return response()->json(['server_url' => self::serverUrl(), 'mode' => 'edit', 'config' => $config]);
    }

    public function template() {
        return response()->download(resource_path('templates/blank-thesis.docx'), 'blank-thesis.docx');
    }

    public function callbackNew(Request $request, DocumentVersionService $versions, $project, $type, $user) {
        $p = \App\Models\Project::find($project);
        if (!$p || !array_key_exists($type, DocumentVersionService::TYPE_LABELS)) return response()->json(['error' => 1]);
        return $this->saveFromCallback($request, $versions, "new {$type} of project {$project}",
            fn () => [$p, $type, (int) $user, 'Written in ThesisGuard', 'Wrote']);
    }

    // The Document Server reports editing status here. Status 2 = everyone
    // closed the editor and there are changes -> save as a new version.
    // Only with a valid token, only from our own Document Server, and each
    // editing session once (ONLYOFFICE can repeat a callback).
    private function saveFromCallback(Request $request, DocumentVersionService $versions, string $what, callable $target) {
        $secret = config('services.onlyoffice.jwt_secret');
        if (!$secret) return response()->json(['error' => 1]);

        $token = $request->input('token') ?: $request->bearerToken();
        try {
            $data = (array) json_decode(json_encode(JWT::decode((string) $token, new Key($secret, 'HS256'))), true);
        } catch (Throwable $e) {
            Log::warning("ONLYOFFICE callback for {$what} had an invalid token: {$e->getMessage()}");
            return response()->json(['error' => 1], 403);
        }
        $data = $data['payload'] ?? $data; // header-token variant wraps the body

        $status = (int) ($data['status'] ?? 0);
        if (!in_array($status, [2, 6], true)) return response()->json(['error' => 0]);

        $fileUrl = (string) ($data['url'] ?? '');
        if (!$fileUrl) return response()->json(['error' => 1]);
        $allowedHost = parse_url((string) self::serverUrl(), PHP_URL_HOST);
        $fileHost = parse_url($fileUrl, PHP_URL_HOST);
        if (!$allowedHost || !$fileHost || strcasecmp($allowedHost, $fileHost) !== 0) {
            Log::warning("ONLYOFFICE callback for {$what}: refused file URL host {$fileHost}");
            return response()->json(['error' => 1]);
        }

        $onceKey = 'onlyoffice-saved:' . ($data['key'] ?? $what);
        if (!Cache::add($onceKey, true, now()->addDays(3))) return response()->json(['error' => 0]);

        try {
            [$project, $type, $fallbackUserId, $note, $verb] = $target();
            $res = Http::timeout(60)->get($fileUrl);
            if (!$res->successful()) throw new \RuntimeException('download failed with ' . $res->status());
            $path = "documents/{$project->id}/" . Str::uuid() . '.docx';
            Storage::disk('local')->put($path, $res->body());

            // Credit the student who edited (first editor in the session).
            $editorId = (int) (($data['users'][0] ?? null) ?: $fallbackUserId);
            if (!self::userCanAccessProject(User::find($editorId) ?? new User(['role' => 'none']), $project->id)) {
                $editorId = $fallbackUserId;
            }
            $versions->create($project, $type, $editorId, $path, $note, null, $verb);
        } catch (Throwable $e) {
            Cache::forget($onceKey);
            Log::error("ONLYOFFICE save for {$what} failed: {$e->getMessage()}");
            return response()->json(['error' => 1]);
        }

        return response()->json(['error' => 0]);
    }
}
