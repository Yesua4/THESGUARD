<?php
namespace App\Http\Controllers;
use App\Http\Controllers\Concerns\AuthorizesDocumentAccess;
use App\Models\Contribution;
use App\Models\Document;
use App\Models\DocumentComment;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\DocumentCommentEvent;
use App\Services\ActivityBroadcastService;
use App\Services\CommentReviewService;
use App\Services\NotificationService;
use App\Support\DocumentCommentPresenter;
use Illuminate\Http\Request;

class DocumentCommentController extends Controller {
    use AuthorizesDocumentAccess;

    public function __construct(
        private NotificationService $notifications,
        private ActivityBroadcastService $activity,
        private CommentReviewService $review,
    ) {}

    // This version's comments, plus still-unresolved comments made on EARLIER
    // versions of the same chapter. Those keep their own document_id (the
    // version they were made on -- comments are never moved); `origin_version`
    // tells the viewer to look for their quoted text in this version and to
    // flag them "anchor needs review" if it can't be found.
    public function index(Request $request, $documentId) {
        $document = Document::findOrFail($documentId);
        $this->authorizeDocumentAccess($request->user(), $document->project_id);

        $earlierVersionIds = Document::where('project_id', $document->project_id)
            ->where('type', $document->type)
            ->where('version', '<', $document->version)
            ->pluck('id');

        $comments = DocumentComment::with('user:id,name,role,avatar', 'resolver:id,name,role', 'document:id,version')
            ->where(fn ($q) => $q
                ->where('document_id', $document->id)
                ->orWhere(fn ($c) => $c
                    ->whereIn('document_id', $earlierVersionIds)
                    ->where('status', '!=', 'resolved')))
            ->orderBy('page_number')
            ->orderBy('created_at')
            ->get()
            ->map(function ($c) use ($document) {
                $c->origin_version = $c->document?->version;
                $c->carried = (int) $c->document_id !== (int) $document->id;
                $c->unsetRelation('document');
                return $c;
            });

        $user = $request->user();
        $project = Project::findOrFail($document->project_id);

        // Timeline: the first time a student of the project sees a comment.
        if ($this->review->isProjectStudent($user, $project->id) && $comments->isNotEmpty()) {
            $seen = DocumentCommentEvent::whereIn('comment_id', $comments->pluck('id'))
                ->where('user_id', $user->id)->where('type', 'viewed')->pluck('comment_id')->all();
            foreach ($comments->pluck('id')->diff($seen) as $id) {
                DocumentCommentEvent::create(['comment_id' => $id, 'user_id' => $user->id, 'type' => 'viewed']);
            }
        }

        $out = [];
        foreach ($comments as $c) {
            $row = DocumentCommentPresenter::present($c, $user, $project, $this->review);
            $row['origin_version'] = $c->origin_version;
            $row['carried'] = $c->carried;
            $out[] = $row;
        }
        return response()->json($out);
    }

    public function store(Request $request, $documentId) {
        $document = Document::findOrFail($documentId);
        $this->authorizeDocumentAccess($request->user(), $document->project_id);
        // Faculty raise concerns; students answer them in the thread (replies)
        // and by submitting corrections -- they don't open new comments.
        abort_unless($this->review->isFaculty($request->user()), 403, 'Students respond to comments by replying in the thread.');

        $data = $request->validate([
            'page_number'   => 'required|integer|min:1',
            'selected_text' => 'nullable|string|max:5000',
            // Legacy: an array of highlight boxes or an {x, y} point.
            // v2: {v, kind, quote{exact,prefix,suffix}, start, end, rects?, block_id?}
            // (see src/utils/commentAnchor.js).
            'anchor'        => ['nullable', 'array', function ($attr, $value, $fail) {
                if (strlen(json_encode($value)) > 20000) $fail('The comment anchor is too large.');
            }],
            'anchor.kind'         => 'sometimes|in:pdf,html',
            'anchor.quote'        => 'sometimes|array',
            'anchor.quote.exact'  => 'sometimes|string|max:5000',
            'anchor.quote.prefix' => 'sometimes|nullable|string|max:200',
            'anchor.quote.suffix' => 'sometimes|nullable|string|max:200',
            'anchor.block_id'     => 'sometimes|nullable|string|max:64',
            'comment'       => 'required|string|max:5000',
        ]);
        $data['document_id'] = $documentId;
        $data['user_id']     = $request->user()->id;

        $data['review_status'] = CommentReviewService::OPEN;
        $comment = DocumentComment::create($data);
        $commenter = $request->user();
        $this->review->log($comment, $commenter, 'created', null, CommentReviewService::OPEN, null, $document->id);

        Contribution::create([
            'project_id'  => $document->project_id,
            'user_id'     => $commenter->id,
            'action'      => 'document_comment',
            'description' => "Added a comment on page {$data['page_number']} of document #{$documentId}",
        ]);

        $this->notifyOnComment($document, $commenter, $data['page_number'], $comment->id);

        $comment->load('user');
        $this->activity->broadcast($document->project_id, 'comment_created', [
            'document_id' => (int) $documentId,
            'comment'     => $comment,
        ]);

        $project = Project::find($document->project_id);
        return response()->json(DocumentCommentPresenter::present($comment, $commenter, $project, $this->review), 201);
    }

    /**
     * Let the "other side" of the review know new feedback landed — students
     * get notified when their adviser/instructor comments, and vice versa.
     */
    private function notifyOnComment(Document $document, $commenter, int $pageNumber, int $commentId): void {
        $project = Project::find($document->project_id);
        if (!$project) return;

        // Only faculty create comments, so this goes to the project's students.
        $chapter = $this->review->chapterLabel($document);
        foreach (ProjectMember::where('project_id', $project->id)->pluck('user_id')->unique() as $userId) {
            if ($userId == $commenter->id) continue;
            $this->notifications->send(
                $userId, 'comment', '💬 New Comment',
                "{$commenter->name} commented on page {$pageNumber} of {$chapter} of \"{$project->title}\".",
                $project->id, $document->id, $commentId
            );
        }
    }

    // Direct resolve / reopen by the comment's verifier (its author, or the
    // group adviser if the author is no longer assigned). Students and the
    // admin can't; a correction awaiting verification goes through verify.
    public function resolve(Request $request, $documentId, $commentId) {
        $user = $request->user();
        $document = Document::findOrFail($documentId);
        $this->authorizeDocumentAccess($user, $document->project_id);
        $project = Project::findOrFail($document->project_id);

        $comment = DocumentComment::with('user')->where('document_id', $documentId)->where('id', $commentId)->firstOrFail();
        $data = $request->validate([
            'status'       => 'required|in:open,resolved',
            'lock_version' => 'sometimes|integer',
            'note'         => 'nullable|string|max:2000',
        ]);
        $can = $this->review->permissions($user, $comment, $project);
        $lock = $data['lock_version'] ?? (int) $comment->lock_version;

        if ($data['status'] === 'resolved') {
            abort_unless($can['resolve'] || $can['verify'], 403, 'Only the person who made this comment (or the group adviser) can resolve it.');
            [, $onBehalf] = $this->review->verifierFor($comment, $project);
            $ok = $this->review->transition($comment, CommentReviewService::RESOLVED, $user, $lock,
                ['type' => 'resolved', 'note' => $data['note'] ?? null],
                $onBehalf ? ['verified_on_behalf_of' => $comment->user_id] : []);
        } else {
            abort_unless($can['reopen'], 403, 'Only the person who made this comment (or the group adviser) can reopen it.');
            $ok = $this->review->transition($comment, CommentReviewService::REOPENED, $user, $lock,
                ['type' => 'reopened', 'note' => $data['note'] ?? null]);
        }
        if (!$ok) {
            return response()->json(['message' => 'Someone else just updated this comment. It has been refreshed -- check it and try again.', 'code' => 'comment_conflict'], 409);
        }
        $comment->load('user', 'resolver');

        $this->activity->broadcast($document->project_id, 'comment_resolved', [
            'document_id' => (int) $documentId,
            'comment'     => $comment,
        ]);

        return response()->json(DocumentCommentPresenter::present($comment, $user, $project, $this->review));
    }

    // Only the author, and only before anyone replied or acted on it -- after
    // that the comment is part of the review record and is kept.
    public function destroy(Request $request, $documentId, $commentId) {
        $document = Document::findOrFail($documentId);
        $this->authorizeDocumentAccess($request->user(), $document->project_id);
        $comment = DocumentComment::where('document_id', $documentId)->where('id', $commentId)->firstOrFail();
        $project = Project::findOrFail($document->project_id);
        abort_unless($this->review->permissions($request->user(), $comment, $project)['delete'], 403,
            'This comment already has replies or review activity, so it is kept as part of the record. Resolve it instead.');
        $comment->delete();

        $this->activity->broadcast($document->project_id, 'comment_deleted', [
            'document_id' => (int) $documentId,
            'comment_id'  => (int) $commentId,
        ]);

        return response()->json(['message' => 'Deleted']);
    }
}
