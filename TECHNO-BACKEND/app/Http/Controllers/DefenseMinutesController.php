<?php
namespace App\Http\Controllers;
use App\Http\Controllers\Concerns\AuthorizesDocumentAccess;
use App\Models\Contribution;
use App\Models\DefenseMinute;
use App\Models\DefenseSchedule;
use App\Models\MinuteItem;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Services\ActivityBroadcastService;
use App\Services\NotificationService;
use Illuminate\Http\Request;

// Defense minutes monitoring: panel comments per defense session and the
// group's action taken on each one, tracked from pending -> addressed (by
// the students) -> verified (by the panel/adviser/instructor).
class DefenseMinutesController extends Controller {
    use AuthorizesDocumentAccess;

    private const STAFF = ['admin', 'instructor', 'adviser', 'panelist'];

    public function index(Request $request, $projectId) {
        $this->authorizeProject($request->user(), $projectId);

        $minutes = DefenseMinute::with('items.addresser:id,name', 'items.verifier:id,name', 'recorder:id,name', 'schedule.panel')
            ->where('project_id', $projectId)
            ->orderByDesc('defense_date')
            ->orderByDesc('id')
            ->get();

        return response()->json($minutes);
    }

    public function store(Request $request, $projectId, ActivityBroadcastService $activity) {
        $user = $request->user();
        $project = $this->authorizeProject($user, $projectId);
        abort_unless($this->isKeeper($user, $project), 403, "The group's adviser records the defense minutes.");

        $data = $request->validate([
            'defense_schedule_id' => 'nullable|integer|exists:defense_schedules,id',
            'defense_type'        => 'required_without:defense_schedule_id|nullable|in:title,outline,pre_deployment,final',
            'defense_date'        => 'nullable|date',
            'notes'               => 'nullable|string|max:2000',
        ]);
        // From a scheduled defense: its type and date (and, later, its panel).
        if (!empty($data['defense_schedule_id'])) {
            $schedule = DefenseSchedule::findOrFail($data['defense_schedule_id']);
            abort_unless($this->scheduleBelongs($schedule, $project), 422, "That defense is not this project's.");
            $data['defense_type'] = $schedule->defense_type ?: ($data['defense_type'] ?? 'outline');
            $data['defense_date'] = $data['defense_date'] ?? $schedule->defense_date;
        }

        $minute = DefenseMinute::create($data + [
            'project_id'  => $project->id,
            'school_id'   => $user->school_id,
            'recorded_by' => $user->id,
        ]);

        $activity->broadcast($project->id, 'minutes_updated', ['minute_id' => $minute->id]);

        return response()->json($minute->load('items', 'recorder:id,name'), 201);
    }

    public function destroy(Request $request, $id) {
        $user   = $request->user();
        $minute = DefenseMinute::findOrFail($id);
        $this->authorizeProject($user, $minute->project_id);
        abort_unless(
            in_array($user->role, ['admin', 'instructor']) || $minute->recorded_by === $user->id,
            403, 'Only the person who recorded these minutes, an instructor, or an admin can delete them.'
        );

        $minute->delete();
        return response()->json(['message' => 'Minutes deleted']);
    }

    public function storeItem(Request $request, $minuteId, NotificationService $notifications, ActivityBroadcastService $activity) {
        $user = $request->user();
        $minute  = DefenseMinute::findOrFail($minuteId);
        $project = $this->authorizeProject($user, $minute->project_id);
        abort_unless($this->isKeeper($user, $project), 403, "The group's adviser writes the minutes.");

        $data = $request->validate([
            'panel_role'    => 'nullable|in:chair,member1,member2,adviser',
            'panelist_name' => 'nullable|string|max:255',
            'panelist_role' => 'nullable|string|max:50',
            'page_no'       => 'nullable|string|max:20',
            'comment'       => 'required|string|max:5000',
        ]);
        // Choosing the role fills in that defense's person automatically.
        [$roleName, $roleLabel] = $this->personFor($minute, $project, $data['panel_role'] ?? null);

        $item = MinuteItem::create([
            'defense_minute_id' => $minute->id,
            'panel_role'        => $data['panel_role'] ?? null,
            'panelist_name'     => $data['panelist_name'] ?? $roleName ?? $user->name,
            'panelist_role'     => $data['panelist_role'] ?? $roleLabel,
            'page_no'           => $data['page_no'] ?? null,
            'comment'           => $data['comment'],
            'status'            => 'pending',
            'created_by'        => $user->id,
        ]);

        foreach (ProjectMember::where('project_id', $project->id)->pluck('user_id') as $memberId) {
            $notifications->send(
                $memberId, 'minutes_comment', 'New Panel Recommendation',
                'A recommendation was added to your defense minutes for "' . $project->title . '". Record the action you took once it is addressed.',
                $project->id
            );
        }
        $activity->broadcast($project->id, 'minutes_updated', ['minute_id' => $minute->id]);

        return response()->json($item, 201);
    }

    public function updateItem(Request $request, $id, NotificationService $notifications, ActivityBroadcastService $activity) {
        $user    = $request->user();
        $item    = MinuteItem::with('minute')->findOrFail($id);
        $project = $this->authorizeProject($user, $item->minute->project_id);
        $isStaff = in_array($user->role, self::STAFF);
        $isKeeper = $this->isKeeper($user, $project);

        $data = $request->validate([
            'panel_role'    => 'nullable|in:chair,member1,member2,adviser',
            'panelist_name' => 'sometimes|string|max:255',
            'panelist_role' => 'nullable|string|max:50',
            'page_no'       => 'nullable|string|max:20',
            'comment'       => 'sometimes|string|max:5000',
            'action_taken'  => 'nullable|string|max:5000',
            'status'        => 'sometimes|in:pending,addressed,verified',
        ]);
        if ($isStaff && !$isKeeper) {
            abort_unless(empty(array_intersect(['panel_role', 'panelist_name', 'panelist_role', 'page_no', 'comment'], array_keys($data))), 403, "Only the group's adviser edits the minutes; reviewers can verify actions taken.");
        }
        if ($isKeeper && array_key_exists('panel_role', $data)) {
            [$roleName, $roleLabel] = $this->personFor($item->minute, $project, $data['panel_role']);
            $data['panelist_name'] = $data['panelist_name'] ?? $roleName ?? $item->panelist_name;
            $data['panelist_role'] = $data['panelist_role'] ?? $roleLabel;
        }

        if (!$isStaff) {
            // Students record what they did; only reviewers edit the comment
            // itself or sign off on it as verified.
            abort_unless(empty(array_intersect(['panel_role', 'panelist_name', 'panelist_role', 'page_no', 'comment'], array_keys($data))), 403, 'Only reviewers can edit a panel comment.');
            abort_if(($data['status'] ?? null) === 'verified', 403, 'Only panelists, advisers, instructors, or admins can verify an action taken.');
            abort_if($item->status === 'verified', 403, 'This recommendation has already been verified.');
        }

        $oldStatus = $item->status;
        $item->fill($data);

        if (isset($data['status']) && $data['status'] !== $oldStatus) {
            if ($data['status'] === 'addressed') {
                $item->addressed_by = $user->id;
                $item->addressed_at = now();
            } elseif ($data['status'] === 'verified') {
                $item->verified_by = $user->id;
                $item->verified_at = now();
            } else {
                $item->verified_by = null;
                $item->verified_at = null;
            }
        }
        $item->save();

        if (($data['status'] ?? null) === 'addressed' && $oldStatus !== 'addressed') {
            Contribution::create([
                'project_id'  => $project->id,
                'user_id'     => $user->id,
                'action'      => 'minutes_addressed',
                'description' => 'Addressed panel recommendation: "' . mb_strimwidth($item->comment, 0, 120, '...') . '"',
            ]);
            if ($project->adviser_id) {
                $notifications->send(
                    $project->adviser_id, 'minutes_addressed', 'Panel Recommendation Addressed',
                    'The group working on "' . $project->title . '" marked a panel recommendation as addressed. Please review and verify it.',
                    $project->id
                );
            }
        }
        $activity->broadcast($project->id, 'minutes_updated', ['minute_id' => $item->defense_minute_id]);

        return response()->json($item->fresh(['addresser:id,name', 'verifier:id,name']));
    }

    public function destroyItem(Request $request, $id) {
        $user = $request->user();
        $item = MinuteItem::with('minute')->findOrFail($id);
        $project = $this->authorizeProject($user, $item->minute->project_id);
        abort_unless($this->isKeeper($user, $project), 403, "Only the group's adviser edits the minutes.");

        $item->delete();
        return response()->json(['message' => 'Comment deleted']);
    }

    // Fill the minutes from the defense's panel comments, each under its
    // panelist (name + role). Never imports the same comment twice.
    public function importPanelComments(Request $request, $minuteId, NotificationService $notifications, ActivityBroadcastService $activity) {
        $user = $request->user();
        $minute = DefenseMinute::findOrFail($minuteId);
        $project = $this->authorizeProject($user, $minute->project_id);
        abort_unless($this->isKeeper($user, $project), 403, "The group's adviser writes the minutes.");
        abort_unless($minute->defense_schedule_id, 422, 'Link these minutes to a scheduled defense first.');

        $already = MinuteItem::where('defense_minute_id', $minute->id)->whereNotNull('panel_comment_id')->pluck('panel_comment_id');
        $comments = \App\Models\PanelComment::with('user:id,name')
            ->where('defense_schedule_id', $minute->defense_schedule_id)->whereNotIn('id', $already)
            ->orderBy('created_at')->get()
            ->sortBy(fn ($c) => [['chair' => 0, 'member1' => 1, 'member2' => 2, 'adviser' => 3][$c->author_role] ?? 9, $c->created_at]);

        foreach ($comments as $c) {
            MinuteItem::create([
                'defense_minute_id' => $minute->id,
                'panel_comment_id'  => $c->id,
                'panel_role'        => $c->author_role,
                'panelist_name'     => $c->user?->name ?? 'Panelist',
                'panelist_role'     => self::ROLE_LABELS[$c->author_role] ?? null,
                'page_no'           => $c->page_no,
                'comment'           => $c->comment,
                'status'            => 'pending',
                'created_by'        => $user->id,
            ]);
        }

        if ($comments->isNotEmpty()) {
            foreach (ProjectMember::where('project_id', $project->id)->pluck('user_id') as $memberId) {
                $notifications->send(
                    $memberId, 'minutes_comment', 'Defense Minutes Updated',
                    'The panel\'s recommendations were added to your defense minutes for "' . $project->title . '". Record the action you took for each one.',
                    $project->id
                );
            }
            $activity->broadcast($project->id, 'minutes_updated', ['minute_id' => $minute->id]);
        }

        return response()->json(['imported' => $comments->count(), 'minute' => $minute->fresh()->load('items', 'schedule.panel')]);
    }

    private const ROLE_LABELS = ['chair' => 'Panel Chair', 'member1' => 'Panel Member 1', 'member2' => 'Panel Member 2', 'adviser' => 'Adviser'];

    // The group's adviser keeps the minutes (and the admin, who can do anything).
    private function isKeeper($user, Project $project): bool {
        if ($user->role === 'admin') return true;
        if ($user->role !== 'adviser') return false;
        $adviserId = $project->adviser_id ?: ($project->group_id ? \App\Models\Group::whereKey($project->group_id)->value('adviser_id') : null);
        return $adviserId && (int) $adviserId === (int) $user->id;
    }

    private function scheduleBelongs(DefenseSchedule $schedule, Project $project): bool {
        return ($schedule->project_id && (int) $schedule->project_id === (int) $project->id)
            || ($project->group_id && (int) $schedule->group_id === (int) $project->group_id);
    }

    /** @return array{0: ?string, 1: ?string} [name, role label] for a panel role on this minute's defense */
    private function personFor(DefenseMinute $minute, Project $project, ?string $role): array {
        if (!$role) return [null, null];
        if ($role === 'adviser') {
            $adviserId = $project->adviser_id ?: ($project->group_id ? \App\Models\Group::whereKey($project->group_id)->value('adviser_id') : null);
            return [$adviserId ? \App\Models\User::whereKey($adviserId)->value('name') : null, 'Adviser'];
        }
        $userId = $minute->defense_schedule_id
            ? \App\Models\DefenseSchedulePanelist::where('defense_schedule_id', $minute->defense_schedule_id)->where('role', $role)->value('user_id')
            : null;
        $userId ??= $project->group_id ? \App\Models\GroupPanelist::where('group_id', $project->group_id)->where('role', $role)->value('user_id') : null;
        return [$userId ? \App\Models\User::whereKey($userId)->value('name') : null, self::ROLE_LABELS[$role] ?? null];
    }

    private function authorizeProject($user, $projectId): Project {
        $project = Project::findOrFail($projectId);
        abort_unless(static::userCanAccessProject($user, $project->id), 403, 'You do not have access to this project.');
        return $project;
    }
}
