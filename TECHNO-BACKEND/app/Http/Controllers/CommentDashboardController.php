<?php
namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesDocumentAccess;
use App\Models\DocumentComment;
use App\Models\Group;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Services\CommentReviewService;
use Illuminate\Http\Request;

// Comment progress across every project the user can see (spec §12-13):
// counts per status, the list (for filtering), and -- for faculty -- the
// corrections waiting for THEIR verification, so nobody has to open every
// document to find them. Uses the same access rule as everything else.
class CommentDashboardController extends Controller {
    use AuthorizesDocumentAccess;

    public function __construct(private CommentReviewService $review) {}

    public function index(Request $request) {
        $user = $request->user();

        $projects = Project::query()
            ->when($user->school_id, fn ($q) => $q->where('school_id', $user->school_id))
            ->when($user->role === 'student', fn ($q) => $q->whereIn('id', ProjectMember::where('user_id', $user->id)->pluck('project_id')))
            ->get(['id', 'title', 'status', 'group_id', 'adviser_id', 'instructor_id', 'school_id'])
            ->filter(fn ($p) => static::userCanAccessProject($user, $p->id))
            ->keyBy('id');

        $comments = DocumentComment::with('user:id,name,role', 'document:id,project_id,type,version')
            ->whereHas('document', fn ($q) => $q->whereIn('project_id', $projects->keys()))
            ->orderByDesc('updated_at')
            ->limit(1000)
            ->get();

        $groups = Group::whereIn('id', $projects->pluck('group_id')->filter())->pluck('group_name', 'id');
        $students = ProjectMember::whereIn('project_id', $projects->keys())->with('user:id,name')->get()
            ->groupBy('project_id')->map(fn ($rows) => $rows->pluck('user.name')->filter()->values());

        $counts = array_fill_keys(['open', 'in_progress', 'awaiting_verification', 'resolved', 'reopened'], 0);
        $rows = [];
        $awaitingMine = [];
        foreach ($comments as $c) {
            $project = $projects[$c->document->project_id];
            $status = $c->review_status ?: CommentReviewService::OPEN;
            $counts[$status] = ($counts[$status] ?? 0) + 1;
            [$verifierId, $onBehalf] = $this->review->verifierFor($c, $project);

            $row = [
                'id'             => $c->id,
                'document_id'    => $c->document_id,
                'project'        => ['id' => $project->id, 'title' => $project->title, 'stage' => $project->status],
                'group'          => $project->group_id ? ($groups[$project->group_id] ?? null) : null,
                'students'       => $students[$project->id] ?? [],
                'chapter'        => $c->document->type,
                'chapter_label'  => CommentReviewService::TYPE_LABELS[$c->document->type] ?? $c->document->type,
                'version'        => $c->document->version,
                'page_number'    => $c->page_number,
                'selected_text'  => $c->selected_text ? mb_strimwidth($c->selected_text, 0, 160, '…') : null,
                'comment'        => mb_strimwidth($c->comment, 0, 220, '…'),
                'review_status'  => $status,
                'review_label'   => CommentReviewService::LABELS[$status] ?? $status,
                'author'         => $c->user ? ['id' => $c->user->id, 'name' => $c->user->name, 'role' => $c->user->role] : null,
                'mine'           => (int) $c->user_id === (int) $user->id,
                'verifier_id'    => $verifierId,
                'on_behalf'      => $onBehalf,
                'created_at'     => $c->created_at,
                'updated_at'     => $c->updated_at,
            ];
            $rows[] = $row;
            if ($status === CommentReviewService::AWAITING && (int) $verifierId === (int) $user->id) {
                $awaitingMine[] = $row;
            }
        }

        return response()->json([
            'counts'                   => $counts + ['total' => count($rows)],
            'awaiting_my_verification' => $awaitingMine,
            'comments'                 => $rows,
            'truncated'                => $comments->count() >= 1000,
        ]);
    }
}
