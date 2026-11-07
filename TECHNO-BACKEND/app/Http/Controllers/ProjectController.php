<?php
namespace App\Http\Controllers;
use App\Models\Contribution;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Services\ActivityBroadcastService;
use App\Services\EmbeddingService;
use App\Services\NotificationService;
use App\Services\SimilarityService;
use Illuminate\Http\Request;

class ProjectController extends Controller {

    public function index(Request $request) {
        $user  = $request->user();
        $query = Project::with('adviser', 'instructor', 'members', 'group', 'group.members.user', 'group.adviser', 'group.recommender:id,name');

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
        } elseif ($user->role === 'instructor' && $user->sectionScope()) {
            // Section-scoped instructor: projects of groups in their sections
            // (or that they created/advise), plus projects assigned to them.
            $groupIds = \App\Models\Group::query()->visibleToInstructor($user)->pluck('id');
            $query->where(fn ($q) => $q
                ->where('instructor_id', $user->id)
                ->orWhereIn('group_id', $groupIds)
            );
        }

        return response()->json($query->get());
    }

    // Approved capstones from previous batches, readable by every role in the
    // school (students included) so they can check what has already been done.
    // Alternate titles a group dropped via chooseFinal() are also stored as
    // 'archived', but they were never completed, so they're left out here.
    public function archive(Request $request) {
        $user = $request->user();

        $projects = Project::with('adviser:id,name')
            ->where('status', 'archived')
            ->where(fn($q) => $q->whereNull('group_id')->orWhere('is_final_title', true))
            ->when($user->school_id, fn($q) => $q->where('school_id', $user->school_id))
            ->orderByDesc('batch')
            ->orderBy('title')
            ->get(['id', 'title', 'description', 'abstract', 'abstract_is_final', 'objectives', 'keywords', 'batch', 'program', 'adviser_id', 'status']);

        return response()->json($projects);
    }

    public function importArchived(Request $request) {
        $user = $request->user();
        abort_unless(in_array($user->role, ['admin', 'instructor']), 403, 'Only administrators and instructors can import archived projects.');

        $request->validate([
            'file' => 'required|file|mimes:csv,txt|max:5120',
        ]);

        $csv = \League\Csv\Reader::createFromPath($request->file('file')->getPathname(), 'r');
        $csv->setHeaderOffset(0);

        $records = collect($csv->getRecords());
        $created = 0;
        $duplicates = 0;
        $skipped = [];

        // Pre-load existing archived titles for this school so each row is a
        // cheap in-memory lookup instead of a query -- keeps the loop fast
        // enough to stay under PHP's execution-time limit on large CSVs, and
        // also catches duplicate rows within the CSV file itself, not just
        // ones already in the archive.
        $existingTitles = Project::where('status', 'archived')
            ->when($user->school_id, fn($q) => $q->where('school_id', $user->school_id))
            ->pluck('title')
            ->map(fn($t) => strtolower(trim($t)))
            ->flip();

        foreach ($records as $index => $row) {
            $title      = trim($row['title']      ?? $row['Title']      ?? '');
            $abstract   = trim($row['abstract']   ?? $row['Abstract']   ?? '');
            $objectives = trim($row['objectives'] ?? $row['Objectives'] ?? '');
            $keywords   = trim($row['keywords']   ?? $row['Keywords']   ?? '');
            $batch      = trim($row['batch']      ?? $row['Batch']      ?? $row['year'] ?? $row['Year'] ?? '');
            $program    = trim($row['program']    ?? $row['Program']    ?? '');
            $adviserName = trim($row['adviser']   ?? $row['Adviser']    ?? '');

            if (!$title) {
                $skipped[] = "Row " . ($index + 2) . ": Missing title.";
                continue;
            }

            $titleKey = strtolower($title);
            if ($existingTitles->has($titleKey)) {
                $duplicates++;
                $skipped[] = "Row " . ($index + 2) . ": Already in the archive (duplicate title), skipped.";
                continue;
            }
            $existingTitles->put($titleKey, true);

            $adviserId = null;
            if ($adviserName) {
                $adviser = \App\Models\User::withRole('adviser')
                    ->where('school_id', $user->school_id)
                    ->whereRaw('LOWER(name) = ?', [strtolower($adviserName)])
                    ->first();
                $adviserId = $adviser?->id;
            }

            $imported = Project::create([
                'group_id'      => null,
                'title'         => substr($title, 0, 500),
                'abstract'      => $abstract ?: null,
                'abstract_is_final' => (bool) $abstract,
                'objectives'    => $objectives ?: null,
                'keywords'      => $keywords ? substr($keywords, 0, 500) : null,
                'batch'         => $batch ? substr($batch, 0, 20) : null,
                'program'       => $program ?: null,
                'adviser_id'    => $adviserId,
                'instructor_id' => null,
                'status'        => 'archived',
                'title_status'  => 'approved',
                'school_id'     => $user->school_id,
            ]);
            // No synchronous embedAndCache() here on purpose: looping it
            // over every CSV row made the request blow past PHP's
            // max_execution_time on large imports, which kills the script
            // before Laravel can send a response. Archived projects fall
            // back to live-encoding in /check until something re-embeds
            // them (see EmbeddingService::embedAndCache docblock).

            $created++;
        }

        $message = $created > 0
            ? "{$created} archived project(s) imported successfully." . ($duplicates > 0 ? " {$duplicates} duplicate(s) skipped." : '')
            : ($duplicates > 0 ? "No new projects imported -- all {$duplicates} row(s) already exist in the archive." : 'No projects were imported.');

        return response()->json([
            'created' => $created,
            'duplicates' => $duplicates,
            'skipped' => $skipped,
            'message' => $message,
        ]);
    }

    public function store(Request $request, SimilarityService $svc, NotificationService $notifications, EmbeddingService $embedder) {
        $data = $request->validate([
            'title'         => 'required|string|max:500',
            // A proposal has no abstract yet: students write a Project
            // Description ("abstract" still accepted from older clients).
            'description'   => 'nullable|string',
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

        // The description is what gets compared until a final abstract exists.
        $data['description'] = $data['description'] ?? $data['abstract'] ?? null;
        $data['abstract'] = $data['description'];
        $data['abstract_is_final'] = false;

        // Instructor, academic year and term come from the group -- the
        // student doesn't pick them.
        if (!empty($data['group_id']) && ($g = \App\Models\Group::find($data['group_id']))) {
            $data['instructor_id'] = \App\Services\CapstoneStageService::instructorFor($g) ?? ($data['instructor_id'] ?? null);
            $data['batch'] = $g->batch ?: ($data['batch'] ?? null);
        }

        // Only compare against projects from the same school
        $archived = Project::whereIn('status', ['approved', 'archived'])
            ->when($user->school_id, fn($q) => $q->where('school_id', $user->school_id))
            ->get();

        // Try Python NLP first, fallback to PHP cosine similarity
        try {
            $archivedForPython = $archived->map(fn($p) => [
                'id'                   => $p->id,
                'title'                => $p->title ?? '',
                'abstract'             => $p->abstract ?? '',
                'objectives'           => $p->objectives ?? '',
                'title_embedding'      => $p->title_embedding,
                'abstract_embedding'   => $p->abstract_embedding,
                'objectives_embedding' => $p->objectives_embedding,
            ])->toArray();

            $response = \Illuminate\Support\Facades\Http::timeout(120)
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
        $embedder->embedAndCache($project);

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

    // After passing the final defense, the group records its real abstract.
    // From then on new proposals are compared against it (the original
    // project description is kept).
    public function finalAbstract(Request $request, $id, EmbeddingService $embedder, ActivityBroadcastService $activity) {
        $user = $request->user();
        $project = Project::findOrFail($id);
        abort_unless(\App\Http\Controllers\DocumentController::userCanAccessProject($user, $project->id), 403, 'You do not have access to this project.');
        abort_unless(
            in_array($user->role, ['adviser', 'instructor', 'admin'], true) || $this->isMember($user, $project),
            403, 'Only the group or its faculty can set the final abstract.'
        );
        $finished = in_array($project->status, ['approved', 'archived'], true) || $project->defense_verdict === 'passed';
        abort_unless($finished && ($project->is_final_title || !$project->group_id), 422,
            'The final abstract can be added once the project has passed its final defense.');

        $data = $request->validate(['abstract' => 'required|string|min:50|max:10000'], [
            'abstract.min' => 'Paste the full final abstract (at least 50 characters).',
        ]);
        $project->update(['abstract' => trim($data['abstract']), 'abstract_is_final' => true]);
        $embedder->embedAndCache($project);
        $activity->broadcast($project->id, 'project_updated', ['project' => $project]);

        return response()->json($project);
    }

    public function show(Request $request, $id) {
        $user    = $request->user();
        $project = Project::findOrFail($id);
        $this->authorizeProjectView($user, $project);

        // A student opening someone else's archived capstone (from the archive
        // or a similarity match) gets the public record only, not that
        // group's documents or schedule.
        if ($user->role === 'student' && !$this->isMember($user, $project)) {
            return response()->json($project->load('adviser:id,name')->only([
                'id', 'title', 'description', 'abstract', 'abstract_is_final', 'objectives', 'keywords', 'batch', 'program', 'status', 'adviser',
            ]));
        }

        return response()->json($project->load('adviser', 'instructor', 'members', 'documents', 'schedule'));
    }

    // School isolation for every role, and students may only open their own
    // projects or archived (completed) capstones.
    private function authorizeProjectView($user, Project $project): void {
        abort_if(
            $user->school_id && $project->school_id && $user->school_id !== $project->school_id,
            403, 'You do not have access to this project.'
        );
        if ($user->role === 'student') {
            abort_unless(
                $this->isMember($user, $project) || $project->status === 'archived',
                403, 'You do not have access to this project.'
            );
        }
    }

    private function isMember($user, Project $project): bool {
        return ProjectMember::where('project_id', $project->id)->where('user_id', $user->id)->exists();
    }

    public function update(Request $request, $id, NotificationService $notifications, ActivityBroadcastService $activity, EmbeddingService $embedder) {
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
            'description'    => 'nullable|string',
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

        // Editing the description updates the comparison text -- unless the
        // project already has its final abstract (that's set separately).
        if (array_key_exists('description', $data) && !$project->abstract_is_final) {
            $data['abstract'] = $data['description'];
        }
        if ($project->abstract_is_final) unset($data['abstract']);

        $oldTitleStatus = $project->title_status;
        $project->update($data);

        if (array_intersect(['title', 'abstract', 'description', 'objectives'], array_keys($data))) {
            $embedder->embedAndCache($project);
        }

        $activity->broadcast($project->id, 'project_updated', ['project' => $project]);

        if (isset($data['title_status']) && $data['title_status'] !== $oldTitleStatus) {
            $members = ProjectMember::where('project_id', $id)->get();

            // Approving a title means "approved for title defense" -- even when
            // it's the group's only one. The final title is set by faculty
            // after the title defense (chooseFinal), never automatically.

            foreach ($members as $member) {
                if ($data['title_status'] === 'approved') {
                    $notifications->send(
                        $member->user_id, 'title_approved', 'Approved for Title Defense',
                        'Your proposal "' . $project->title . '" has been approved for the title defense. Your final title will be set by your instructor after the defense.',
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
    public function chooseFinal($id, Request $request, NotificationService $notifications, ActivityBroadcastService $activity) {
        $project = Project::findOrFail($id);
        $user = $request->user();

        // After the title defense the panel tells the instructor which title
        // the group will pursue; faculty record it here. Students can't.
        abort_unless(in_array($user->role, ['instructor', 'adviser', 'admin'], true), 403,
            'The final title is set by your instructor or adviser after the title defense.');
        abort_unless(\App\Http\Controllers\DocumentController::userCanAccessProject($user, $project->id), 403,
            'You do not handle this group.');
        abort_unless($project->title_status === 'approved', 422, 'Only a title approved for the title defense can be set as final.');
        abort_unless($project->group_id, 422, 'This project has no group.');

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
            'description' => 'Set "' . $project->title . '" as the group\'s final title after the title defense.',
        ]);

        // Tell the group, and the other faculty on the project.
        $notifyIds = ProjectMember::where('project_id', $project->id)->pluck('user_id')
            ->merge([$project->adviser_id, $project->instructor_id])->filter()->unique()
            ->reject(fn ($uid) => (int) $uid === (int) $user->id);
        foreach ($notifyIds as $notifyId) {
            $notifications->send(
                $notifyId, 'title_chosen', '🏆 Final Title Set',
                '"' . $project->title . '" is now the final title (set by ' . $user->name . ' after the title defense). You can start uploading chapter documents.',
                $project->id
            );
        }

        $activity->broadcast($project->id, 'project_updated', ['project' => $project]);

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

    public function similarityDetail(Request $request, $id) {
        $user    = $request->user();
        $project = Project::findOrFail($id);
        $this->authorizeProjectView($user, $project);
        abort_if($user->role === 'student' && !$this->isMember($user, $project), 403, 'You can only view the similarity report of your own project.');
        $allResults = \App\Models\SimilarityResult::where('project_id', $id)
            ->orderBy('overall_score', 'desc')
            ->limit(25)
            ->get();
        $result = $allResults->first();

        // The full ranked list, so a reviewer can see everything a proposal
        // is similar to -- not just the single top match. Titles only (no
        // abstract/objectives text here, to keep this payload light); the
        // frontend fetches a match's full text on demand via GET /projects/{id}
        // only when a reviewer actually expands that specific row.
        $comparedIds = $allResults->pluck('compared_to_project_id');
        $comparedTitles = Project::whereIn('id', $comparedIds)->pluck('title', 'id');
        $allMatches = $allResults->map(fn ($r) => [
            'compared_to_id'    => $r->compared_to_project_id,
            'matched_title'     => $comparedTitles[$r->compared_to_project_id] ?? null,
            'title_score'       => $r->title_score,
            'abstract_score'    => $r->abstract_score,
            'objectives_score'  => $r->objectives_score,
            'overall_score'     => $r->overall_score,
        ])->values();

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
                'all_matches'        => [],
            ]);
        }

        $matchedProject = \App\Models\Project::find($result->compared_to_project_id);

        // Students see the full text of a matched capstone only once it's
        // archived; another group's in-progress proposal stays title-only.
        if ($user->role === 'student' && $matchedProject?->status !== 'archived') {
            $matchedProject?->setAttribute('abstract', null);
            $matchedProject?->setAttribute('objectives', null);
        }

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
            'all_matches'        => $allMatches,
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
                'id'                   => $p->id,
                'title'                => $p->title ?? '',
                'abstract'             => $p->abstract ?? '',
                'objectives'           => $p->objectives ?? '',
                'title_embedding'      => $p->title_embedding,
                'abstract_embedding'   => $p->abstract_embedding,
                'objectives_embedding' => $p->objectives_embedding,
            ])->toArray();

            $response = \Illuminate\Support\Facades\Http::timeout(120)
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
