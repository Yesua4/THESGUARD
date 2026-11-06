<?php
namespace App\Support;

use App\Models\Document;
use App\Models\DocumentComment;
use App\Models\Project;
use App\Models\User;
use App\Services\CommentReviewService;

// Shapes a comment for the frontend: its thread, every correction attempt,
// who verifies it, and what the CURRENT user may do (`can`) -- computed by
// the same rules the API enforces, so buttons and backend never disagree.
class DocumentCommentPresenter {
    public static function present(DocumentComment $comment, User $user, Project $project, CommentReviewService $review, bool $withTimeline = false): array {
        $comment->loadMissing([
            'user:id,name,role,avatar',
            'resolver:id,name,role',
            'onBehalfOf:id,name',
            'replies.user:id,name,role,avatar',
            'attempts.submitter:id,name',
            'attempts.decider:id,name,role',
            'attempts.revision:id,version,type',
        ]);
        if ($withTimeline) $comment->loadMissing('events.user:id,name,role');

        [$verifierId, $onBehalf] = $review->verifierFor($comment, $project);
        $status = $comment->review_status ?: CommentReviewService::OPEN;

        $data = $comment->toArray();
        $data['review_status'] = $status;
        $data['review_label'] = CommentReviewService::LABELS[$status] ?? $status;
        $data['verifier'] = $verifierId
            ? ['id' => (int) $verifierId, 'name' => User::whereKey($verifierId)->value('name'), 'on_behalf' => $onBehalf]
            : null;
        $data['can'] = $review->permissions($user, $comment, $project);
        if (!$withTimeline) unset($data['events']);

        return $data;
    }

    /** @param iterable<DocumentComment> $comments */
    public static function presentMany(iterable $comments, User $user, Project $project, CommentReviewService $review): array {
        $out = [];
        foreach ($comments as $c) $out[] = self::present($c, $user, $project, $review);
        return $out;
    }
}
