<?php
namespace App\Http\Controllers;
use App\Models\Contribution;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Services\NotificationService;
use App\Services\SimilarityService;
use Illuminate\Http\Request;

class ProjectController extends Controller {

    public function index(Request $request) {
        $user  = $request->user();
        $query = Project::with('adviser', 'instructor', 'members', 'group', 'group.members.user', 'group.adviser');

        // ── School isolation ──────────────────────────────────
        if ($user->school_id) {
            $query->where('school_id', $user->school_id);
        }

        if ($user->role === 'student') {
            $projectIds = ProjectMember::where('user_id', $user->id)->pluck('project_id');
            $query->whereIn('id', $projectIds);
        } elseif ($user->role === 'adviser') {
            $groupIds = \App\Models\Group::where('adviser_id', $user->id)->pluck('id');
            $query->where(function($q) use ($user, $groupIds) {
                $q->where('adviser_id', $user->id)
                ->orWhereIn('group_id', $groupIds);
            });
        } elseif ($user->role === 'panelist') {
            $query->whereIn('status', ['approved', 'for_defense']);
        }

        return response()->json($query->get());
    }

    public function store(Request $request, SimilarityService $svc, NotificationService $notifications) {
        $data = $request->validate([
            'title'         => 'required|string|max:500',
            'abstract'      => 'nullable|string',
            'objectives'    => 'nullable|string',
            'keywords'      => 'nullable|string|max:500',
            'batch'         => 'nullable|string|max:20',
            'program'       => 'nullable|string|max:150',
            'instructor_id' => 'nullable|integer|exists:users,id',
            'adviser_id'    => 'nullable|integer|exists:users,id',
            'group_id'      => 'nullable|integer|exists:groups,id',
            'members'       => 'nullable|array',
            'members.*'     => 'integer|exists:users,id',
            'github_url'    => 'nullable|url|max:500',
        ]);

        // ── School isolation ──────────────────────────────────
        $user = $request->user();
        $data['school_id'] = $user->school_id;

        // Only compare against projects from the same school
        $archived = Project::whereIn('status', ['approved', 'archived'])
            ->when($user->school_id, fn($q) => $q->where('school_id', $user->school_id))
            ->get();

        // Try Python NLP first, fallback to PHP cosine similarity
        try {
            $archivedForPython = $archived->map(fn($p) => [
                'id'         => $p->id,
                'title'      => $p->title ?? '',
                'abstract'   => $p->abstract ?? '',
                'objectives' => $p->objectives ?? '',
            ])->toArray();

            $response = \Illuminate\Support\Facades\Http::timeout(30)
            ->post(config('services.similarity_url') . '/check', [
                'use_sbert'   => true,
                'new_project' => [
                        'title'      => $data['title'],
                        'abstract'   => $data['abstract']   ?? '',
                        'objectives' => $data['objectives']  ?? '',
                    ],
                    'archived' => $archivedForPython,
                ]);

            if ($response->successful()) {
                $nlpResult = $response->json();
                $topScore  = $nlpResult['overall_score'] ?? 0;
                $results   = $nlpResult['matches'] ?? [];
            } else {
                throw new \Exception('Python NLP service returned error');
            }
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning('NLP similarity fallback triggered: ' . $e->getMessage());
            $results  = $svc->checkAgainstArchive([
                'title'      => $data['title'],
                'abstract'   => $data['abstract']   ?? '',
                'objectives' => $data['objectives']  ?? '',
            ], $archived);
            $topScore = !empty($results) ? $results[0]['overall_score'] : 0;
        }

        $data['similarity_score'] = $topScore;
        $data['status']           = 'ongoing';
        $data['title_status']     = 'pending';

        // Auto-assign adviser from the group if one is set
        $data['adviser_id'] = null;
        if (!empty($data['group_id'])) {
            $group = \App\Models\Group::find($data['group_id']);
            if ($group && $group->adviser_id) {
                $data['adviser_id'] = $group->adviser_id;
            }
        }
        // Fallback: if adviser_id was sent directly from frontend, use it
        if (empty($data['adviser_id']) && $request->filled('adviser_id')) {
            $data['adviser_id'] = $request->input('adviser_id');
        }

        $project = Project::create($data);

        // Notify adviser about new proposal
        if ($data['adviser_id']) {
            $notifications->send(
                $data['adviser_id'], 'title_pending', 'New Proposal Submitted',
                'A proposal has been submitted for your review: "' . $data['title'] . '". Please review and approve or return for revision.',
                $project->id
            );
        }

        // Auto-add group members if group_id provided
        if (!empty($data['group_id'])) {
            $groupMembers = \App\Models\GroupMember::where('group_id', $data['group_id'])->get();
            foreach ($groupMembers as $gm) {
                ProjectMember::firstOrCreate(
                    ['project_id' => $project->id, 'user_id' => $gm->user_id],
                    ['is_leader'  => $gm->is_leader]
                );
            }
        } elseif (!empty($data['members'])) {
            foreach ($data['members'] as $i => $userId) {
                ProjectMember::create([
                    'project_id' => $project->id,
                    'user_id'    => $userId,
                    'is_leader'  => $i === 0 ? 1 : 0,
                ]);
            }
        }

        if (!empty($results)) {
            foreach ($results as $r) {
                \App\Models\SimilarityResult::create([
                    'project_id'             => $project->id,
                    'compared_to_project_id' => $r['compared_to_id'],
                    'title_score'            => $r['title_score'],
                    'abstract_score'         => $r['abstract_score'],
                    'objectives_score'       => $r['objectives_score'],
                    'overall_score'          => $r['overall_score'],
                ]);
            }
        }

        // Log contribution for the submitter
        Contribution::create([
            'project_id'  => $project->id,
            'user_id'     => $user->id,
            'action'      => 'proposal_submitted',
            'description' => "Submitted proposal: \"{$project->title}\"",
        ]);

        return response()->json($project->load('members'), 201);
    }

    public function show($id) {
        return response()->json(
            Project::with('adviser', 'instructor', 'members', 'documents', 'schedule')->findOrFail($id)
        );
    }

    public function update(Request $request, $id, NotificationService $notifications) {
        $project = Project::findOrFail($id);
        $user    = $request->user();

        // Fields that steer the project's approval/workflow state are staff-only
        // (adviser/instructor/admin) -- a student must never be able to
        // self-approve their own title or reassign their own adviser/instructor.
        $staffOnlyFields = ['status', 'title_status', 'title_feedback', 'instructor_id', 'adviser_id'];
        if (array_intersect($staffOnlyFields, array_keys($request->all()))) {
            abort_unless(in_array($user->role, ['adviser', 'instructor', 'admin']), 403, 'Only advisers, instructors, or admins can change a project\'s status or assignment.');
        }

        // Editing the proposal's own content (title/abstract/etc.) is allowed
        // for staff, or for a student who is a member of this exact project
        // and only while the title is still pending (matches the frontend,
        // which locks editing once a title has been approved/rejected).
        if (!in_array($user->role, ['adviser', 'instructor', 'admin'])) {
            $isMember = ProjectMember::where('project_id', $id)->where('user_id', $user->id)->exists();
            abort_unless($isMember, 403, 'You do not have access to this project.');
            abort_unless($project->title_status === 'pending', 403, 'This proposal can no longer be edited.');
        }

        $data = $request->validate([
            'title'          => 'sometimes|string|max:500',
            'abstract'       => 'nullable|string',
            'objectives'     => 'nullable|string',
            'keywords'       => 'nullable|string|max:500',
            'batch'          => 'nullable|string|max:20',
            'program'        => 'nullable|string|max:150',
            'instructor_id'  => 'nullable|integer|exists:users,id',
            'adviser_id'     => 'nullable|integer|exists:users,id',
            'status'         => 'sometimes|in:ongoing,for_defense,approved,archived,flagged',
            'title_status'   => 'sometimes|in:pending,approved,rejected',
            'title_feedback' => 'nullable|string|max:1000',
            'github_url'     => 'nullable|url|max:500',
        ]);

        $oldTitleStatus = $project->title_status;
        $project->update($data);

        if (isset($data['title_status']) && $data['title_status'] !== $oldTitleStatus) {
            $members = ProjectMember::where('project_id', $id)->get();

            // A group can have more than one title proposal approved at once (e.g. they
            // submitted a few candidates). If this is the only approved title under the
            // group so far, there's no ambiguity — auto-finalize it so upload/review just
            // works. If a sibling is already approved, leave both unresolved: the group
            // leader has to explicitly pick one via chooseFinal(), since only they know
            // which one they actually want to commit to.
            if ($data['title_status'] === 'approved' && $project->group_id) {
                $siblingApproved = Project::where('group_id', $project->group_id)
                    ->where('id', '!=', $project->id)
                    ->where('title_status', 'approved')
                    ->exists();
                if (!$siblingApproved) {
                    $project->update(['is_final_title' => true]);
                }
            }

            foreach ($members as $member) {
                if ($data['title_status'] === 'approved') {
                    $notifications->send(
                        $member->user_id, 'title_approved', 'Title Approved!',
                        'Your proposal "' . $project->title . '" has been approved. You can now upload your chapter documents.',
                        $id
                    );
                } elseif ($data['title_status'] === 'rejected') {
                    $notifications->send(
                        $member->user_id, 'title_rejected', 'Title Needs Revision',
                        'Your proposal "' . $project->title . '" was returned for revision. Check the instructor feedback.',
                        $id
                    );
                }
            }

            Contribution::create([
                'project_id'  => $id,
                'user_id'     => $request->user()->id,
                'action'      => 'title_' . $data['title_status'],
                'description' => 'Title "' . $project->title . '" marked ' . $data['title_status'] . '.',
            ]);
        }

        return response()->json($project);
    }

    // Lets the group leader commit to one of the group's (possibly several)
    // approved title proposals as "the" thesis title. Un-finalizes and archives
    // any other approved sibling proposals under the same group so there's
    // never more than one active title, and tells the adviser/instructor which
    // title was picked.
    public function chooseFinal($id, Request $request, NotificationService $notifications) {
        $project = Project::findOrFail($id);
        $user = $request->user();

        abort_unless($project->title_status === 'approved', 422, 'Only an approved title can be chosen as final.');
        abort_unless($project->group_id, 422, 'This project has no group to coordinate the choice with.');

        $isLeader = ProjectMember::where('project_id', $id)
            ->where('user_id', $user->id)
            ->where('is_leader', true)
            ->exists();
        abort_unless($isLeader, 403, 'Only the group leader can choose the final title.');

        $siblings = Project::where('group_id', $project->group_id)
            ->where('id', '!=', $project->id)
            ->where('title_status', 'approved')
            ->get();
        foreach ($siblings as $sibling) {
            $sibling->update(['is_final_title' => false, 'status' => 'archived']);
        }

        $project->update(['is_final_title' => true]);

        Contribution::create([
            'project_id'  => $project->id,
            'user_id'     => $user->id,
            'action'      => 'title_chosen',
            'description' => 'Chose "' . $project->title . '" as the group\'s final title.',
        ]);

        foreach (array_filter([$project->adviser_id, $project->instructor_id]) as $notifyId) {
            $notifications->send(
                $notifyId, 'title_chosen', 'Final Title Selected',
                'The group has chosen "' . $project->title . '" as their final thesis title.',
                $project->id
            );
        }

        return response()->json($project->load('adviser', 'instructor', 'members'));
    }

    public function destroy(Request $request, $id) {
        $project = Project::findOrFail($id);
        $user    = $request->user();

        if ($user->role !== 'admin') {
            // Non-admins may only withdraw their own still-pending proposal --
            // matches the frontend, which only ever offers "Delete" to a
            // student on their own project while title_status is pending.
            $isMember = ProjectMember::where('project_id', $id)->where('user_id', $user->id)->exists();
            abort_unless($isMember && $project->title_status === 'pending', 403, 'You cannot delete this project.');
        }

        $project->delete();
        return response()->json(['message' => 'Deleted']);
    }

    public function similarityDetail($id) {
        $project = Project::find($id);
        $result = \App\Models\SimilarityResult::where('project_id', $id)
            ->orderBy('overall_score', 'desc')
            ->first();

        if (!$result) {
            return response()->json([
                'title_score'      => null,
                'abstract_score'   => null,
                'objectives_score' => null,
                'overall_score'    => null,
                'matched_title'      => null,
                'own_abstract'       => $project?->abstract,
                'own_objectives'     => $project?->objectives,
                'matched_abstract'   => null,
                'matched_objectives' => null,
            ]);
        }

        $matchedProject = \App\Models\Project::find($result->compared_to_project_id);

        return response()->json([
            'title_score'      => $result->title_score,
            'abstract_score'   => $result->abstract_score,
            'objectives_score' => $result->objectives_score,
            'overall_score'    => $result->overall_score,
            'matched_title'      => $matchedProject?->title,
            // Full text of both sides so the frontend can highlight exactly
            // which phrases overlap, not just show an opaque score.
            'own_abstract'       => $project?->abstract,
            'own_objectives'     => $project?->objectives,
            'matched_abstract'   => $matchedProject?->abstract,
            'matched_objectives' => $matchedProject?->objectives,
        ]);
    }

    public function recheckSimilarity($id, SimilarityService $svc, \Illuminate\Http\Request $request) {
        $user     = $request->user();
        $project  = Project::findOrFail($id);
        $archived = Project::whereIn('status', ['approved', 'archived'])
                        ->where('id', '!=', $id)
                        ->when($project->school_id, fn($q) => $q->where('school_id', $project->school_id))
                        ->get();

        try {
            $archivedForPython = $archived->map(fn($p) => [
                'id'         => $p->id,
                'title'      => $p->title ?? '',
                'abstract'   => $p->abstract ?? '',
                'objectives' => $p->objectives ?? '',
            ])->toArray();

            $response = \Illuminate\Support\Facades\Http::timeout(30)
            ->post(config('services.similarity_url') . '/check', [
                'use_sbert'   => true,
                'new_project' => [
                        'title'      => $project->title,
                        'abstract'   => $project->abstract   ?? '',
                        'objectives' => $project->objectives ?? '',
                    ],
                    'archived' => $archivedForPython,
                ]);

            if ($response->successful()) {
                $nlpResult = $response->json();
                $topScore  = $nlpResult['overall_score'] ?? 0;
                $results   = $nlpResult['matches'] ?? [];
            } else {
                throw new \Exception('Python NLP service error');
            }
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning('NLP recheck fallback triggered: ' . $e->getMessage());
            $results  = $svc->checkAgainstArchive([
                'title'      => $project->title,
                'abstract'   => $project->abstract   ?? '',
                'objectives' => $project->objectives ?? '',
            ], $archived);
            $topScore = !empty($results) ? $results[0]['overall_score'] : 0;
        }

        $project->update(['similarity_score' => $topScore]);

        \App\Models\SimilarityResult::where('project_id', $id)->delete();
        foreach ($results as $r) {
            \App\Models\SimilarityResult::create([
                'project_id'             => $id,
                'compared_to_project_id' => $r['compared_to_id'],
                'title_score'            => $r['title_score'],
                'abstract_score'         => $r['abstract_score'],
                'objectives_score'       => $r['objectives_score'],
                'overall_score'          => $r['overall_score'],
            ]);
        }

        return response()->json(['message' => 'Similarity rechecked', 'score' => $topScore]);
    }
}
