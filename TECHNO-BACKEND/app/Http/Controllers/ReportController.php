<?php
namespace App\Http\Controllers;
use App\Models\Project;
use App\Models\DefenseSchedule;
use App\Models\Contribution;
use App\Models\Document;
use Illuminate\Http\Request;

class ReportController extends Controller {

    private function assertCanViewReports(Request $request) {
        abort_unless(in_array($request->user()->role, ['admin', 'instructor']), 403, 'Only administrators and instructors can view reports.');
    }

    public function projects(Request $request) {
        $this->assertCanViewReports($request);
        $batch = $request->query('batch');
        $query = Project::with('adviser', 'instructor', 'members')
            ->when($request->user()->school_id, fn($q) => $q->where('school_id', $request->user()->school_id));
        if ($batch) $query->where('batch', $batch);

        $projects = $query->get()->map(fn($p) => [
            'title'            => $p->title,
            'batch'            => $p->batch ?? '—',
            'status'           => $p->status,
            'title_status'     => $p->title_status,
            'similarity_score' => $p->similarity_score,
            'adviser'          => $p->adviser?->name ?? 'Not assigned',
            'instructor'       => $p->instructor?->name ?? '—',
            'members'          => $p->members->map(fn($m) => $m->user?->name)->filter()->join(', '),
        ]);

        return response()->json($projects);
    }

    public function similarity(Request $request) {
        $this->assertCanViewReports($request);
        $threshold = $request->query('threshold', 30);
        $projects  = Project::with('adviser')
            ->when($request->user()->school_id, fn($q) => $q->where('school_id', $request->user()->school_id))
            ->where('similarity_score', '>=', $threshold)
            ->orderBy('similarity_score', 'desc')
            ->get()->map(fn($p) => [
                'title'            => $p->title,
                'batch'            => $p->batch ?? '—',
                'similarity_score' => $p->similarity_score,
                'status'           => $p->status,
                'adviser'          => $p->adviser?->name ?? 'Not assigned',
            ]);

        return response()->json($projects);
    }

    public function schedules(Request $request) {
        $this->assertCanViewReports($request);
        $schoolId  = $request->user()->school_id;
        $schedules = DefenseSchedule::with('project.members.user', 'project.adviser')
            ->when($schoolId, fn($q) => $q->whereHas('project', fn($p) => $p->where('school_id', $schoolId)))
            ->orderBy('defense_date')
            ->get()->map(fn($s) => [
                'project'      => $s->project?->title ?? '—',
                'date'         => $s->defense_date,
                'time'         => $s->defense_time,
                'venue'        => $s->venue ?? '—',
                'panelists'    => $s->panelists ?? '—',
                'status'       => $s->status,
                'members'      => $s->project?->members->map(fn($m) => $m->user?->name)->filter()->join(', ') ?? '—',
            ]);

        return response()->json($schedules);
    }

    public function contributions(Request $request) {
        $this->assertCanViewReports($request);
        $batch    = $request->query('batch');
        $schoolId = $request->user()->school_id;

        $query = Contribution::with('user', 'project')
            ->when($schoolId, fn($q) => $q->whereHas('project', fn($p) => $p->where('school_id', $schoolId)));
        if ($batch) {
            $query->whereHas('project', fn($q) => $q->where('batch', $batch));
        }
        $contributions = $query->get();

        $grouped = $contributions->groupBy(fn($c) => $c->user_id . '-' . $c->project_id);
        $total   = $contributions->count();

        $rows = $grouped->map(function ($items) use ($total) {
            $first = $items->first();
            return [
                'name'        => $first->user?->name ?? 'Unknown',
                'project'     => $first->project?->title ?? '—',
                'batch'       => $first->project?->batch ?? '—',
                'count'       => $items->count(),
                'percentage'  => $total > 0 ? round(($items->count() / $total) * 100, 1) : 0,
                'last_active' => $items->sortByDesc('created_at')->first()->created_at?->format('M d, Y') ?? '—',
            ];
        })->sortByDesc('count')->values();

        return response()->json($rows);
    }

    public function documentRevisions(Request $request) {
        $this->assertCanViewReports($request);
        $batch    = $request->query('batch');
        $type     = $request->query('type');
        $schoolId = $request->user()->school_id;

        $query = Document::with('uploader', 'project')
            ->when($schoolId, fn($q) => $q->whereHas('project', fn($p) => $p->where('school_id', $schoolId)))
            ->orderBy('project_id')->orderBy('version', 'desc');
        if ($batch) {
            $query->whereHas('project', fn($q) => $q->where('batch', $batch));
        }
        if ($type) {
            $query->where('type', $type);
        }
        $documents = $query->get()->map(fn($doc) => [
            'project'      => $doc->project?->title ?? '—',
            'type'         => $doc->type,
            'version'      => $doc->version,
            'status'       => $doc->status,
            'version_note' => $doc->version_note ?? '—',
            'uploaded_by'  => $doc->uploader?->name ?? 'Unknown',
            'date'         => $doc->created_at?->format('M d, Y') ?? '—',
        ]);

        return response()->json($documents);
    }
}
