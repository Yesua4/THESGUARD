<?php
namespace App\Services;

use App\Models\AcademicTerm;
use App\Models\CapstoneStage;
use App\Models\Group;
use App\Models\GroupMember;
use App\Models\User;

/**
 * Which capstone stage a group is in right now -- automatically.
 *
 * A group remembers the term it was formed in and its members' year level
 * then (from their section, "BSIT 2-A" -> 2). Walking the academic calendar
 * from that term to today gives its current year level (+1 per school year
 * passed) and term number within the year; the admin's capstone plan maps
 * that to a stage. A stage lasts until the next one begins, so a summer
 * term in between keeps "Capstone 1".
 */
class CapstoneStageService {
    private array $termsBySchool = [];
    private array $stagesBySchool = [];

    // "BSIT 1-G" -> 1, "BSIT 4A" -> 4; null if the section has no number.
    public static function yearLevelOf(?string $section): ?int {
        return $section && preg_match('/(\d)/', $section, $m) ? (int) $m[1] : null;
    }

    // The section most of the group's members are in (ties: alphabetical).
    public static function sectionFromMembers(iterable $userIds): ?string {
        $sections = User::whereIn('id', collect($userIds)->all())->pluck('section')
            ->map(fn ($s) => User::normalizeSection($s))->filter();
        if ($sections->isEmpty()) return null;
        return $sections->countBy()->sortKeys()->sortDesc()->keys()->first();
    }

    // Keeps groups' section in step with their members (e.g. after a new
    // class list moves students to a new section).
    public static function syncSectionsForUser(User $user): void {
        $groupIds = GroupMember::where('user_id', $user->id)->pluck('group_id');
        foreach (Group::whereIn('id', $groupIds)->get() as $group) {
            $section = self::sectionFromMembers(GroupMember::where('group_id', $group->id)->pluck('user_id'));
            if ($section && $section !== $group->section) {
                $group->update(['section' => $section]);
            }
        }
    }

    // The instructor handling the group's section (assigned by the admin in
    // User Accounts); else whoever created the group.
    public static function instructorFor(Group $group): ?int {
        if ($group->section) {
            $id = User::query()
                ->when($group->school_id, fn ($q) => $q->where('school_id', $group->school_id))
                ->withRole('instructor')
                ->whereHas('sectionAssignments', fn ($q) => $q->where('section', User::normalizeSection($group->section)))
                ->orderBy('id')->value('id');
            if ($id) return (int) $id;
        }
        return $group->instructor_id ? (int) $group->instructor_id : null;
    }

    private function terms(int $schoolId) {
        return $this->termsBySchool[$schoolId] ??= AcademicTerm::where('school_id', $schoolId)->orderBy('start_date')->get();
    }

    public function stages(int $schoolId) {
        return $this->stagesBySchool[$schoolId] ??= CapstoneStage::where('school_id', $schoolId)
            ->orderBy('year_level')->orderBy('term_no')->get();
    }

    // 1-based position of a term within its own school year, by date.
    private function termNo(AcademicTerm $term, $terms): int {
        return 1 + $terms->filter(fn ($t) => $t->academic_year === $term->academic_year && $t->start_date < $term->start_date)->count();
    }

    /**
     * @return array{stage: ?string, year_level: ?int, term_no: ?int, term: ?string}|null
     *         null when the group's start term or year level isn't known.
     */
    public function forGroup(Group $group): ?array {
        if (!$group->school_id || !$group->academic_term_id || !$group->start_year_level) return null;
        $terms = $this->terms($group->school_id);
        $start = $terms->firstWhere('id', $group->academic_term_id);
        if (!$start) return null;

        // Today's term, or the most recent one if we're between terms.
        $today = AcademicTerm::today();
        $current = $terms->first(fn ($t) => $t->start_date->toDateString() <= $today && $t->end_date->toDateString() >= $today)
            ?? $terms->filter(fn ($t) => $t->start_date->toDateString() <= $today)->last()
            ?? $start;
        if ($current->start_date < $start->start_date) $current = $start;

        $years = $terms->pluck('academic_year')->unique()->values();
        $yearLevel = $group->start_year_level + max(0, $years->search($current->academic_year) - $years->search($start->academic_year));
        $termNo = $this->termNo($current, $terms);

        // The last stage that has begun by (year level, term).
        $stage = $this->stages($group->school_id)
            ->filter(fn ($s) => [$s->year_level, $s->term_no] <= [$yearLevel, $termNo])
            ->last();

        return [
            'stage'      => $stage?->name,
            'stage_id'   => $stage?->id,
            'year_level' => $yearLevel,
            'term_no'    => $termNo,
            'term'       => $current->label(),
        ];
    }
}
