<?php
namespace App\Services;

use App\Http\Controllers\Concerns\AuthorizesDocumentAccess;
use App\Models\Document;
use App\Models\DocumentComment;
use App\Models\DocumentCommentAttempt;
use App\Models\DocumentCommentEvent;
use App\Models\Group;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Rules for the verified comment workflow -- one place, enforced by the API
 * (the frontend only mirrors them via each comment's `can` flags):
 *
 *   open ──student starts──▶ in_progress ──student submits a saved revision──▶ awaiting_verification
 *     awaiting_verification ──verifier approves──▶ resolved
 *     awaiting_verification ──verifier requests more──▶ reopened ──▶ in_progress ──▶ …
 *     resolved ──verifier reopens──▶ reopened
 *
 * Verifier = the comment's author while they still have access to the
 * project; otherwise the group's current adviser ("on behalf of"). The
 * admin monitors but never verifies someone else's comment, and a student
 * can never resolve.
 */
class CommentReviewService {
    public const OPEN = 'open';
    public const IN_PROGRESS = 'in_progress';
    public const AWAITING = 'awaiting_verification';
    public const RESOLVED = 'resolved';
    public const REOPENED = 'reopened';

    public const LABELS = [
        self::OPEN => 'Needs revision', self::IN_PROGRESS => 'In progress',
        self::AWAITING => 'Awaiting verification', self::RESOLVED => 'Resolved', self::REOPENED => 'Reopened',
    ];

    public const TYPE_LABELS = [
        'proposal' => 'Proposal', 'chapter1' => 'Chapter 1', 'chapter2' => 'Chapter 2', 'chapter3' => 'Chapter 3',
        'chapter4' => 'Chapter 4', 'chapter5' => 'Chapter 5', 'final_manuscript' => 'Final Manuscript',
    ];

    public function __construct(
        private NotificationService $notifications,
        private ActivityBroadcastService $activity,
    ) {}

    // ── Who ───────────────────────────────────────────────────

    private array $studentMemo = [];

    public function isProjectStudent(User $user, int $projectId): bool {
        return $this->studentMemo["{$user->id}:{$projectId}"] ??= $user->role === 'student'
            && ProjectMember::where('project_id', $projectId)->where('user_id', $user->id)->exists();
    }

    public function isFaculty(User $user): bool {
        return in_array($user->role, ['adviser', 'instructor', 'panelist', 'admin'], true);
    }

    public function adviserOf(Project $project): ?int {
        return $project->adviser_id
            ?: ($project->group_id ? Group::whereKey($project->group_id)->value('adviser_id') : null);
    }

    // Per-request memo: a comment list asks this for every comment, and
    // most comments share a handful of authors.
    private array $verifierMemo = [];

    /** @return array{0: ?int, 1: bool} [verifier user id, is on behalf of the author] */
    public function verifierFor(DocumentComment $comment, Project $project): array {
        $key = $comment->user_id . ':' . $project->id;
        if (isset($this->verifierMemo[$key])) return $this->verifierMemo[$key];

        $author = $comment->user ?? User::find($comment->user_id);
        if ($author && AuthorizesDocumentAccess::userCanAccessProject($author, $project->id)) {
            return $this->verifierMemo[$key] = [$author->id, false];
        }
        $adviser = $this->adviserOf($project);
        return $this->verifierMemo[$key] = [$adviser, (bool) $adviser];
    }

    public function permissions(User $user, DocumentComment $comment, Project $project): array {
        $status = $comment->review_status ?: self::OPEN;
        $student = $this->isProjectStudent($user, $project->id);
        [$verifierId] = $this->verifierFor($comment, $project);
        $verifier = $verifierId && (int) $verifierId === (int) $user->id;
        $hasHistory = ($comment->relationLoaded('replies') ? $comment->replies->isNotEmpty() : $comment->replies()->exists())
            || ($comment->relationLoaded('attempts') ? $comment->attempts->isNotEmpty() : $comment->attempts()->exists());

        return [
            'reply'   => true, // everyone who can see the document (already checked) can reply
            'start'   => $student && in_array($status, [self::OPEN, self::REOPENED], true),
            'submit'  => $student && in_array($status, [self::OPEN, self::IN_PROGRESS, self::REOPENED], true),
            'verify'  => $verifier && $status === self::AWAITING,
            'reopen'  => $verifier && $status === self::RESOLVED,
            // The verifier may also close their own comment directly (e.g. no
            // longer relevant) -- recorded in the timeline like everything else.
            'resolve' => $verifier && in_array($status, [self::OPEN, self::IN_PROGRESS, self::REOPENED], true),
            // Deleting is only allowed before anything happened on it.
            'delete'  => (int) $comment->user_id === (int) $user->id && !$hasHistory && $status === self::OPEN,
        ];
    }

    // ── Transitions ───────────────────────────────────────────

    /**
     * Moves a comment to a new status if nobody else changed it since the
     * caller loaded it (lock_version), and records the timeline entry.
     * Returns false on a conflicting concurrent update.
     */
    public function transition(DocumentComment $comment, string $to, User $by, int $expectedLock, array $event = [], array $extra = []): bool {
        $from = $comment->review_status ?: self::OPEN;

        $changed = DocumentComment::whereKey($comment->id)
            ->where('lock_version', $expectedLock)
            ->update(array_merge([
                'review_status' => $to,
                'status'        => $to === self::RESOLVED ? 'resolved' : 'open',
                'lock_version'  => $expectedLock + 1,
                'resolved_at'   => $to === self::RESOLVED ? now() : null,
                'resolved_by'   => $to === self::RESOLVED ? $by->id : null,
                'updated_at'    => now(),
            ], $to === self::RESOLVED ? [] : ['verified_on_behalf_of' => null], $extra));

        if (!$changed) return false;

        $this->log($comment, $by, $event['type'] ?? 'status_changed', $from, $to, $event['note'] ?? null, $event['document_id'] ?? null, $event['attempt_id'] ?? null);
        $comment->refresh();
        return true;
    }

    public function log(DocumentComment $comment, ?User $by, string $type, ?string $from = null, ?string $to = null, ?string $note = null, ?int $documentId = null, ?int $attemptId = null): void {
        DocumentCommentEvent::create([
            'comment_id' => $comment->id, 'user_id' => $by?->id, 'type' => $type,
            'from_status' => $from, 'to_status' => $to, 'note' => $note,
            'document_id' => $documentId, 'attempt_id' => $attemptId,
        ]);
    }

    /**
     * The saved revision a fix is submitted against must be a NEWER version
     * of the same chapter than the one the comment was made on -- and newer
     * than the revision of any earlier (rejected) attempt. A reply alone is
     * never proof that the document changed.
     */
    public function validRevision(DocumentComment $comment, int $revisionId): ?string {
        $origin = Document::find($comment->document_id);
        $revision = Document::find($revisionId);
        if (!$origin || !$revision || (int) $revision->project_id !== (int) $origin->project_id || $revision->type !== $origin->type) {
            return 'Choose a saved version of this same chapter.';
        }
        if ($revision->version <= $origin->version) {
            return "Save your corrections as a new version first (newer than v{$origin->version}, where this comment was made).";
        }
        $lastRevisionId = DocumentCommentAttempt::where('comment_id', $comment->id)->orderByDesc('attempt_no')->value('revision_document_id');
        if ($lastRevisionId) {
            $last = Document::find($lastRevisionId);
            if ($last && $revision->version <= $last->version) {
                return "Your previous attempt used v{$last->version}. Save your new corrections as a newer version before resubmitting.";
            }
        }
        return null;
    }

    // ── Notifications + live updates ──────────────────────────

    public function chapterLabel(Document $document): string {
        return (self::TYPE_LABELS[$document->type] ?? 'Document') . " (v{$document->version})";
    }

    public function notifyStudents(Project $project, DocumentComment $comment, User $actor, string $title, string $message): void {
        $ids = ProjectMember::where('project_id', $project->id)->pluck('user_id');
        foreach ($ids as $id) {
            if ((int) $id === (int) $actor->id) continue;
            $this->notifications->send($id, 'comment', $title, $message, $project->id, $comment->document_id, $comment->id);
        }
    }

    public function notifyUser(?int $userId, Project $project, DocumentComment $comment, User $actor, string $title, string $message): void {
        if (!$userId || (int) $userId === (int) $actor->id) return;
        $user = User::find($userId);
        if (!$user || !AuthorizesDocumentAccess::userCanAccessProject($user, $project->id)) return;
        $this->notifications->send($userId, 'comment', $title, $message, $project->id, $comment->document_id, $comment->id);
    }

    public function broadcast(Project $project, DocumentComment $comment, string $type): void {
        $this->activity->broadcast($project->id, $type, ['document_id' => (int) $comment->document_id, 'comment_id' => (int) $comment->id]);
    }

    // Runs a multi-step change atomically.
    public function atomically(callable $fn) {
        return DB::transaction($fn);
    }
}
