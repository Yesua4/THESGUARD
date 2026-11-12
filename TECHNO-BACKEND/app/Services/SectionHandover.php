<?php
namespace App\Services;

use App\Models\Group;
use App\Models\User;

// When the admin moves a section from one instructor to another, the groups
// in that section follow: their instructor becomes the one who now handles
// the section. Works whichever account is saved first:
//  - section ADDED to X: its groups whose instructor doesn't handle it (or
//    have none) move to X. A group whose instructor still handles the
//    section (a shared section) is left alone.
//  - section REMOVED from X: X's groups there move to the one other
//    instructor who handles it, if there is exactly one; otherwise they stay.
// Each group is saved one by one so the live updates go out.
class SectionHandover {
    public static function apply(User $user, array $before, array $after): void {
        $added   = array_values(array_diff($after, $before));
        $removed = array_values(array_diff($before, $after));

        foreach ($added as $section) {
            foreach (self::groupsIn($user, $section) as $group) {
                if ((int) $group->instructor_id === (int) $user->id) continue;
                if ($group->instructor_id && self::handles((int) $group->instructor_id, $section)) continue;
                self::move($group, $user->id);
            }
        }

        foreach ($removed as $section) {
            $others = User::query()
                ->when($user->school_id, fn ($q) => $q->where('school_id', $user->school_id))
                ->where('id', '!=', $user->id)
                ->withRole('instructor')
                ->whereHas('sectionAssignments', fn ($q) => $q->where('section', $section))
                ->pluck('id');
            if ($others->count() !== 1) continue;
            foreach (self::groupsIn($user, $section) as $group) {
                if ((int) $group->instructor_id === (int) $user->id) self::move($group, (int) $others->first());
            }
        }
    }

    private static function groupsIn(User $user, string $section) {
        return User::whereSectionIn(Group::query(), 'section', [$section])
            ->when($user->school_id, fn ($q) => $q->where('school_id', $user->school_id))
            ->get();
    }

    private static function handles(int $userId, string $section): bool {
        return \App\Models\InstructorSection::where('user_id', $userId)->where('section', $section)->exists();
    }

    private static function move(Group $group, int $instructorId): void {
        $group->update(['instructor_id' => $instructorId]);
        // Keep the group's projects on its current instructor (same rule
        // the group list uses), so proposals and notifications follow.
        CapstoneStageService::syncProjectInstructors($group->fresh());
    }
}
