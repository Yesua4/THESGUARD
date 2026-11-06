<?php
namespace App\Http\Controllers;
use App\Http\Controllers\Concerns\AuthorizesDocumentAccess;
use App\Models\Contribution;
use App\Models\Document;
use App\Models\DocumentComment;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Services\ActivityBroadcastService;
use App\Services\NotificationService;
use Illuminate\Http\Request;

class DocumentCommentController extends Controller {
    use AuthorizesDocumentAccess;

    public function __construct(
        private NotificationService $notifications,
        private ActivityBroadcastService $activity,
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

        $comments = DocumentComment::with('user', 'resolver', 'document:id,version')
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

        return response()->json($comments->values());
    }

    public function store(Request $request, $documentId) {
        $document = Document::findOrFail($documentId);
        $this->authorizeDocumentAccess($request->user(), $document->project_id);

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

        $comment = DocumentComment::create($data);
        $commenter = $request->user();

        Contribution::create([
            'project_id'  => $document->project_id,
            'user_id'     => $commenter->id,
            'action'      => 'document_comment',
            'description' => "Added a comment on page {$data['page_number']} of document #{$documentId}",
        ]);

        $this->notifyOnComment($document, $commenter, $data['page_number']);

        $comment->load('user');
        $this->activity->broadcast($document->project_id, 'comment_created', [
            'document_id' => (int) $documentId,
            'comment'     => $comment,
        ]);

        return response()->json($comment, 201);
    }

    /**
     * Let the "other side" of the review know new feedback landed — students
     * get notified when their adviser/instructor comments, and vice versa.
     */
    private function notifyOnComment(Document $document, $commenter, int $pageNumber): void {
        $project = Project::find($document->project_id);
        if (!$project) return;

        if ($commenter->role === 'student') {
            $notifyUserIds = array_filter([
                $project->adviser_id,
                $project->instructor_id,
            ]);
        } else {
            $notifyUserIds = ProjectMember::where('project_id', $project->id)->pluck('user_id')->all();
        }

        foreach (array_unique($notifyUserIds) as $userId) {
            if ($userId == $commenter->id) continue;
            $this->notifications->send(
                $userId, 'comment', '💬 New Comment',
                "{$commenter->name} commented on page {$pageNumber} of \"{$project->title}\".",
                $project->id, $document->id
            );
        }
    }

    public function resolve(Request $request, $documentId, $commentId) {
        $user = $request->user();
        abort_unless(in_array($user->role, ['adviser', 'instructor', 'admin']), 403, 'Only advisers, instructors, or admins can resolve comments.');

        $document = Document::findOrFail($documentId);
        $this->authorizeDocumentAccess($user, $document->project_id);

        $comment = DocumentComment::where('document_id', $documentId)->where('id', $commentId)->firstOrFail();
        $data = $request->validate(['status' => 'required|in:open,resolved']);

        $comment->status      = $data['status'];
        $comment->resolved_at = $data['status'] === 'resolved' ? now() : null;
        $comment->resolved_by = $data['status'] === 'resolved' ? $user->id : null;
        $comment->save();
        $comment->load('user', 'resolver');

        $this->activity->broadcast($document->project_id, 'comment_resolved', [
            'document_id' => (int) $documentId,
            'comment'     => $comment,
        ]);

        return response()->json($comment);
    }

    public function destroy($documentId, $commentId) {
        $comment = DocumentComment::where('document_id', $documentId)
            ->where('id', $commentId)
            ->where('user_id', auth()->id())
            ->firstOrFail();
        $document = Document::findOrFail($documentId);
        $comment->delete();

        $this->activity->broadcast($document->project_id, 'comment_deleted', [
            'document_id' => (int) $documentId,
            'comment_id'  => (int) $commentId,
        ]);

        return response()->json(['message' => 'Deleted']);
    }
}
