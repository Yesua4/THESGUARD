<?php
namespace App\Http\Controllers;
use App\Models\Group;
use App\Models\GroupMember;
use App\Models\User;
use App\Models\AcademicTerm;
use App\Services\CapstoneStageService;
use Illuminate\Http\Request;

class GroupController extends Controller {

    public function index(Request $request) {
        return response()->json($this->withStages($this->visibleGroups($request->user())->get()));
    }

    // The groups this user may see: their school, then by role (an adviser's
    // own groups, an instructor's sections, a student's own group, the groups
    // a panelist sits on the panel of). Used by the list and by show().
    private function visibleGroups($user) {
        $query = Group::with('instructor', 'adviser', 'members', 'leader', 'projects', 'term', 'panel', 'recommender:id,name', 'stageInstructors');

        // ── School isolation ──────────────────────────────────
        if ($user->school_id) {
            $query->where('school_id', $user->school_id);
        }

        if ($user->role === 'adviser') {
            $query->where('adviser_id', $user->id);
        } elseif ($user->role === 'instructor') {
            $query->visibleToInstructor($user);
        } elseif ($user->role === 'student') {
            $groupIds = GroupMember::where('user_id', $user->id)->pluck('group_id');
            $query->whereIn('id', $groupIds);
        } elseif ($user->role === 'panelist') {
            $groupIds = \App\Models\Project::whereIn('id', \App\Http\Controllers\Concerns\AuthorizesDocumentAccess::accessibleProjectIds($user))
                ->pluck('group_id')
                ->merge(\App\Models\GroupPanelist::where('user_id', $user->id)->pluck('group_id'))
                ->filter()->unique();
            $query->whereIn('id', $groupIds);
        }
        return $query;
    }

    // Each group's current capstone stage, worked out from the calendar.
    private function withStages($groups) {
        $stages = app(CapstoneStageService::class);
        return $groups->map(function ($g) use ($stages) {
            $g->setAttribute('capstone', $stages->forGroup($g));
            // Who a proposal from this group goes to (shown on the form), and
            // keep its projects on the current stage's instructor.
            CapstoneStageService::syncProjectInstructors($g);
            $instructorId = CapstoneStageService::instructorFor($g);
            $g->setAttribute('current_instructor', $instructorId ? User::select('id', 'name')->find($instructorId) : null);
            return $g;
        });
    }

    // Group creation/editing is instructor-only in the frontend (PageGroups.jsx
    // gates the create form, delete, and adviser-reassignment controls to
    // user.role === 'instructor'; adviser only ever gets a read-only list) --
    // admin is included too, matching the "admin can always manage" pattern
    // used consistently across every other controller in this codebase.
    private function assertCanManageGroups(Request $request) {
        abort_unless(in_array($request->user()->role, ['instructor', 'admin']), 403, 'Only instructors and admins can manage groups.');
    }

    // A term from this school's own calendar, or null.
    private function termFor(Request $request, $termId): ?\App\Models\AcademicTerm {
        if (!$termId) return null;
        $term = \App\Models\AcademicTerm::where('school_id', $request->user()->school_id)->find($termId);
        abort_unless($term, 422, "That semester is not on your school's academic calendar.");
        return $term;
    }

    private function assertGroupInScope(Request $request, Group $group): void {
        $user = $request->user();
        abort_if($user->school_id && $group->school_id && (int) $group->school_id !== (int) $user->school_id, 403, "This group is not in your school.");
        abort_unless($group->isManageableBy($request->user()), 403, 'This group is not in a section you handle.');
    }

    // An institute of this school; the school admin may choose any, everyone
    // else only their own (or none when they have none).
    private function instituteFor(Request $request, $instituteId): ?int {
        $caller = $request->user();
        $instituteId = $instituteId === '' || $instituteId === null ? null : (int) $instituteId;
        if ($instituteId !== null) {
            abort_unless(\App\Models\Institute::whereKey($instituteId)->where('school_id', $caller->school_id)->exists(), 422, 'Choose an institute of your school.');
        }
        if (!$caller->isSchoolAdmin() && $caller->institute_id) {
            abort_unless($instituteId === (int) $caller->institute_id, 403, 'You can only put groups in your own institute.');
        }
        return $instituteId;
    }

    public function store(Request $request) {
        $this->assertCanManageGroups($request);
        $data = $request->validate([
            'group_name' => 'required|string|unique:groups,group_name',
            'batch'      => 'nullable|string',
            'academic_term_id' => 'nullable|integer',
            'section'    => 'nullable|string|max:100',
            'adviser_id' => 'nullable|integer',
            'institute_id' => 'nullable|integer',
            'members'    => 'required|array|min:1',
            'members.*'  => 'integer',
            'leader_id'  => 'required|integer',
        ]);

        // The group's section comes from its members (they already have one);
        // a typed section is only used when none of them has a section yet.
        $data['section'] = CapstoneStageService::sectionFromMembers($data['members'])
            ?? (User::normalizeSection($data['section'] ?? '') ?: null);

        // A section-scoped instructor can only create groups in their sections.
        $caller = $request->user();
        if ($scope = $caller->sectionScope()) {
            if (empty($data['section']) && count($scope) === 1) {
                $data['section'] = $scope[0];
            }
            if (!$caller->handlesSection($data['section'] ?? null)) {
                $msg = 'Choose one of your sections: ' . implode(', ', $scope) . '.';
                return response()->json(['message' => $msg, 'errors' => ['section' => [$msg]]], 422);
            }
        }

        // Check if any selected student already has a group
        $alreadyGrouped = [];
        foreach ($request->members as $userId) {
            $existing = GroupMember::where('user_id', $userId)->first();
            if ($existing) {
                $user = \App\Models\User::find($userId);
                $alreadyGrouped[] = $user->name;
            }
        }
        if (!empty($alreadyGrouped)) {
            return response()->json([
                'message' => 'Some students already have a group: ' . implode(', ', $alreadyGrouped),
                'errors'  => ['members' => ['The following students already belong to a group: ' . implode(', ', $alreadyGrouped)]]
            ], 422);
        }

        // Picking a term from the admin's calendar sets the academic year
        // (batch) from it, so the two can't disagree.
        // Not picked -> the term today falls in.
        $term = $this->termFor($request, $data['academic_term_id'] ?? null)
            ?? AcademicTerm::currentFor($caller->school_id);

        $group = Group::create([
            'group_name'    => $data['group_name'],
            'batch'         => $term?->academic_year ?? ($data['batch'] ?? null),
            'academic_term_id' => $term?->id,
            'start_year_level' => CapstoneStageService::yearLevelOf($data['section']),
            'section'       => $data['section'] ?? null,
            'instructor_id' => $request->user()->id,
            'adviser_id'    => $data['adviser_id'] ?? null,
            'school_id'     => $request->user()->school_id, // ── school isolation
            // Not chosen -> the creator's institute (which decides capstone vs thesis).
            'institute_id'  => $this->instituteFor($request, array_key_exists('institute_id', $data) ? $data['institute_id'] : $caller->institute_id),
        ]);

        foreach ($data['members'] as $userId) {
            GroupMember::create([
                'group_id'  => $group->id,
                'user_id'   => $userId,
                'is_leader' => $userId == $data['leader_id'] ? 1 : 0,
            ]);
        }

        return response()->json($group->load('members', 'adviser', 'instructor', 'leader'), 201);
    }

    public function show(Request $request, $id) {
        $group = $this->visibleGroups($request->user())->find($id);
        abort_unless($group, Group::whereKey($id)->exists() ? 403 : 404, 'You do not have access to this group.');
        // Same extras as the list (current stage, current instructor).
        return response()->json($this->withStages(collect([$group]))->first());
    }

    public function update(Request $request, $id) {
        $this->assertCanManageGroups($request);
        $group = Group::findOrFail($id);
        $this->assertGroupInScope($request, $group);
        if ($request->has('section')) {
            abort_unless($request->user()->handlesSection($request->input('section')), 403, 'You can only move groups into sections you handle.');
        }
        $changes = $request->only(['group_name', 'batch', 'section', 'adviser_id']);
        if ($request->has('institute_id')) {
            $changes['institute_id'] = $this->instituteFor($request, $request->input('institute_id'));
        }
        if ($request->has('academic_term_id')) {
            $term = $this->termFor($request, $request->input('academic_term_id'));
            $changes['academic_term_id'] = $term?->id;
            if ($term) $changes['batch'] = $term->academic_year;
        }
        $group->update($changes);

        // Keep every project under this group in sync with its adviser — Project.adviser_id
        // is otherwise just a one-time snapshot from creation, so assigning (or reassigning)
        // a group's adviser after projects already exist would silently leave them unable
        // to see documents (or leave a replaced adviser with stale access).
        if ($request->has('adviser_id')) {
            \App\Models\Project::where('group_id', $group->id)->update(['adviser_id' => $group->adviser_id]);
        }

        if ($request->has('members')) {
            GroupMember::where('group_id', $id)->delete();
            foreach ($request->members as $userId) {
                GroupMember::create([
                    'group_id'  => $id,
                    'user_id'   => $userId,
                    'is_leader' => $userId == $request->leader_id ? 1 : 0,
                ]);
            }
        }

        return response()->json($group->load('members', 'adviser', 'leader'));
    }

    // The group's permanent panel (outline -> final defense), with roles:
    // Panel Chair, Panel Member 1, Panel Member 2. Defenses from the outline
    // on use it automatically; it can be changed any time (e.g. a panelist
    // retires).
    public function setPanel(Request $request, $id) {
        $this->assertCanManageGroups($request);
        $group = Group::findOrFail($id);
        $this->assertGroupInScope($request, $group);
        $caller = $request->user();
        abort_if($caller->school_id && $group->school_id && (int) $group->school_id !== (int) $caller->school_id, 403);

        $data = $request->validate([
            'panel'           => 'present|array|max:3',
            'panel.*.role'    => 'required|in:chair,member1,member2|distinct',
            'panel.*.user_id' => 'required|integer|distinct|exists:users,id',
        ]);
        $ids = array_map(fn ($p) => (int) $p['user_id'], $data['panel']);

        $valid = User::whereIn('id', $ids)
            ->when($caller->school_id, fn ($q) => $q->where('school_id', $caller->school_id))
            ->withRole('panelist')->pluck('id')->map(fn ($i) => (int) $i)->all();
        if ($bad = array_diff($ids, $valid)) {
            $msg = 'Only accounts with the Panelist role can be on a panel: ' . User::whereIn('id', $bad)->pluck('name')->implode(', ') . '.';
            return response()->json(['message' => $msg, 'errors' => ['panel' => [$msg]]], 422);
        }
        if ($issues = app(\App\Services\DefenseScheduleService::class)->conflictOfInterest($group->id, $ids, [])) {
            $msg = implode(' ', $issues[0]['reasons']);
            return response()->json(['message' => $msg, 'errors' => ['panel' => [$msg]]], 422);
        }

        \Illuminate\Support\Facades\DB::transaction(function () use ($group, $data) {
            \App\Models\GroupPanelist::where('group_id', $group->id)->delete();
            foreach ($data['panel'] as $p) {
                \App\Models\GroupPanelist::create(['group_id' => $group->id, 'user_id' => $p['user_id'], 'role' => $p['role']]);
            }
        });

        return response()->json($group->fresh()->load('panel'));
    }

    // "Recommended for: <defense>" -- the step before a group is approved for
    // a defense. By the group's adviser, an instructor who handles the
    // group, or the admin. Students and the instructor are notified.
    public function recommend(Request $request, $id) {
        $user = $request->user();
        $group = Group::findOrFail($id);
        abort_if($user->school_id && $group->school_id && (int) $group->school_id !== (int) $user->school_id, 403);
        $allowed = $user->role === 'admin'
            || ($user->role === 'adviser' && (int) $group->adviser_id === (int) $user->id)
            || ($user->role === 'instructor' && $group->isManageableBy($user));
        abort_unless($allowed, 403, "Only this group's adviser, its instructor, or the admin can recommend it for a defense.");

        $data = $request->validate([
            'recommended_for' => 'nullable|in:' . implode(',', \App\Models\DefenseSchedule::TYPES),
        ]);
        $for = $data['recommended_for'] ?? null;

        $group->update([
            'recommended_for' => $for,
            'recommended_by'  => $for ? $user->id : null,
            'recommended_at'  => $for ? now() : null,
        ]);

        if ($for) {
            $label = \App\Models\DefenseSchedule::TYPE_LABELS[$for];
            $notify = GroupMember::where('group_id', $group->id)->pluck('user_id')
                ->push(\App\Services\CapstoneStageService::instructorFor($group))
                ->filter()->unique()->reject(fn ($uid) => (int) $uid === (int) $user->id);
            foreach ($notify as $uid) {
                app(\App\Services\NotificationService::class)->send(
                    $uid, 'recommendation', "✅ Recommended for {$label}",
                    "{$group->group_name} has been recommended for the {$label} by {$user->name}."
                );
            }
        }

        return response()->json($group->fresh()->load('recommender:id,name'));
    }

    // The instructor of each capstone stage for this group (Capstone 1 and 2
    // can differ). `user_id` null clears a stage.
    public function setStageInstructors(Request $request, $id) {
        $this->assertCanManageGroups($request);
        $group = Group::findOrFail($id);
        $this->assertGroupInScope($request, $group);
        $caller = $request->user();

        $data = $request->validate([
            'assignments'                     => 'present|array',
            'assignments.*.capstone_stage_id' => 'required|integer|distinct',
            'assignments.*.user_id'           => 'nullable|integer|exists:users,id',
        ]);
        $stageIds = \App\Models\CapstoneStage::where('school_id', $group->school_id ?? $caller->school_id)->pluck('id')->map(fn ($i) => (int) $i)->all();
        $userIds = array_filter(array_column($data['assignments'], 'user_id'));
        $instructors = User::whereIn('id', $userIds)
            ->when($caller->school_id, fn ($q) => $q->where('school_id', $caller->school_id))
            ->withRole('instructor')->pluck('id')->map(fn ($i) => (int) $i)->all();

        foreach ($data['assignments'] as $a) {
            abort_unless(in_array((int) $a['capstone_stage_id'], $stageIds, true), 422, 'That capstone stage is not in your school\'s capstone plan.');
            if ($a['user_id'] && !in_array((int) $a['user_id'], $instructors, true)) {
                return response()->json(['message' => 'Only accounts with the Instructor role can be a stage instructor.', 'errors' => ['assignments' => ['Only accounts with the Instructor role can be a stage instructor.']]], 422);
            }
        }

        foreach ($data['assignments'] as $a) {
            if ($a['user_id']) {
                \App\Models\GroupStageInstructor::updateOrCreate(
                    ['group_id' => $group->id, 'capstone_stage_id' => $a['capstone_stage_id']],
                    ['user_id' => $a['user_id']]
                );
            } else {
                \App\Models\GroupStageInstructor::where('group_id', $group->id)->where('capstone_stage_id', $a['capstone_stage_id'])->delete();
            }
        }
        CapstoneStageService::syncProjectInstructors($group);

        return response()->json($group->fresh()->load('stageInstructors'));
    }

    public function destroy(Request $request, $id) {
        $this->assertCanManageGroups($request);
        $group = Group::findOrFail($id);
        $this->assertGroupInScope($request, $group);
        $group->delete();
        return response()->json(['message' => 'Deleted']);
    }

    public function students(Request $request) {
        $user = $request->user();
        abort_unless(in_array($user->role, ['admin', 'instructor']), 403, 'Only administrators and instructors can view the student list.');
        $query = User::where('role', 'student');

        // ── School isolation ──────────────────────────────────
        if ($user->school_id) {
            $query->where('school_id', $user->school_id);
        }

        if ($sections = $user->sectionScope()) {
            User::whereSectionIn($query, 'section', $sections);
        }

        return response()->json($query->get());
    }

    public function advisers(Request $request) {
        $user = $request->user();
        abort_unless(in_array($user->role, ['admin', 'instructor']), 403, 'Only administrators and instructors can assign advisers.');
        $query = User::withRole(['adviser', 'instructor']);

        // ── School isolation ──────────────────────────────────
        if ($user->school_id) {
            $query->where('school_id', $user->school_id);
        }

        $advisers = $query->get();

        // How many groups each candidate is already advising, so whoever's
        // assigning an adviser can see who's already stretched thin instead
        // of having to check the groups list separately.
        $counts = Group::whereNotNull('adviser_id')
            ->selectRaw('adviser_id, count(*) as c')
            ->groupBy('adviser_id')
            ->pluck('c', 'adviser_id');
        $advisers->each(fn($a) => $a->groups_count = $counts[$a->id] ?? 0);

        return response()->json($advisers);
    }
}