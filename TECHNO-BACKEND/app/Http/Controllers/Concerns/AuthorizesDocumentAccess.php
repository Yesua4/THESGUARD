<?php
namespace App\Http\Controllers\Concerns;

use App\Models\DefenseSchedule;
use App\Models\Group;
use App\Models\Project;
use App\Models\ProjectMember;

trait AuthorizesDocumentAccess {

    // Shared with routes/channels.php (Project.{id} broadcast auth) so the
    // "who can see this project's stuff" rule lives in exactly one place.
    public static function userCanAccessProject($user, $projectId): bool {
        if ($user->role === 'admin') {
            return true;
        }

        if ($user->role === 'student') {
            return ProjectMember::where('user_id', $user->id)->where('project_id', $projectId)->exists();
        }
        if ($user->role === 'adviser') {
            $groupIds = Group::where('adviser_id', $user->id)->pluck('id');
            return Project::where('id', $projectId)
                ->where(fn($q) => $q->where('adviser_id', $user->id)->orWhereIn('group_id', $groupIds))
                ->exists();
        }
        if ($user->role === 'instructor') {
            $advisoryGroupIds = Group::where('adviser_id', $user->id)->pluck('id');
            return Project::where('id', $projectId)
                ->where(fn($q) => $q->where('instructor_id', $user->id)->orWhereIn('group_id', $advisoryGroupIds))
                ->exists();
        }
        if ($user->role === 'panelist') {
            return DefenseSchedule::projectIdsForPanelist($user)->contains($projectId);
        }

        return false;
    }

    private function authorizeDocumentAccess($user, $projectId) {
        abort_unless(static::userCanAccessProject($user, $projectId), 403, 'You do not have access to this document.');
    }
}
