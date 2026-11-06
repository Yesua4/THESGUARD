<?php
namespace App\Http\Controllers;

use App\Exceptions\CommentConflict;
use App\Http\Controllers\Concerns\AuthorizesDocumentAccess;
use App\Models\Document;
use App\Models\DocumentComment;
use App\Models\DocumentCommentAttempt;
use App\Models\DocumentCommentReply;
use App\Models\Project;
use App\Services\CommentReviewService as Review;
use App\Support\DocumentCommentPresenter;
use Illuminate\Http\Request;

// Threads, student corrections, and faculty verification for document
// comments. Every rule lives in CommentReviewService; each action here is
// authorized on the server, and status changes must quote the comment's
// lock_version so two people can't silently overwrite each other.
class CommentReviewController extends Controller {
    use AuthorizesDocumentAccess;

    public function __construct(private Review $review) {}

    /** @return array{0: Document, 1: DocumentComment, 2: Project} */
    private function load(Request $request, $documentId, $commentId): array {
        $document = Document::findOrFail($documentId);
        $this->authorizeDocumentAccess($request->user(), $document->project_id);
        $comment = DocumentComment::with('user')->where('document_id', $document->id)->findOrFail($commentId);
        return [$document, $comment, Project::findOrFail($document->project_id)];
    }

    private function conflict() {
        return response()->json([
            'message' => 'Someone else just updated this comment. It has been refreshed -- check it and try again.',
            'code'    => 'comment_conflict',
        ], 409);
    }

    private function deny(string $message) {
        return response()->json(['message' => $message], 403);
    }

    // Full history of one comment: thread, every attempt, and the timeline.
    public function show(Request $request, $documentId, $commentId) {
        [, $comment, $project] = $this->load($request, $documentId, $commentId);
        return response()->json(DocumentCommentPresenter::present($comment, $request->user(), $project, $this->review, true));
    }

    public function reply(Request $request, $documentId, $commentId) {
        [$document, $comment, $project] = $this->load($request, $documentId, $commentId);
        $data = $request->validate(['body' => 'required|string|max:5000']);
        $user = $request->user();

        $reply = $this->review->atomically(function () use ($comment, $user, $data) {
            $reply = DocumentCommentReply::create(['comment_id' => $comment->id, 'user_id' => $user->id, 'body' => trim($data['body'])]);
            $this->review->log($comment, $user, 'replied', null, null, mb_strimwidth(trim($data['body']), 0, 300, '…'));
            return $reply;
        });

        // Students' replies go to the commenter (and the verifier, if that's
        // someone else); faculty replies go to the project's students.
        $chapter = $this->review->chapterLabel($document);
        if ($this->review->isProjectStudent($user, $project->id)) {
            [$verifierId] = $this->review->verifierFor($comment, $project);
            foreach (array_unique(array_filter([$comment->user_id, $verifierId])) as $id) {
                $this->review->notifyUser($id, $project, $comment, $user, '💬 Reply to your comment', "{$user->name} replied to your comment on {$chapter} of \"{$project->title}\".");
            }
        } else {
            $this->review->notifyStudents($project, $comment, $user, '💬 New reply', "{$user->name} replied to a comment on {$chapter} of \"{$project->title}\".");
        }
        $this->review->broadcast($project, $comment, 'comment_replied');

        return response()->json($reply->load('user:id,name,role,avatar'), 201);
    }

    // Student: "I'm working on this."
    public function start(Request $request, $documentId, $commentId) {
        [, $comment, $project] = $this->load($request, $documentId, $commentId);
        $user = $request->user();
        $data = $request->validate(['lock_version' => 'required|integer']);
        if (!$this->review->permissions($user, $comment, $project)['start']) {
            return $this->deny('Only a student of this project can start working on an open comment.');
        }

        if (!$this->review->transition($comment, Review::IN_PROGRESS, $user, $data['lock_version'])) return $this->conflict();
        $this->review->broadcast($project, $comment, 'comment_updated');
        return response()->json(DocumentCommentPresenter::present($comment, $user, $project, $this->review));
    }

    // Student: "Addressed -- ready for review", pointing at the saved revision.
    public function submit(Request $request, $documentId, $commentId) {
        [$document, $comment, $project] = $this->load($request, $documentId, $commentId);
        $user = $request->user();
        $data = $request->validate([
            'lock_version'         => 'required|integer',
            'revision_document_id' => 'required|integer',
            'explanation'          => 'required|string|min:10|max:2000',
        ], [
            'explanation.min' => 'Briefly explain what you changed (at least 10 characters).',
        ]);
        if (!$this->review->permissions($user, $comment, $project)['submit']) {
            return $this->deny('Only a student of this project can submit a correction, and only while the comment is open, in progress, or reopened.');
        }
        if ($error = $this->review->validRevision($comment, $data['revision_document_id'])) {
            return response()->json(['message' => $error, 'errors' => ['revision_document_id' => [$error]]], 422);
        }

        try {
        $this->review->atomically(function () use ($comment, $user, $data) {
            $no = (int) DocumentCommentAttempt::where('comment_id', $comment->id)->max('attempt_no') + 1;
            $attempt = DocumentCommentAttempt::create([
                'comment_id' => $comment->id, 'attempt_no' => $no, 'submitted_by' => $user->id,
                'revision_document_id' => $data['revision_document_id'], 'explanation' => trim($data['explanation']),
                'original_text' => $comment->selected_text,
            ]);
            $ok = $this->review->transition($comment, Review::AWAITING, $user, $data['lock_version'], [
                'type' => 'revision_submitted', 'note' => trim($data['explanation']),
                'document_id' => $data['revision_document_id'], 'attempt_id' => $attempt->id,
            ]);
            if (!$ok) throw new CommentConflict();
        });
        } catch (CommentConflict) {
            return $this->conflict();
        }

        [$verifierId] = $this->review->verifierFor($comment, $project);
        $revision = Document::find($data['revision_document_id']);
        $this->review->notifyUser($verifierId, $project, $comment, $user, '📝 Revision ready for your review',
            "{$user->name} has submitted a revision addressing your comment in " . $this->review->chapterLabel($document)
            . " of \"{$project->title}\" (revised in v{$revision->version}).");
        $this->review->broadcast($project, $comment, 'comment_updated');

        return response()->json(DocumentCommentPresenter::present($comment->fresh('user'), $user, $project, $this->review));
    }

    // Verifier: approve (resolve) or request further revision (reopen).
    public function verify(Request $request, $documentId, $commentId) {
        [$document, $comment, $project] = $this->load($request, $documentId, $commentId);
        $user = $request->user();
        $data = $request->validate([
            'lock_version' => 'required|integer',
            'decision'     => 'required|in:approve,reject',
            'note'         => 'nullable|string|max:2000|required_if:decision,reject',
        ], [
            'note.required_if' => 'Explain what still needs to change.',
        ]);
        if (!$this->review->permissions($user, $comment, $project)['verify']) {
            return $this->deny('Only the person who made this comment (or the group adviser, if they are no longer assigned) can verify it, and only while it awaits verification.');
        }
        [, $onBehalf] = $this->review->verifierFor($comment, $project);
        $approve = $data['decision'] === 'approve';

        try {
        $this->review->atomically(function () use ($comment, $user, $data, $approve, $onBehalf) {
            $attempt = DocumentCommentAttempt::where('comment_id', $comment->id)->where('decision', 'pending')->orderByDesc('attempt_no')->first();
            $attempt?->update([
                'decision' => $approve ? 'approved' : 'rejected', 'decided_by' => $user->id,
                'decided_at' => now(), 'decision_note' => $data['note'] ?? null,
            ]);
            $ok = $this->review->transition($comment, $approve ? Review::RESOLVED : Review::REOPENED, $user, $data['lock_version'], [
                'type' => $approve ? 'approved' : 'revision_requested', 'note' => $data['note'] ?? null,
                'document_id' => $attempt?->revision_document_id, 'attempt_id' => $attempt?->id,
            ], $approve && $onBehalf ? ['verified_on_behalf_of' => $comment->user_id] : []);
            if (!$ok) throw new CommentConflict();
        });
        } catch (CommentConflict) {
            return $this->conflict();
        }

        $chapter = $this->review->chapterLabel($document);
        $approve
            ? $this->review->notifyStudents($project, $comment, $user, '✅ Correction approved', "{$user->name} approved your correction on {$chapter} of \"{$project->title}\". The comment is resolved.")
            : $this->review->notifyStudents($project, $comment, $user, '↩️ Further revision requested', "{$user->name} reviewed your correction on {$chapter} of \"{$project->title}\" and asked for more changes: " . mb_strimwidth($data['note'], 0, 160, '…'));
        $this->review->broadcast($project, $comment, 'comment_updated');

        return response()->json(DocumentCommentPresenter::present($comment->fresh('user'), $user, $project, $this->review));
    }

    // Verifier: reopen a resolved comment (with a reason).
    public function reopen(Request $request, $documentId, $commentId) {
        [$document, $comment, $project] = $this->load($request, $documentId, $commentId);
        $user = $request->user();
        $data = $request->validate([
            'lock_version' => 'required|integer',
            'note'         => 'required|string|max:2000',
        ], ['note.required' => 'Explain why the comment is being reopened.']);
        if (!$this->review->permissions($user, $comment, $project)['reopen']) {
            return $this->deny('Only the person who made this comment (or the group adviser) can reopen it.');
        }

        if (!$this->review->transition($comment, Review::REOPENED, $user, $data['lock_version'], ['type' => 'reopened', 'note' => $data['note']])) {
            return $this->conflict();
        }
        $this->review->notifyStudents($project, $comment, $user, '↩️ Comment reopened', "{$user->name} reopened a comment on " . $this->review->chapterLabel($document) . " of \"{$project->title}\": " . mb_strimwidth($data['note'], 0, 160, '…'));
        $this->review->broadcast($project, $comment, 'comment_updated');

        return response()->json(DocumentCommentPresenter::present($comment, $user, $project, $this->review));
    }
}
