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

    public function index(Request $request, $documentId) {
        $document = Document::findOrFail($documentId);
        $this->authorizeDocumentAccess($request->user(), $document->project_id);

        return response()->json(
            DocumentComment::with('user', 'resolver')
                ->where('document_id', $documentId)
                ->orderBy('page_number')
                ->orderBy('created_at')
                ->get()
        );
    }

    public function store(Request $request, $documentId) {
        $document = Document::findOrFail($documentId);
        $this->authorizeDocumentAccess($request->user(), $document->project_id);

        $data = $request->validate([
            'page_number'   => 'required|integer|min:1',
            'selected_text' => 'nullable|string',
            'anchor'        => 'nullable|array',
            'comment'       => 'required|string',
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
