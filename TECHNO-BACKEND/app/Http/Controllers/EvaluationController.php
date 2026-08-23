<?php
namespace App\Http\Controllers;
use App\Models\Contribution;
use App\Models\DefenseSchedule;
use App\Models\Evaluation;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\Request;

class EvaluationController extends Controller {

    public function __construct(private NotificationService $notifications) {}

    public function index(Request $request) {
        $user = $request->user();
        if ($user->role === 'panelist') {
            return response()->json(
                Evaluation::with('project', 'panelist')
                    ->where('panelist_id', $user->id)
                    ->get()
            );
        }
        // Only admin/instructor may see every evaluation across every
        // project; every other role must go through show($projectId)
        // instead, which is already scoped to one project.
        abort_unless(in_array($user->role, ['admin', 'instructor']), 403);
        return response()->json(
            Evaluation::with('project', 'panelist')
                ->when($user->school_id, fn($q) => $q->whereHas('project', fn($p) => $p->where('school_id', $user->school_id)))
                ->get()
        );
    }

    public function store(Request $request) {
        abort_unless($request->user()->role === 'panelist', 403, 'Only panelists can submit evaluations.');

        $data = $request->validate([
            'project_id'           => 'required|integer',
            'group_id'             => 'nullable|integer',
            'presentation_score'   => 'required|numeric|min:0|max:100',
            'technical_score'      => 'required|numeric|min:0|max:100',
            'documentation_score'  => 'required|numeric|min:0|max:100',
            'qa_score'             => 'required|numeric|min:0|max:100',
            'remarks'              => 'nullable|string',
            'recommendation'       => 'required|in:passed,failed,revision',
        ]);

        $data['panelist_id']    = $request->user()->id;
        $data['overall_score']  = round(
            ($data['presentation_score'] +
             $data['technical_score'] +
             $data['documentation_score'] +
             $data['qa_score']) / 4, 2
        );

        $existing = Evaluation::where('project_id', $data['project_id'])
            ->where('panelist_id', $data['panelist_id'])
            ->first();

        if ($existing) {
            $existing->update($data);
            $eval = $existing;
        } else {
            $eval = Evaluation::create($data);
        }

        Contribution::create([
            'project_id'  => $data['project_id'],
            'user_id'     => $data['panelist_id'],
            'action'      => 'evaluation_submitted',
            'description' => "Submitted a defense evaluation (recommendation: {$data['recommendation']}).",
        ]);

        $this->updateDefenseVerdict($data['project_id']);

        return response()->json($eval->load('panelist'), $existing ? 200 : 201);
    }

    public function show($projectId) {
        return response()->json(
            Evaluation::with('panelist')
                ->where('project_id', $projectId)
                ->get()
        );
    }

    // Consolidates every assigned panelist's individual recommendation into one
    // defense outcome, instead of leaving advisers/students to read each raw
    // evaluation row themselves. Only resolves once every panelist named on the
    // project's defense schedule has actually submitted; any single "failed"
    // recommendation fails the defense outright, otherwise any "revision" wins
    // over an all-"passed" result.
    private function updateDefenseVerdict(int $projectId): void {
        $project = Project::find($projectId);
        if (!$project) return;

        $schedule = DefenseSchedule::where('project_id', $projectId)
            ->when($project->group_id, fn($q) => $q->orWhere('group_id', $project->group_id))
            ->latest('id')->first();
        if (!$schedule || !$schedule->panelists) return;

        $panelistNames = array_values(array_filter(array_map('trim', explode(',', $schedule->panelists))));
        if (empty($panelistNames)) return;

        $expectedPanelistIds = User::where('role', 'panelist')->get()
            ->filter(fn($u) => collect($panelistNames)->contains(fn($n) => strcasecmp($n, $u->name) === 0))
            ->pluck('id');
        if ($expectedPanelistIds->isEmpty()) return;

        $submitted = Evaluation::where('project_id', $projectId)
            ->whereIn('panelist_id', $expectedPanelistIds)
            ->get();
        if ($submitted->count() < $expectedPanelistIds->count()) return;

        $verdict = $submitted->contains('recommendation', 'failed') ? 'failed'
            : ($submitted->contains('recommendation', 'revision') ? 'revision' : 'passed');

        if ($project->defense_verdict === $verdict) return;
        $project->update(['defense_verdict' => $verdict]);

        $labels = ['passed' => 'Passed', 'failed' => 'Failed', 'revision' => 'Needs Revision'];
        $memberIds = ProjectMember::where('project_id', $projectId)->pluck('user_id');
        foreach (array_filter([...$memberIds->all(), $project->adviser_id]) as $userId) {
            $this->notifications->send(
                $userId, 'defense_verdict', 'Defense Result: ' . $labels[$verdict],
                'The panel has reached a consolidated verdict for "' . $project->title . '": ' . $labels[$verdict] . '.',
                $project->id
            );
        }
    }
}
