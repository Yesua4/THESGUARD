<?php
namespace App\Http\Controllers;

use App\Models\Contribution;
use App\Models\DefenseSchedule;
use App\Models\DefenseSchedulePanelist;
use App\Models\Group;
use App\Models\GroupPanelist;
use App\Models\User;
use App\Services\ActivityBroadcastService;
use App\Services\DefenseScheduleService as Times;
use App\Services\NotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// Defense schedules: type (title / outline / pre-deployment / final), date,
// start-end time, room, and a panel of real accounts with roles (chair,
// member 1, member 2). Outline -> final defenses use the group's permanent
// panel by default. Every save is checked for overlapping-time conflicts
// (room, panelists, adviser, group) -- see DefenseScheduleService.
class ScheduleController extends Controller {

    public function __construct(
        private NotificationService $notifications,
        private ActivityBroadcastService $activity,
        private Times $times,
    ) {}

    // Schedules are keyed by group_id; broadcast to the group's projects so
    // the existing Project.{id} channels (and access rules) carry it.
    private function broadcastToGroupProjects(?int $groupId, string $type, array $payload = []): void {
        if (!$groupId) return;
        Group::find($groupId)?->projects?->each(
            fn($project) => $this->activity->broadcast($project->id, $type, $payload)
        );
    }

    public function index(Request $request) {
        $user = $request->user();
        $query = DefenseSchedule::with(['group', 'group.members', 'group.members.user', 'group.projects', 'group.panel', 'adviser', 'panel']);

        if ($user->role === 'student') {
            $query->whereIn('group_id', \App\Models\GroupMember::where('user_id', $user->id)->pluck('group_id'));
        } elseif ($user->role === 'adviser') {
            $advised = Group::where('adviser_id', $user->id)->pluck('id');
            $query->where(fn ($q) => $q->where('adviser_id', $user->id)->orWhereIn('group_id', $advised));
        }
        // instructor, admin, panelist see all schedules

        return response()->json($query->orderBy('defense_date')->get());
    }

    private function assertCanManageSchedules(Request $request) {
        abort_unless(in_array($request->user()->role, ['adviser', 'instructor', 'admin']), 403, 'Only advisers, instructors, and admins can manage defense schedules.');
    }

    private function rules(bool $creating): array {
        $req = $creating ? 'required' : 'sometimes';
        return [
            'group_id'           => "{$req}|integer|exists:groups,id",
            'project_id'         => 'nullable|integer',
            'defense_type'       => 'nullable|in:' . implode(',', DefenseSchedule::TYPES),
            'defense_date'       => "{$req}|date",
            'start_time'         => 'nullable|date_format:H:i',
            'end_time'           => 'nullable|date_format:H:i',
            'defense_time'       => $creating ? 'required_without:start_time' : 'sometimes',
            'venue'              => 'nullable|string|max:150',
            'panelists'          => 'nullable',
            'panel'              => 'nullable|array|max:3',
            'panel.*.role'       => 'required|in:' . implode(',', DefenseSchedule::ROLES) . '|distinct',
            'panel.*.user_id'    => 'required|integer|distinct|exists:users,id',
            'update_group_panel' => 'nullable|boolean',
            'status'             => 'nullable|string',
        ];
    }

    /**
     * Normalizes a create/update payload against the existing schedule (if
     * any): times as HH:MM, the panel (explicit, else the group's permanent
     * panel for outline -> final), and the matching names string.
     */
    private function resolve(Request $request, array $data, ?DefenseSchedule $existing): array {
        $groupId = (int) ($data['group_id'] ?? $existing?->group_id);
        $type = array_key_exists('defense_type', $data) ? $data['defense_type'] : $existing?->defense_type;

        $start = Times::minutes($data['start_time'] ?? $data['defense_time'] ?? null)
            ?? ($existing ? Times::window($existing)[0] : null);
        $end = array_key_exists('end_time', $data) ? Times::minutes($data['end_time'])
            : ($existing?->end_time ? Times::minutes($existing->end_time) : null);
        if ($start !== null && $end !== null && $end <= $start) {
            abort(response()->json(['message' => 'The end time must be after the start time.', 'errors' => ['end_time' => ['The end time must be after the start time.']]], 422));
        }

        // Panel: explicit > (outline..final) the group's permanent panel > old names string.
        $panel = null;
        if (array_key_exists('panel', $data) && $data['panel'] !== null) {
            $panel = collect($data['panel'])->map(fn ($p) => ['role' => $p['role'], 'user_id' => (int) $p['user_id']])->values()->all();
        } elseif (!$existing && $type && $type !== 'title') {
            $panel = GroupPanelist::where('group_id', $groupId)->get(['role', 'user_id'])
                ->map(fn ($p) => ['role' => $p->role, 'user_id' => (int) $p->user_id])->values()->all() ?: null;
        }

        if ($panel !== null) {
            $ids = array_column($panel, 'user_id');
            $user = $request->user();
            $valid = User::whereIn('id', $ids)
                ->when($user->school_id, fn ($q) => $q->where('school_id', $user->school_id))
                ->withRole('panelist')->pluck('id')->map(fn ($i) => (int) $i)->all();
            if ($bad = array_diff($ids, $valid)) {
                $msg = 'Only accounts with the Panelist role (in User Accounts) can be on a panel: ' . User::whereIn('id', $bad)->pluck('name')->implode(', ') . '.';
                abort(response()->json(['message' => $msg, 'errors' => ['panel' => [$msg]]], 422));
            }
            $order = array_flip(DefenseSchedule::ROLES);
            usort($panel, fn ($a, $b) => $order[$a['role']] <=> $order[$b['role']]);
            $names = User::whereIn('id', $ids)->pluck('name', 'id');
            $panelistsString = implode(', ', array_map(fn ($p) => $names[$p['user_id']] ?? '', $panel));
        } else {
            $raw = array_key_exists('panelists', $data) ? $data['panelists'] : $existing?->panelists;
            $panelistsString = is_array($raw) ? implode(', ', $raw) : $raw;
        }

        return [
            'group_id' => $groupId, 'type' => $type, 'start' => $start, 'end' => $end,
            'date' => $data['defense_date'] ?? $existing?->defense_date,
            'venue' => array_key_exists('venue', $data) ? $data['venue'] : $existing?->venue,
            'panel' => $panel,
            'panel_ids' => $panel !== null ? array_column($panel, 'user_id') : ($existing ? $existing->panel()->pluck('user_id')->all() : []),
            'panelists' => $panelistsString,
        ];
    }

    private function conflictsFor(Request $request, array $r, ?int $excludeId): array {
        $names = $r['panelists'] ? array_map('trim', explode(',', $r['panelists'])) : [];
        $date = $r['date'] instanceof \DateTimeInterface ? $r['date']->format('Y-m-d') : substr((string) $r['date'], 0, 10);
        return array_merge(
            $this->times->conflicts([
                'date' => $date, 'start' => $r['start'], 'end' => $r['end'], 'venue' => $r['venue'],
                'group_id' => $r['group_id'], 'panel_ids' => $r['panel_ids'], 'panel_names' => $names,
            ], $excludeId, $request->user()),
            $this->times->conflictOfInterest($r['group_id'], $r['panel_ids'], $names),
        );
    }

    private function conflictResponse(array $conflicts) {
        return response()->json([
            'message'   => 'This defense schedule conflicts with an existing one.',
            'conflicts' => $conflicts,
        ], 409);
    }

    private function savePanel(DefenseSchedule $schedule, ?array $panel, bool $updateGroupPanel): void {
        if ($panel === null) return;
        DefenseSchedulePanelist::where('defense_schedule_id', $schedule->id)->delete();
        foreach ($panel as $p) {
            DefenseSchedulePanelist::create(['defense_schedule_id' => $schedule->id, 'user_id' => $p['user_id'], 'role' => $p['role']]);
        }
        // The panel used from the outline defense on is the group's permanent
        // panel -- assigning it here carries it to the next defenses.
        if ($updateGroupPanel && $schedule->defense_type && $schedule->defense_type !== 'title') {
            GroupPanelist::where('group_id', $schedule->group_id)->delete();
            foreach ($panel as $p) {
                GroupPanelist::create(['group_id' => $schedule->group_id, 'user_id' => $p['user_id'], 'role' => $p['role']]);
            }
        }
    }

    // Live check while filling in the form -- same rules as saving.
    public function check(Request $request) {
        $this->assertCanManageSchedules($request);
        $data = $request->validate(array_merge($this->rules(true), ['schedule_id' => 'nullable|integer']));
        $existing = !empty($data['schedule_id']) ? DefenseSchedule::find($data['schedule_id']) : null;
        $r = $this->resolve($request, $data, $existing);
        return response()->json(['conflicts' => $this->conflictsFor($request, $r, $existing?->id)]);
    }

    public function store(Request $request) {
        $this->assertCanManageSchedules($request);
        $data = $request->validate($this->rules(true));
        $r = $this->resolve($request, $data, null);

        if ($conflicts = $this->conflictsFor($request, $r, null)) return $this->conflictResponse($conflicts);

        $schedule = DB::transaction(function () use ($request, $data, $r) {
            $schedule = DefenseSchedule::create([
                'group_id'     => $r['group_id'],
                'project_id'   => $data['project_id'] ?? null,
                'adviser_id'   => $request->user()->id,
                'defense_type' => $r['type'],
                'defense_date' => $r['date'],
                'defense_time' => Times::hhmm($r['start']) ?? ($data['defense_time'] ?? null),
                'start_time'   => Times::hhmm($r['start']),
                'end_time'     => Times::hhmm($r['end']),
                'venue'        => $r['venue'],
                'panelists'    => $r['panelists'],
                'status'       => $data['status'] ?? null,
            ]);
            $this->savePanel($schedule, $r['panel'], (bool) ($data['update_group_panel'] ?? true));
            return $schedule;
        });

        if ($schedule->project_id) {
            Contribution::create([
                'project_id'  => $schedule->project_id,
                'user_id'     => $request->user()->id,
                'action'      => 'defense_scheduled',
                'description' => 'Scheduled ' . $this->describe($schedule) . '.',
            ]);
        }

        $group = Group::with('members')->find($schedule->group_id);
        foreach ($group?->members ?? [] as $member) {
            $this->notifications->send(
                $member->user_id, 'schedule', '📅 Defense Scheduled!',
                'Your ' . $this->describe($schedule) . ' at ' . ($schedule->venue ?: 'TBA') . '.'
            );
        }
        // Panelists are told too.
        foreach (DefenseSchedulePanelist::where('defense_schedule_id', $schedule->id)->get() as $p) {
            $this->notifications->send(
                $p->user_id, 'schedule', '📅 You are on a defense panel',
                'You are ' . (DefenseSchedule::ROLE_LABELS[$p->role] ?? 'a panelist') . ' for ' . ($group->group_name ?? 'a group') . "'s " . $this->describe($schedule) . ' at ' . ($schedule->venue ?: 'TBA') . '.'
            );
        }

        $this->broadcastToGroupProjects($schedule->group_id, 'schedule_updated', ['schedule_id' => $schedule->id]);
        return response()->json($schedule->load('group', 'adviser', 'panel'), 201);
    }

    public function update(Request $request, $id) {
        $this->assertCanManageSchedules($request);
        $schedule = DefenseSchedule::findOrFail($id);
        $data = $request->validate($this->rules(false));
        $r = $this->resolve($request, $data, $schedule);

        if ($conflicts = $this->conflictsFor($request, $r, $schedule->id)) return $this->conflictResponse($conflicts);

        DB::transaction(function () use ($schedule, $data, $r) {
            // Every value is already resolved against the current schedule.
            $schedule->update([
                'group_id'     => $r['group_id'],
                'project_id'   => array_key_exists('project_id', $data) ? $data['project_id'] : $schedule->project_id,
                'defense_type' => $r['type'],
                'defense_date' => $r['date'],
                'defense_time' => Times::hhmm($r['start']) ?? $schedule->defense_time,
                'start_time'   => Times::hhmm($r['start']),
                'end_time'     => Times::hhmm($r['end']),
                'venue'        => $r['venue'],
                'panelists'    => $r['panelists'],
                'status'       => array_key_exists('status', $data) ? $data['status'] : $schedule->status,
            ]);
            $this->savePanel($schedule, $r['panel'], (bool) ($data['update_group_panel'] ?? true));
        });

        $this->broadcastToGroupProjects($schedule->group_id, 'schedule_updated', ['schedule_id' => $schedule->id]);
        return response()->json($schedule->fresh()->load('group', 'adviser', 'panel'));
    }

    public function destroy(Request $request, $id) {
        $this->assertCanManageSchedules($request);
        $schedule = DefenseSchedule::findOrFail($id);
        $groupId = $schedule->group_id;
        $scheduleId = $schedule->id;
        $schedule->delete();
        $this->broadcastToGroupProjects($groupId, 'schedule_updated', ['schedule_id' => $scheduleId]);
        return response()->json(['message' => 'Deleted']);
    }

    public function show($id) {
        return response()->json(
            DefenseSchedule::with(['group', 'group.projects', 'adviser', 'panel'])->findOrFail($id)
        );
    }

    // "Outline Defense on 2026-07-31, 1:00 PM–2:00 PM"
    private function describe(DefenseSchedule $s): string {
        [$start, $end] = Times::window($s);
        $type = DefenseSchedule::TYPE_LABELS[$s->defense_type] ?? 'defense';
        $date = $s->defense_date instanceof \DateTimeInterface ? $s->defense_date->format('Y-m-d') : substr((string) $s->defense_date, 0, 10);
        return "{$type} on {$date}, " . Times::label($start) . '–' . Times::label($end);
    }
}
