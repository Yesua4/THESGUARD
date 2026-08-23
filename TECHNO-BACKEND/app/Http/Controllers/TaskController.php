<?php
namespace App\Http\Controllers;
use App\Models\Task;
use App\Models\Contribution;
use App\Models\ProjectMember;
use App\Models\GroupMember;
use App\Models\Project;
use Illuminate\Http\Request;

class TaskController extends Controller {

    public function index(Request $request, $projectId) {
        $this->assertCanAccessProject($request, $projectId);

        $tasks = Task::with('assignee', 'creator')
            ->where('project_id', $projectId)
            ->orderBy('is_completed')
            ->orderBy('due_date')
            ->get();

        return response()->json($tasks);
    }

    public function store(Request $request) {
        $data = $request->validate([
            'project_id'  => 'required|integer|exists:projects,id',
            'assigned_to' => 'nullable|integer|exists:users,id',
            'title'       => 'required|string|max:255',
            'description' => 'nullable|string',
            'due_date'    => 'nullable|date',
        ]);
        $this->assertCanAccessProject($request, $data['project_id']);

        $data['created_by'] = $request->user()->id;
        $task = Task::create($data);

        return response()->json($task->load('assignee', 'creator'), 201);
    }

    public function update(Request $request, $id) {
        $task = Task::findOrFail($id);
        $this->assertCanAccessProject($request, $task->project_id);

        $data = $request->validate([
            'title'       => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'due_date'    => 'nullable|date',
            'assigned_to' => 'nullable|integer|exists:users,id',
            'is_completed' => 'sometimes|boolean',
        ]);

        $wasCompleted = $task->is_completed;
        $task->update($data);

        if (isset($data['is_completed'])) {
            if ($data['is_completed'] && !$wasCompleted) {
                $task->completed_at = now();
                $task->save();
                Contribution::create([
                    'project_id'  => $task->project_id,
                    'user_id'     => $request->user()->id,
                    'action'      => 'task_completed',
                    'description' => $task->title,
                ]);
            } elseif (!$data['is_completed'] && $wasCompleted) {
                $task->completed_at = null;
                $task->save();
            }
        }

        return response()->json($task->fresh(['assignee', 'creator']));
    }

    public function destroy(Request $request, $id) {
        $task = Task::findOrFail($id);
        $this->assertCanAccessProject($request, $task->project_id);
        $task->delete();
        return response()->json(['message' => 'Task deleted']);
    }

    private function assertCanAccessProject(Request $request, $projectId) {
        $user = $request->user();
        if (in_array($user->role, ['admin', 'instructor'])) return;

        $project = Project::findOrFail($projectId);
        if ($user->role === 'adviser' && $project->adviser_id === $user->id) return;

        $memberProjectIds = ProjectMember::where('user_id', $user->id)->pluck('project_id');
        if ($memberProjectIds->contains((int) $projectId)) return;

        if ($project->group_id) {
            $groupIds = GroupMember::where('user_id', $user->id)->pluck('group_id');
            if ($groupIds->contains($project->group_id)) return;
        }

        abort(403, 'You do not have access to tasks for this project.');
    }
}
