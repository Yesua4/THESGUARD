<?php
namespace App\Http\Controllers;
use App\Http\Controllers\Concerns\AuthorizesDocumentAccess;
use App\Models\Contribution;
use App\Models\DefenseSchedule;
use App\Models\DefenseSchedulePanelist;
use App\Models\Evaluation;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\User;
use App\Services\ActivityBroadcastService;
use App\Services\NotificationService;
use Illuminate\Http\Request;

// Panel evaluations, following the school's defense evaluation sheet:
//   Individual grade per presenter (100): Disposition 30 + Delivery & Presentation 70
//   Group grade (100): Documentation 50 + Software 50
//   Verdict: passed (no revisions) / passed (with revisions) / conditional / failed
// One evaluation per panelist per defense. When every panelist of that
// defense has evaluated, the panel's consolidated verdict is recorded.
// (The older 4-score format is still accepted for old screens.)
class EvaluationController extends Controller {
    use AuthorizesDocumentAccess;

    public const VERDICTS = ['passed_no_revisions', 'passed_with_revisions', 'conditional', 'failed'];
    public const VERDICT_LABELS = [
        'passed_no_revisions'   => 'Passed (No revisions needed)',
        'passed_with_revisions' => 'Passed (With revisions needed)',
        'conditional'           => 'Conditional Passed',
        'failed'                => 'Failed',
    ];
    // How a sheet verdict maps to the project's simple defense_verdict.
    private const PROJECT_VERDICT = [
        'passed_no_revisions' => 'passed', 'passed_with_revisions' => 'passed',
        'conditional' => 'revision', 'failed' => 'failed',
    ];

    public function __construct(
        private NotificationService $notifications,
        private ActivityBroadcastService $activity,
    ) {}

    public function index(Request $request) {
        $user = $request->user();
        if ($user->role === 'panelist') {
            return response()->json(
                Evaluation::with('project', 'panelist', 'schedule')->where('panelist_id', $user->id)->get()
            );
        }
        abort_unless(in_array($user->role, ['admin', 'instructor']), 403);
        return response()->json(
            Evaluation::with('project', 'panelist', 'schedule')
                ->when($user->school_id, fn($q) => $q->whereHas('project', fn($p) => $p->where('school_id', $user->school_id)))
                ->get()
        );
    }

    public function store(Request $request) {
        abort_unless($request->user()->actsAs('panelist'), 403, 'Only panelists can submit evaluations.');
        return $request->has('verdict') ? $this->storeSheet($request) : $this->storeLegacy($request);
    }

    // ── The evaluation sheet ──────────────────────────────────
    private function storeSheet(Request $request) {
        $user = $request->user();
        $data = $request->validate([
            'project_id'                 => 'required|integer|exists:projects,id',
            'defense_schedule_id'        => 'required|integer|exists:defense_schedules,id',
            'individual'                 => 'required|array|min:1',
            'individual.*.user_id'       => 'required|integer|distinct',
            'individual.*.disposition'   => 'required|numeric|min:0|max:30',
            'individual.*.delivery'      => 'required|numeric|min:0|max:70',
            'documentation'              => 'required|numeric|min:0|max:50',
            'software'                   => 'required|numeric|min:0|max:50',
            'verdict'                    => 'required|in:' . implode(',', self::VERDICTS),
            'comply_by'                  => 'nullable|required_if:verdict,conditional|date',
            'remarks'                    => 'nullable|string|max:5000',
        ], [
            'comply_by.required_if' => 'For a conditional pass, set the date the group must comply by.',
        ]);

        $project = Project::findOrFail($data['project_id']);
        $schedule = DefenseSchedule::findOrFail($data['defense_schedule_id']);
        abort_unless(
            ($schedule->project_id && (int) $schedule->project_id === (int) $project->id)
            || ($project->group_id && (int) $schedule->group_id === (int) $project->group_id),
            422, "That defense is not this project's."
        );
        abort_unless($this->isOnPanel($user, $schedule), 403, "Only panelists on this defense's panel can evaluate it.");

        $memberIds = ProjectMember::where('project_id', $project->id)->pluck('user_id')->map(fn ($i) => (int) $i)->all();
        $names = User::whereIn('id', $memberIds)->pluck('name', 'id');
        $individual = [];
        foreach ($data['individual'] as $row) {
            abort_unless(in_array((int) $row['user_id'], $memberIds, true), 422, "Individual grades are only for the group's presenters.");
            $individual[] = [
                'user_id'     => (int) $row['user_id'],
                'name'        => $names[(int) $row['user_id']] ?? null,
                'disposition' => (float) $row['disposition'],
                'delivery'    => (float) $row['delivery'],
                'total'       => round((float) $row['disposition'] + (float) $row['delivery'], 2),
            ];
        }
        $groupTotal = round((float) $data['documentation'] + (float) $data['software'], 2);

        $attrs = [
            'project_id'          => $project->id,
            'defense_schedule_id' => $schedule->id,
            'panelist_id'         => $user->id,
            'individual_scores'   => $individual,
            'group_documentation' => (float) $data['documentation'],
            'group_software'      => (float) $data['software'],
            'group_total'         => $groupTotal,
            'overall_score'       => $groupTotal,
            'verdict'             => $data['verdict'],
            'recommendation'      => self::PROJECT_VERDICT[$data['verdict']],
            'comply_by'           => $data['verdict'] === 'conditional' ? $data['comply_by'] : null,
            'remarks'             => $data['remarks'] ?? null,
        ];
        $existing = Evaluation::where('defense_schedule_id', $schedule->id)->where('panelist_id', $user->id)->first();
        $eval = $existing ? tap($existing)->update($attrs) : Evaluation::create($attrs);

        Contribution::create([
            'project_id'  => $project->id,
            'user_id'     => $user->id,
            'action'      => 'evaluation_submitted',
            'description' => 'Submitted a ' . (DefenseSchedule::TYPE_LABELS[$schedule->defense_type] ?? 'defense') . ' evaluation (' . self::VERDICT_LABELS[$data['verdict']] . ').',
        ]);

        $this->consolidate($schedule, $project);

        $eval->load('panelist', 'schedule');
        $this->activity->broadcast($project->id, 'evaluation_submitted', ['evaluation' => $eval]);
        return response()->json($eval, $existing ? 200 : 201);
    }

    // On the panel by account, or by name on older schedules. The admin acting
    // as a panelist may evaluate any defense.
    private function isOnPanel(User $user, DefenseSchedule $schedule): bool {
        if ($user->role === 'admin') return true;
        if (DefenseSchedulePanelist::where('defense_schedule_id', $schedule->id)->where('user_id', $user->id)->exists()) return true;
        $names = $schedule->panelists ? array_map('trim', explode(',', $schedule->panelists)) : [];
        return collect($names)->contains(fn ($n) => $n !== '' && strcasecmp($n, $user->name) === 0);
    }

    // Once everyone on the panel has evaluated: any Failed fails the defense;
    // else any Conditional; else any "with revisions"; else passed.
    private function consolidate(DefenseSchedule $schedule, Project $project): void {
        $expected = DefenseSchedulePanelist::where('defense_schedule_id', $schedule->id)->pluck('user_id');
        if ($expected->isEmpty() && $schedule->panelists) {
            $names = array_filter(array_map('trim', explode(',', $schedule->panelists)));
            $expected = User::withRole('panelist')->get()
                ->filter(fn ($u) => collect($names)->contains(fn ($n) => strcasecmp($n, $u->name) === 0))->pluck('id');
        }
        if ($expected->isEmpty()) return;

        $submitted = Evaluation::where('defense_schedule_id', $schedule->id)->whereIn('panelist_id', $expected)->get();
        if ($submitted->count() < $expected->count()) return;

        $verdict = collect(['failed', 'conditional', 'passed_with_revisions'])
            ->first(fn ($v) => $submitted->contains('verdict', $v)) ?? 'passed_no_revisions';
        if ($schedule->verdict === $verdict) return;

        $schedule->update(['verdict' => $verdict, 'status' => 'completed']);
        $project->update(['defense_verdict' => self::PROJECT_VERDICT[$verdict]]);
        $this->activity->broadcast($project->id, 'project_updated', ['project' => $project]);

        $type = DefenseSchedule::TYPE_LABELS[$schedule->defense_type] ?? 'Defense';
        $label = self::VERDICT_LABELS[$verdict];
        $memberIds = ProjectMember::where('project_id', $project->id)->pluck('user_id');
        foreach (array_unique(array_filter([...$memberIds->all(), $project->adviser_id, $project->instructor_id])) as $userId) {
            $this->notifications->send(
                $userId, 'defense_verdict', "{$type} Result: {$label}",
                "The panel's verdict for \"{$project->title}\" ({$type}): {$label}.",
                $project->id
            );
        }
    }

    // ── Older 4-score format (kept for old screens) ───────────
    private function storeLegacy(Request $request) {
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
        unset($data['group_id']);

        $data['panelist_id']    = $request->user()->id;
        $data['overall_score']  = round(($data['presentation_score'] + $data['technical_score'] + $data['documentation_score'] + $data['qa_score']) / 4, 2);

        $existing = Evaluation::where('project_id', $data['project_id'])->whereNull('defense_schedule_id')
            ->where('panelist_id', $data['panelist_id'])->first();
        $eval = $existing ? tap($existing)->update($data) : Evaluation::create($data);

        Contribution::create([
            'project_id'  => $data['project_id'],
            'user_id'     => $data['panelist_id'],
            'action'      => 'evaluation_submitted',
            'description' => "Submitted a defense evaluation (recommendation: {$data['recommendation']}).",
        ]);

        $this->updateLegacyVerdict($data['project_id']);

        $eval->load('panelist');
        $this->activity->broadcast($data['project_id'], 'evaluation_submitted', ['evaluation' => $eval]);
        return response()->json($eval, $existing ? 200 : 201);
    }

    // Only people who can see the project see its evaluations.
    public function show(Request $request, $projectId) {
        abort_unless(static::userCanAccessProject($request->user(), $projectId), 403, 'You do not have access to this project.');
        return response()->json(
            Evaluation::with('panelist:id,name', 'schedule:id,defense_type,defense_date,verdict')
                ->where('project_id', $projectId)
                ->orderBy('id')
                ->get()
        );
    }

    private function updateLegacyVerdict(int $projectId): void {
        $project = Project::find($projectId);
        if (!$project) return;

        $schedule = DefenseSchedule::where('project_id', $projectId)
            ->when($project->group_id, fn($q) => $q->orWhere('group_id', $project->group_id))
            ->latest('id')->first();
        if (!$schedule || !$schedule->panelists) return;

        $panelistNames = array_values(array_filter(array_map('trim', explode(',', $schedule->panelists))));
        if (empty($panelistNames)) return;

        $expectedPanelistIds = User::withRole('panelist')->get()
            ->filter(fn($u) => collect($panelistNames)->contains(fn($n) => strcasecmp($n, $u->name) === 0))
            ->pluck('id');
        if ($expectedPanelistIds->isEmpty()) return;

        $submitted = Evaluation::where('project_id', $projectId)->whereNull('defense_schedule_id')
            ->whereIn('panelist_id', $expectedPanelistIds)->get();
        if ($submitted->count() < $expectedPanelistIds->count()) return;

        $verdict = $submitted->contains('recommendation', 'failed') ? 'failed'
            : ($submitted->contains('recommendation', 'revision') ? 'revision' : 'passed');

        if ($project->defense_verdict === $verdict) return;
        $project->update(['defense_verdict' => $verdict]);
        $this->activity->broadcast($projectId, 'project_updated', ['project' => $project]);

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
