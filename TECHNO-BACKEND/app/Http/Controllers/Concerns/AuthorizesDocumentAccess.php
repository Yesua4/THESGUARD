<?php
namespace App\Http\Controllers\Concerns;

use App\Models\DefenseSchedule;
use App\Models\Group;
use App\Models\Project;
use App\Models\ProjectMember;

trait AuthorizesDocumentAccess {

    private function authorizeDocumentAccess($user, $projectId) {
        if ($user->role === 'admin') {
            return;
        }

        if ($user->role === 'student') {
            $ok = ProjectMember::where('user_id', $user->id)->where('project_id', $projectId)->exists();
        } elseif ($user->role === 'adviser') {
            $groupIds = Group::where('adviser_id', $user->id)->pluck('id');
            $ok = Project::where('id', $projectId)
                ->where(fn($q) => $q->where('adviser_id', $user->id)->orWhereIn('group_id', $groupIds))
                ->exists();
        } elseif ($user->role === 'instructor') {
            $advisoryGroupIds = Group::where('adviser_id', $user->id)->pluck('id');
            $ok = Project::where('id', $projectId)
                ->where(fn($q) => $q->where('instructor_id', $user->id)->orWhereIn('group_id', $advisoryGroupIds))
                ->exists();
        } elseif ($user->role === 'panelist') {
            $ok = DefenseSchedule::projectIdsForPanelist($user)->contains($projectId);
        } else {
            $ok = false;
        }

        abort_unless($ok, 403, 'You do not have access to this document.');
    }
}
