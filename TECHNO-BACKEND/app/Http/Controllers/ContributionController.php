<?php
namespace App\Http\Controllers;
use App\Models\Contribution;
use App\Models\ProjectMember;
use App\Models\Project;
use Illuminate\Http\Request;

class ContributionController extends Controller {

    public function index(Request $request, $projectId = null) {
    $user = $request->user();

    if ($projectId) {
        $contributions = Contribution::with('user')
            ->where('project_id', $projectId)
            ->orderBy('created_at', 'desc')
            ->get();
    } elseif ($user->role === 'student') {
        // Get all groups this student belongs to
        $groupIds = \App\Models\GroupMember::where('user_id', $user->id)->pluck('group_id');
        // Get all projects for those groups
        $projectIds = \App\Models\Project::whereIn('group_id', $groupIds)->pluck('id');
        // Also get direct project memberships
        $directIds = \App\Models\ProjectMember::where('user_id', $user->id)->pluck('project_id');
        $allIds = $projectIds->merge($directIds)->unique();

        $contributions = Contribution::with('user')
            ->whereIn('project_id', $allIds)
            ->orderBy('created_at', 'desc')
            ->get();
    } else {
        $contributions = Contribution::with('user', 'project')
            ->orderBy('created_at', 'desc')
            ->get();
    }

    $grouped = $contributions->groupBy('user_id');
    $total   = $contributions->count();

    $analytics = $grouped->map(function($items, $userId) use ($total) {
        $u = $items->first()->user;
        return [
            'user_id'    => $userId,
            'name'       => $u?->name ?? 'Unknown',
            'count'      => $items->count(),
            'percentage' => $total > 0 ? round(($items->count() / $total) * 100, 1) : 0,
            'activities' => $items->take(10)->map(fn($c) => [
                'action'      => $c->action,
                'description' => $c->description,
                'date'        => $c->created_at?->format('M d, Y') ?? '—',
            ]),
        ];
    })->values();

    return response()->json([
        'total'      => $total,
        'analytics'  => $analytics,
        'activities' => $contributions->take(20)->map(fn($c) => [
            'name'        => $c->user?->name ?? 'Unknown',
            'action'      => $c->action,
            'description' => $c->description,
            'date'        => $c->created_at?->format('M d, Y') ?? '—',
            'project'     => $c->project?->title ?? '—',
        ]),
    ]);
}

    public function store(Request $request) {
        $data = $request->validate([
            'project_id'  => 'required|integer',
            'action'      => 'required|string',
            'description' => 'nullable|string',
        ]);
        $data['user_id'] = $request->user()->id;
        $contribution = Contribution::create($data);
        return response()->json($contribution, 201);
    }
}
