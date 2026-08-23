<?php
namespace App\Http\Controllers;

use App\Models\Contribution;
use App\Models\DefenseSchedule;
use App\Models\Group;
use App\Models\GroupMember;
use App\Services\NotificationService;
use Illuminate\Http\Request;

class ScheduleController extends Controller {

    public function __construct(private NotificationService $notifications) {}

    public function index(Request $request) {
    $user = $request->user();
    $query = DefenseSchedule::with(['group', 'group.members', 'group.members.user', 'adviser']);

    if ($user->role === 'student') {
        // Get groups the student belongs to
        $groupIds = \App\Models\GroupMember::where('user_id', $user->id)
            ->pluck('group_id');
        $query->whereIn('group_id', $groupIds);
    } elseif ($user->role === 'adviser') {
        $query->where('adviser_id', $user->id);
    }
    // instructor, admin, panelist see all schedules — no filter

    return response()->json($query->get());
}

    // adviser/instructor/admin manage defense schedules -- the existing,
    // already-passing test suite (ScheduleConflictTest, PanelistConflictOfInterestTest)
    // exercises this as an adviser (store() records the caller as adviser_id),
    // so adviser access is real intended behavior, not just a UI gap.
    private function assertCanManageSchedules(Request $request) {
        abort_unless(in_array($request->user()->role, ['adviser', 'instructor', 'admin']), 403, 'Only advisers, instructors, and admins can manage defense schedules.');
    }

    public function store(Request $request) {
        $this->assertCanManageSchedules($request);
        $data = $request->validate([
            'group_id'     => 'required|integer',
            'project_id'   => 'nullable|integer',
            'defense_date' => 'required|date',
            'defense_time' => 'required',
            'venue'        => 'nullable|string',
            'panelists'    => 'nullable', // Removed 'string' to allow arrays from UI
        ]);

        // Convert panelists array to string if necessary
        if (isset($data['panelists']) && is_array($data['panelists'])) {
            $data['panelists'] = implode(', ', $data['panelists']);
        }

        $data['adviser_id'] = $request->user()->id;

        $conflicts = $this->findConflicts($data['defense_date'], $data['defense_time'], $data['venue'] ?? null, $data['adviser_id'], $data['panelists'] ?? null);
        $conflicts = array_merge($conflicts, $this->conflictOfInterestIssues($data['panelists'] ?? null, $data['adviser_id'], $data['group_id']));
        if (!empty($conflicts)) {
            return response()->json([
                'message'   => 'This defense schedule conflicts with an existing one.',
                'conflicts' => $conflicts,
            ], 409);
        }

        $schedule = DefenseSchedule::create($data);

        if ($data['project_id'] ?? null) {
            Contribution::create([
                'project_id'  => $data['project_id'],
                'user_id'     => $data['adviser_id'],
                'action'      => 'defense_scheduled',
                'description' => "Scheduled a defense on {$data['defense_date']} at {$data['defense_time']}.",
            ]);
        }

        // Notify members based on group_id (since project_id might be null)
        $group = Group::with('members')->find($request->group_id);

        if ($group && $group->members) {
        foreach ($group->members as $member) {
            $this->notifications->send(
                $member->user_id, 'schedule', '📅 Defense Scheduled!',
                "Your defense is on {$request->defense_date} at {$request->defense_time} at " . ($request->venue ?? 'TBA')
            );
        }
    }

        return response()->json($schedule->load('group', 'adviser'), 201);
    }

    public function update(Request $request, $id) {
        $this->assertCanManageSchedules($request);
        $schedule = DefenseSchedule::findOrFail($id);

        $data = $request->validate([
            'group_id'     => 'sometimes|integer',
            'project_id'   => 'nullable|integer',
            'defense_date' => 'sometimes|date',
            'defense_time' => 'sometimes',
            'venue'        => 'nullable|string',
            'panelists'    => 'nullable',
            'status'       => 'nullable|string',
        ]);

        if (isset($data['panelists']) && is_array($data['panelists'])) {
            $data['panelists'] = implode(', ', $data['panelists']);
        }

        $defenseDate = $data['defense_date'] ?? $schedule->defense_date;
        $defenseTime = $data['defense_time'] ?? $schedule->defense_time;
        $venue       = array_key_exists('venue', $data) ? $data['venue'] : $schedule->venue;
        $panelists   = array_key_exists('panelists', $data) ? $data['panelists'] : $schedule->panelists;

        $groupId   = array_key_exists('group_id', $data) ? $data['group_id'] : $schedule->group_id;

        $conflicts = $this->findConflicts($defenseDate, $defenseTime, $venue, $schedule->adviser_id, $panelists, $schedule->id);
        $conflicts = array_merge($conflicts, $this->conflictOfInterestIssues($panelists, $schedule->adviser_id, $groupId));
        if (!empty($conflicts)) {
            return response()->json([
                'message'   => 'This defense schedule conflicts with an existing one.',
                'conflicts' => $conflicts,
            ], 409);
        }

        $schedule->update($data);
        return response()->json($schedule->load('group', 'adviser'));
    }

    public function destroy(Request $request, $id) {
        $this->assertCanManageSchedules($request);
        DefenseSchedule::findOrFail($id)->delete();
        return response()->json(['message' => 'Deleted']);
    }

    public function show($id) {
        return response()->json(
            DefenseSchedule::with(['group', 'adviser'])->findOrFail($id)
        );
    }

    // Flags same-date/same-time bookings that share a resource: the adviser,
    // the venue (exact name match), or a panelist (comma-separated names,
    // matched case-insensitively). There's no separate end-time field, so
    // "conflict" means the exact same slot, not a general overlap window.
    private function findConflicts(string $date, string $time, ?string $venue, int $adviserId, ?string $panelists, ?int $excludeId = null): array {
        $panelistNames = $panelists
            ? array_values(array_filter(array_map('trim', explode(',', $panelists))))
            : [];

        $sameSlot = DefenseSchedule::where('defense_date', $date)
            ->where('defense_time', $time)
            ->when($excludeId, fn($q) => $q->where('id', '!=', $excludeId))
            ->with('group')
            ->get();

        $conflicts = [];
        foreach ($sameSlot as $existing) {
            $reasons = [];

            if ($existing->adviser_id === $adviserId) {
                $reasons[] = 'You already have a defense scheduled at this time.';
            }

            if ($venue && $existing->venue && strcasecmp(trim($existing->venue), trim($venue)) === 0) {
                $reasons[] = "Venue \"{$venue}\" is already booked at this time.";
            }

            if ($panelistNames && $existing->panelists) {
                $existingPanelists = array_map('trim', explode(',', $existing->panelists));
                $overlap = array_uintersect($panelistNames, $existingPanelists, 'strcasecmp');
                if (!empty($overlap)) {
                    $reasons[] = 'Panelist(s) ' . implode(', ', $overlap) . ' already assigned to another defense at this time.';
                }
            }

            if (!empty($reasons)) {
                $conflicts[] = [
                    'schedule_id' => $existing->id,
                    'group'       => $existing->group->group_name ?? null,
                    'reasons'     => $reasons,
                ];
            }
        }

        return $conflicts;
    }

    // Panelists are stored as free-text names (not user IDs), so there's nothing
    // stopping a group's own adviser — or one of its own students — from being
    // typed into the panel list. Flag it as a conflict rather than silently
    // scheduling someone to grade their own advisee/group.
    private function conflictOfInterestIssues(?string $panelists, int $adviserId, ?int $groupId): array {
        $panelistNames = $panelists
            ? array_values(array_filter(array_map('trim', explode(',', $panelists))))
            : [];
        if (empty($panelistNames)) return [];

        $reasons = [];

        $adviser = \App\Models\User::find($adviserId);
        if ($adviser && $adviser->name) {
            foreach ($panelistNames as $name) {
                if (strcasecmp($name, $adviser->name) === 0) {
                    $reasons[] = "{$adviser->name} is this group's adviser and can't also serve as a panelist for its defense.";
                }
            }
        }

        if ($groupId) {
            $memberNames = GroupMember::where('group_id', $groupId)->with('user')->get()
                ->pluck('user.name')->filter();
            foreach ($panelistNames as $name) {
                foreach ($memberNames as $memberName) {
                    if (strcasecmp($name, $memberName) === 0) {
                        $reasons[] = "{$memberName} is a member of this group and can't be a panelist for their own defense.";
                    }
                }
            }
        }

        if (empty($reasons)) return [];

        return [[
            'schedule_id' => null,
            'group'       => null,
            'reasons'     => array_values(array_unique($reasons)),
        ]];
    }
}
