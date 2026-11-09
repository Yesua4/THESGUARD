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
            // A school's admin sees everything in their own school only (an
            // admin with no school is the platform owner and sees all).
            return !$user->school_id || Project::whereKey($projectId)
                ->where(fn ($q) => $q->where('school_id', $user->school_id)->orWhereNull('school_id'))->exists();
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
            $advisoryGroupIds = Group::where('adviser_id', $user->id)->pluck('id')
                ->merge(Group::idsInSectionsOf($user))
                // instructor of one of the group's capstone stages (1 or 2)
                ->merge(\App\Models\GroupStageInstructor::where('user_id', $user->id)->pluck('group_id'));
            return Project::where('id', $projectId)
                ->where(fn($q) => $q->where('instructor_id', $user->id)->orWhereIn('group_id', $advisoryGroupIds))
                ->exists();
        }
        if ($user->role === 'panelist') {
            return DefenseSchedule::projectIdsForPanelist($user)->contains($projectId);
        }

        return false;
    }

    // Every project this user may see, by the same rule as above -- for
    // lists (contributions, documents, ...) so they match what opens.
    public static function accessibleProjectIds($user): \Illuminate\Support\Collection {
        $q = Project::query();
        switch ($user->role) {
            case 'admin':
                if ($user->school_id) $q->where(fn ($w) => $w->where('school_id', $user->school_id)->orWhereNull('school_id'));
                break;
            case 'student':
                return ProjectMember::where('user_id', $user->id)->pluck('project_id')->map(fn ($id) => (int) $id);
            case 'adviser':
                $groupIds = Group::where('adviser_id', $user->id)->pluck('id');
                $q->where(fn ($w) => $w->where('adviser_id', $user->id)->orWhereIn('group_id', $groupIds));
                break;
            case 'instructor':
                $groupIds = Group::where('adviser_id', $user->id)->pluck('id')
                    ->merge(Group::idsInSectionsOf($user))
                    ->merge(\App\Models\GroupStageInstructor::where('user_id', $user->id)->pluck('group_id'));
                $q->where(fn ($w) => $w->where('instructor_id', $user->id)->orWhereIn('group_id', $groupIds));
                break;
            case 'panelist':
                return DefenseSchedule::projectIdsForPanelist($user)->map(fn ($id) => (int) $id);
            default:
                return collect();
        }
        return $q->pluck('id')->map(fn ($id) => (int) $id);
    }

    private function authorizeDocumentAccess($user, $projectId) {
        abort_unless(static::userCanAccessProject($user, $projectId), 403, 'You do not have access to this document.');
    }
}
