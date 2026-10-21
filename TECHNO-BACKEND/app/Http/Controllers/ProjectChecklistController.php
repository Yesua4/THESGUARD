<?php
namespace App\Http\Controllers;
use App\Http\Controllers\Concerns\AuthorizesDocumentAccess;
use App\Models\Contribution;
use App\Models\Project;
use App\Models\ProjectChecklistItem;
use App\Services\ActivityBroadcastService;
use Illuminate\Http\Request;

// Pre-deployment readiness and final manuscript routing checklists. Each item
// names the role responsible for signing it off, so the routing order
// (adviser -> panel -> instructor -> dean -> library) is enforced by who can
// tick what. Default items are created the first time a project's checklists
// are opened; staff can add project-specific items on top.
class ProjectChecklistController extends Controller {
    use AuthorizesDocumentAccess;

    public const TEMPLATES = [
        'pre_deployment' => [
            ['outline_recommendations', 'All outline defense recommendations addressed', 'student'],
            ['system_deployed', 'System deployed and accessible for panel review', 'student'],
            ['testing_done', 'Unit and integration testing completed', 'student'],
            ['uat_done', 'User acceptance testing conducted and results tabulated', 'student'],
            ['user_manual', 'User manual and system documentation prepared', 'student'],
            ['adviser_endorsement', 'Adviser endorsement for pre-deployment defense', 'adviser'],
            ['instructor_clearance', 'Capstone instructor clearance to schedule the defense', 'instructor'],
        ],
        'manuscript_routing' => [
            ['adviser_approval', 'Adviser approval of the final manuscript', 'adviser'],
            ['panel_approval', 'Panel approval of final revisions', 'panelist'],
            ['grammar_check', 'English and grammar editing completed', 'instructor'],
            ['format_check', 'Format and similarity check passed', 'instructor'],
            ['instructor_approval', 'Capstone instructor approval', 'instructor'],
            ['dean_approval', 'Dean or program chair approval', 'admin'],
            ['final_copy', 'Final copy submitted to the library and archive', 'student'],
        ],
    ];

    public function index(Request $request, $projectId) {
        $project = $this->authorizeProject($request->user(), $projectId);
        $this->ensureDefaults($project);

        $items = ProjectChecklistItem::with('completer:id,name')
            ->where('project_id', $project->id)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->groupBy('checklist_type');

        return response()->json([
            'pre_deployment'     => $items->get('pre_deployment', collect())->values(),
            'manuscript_routing' => $items->get('manuscript_routing', collect())->values(),
        ]);
    }

    public function store(Request $request, $projectId) {
        $user = $request->user();
        abort_unless(in_array($user->role, ['admin', 'instructor', 'adviser']), 403, 'Only advisers, instructors, or admins can add checklist items.');
        $project = $this->authorizeProject($user, $projectId);

        $data = $request->validate([
            'checklist_type'   => 'required|in:pre_deployment,manuscript_routing',
            'label'            => 'required|string|max:255',
            'responsible_role' => 'required|in:admin,instructor,adviser,student,panelist',
        ]);

        $nextOrder = (int) ProjectChecklistItem::where('project_id', $project->id)
            ->where('checklist_type', $data['checklist_type'])
            ->max('sort_order') + 1;

        $item = ProjectChecklistItem::create($data + [
            'project_id' => $project->id,
            'school_id'  => $user->school_id,
            'item_key'   => null,
            'sort_order' => $nextOrder,
        ]);

        return response()->json($item, 201);
    }

    public function update(Request $request, $id, ActivityBroadcastService $activity) {
        $user = $request->user();
        $item = ProjectChecklistItem::findOrFail($id);
        $this->authorizeProject($user, $item->project_id);
        abort_unless(
            $user->role === 'admin' || $user->role === $item->responsible_role,
            403, 'This item can only be signed off by the ' . $item->responsible_role . '.'
        );

        $data = $request->validate([
            'is_done' => 'sometimes|boolean',
            'remarks' => 'nullable|string|max:1000',
        ]);

        $wasDone = $item->is_done;
        $item->fill($data);
        if (isset($data['is_done']) && $data['is_done'] !== $wasDone) {
            $item->done_by = $data['is_done'] ? $user->id : null;
            $item->done_at = $data['is_done'] ? now() : null;
        }
        $item->save();

        if (!$wasDone && $item->is_done) {
            Contribution::create([
                'project_id'  => $item->project_id,
                'user_id'     => $user->id,
                'action'      => 'checklist_completed',
                'description' => 'Completed checklist item: "' . $item->label . '"',
            ]);
        }
        $activity->broadcast($item->project_id, 'checklist_updated', ['item_id' => $item->id]);

        return response()->json($item->fresh('completer:id,name'));
    }

    public function destroy(Request $request, $id) {
        $user = $request->user();
        abort_unless(in_array($user->role, ['admin', 'instructor', 'adviser']), 403, 'Only advisers, instructors, or admins can remove checklist items.');
        $item = ProjectChecklistItem::findOrFail($id);
        $this->authorizeProject($user, $item->project_id);
        abort_unless($item->item_key === null, 422, 'Default checklist items cannot be removed.');

        $item->delete();
        return response()->json(['message' => 'Checklist item removed']);
    }

    private function ensureDefaults(Project $project): void {
        foreach (self::TEMPLATES as $type => $rows) {
            foreach ($rows as $order => [$key, $label, $role]) {
                ProjectChecklistItem::firstOrCreate(
                    ['project_id' => $project->id, 'checklist_type' => $type, 'item_key' => $key],
                    ['label' => $label, 'responsible_role' => $role, 'sort_order' => $order, 'school_id' => $project->school_id]
                );
            }
        }
    }

    private function authorizeProject($user, $projectId): Project {
        $project = Project::findOrFail($projectId);
        abort_unless(static::userCanAccessProject($user, $project->id), 403, 'You do not have access to this project.');
        return $project;
    }
}
