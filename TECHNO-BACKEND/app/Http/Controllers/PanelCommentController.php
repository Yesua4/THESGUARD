<?php
namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesDocumentAccess;
use App\Models\DefenseSchedule;
use App\Models\DefenseSchedulePanelist;
use App\Models\Group;
use App\Models\PanelComment;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\Request;

// Panel comments & recommendations for a defense. Panelists on that
// defense's panel write them (and the group's adviser can add to them);
// everyone who can see the project can read them.
class PanelCommentController extends Controller {
    use AuthorizesDocumentAccess;

    private const ORDER = ['chair' => 0, 'member1' => 1, 'member2' => 2, 'adviser' => 3];

    public function index(Request $request, $projectId) {
        $user = $request->user();
        abort_unless(static::userCanAccessProject($user, $projectId), 403, 'You do not have access to this project.');
        $project = Project::findOrFail($projectId);

        $schedules = DefenseSchedule::with('panel')
            ->where(fn ($q) => $q->where('project_id', $project->id)
                ->when($project->group_id, fn ($g) => $g->orWhere('group_id', $project->group_id)))
            ->orderByDesc('defense_date')->get();

        $comments = PanelComment::with('user:id,name')->whereIn('defense_schedule_id', $schedules->pluck('id'))
            ->orderBy('created_at')->get()
            ->sortBy(fn ($c) => [self::ORDER[$c->author_role] ?? 9, $c->created_at])->values();

        return response()->json([
            'defenses' => $schedules->map(fn ($s) => [
                'id' => $s->id, 'defense_type' => $s->defense_type, 'defense_date' => $s->defense_date,
                'panel' => $s->panel, 'panelists' => $s->panelists,
                'my_role' => $this->roleFor($user, $s, $project),
            ])->values(),
            'comments' => $comments->map(fn ($c) => $c->toArray() + ['mine' => (int) $c->user_id === (int) $user->id])->values(),
        ]);
    }

    public function store(Request $request, $projectId) {
        $user = $request->user();
        $project = Project::findOrFail($projectId);
        $data = $request->validate([
            'defense_schedule_id' => 'required|integer|exists:defense_schedules,id',
            'page_no'             => 'nullable|string|max:20',
            'comment'             => 'required|string|max:5000',
        ]);
        $schedule = DefenseSchedule::findOrFail($data['defense_schedule_id']);
        abort_unless(
            ($schedule->project_id && (int) $schedule->project_id === (int) $project->id)
            || ($project->group_id && (int) $schedule->group_id === (int) $project->group_id),
            422, "That defense is not this project's."
        );
        $role = $this->roleFor($user, $schedule, $project);
        abort_unless($role, 403, "Only this defense's panelists and the group's adviser can add panel comments.");

        $comment = PanelComment::create([
            'project_id' => $project->id, 'defense_schedule_id' => $schedule->id, 'user_id' => $user->id,
            'author_role' => $role, 'page_no' => $data['page_no'] ?? null, 'comment' => trim($data['comment']),
        ]);
        return response()->json($comment->load('user:id,name'), 201);
    }

    public function update(Request $request, $id) {
        $comment = PanelComment::findOrFail($id);
        abort_unless((int) $comment->user_id === (int) $request->user()->id, 403, 'You can only edit your own comments.');
        $data = $request->validate(['page_no' => 'nullable|string|max:20', 'comment' => 'required|string|max:5000']);
        $comment->update(['page_no' => $data['page_no'] ?? null, 'comment' => trim($data['comment'])]);
        return response()->json($comment->load('user:id,name'));
    }

    public function destroy(Request $request, $id) {
        $comment = PanelComment::findOrFail($id);
        abort_unless((int) $comment->user_id === (int) $request->user()->id, 403, 'You can only delete your own comments.');
        $comment->delete();
        return response()->json(['message' => 'Deleted']);
    }

    // The user's role for writing comments on this defense: their panel
    // role (by account, or by name on older schedules), or "adviser" for the
    // group's adviser. Null = can't write.
    private function roleFor(User $user, DefenseSchedule $schedule, Project $project): ?string {
        $role = DefenseSchedulePanelist::where('defense_schedule_id', $schedule->id)->where('user_id', $user->id)->value('role');
        if ($role) return $role;

        $names = $schedule->panelists ? array_values(array_filter(array_map('trim', explode(',', $schedule->panelists)))) : [];
        foreach ($names as $i => $n) {
            if (strcasecmp($n, $user->name) === 0) return ['chair', 'member1', 'member2'][$i] ?? 'member2';
        }

        $adviserId = $project->adviser_id ?: ($project->group_id ? Group::whereKey($project->group_id)->value('adviser_id') : null);
        return $adviserId && (int) $adviserId === (int) $user->id ? 'adviser' : null;
    }
}
