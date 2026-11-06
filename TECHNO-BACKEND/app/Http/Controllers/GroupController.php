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
        $user  = $request->user();
        $query = Group::with('instructor', 'adviser', 'members', 'leader', 'projects', 'term');

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
        }

        return response()->json($this->withStages($query->get()));
    }

    // Each group's current capstone stage, worked out from the calendar.
    private function withStages($groups) {
        $stages = app(CapstoneStageService::class);
        return $groups->map(function ($g) use ($stages) {
            $g->setAttribute('capstone', $stages->forGroup($g));
            // Who a proposal from this group goes to (shown on the form).
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
        abort_unless($group->isManageableBy($request->user()), 403, 'This group is not in a section you handle.');
    }

    public function store(Request $request) {
        $this->assertCanManageGroups($request);
        $data = $request->validate([
            'group_name' => 'required|string|unique:groups,group_name',
            'batch'      => 'nullable|string',
            'academic_term_id' => 'nullable|integer',
            'section'    => 'nullable|string|max:100',
            'adviser_id' => 'nullable|integer',
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

    public function show($id) {
        $group = Group::with('instructor', 'adviser', 'members', 'leader', 'projects', 'term')->findOrFail($id);
        $group->setAttribute('capstone', app(CapstoneStageService::class)->forGroup($group));
        return response()->json($group);
    }

    public function update(Request $request, $id) {
        $this->assertCanManageGroups($request);
        $group = Group::findOrFail($id);
        $this->assertGroupInScope($request, $group);
        if ($request->has('section')) {
            abort_unless($request->user()->handlesSection($request->input('section')), 403, 'You can only move groups into sections you handle.');
        }
        $changes = $request->only(['group_name', 'batch', 'section', 'adviser_id']);
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

    public function destroy(Request $request, $id) {
        $this->assertCanManageGroups($request);
        $group = Group::findOrFail($id);
        $this->assertGroupInScope($request, $group);
        $group->delete();
        return response()->json(['message' => 'Deleted']);
    }

    public function students(Request $request) {
        $user = $request->user();
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