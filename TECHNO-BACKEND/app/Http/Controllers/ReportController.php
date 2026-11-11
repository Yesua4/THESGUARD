<?php
namespace App\Http\Controllers;

use App\Models\AcademicTerm;
use App\Models\Contribution;
use App\Models\DefenseSchedule;
use App\Models\Document;
use App\Models\Evaluation;
use App\Models\Group;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\School;
use App\Models\User;
use Illuminate\Http\Request;

// Reports for admins and instructors. Every report:
//  - stays inside the viewer's school,
//  - for a section-scoped instructor, covers only the groups they handle
//    (same rule as Manage Groups: Group::visibleToInstructor),
//  - accepts the same optional filters: academic_year, section, group_id.
// Values are returned raw (e.g. "for_defense"); the page turns them into
// readable labels for the screen, the CSV and the printout.
class ReportController extends Controller {

    private function viewer(Request $request): User {
        $user = $request->user();
        abort_unless(in_array($user->role, ['admin', 'instructor']), 403, 'Only administrators and instructors can view reports.');
        return $user;
    }

    // "2025–2026" (long dash) and "2025 - 2026" both mean "2025-2026".
    private function year(Request $request): ?string {
        $y = trim((string) ($request->query('academic_year') ?? $request->query('batch') ?? ''));
        return $y === '' ? null : preg_replace('/\s*[\x{2010}-\x{2015}\-]\s*/u', '-', $y);
    }

    private function groups(Request $request, User $user) {
        return Group::query()
            ->when($user->school_id, fn ($q) => $q->where('school_id', $user->school_id))
            ->visibleToInstructor($user)
            ->when($this->year($request), fn ($q, $y) => $q->where('batch', $y))
            ->when($request->query('section'), fn ($q, $s) => $q->where('section', $s))
            ->when($request->query('group_id'), fn ($q, $g) => $q->where('id', (int) $g));
    }

    // Do the filters (or the viewer's section scope) narrow things to some groups?
    private function narrowed(Request $request, User $user): bool {
        return $user->sectionScope() !== null || $this->year($request)
            || $request->query('section') || $request->query('group_id');
    }

    // Projects this report may include, after the filters. Old archived
    // projects imported without a group only follow the academic-year filter.
    private function projectScope(Request $request, User $user) {
        $q = Project::query()->when($user->school_id, fn ($q) => $q->where('school_id', $user->school_id));
        if (!$this->narrowed($request, $user)) return $q;
        $groupIds = $this->groups($request, $user)->pluck('id');
        $byGroupOnly = $user->sectionScope() !== null || $request->query('section') || $request->query('group_id');
        return $q->where(function ($w) use ($groupIds, $byGroupOnly, $request) {
            $w->whereIn('group_id', $groupIds);
            if (!$byGroupOnly) {
                $w->orWhere(fn ($a) => $a->whereNull('group_id')->where('batch', $this->year($request)));
            }
        });
    }

    // "2026-11-13 00:00:00", a date object or null -> "2026-11-13" / null.
    private static function day($v): ?string {
        return $v ? substr((string) $v, 0, 10) : null;
    }

    private static function memberNames($project): string {
        return $project?->members?->map(fn ($m) => $m->user?->name)->filter()->join(', ') ?? '';
    }

    // Choices for the filter dropdowns, limited to what this viewer may see.
    public function options(Request $request) {
        $user = $this->viewer($request);
        $groups = $this->groups(new Request(), $user)->orderBy('group_name')->get(['id', 'group_name', 'section', 'batch']);
        $years = $groups->pluck('batch')
            ->merge(Project::when($user->school_id, fn ($q) => $q->where('school_id', $user->school_id))->whereNotNull('batch')->distinct()->pluck('batch'))
            ->merge(AcademicTerm::when($user->school_id, fn ($q) => $q->where('school_id', $user->school_id))->pluck('academic_year'))
            ->filter()->map(fn ($y) => preg_replace('/\s*[\x{2010}-\x{2015}\-]\s*/u', '-', trim($y)))
            // Only real academic years ("2025-2026"). Old archive imports can hold
            // notes like "Not shown in the page" or a single year in that column.
            ->filter(fn ($y) => preg_match('/^\d{4}-\d{4}$/', $y))
            ->unique()->sortDesc()->values();
        return response()->json([
            'school'         => $user->school_id ? School::find($user->school_id)?->name : null,
            'academic_years' => $years,
            'sections'       => $groups->pluck('section')->filter()->unique()->sort()->values(),
            'groups'         => $groups->map(fn ($g) => ['id' => $g->id, 'name' => $g->group_name, 'section' => $g->section, 'academic_year' => $g->batch])->values(),
        ]);
    }

    public function projects(Request $request) {
        $user  = $this->viewer($request);
        $scope = $request->query('scope', 'current'); // current | archived | all
        $rows = $this->projectScope($request, $user)
            ->with('adviser:id,name', 'instructor:id,name', 'members', 'group:id,group_name,section,batch')
            ->when($scope === 'current', fn ($q) => $q->where('status', '!=', 'archived'))
            ->when($scope === 'archived', fn ($q) => $q->where('status', 'archived'))
            ->orderBy('title')->get()
            ->map(fn ($p) => [
                'title'            => $p->title,
                'group'            => $p->group?->group_name,
                'section'          => $p->group?->section,
                'academic_year'    => $p->batch ?? $p->group?->batch,
                'members'          => self::memberNames($p),
                'adviser'          => $p->adviser?->name,
                'title_status'     => $p->title_status,
                'is_final_title'   => (bool) $p->is_final_title,
                'status'           => $p->status,
                'defense_verdict'  => $p->defense_verdict,
                'similarity_score' => $p->similarity_score,
            ]);
        return response()->json($rows);
    }

    public function similarity(Request $request) {
        $user = $this->viewer($request);
        $threshold = (float) $request->query('threshold', 30);
        $rows = $this->projectScope($request, $user)
            ->with('adviser:id,name', 'group:id,group_name,section,batch')
            ->where('status', '!=', 'archived')
            ->whereNotNull('similarity_score')
            ->where('similarity_score', '>=', $threshold)
            ->orderByDesc('similarity_score')->get()
            ->map(fn ($p) => [
                'title'            => $p->title,
                'group'            => $p->group?->group_name,
                'section'          => $p->group?->section,
                'academic_year'    => $p->batch ?? $p->group?->batch,
                'adviser'          => $p->adviser?->name,
                'title_status'     => $p->title_status,
                'similarity_score' => $p->similarity_score,
            ]);
        return response()->json($rows);
    }

    public function schedules(Request $request) {
        $user = $this->viewer($request);
        $groupIds = $this->groups($request, $user)->pluck('id');
        $rows = DefenseSchedule::with('panel', 'group:id,group_name,section,batch', 'project:id,title')
            // Keyed by group: title defenses have no single project yet.
            ->whereIn('group_id', $groupIds)
            ->when($request->query('defense_type'), fn ($q, $t) => $q->where('defense_type', $t))
            ->when($request->query('from'), fn ($q, $d) => $q->whereDate('defense_date', '>=', $d))
            ->when($request->query('to'), fn ($q, $d) => $q->whereDate('defense_date', '<=', $d))
            ->orderBy('defense_date')->orderBy('start_time')->get()
            ->map(fn ($s) => [
                'group'        => $s->group?->group_name,
                'section'      => $s->group?->section,
                'project'      => $s->project?->title,
                'defense_type' => $s->defense_type,
                'date'         => self::day($s->defense_date),
                'start_time'   => $s->start_time ?? $s->defense_time,
                'end_time'     => $s->end_time,
                'venue'        => $s->venue,
                'panel'        => $s->panel->map(fn ($p) => ['role' => $p->role, 'name' => $p->user?->name])->filter(fn ($p) => $p['name'])->values(),
                'panelists'    => $s->panelists, // older defenses kept a typed list
                'verdict'      => $s->verdict,
                'status'       => $s->status,
            ]);
        return response()->json($rows);
    }

    // Each student's share of their own project's student activity (adds up
    // to 100% per project). Advisers' and instructors' actions are left out.
    public function contributions(Request $request) {
        $user = $this->viewer($request);
        $projects = $this->projectScope($request, $user)
            ->with('members', 'group:id,group_name,section,batch')
            ->where('status', '!=', 'archived')->get();
        $rows = collect();
        foreach ($projects as $p) {
            $memberIds = $p->members->pluck('user_id')->map(fn ($i) => (int) $i);
            if ($memberIds->isEmpty()) continue;
            $items = Contribution::where('project_id', $p->id)->whereIn('user_id', $memberIds)->get(['user_id', 'created_at']);
            $total = $items->count();
            foreach ($p->members as $m) {
                $mine = $items->where('user_id', (int) $m->user_id);
                $rows->push([
                    'name'          => $m->user?->name ?? 'Unknown',
                    'is_leader'     => (bool) $m->is_leader,
                    'group'         => $p->group?->group_name,
                    'section'       => $p->group?->section,
                    'project'       => $p->title,
                    'count'         => $mine->count(),
                    'percentage'    => $total > 0 ? round($mine->count() / $total * 100, 1) : 0,
                    'last_active'   => optional($mine->sortByDesc('created_at')->first())->created_at?->toDateString(),
                ]);
            }
        }
        return response()->json($rows->sortBy([['project', 'asc'], ['count', 'desc']])->values());
    }

    public function documentRevisions(Request $request) {
        $user = $this->viewer($request);
        $projectIds = $this->projectScope($request, $user)->pluck('id');
        $rows = Document::with('uploader:id,name', 'project:id,title,group_id', 'project.group:id,group_name,section')
            ->whereIn('project_id', $projectIds)
            ->when($request->query('type'), fn ($q, $t) => $q->where('type', $t))
            ->orderBy('project_id')->orderBy('type')->orderByDesc('version')->get()
            ->map(fn ($d) => [
                'group'        => $d->project?->group?->group_name,
                'section'      => $d->project?->group?->section,
                'project'      => $d->project?->title,
                'type'         => $d->type,
                'version'      => $d->version,
                'status'       => $d->status,
                'version_note' => $d->version_note,
                'uploaded_by'  => $d->uploader?->name,
                'date'         => $d->created_at?->toDateString(),
            ]);
        return response()->json($rows);
    }

    // Panel evaluation results: one row per panelist per defense.
    public function evaluations(Request $request) {
        $user = $this->viewer($request);
        $projectIds = $this->projectScope($request, $user)->pluck('id');
        $rows = Evaluation::with('panelist:id,name', 'schedule.panel', 'project:id,title,group_id', 'project.group:id,group_name,section')
            ->whereIn('project_id', $projectIds)
            ->when($request->query('defense_type'), fn ($q, $t) => $q->whereHas('schedule', fn ($s) => $s->where('defense_type', $t)))
            ->get()
            ->map(function ($e) {
                $individual = collect($e->individual_scores ?? []);
                return [
                    'group'           => $e->project?->group?->group_name,
                    'section'         => $e->project?->group?->section,
                    'project'         => $e->project?->title,
                    'defense_type'    => $e->schedule?->defense_type,
                    'date'            => self::day($e->schedule?->defense_date),
                    'panelist'        => $e->panelist?->name,
                    'panel_role'      => $e->schedule?->panel->firstWhere('user_id', $e->panelist_id)?->role,
                    'group_score'     => $e->group_total ?? $e->overall_score,
                    'individual_avg'  => $individual->isNotEmpty() ? round($individual->avg('total'), 1) : null,
                    'verdict'         => $e->verdict,
                    'comply_by'       => $e->comply_by?->toDateString(),
                    'panel_verdict'   => $e->schedule?->verdict,
                ];
            })
            ->sortBy([['project', 'asc'], ['date', 'asc']])->values();
        return response()->json($rows);
    }
}
