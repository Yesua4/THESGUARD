<?php
namespace App\Http\Controllers;
use App\Models\Group;
use App\Models\GroupMember;
use App\Models\User;
use Illuminate\Http\Request;

class GroupController extends Controller {

    public function index(Request $request) {
        $user  = $request->user();
        $query = Group::with('instructor', 'adviser', 'members', 'leader', 'projects');

        // ── School isolation ──────────────────────────────────
        if ($user->school_id) {
            $query->where('school_id', $user->school_id);
        }

        if ($user->role === 'adviser') {
            $query->where('adviser_id', $user->id);
        } elseif ($user->role === 'student') {
            $groupIds = GroupMember::where('user_id', $user->id)->pluck('group_id');
            $query->whereIn('id', $groupIds);
        }

        return response()->json($query->get());
    }

    // Group creation/editing is instructor-only in the frontend (PageGroups.jsx
    // gates the create form, delete, and adviser-reassignment controls to
    // user.role === 'instructor'; adviser only ever gets a read-only list) --
    // admin is included too, matching the "admin can always manage" pattern
    // used consistently across every other controller in this codebase.
    private function assertCanManageGroups(Request $request) {
        abort_unless(in_array($request->user()->role, ['instructor', 'admin']), 403, 'Only instructors and admins can manage groups.');
    }

    public function store(Request $request) {
        $this->assertCanManageGroups($request);
        $data = $request->validate([
            'group_name' => 'required|string|unique:groups,group_name',
            'batch'      => 'nullable|string',
            'section'    => 'nullable|string|max:100',
            'adviser_id' => 'nullable|integer',
            'members'    => 'required|array|min:1',
            'leader_id'  => 'required|integer',
        ]);

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

        $group = Group::create([
            'group_name'    => $data['group_name'],
            'batch'         => $data['batch'] ?? null,
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
        return response()->json(
            Group::with('instructor', 'adviser', 'members', 'leader', 'projects')->findOrFail($id)
        );
    }

    public function update(Request $request, $id) {
        $this->assertCanManageGroups($request);
        $group = Group::findOrFail($id);
        $group->update($request->only(['group_name', 'batch', 'section', 'adviser_id']));

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
        Group::findOrFail($id)->delete();
        return response()->json(['message' => 'Deleted']);
    }

    public function students(Request $request) {
        $user = $request->user();
        $query = User::where('role', 'student');

        // ── School isolation ──────────────────────────────────
        if ($user->school_id) {
            $query->where('school_id', $user->school_id);
        }

        return response()->json($query->get());
    }

    public function advisers(Request $request) {
        $user = $request->user();
        $query = User::whereIn('role', ['adviser', 'instructor']);

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