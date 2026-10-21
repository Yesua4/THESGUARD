<?php
namespace App\Http\Controllers;
use App\Http\Controllers\Concerns\AuthorizesDocumentAccess;
use App\Models\Contribution;
use App\Models\DefenseMinute;
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

        $minutes = DefenseMinute::with('items.addresser:id,name', 'items.verifier:id,name', 'recorder:id,name')
            ->where('project_id', $projectId)
            ->orderByDesc('defense_date')
            ->orderByDesc('id')
            ->get();

        return response()->json($minutes);
    }

    public function store(Request $request, $projectId, ActivityBroadcastService $activity) {
        $user = $request->user();
        abort_unless(in_array($user->role, self::STAFF), 403, 'Only panelists, advisers, instructors, or admins can record defense minutes.');
        $project = $this->authorizeProject($user, $projectId);

        $data = $request->validate([
            'defense_type' => 'required|in:outline,pre_deployment,final',
            'defense_date' => 'nullable|date',
            'notes'        => 'nullable|string|max:2000',
        ]);

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
        abort_unless(in_array($user->role, self::STAFF), 403, 'Only panelists, advisers, instructors, or admins can add panel comments.');
        $minute  = DefenseMinute::findOrFail($minuteId);
        $project = $this->authorizeProject($user, $minute->project_id);

        $data = $request->validate([
            'panelist_name' => 'nullable|string|max:255',
            'panelist_role' => 'nullable|string|max:50',
            'page_no'       => 'nullable|string|max:20',
            'comment'       => 'required|string|max:5000',
        ]);

        $item = MinuteItem::create([
            'defense_minute_id' => $minute->id,
            'panelist_name'     => $data['panelist_name'] ?? $user->name,
            'panelist_role'     => $data['panelist_role'] ?? null,
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

        $data = $request->validate([
            'panelist_name' => 'sometimes|string|max:255',
            'panelist_role' => 'nullable|string|max:50',
            'page_no'       => 'nullable|string|max:20',
            'comment'       => 'sometimes|string|max:5000',
            'action_taken'  => 'nullable|string|max:5000',
            'status'        => 'sometimes|in:pending,addressed,verified',
        ]);

        if (!$isStaff) {
            // Students record what they did; only reviewers edit the comment
            // itself or sign off on it as verified.
            abort_unless(empty(array_intersect(['panelist_name', 'panelist_role', 'page_no', 'comment'], array_keys($data))), 403, 'Only reviewers can edit a panel comment.');
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
        abort_unless(in_array($user->role, self::STAFF), 403, 'Only reviewers can delete a panel comment.');
        $item = MinuteItem::with('minute')->findOrFail($id);
        $this->authorizeProject($user, $item->minute->project_id);

        $item->delete();
        return response()->json(['message' => 'Comment deleted']);
    }

    private function authorizeProject($user, $projectId): Project {
        $project = Project::findOrFail($projectId);
        abort_unless(static::userCanAccessProject($user, $project->id), 403, 'You do not have access to this project.');
        return $project;
    }
}
