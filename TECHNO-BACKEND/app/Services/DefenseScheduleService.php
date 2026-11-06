<?php
namespace App\Services;

use App\Models\DefenseSchedule;
use App\Models\Group;
use App\Models\GroupMember;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Defense times and conflicts.
 *
 * Two defenses on the same date conflict when their time windows OVERLAP
 * (1:00-2:00 PM and 1:30-2:30 PM do) and they share anything that can't be
 * in two places at once: the room, a panelist, the groups' adviser, or the
 * group itself. Old schedules without an end time count as one hour long.
 */
class DefenseScheduleService {
    public const DEFAULT_MINUTES = 60;

    // "13:00", "1:00 PM", "09:30:00" -> minutes after midnight; null if unreadable.
    public static function minutes(?string $time): ?int {
        if (!$time) return null;
        if (preg_match('/^\s*(\d{1,2}):(\d{2})/', $time, $m) && !preg_match('/[ap]\.?m/i', $time)) {
            return (int) $m[1] * 60 + (int) $m[2];
        }
        try {
            $c = Carbon::parse($time);
            return $c->hour * 60 + $c->minute;
        } catch (\Throwable) {
            return null;
        }
    }

    public static function hhmm(?int $minutes): ?string {
        return $minutes === null ? null : sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
    }

    public static function label(?int $minutes): string {
        if ($minutes === null) return '?';
        $h = intdiv($minutes, 60); $m = $minutes % 60;
        return sprintf('%d:%02d %s', ($h % 12) ?: 12, $m, $h < 12 ? 'AM' : 'PM');
    }

    /** @return array{0: ?int, 1: ?int} [start, end] in minutes */
    public static function window(DefenseSchedule $s): array {
        $start = self::minutes($s->start_time ?: $s->defense_time);
        $end = self::minutes($s->end_time);
        if ($start !== null && ($end === null || $end <= $start)) $end = $start + self::DEFAULT_MINUTES;
        return [$start, $end];
    }

    private static function overlaps(?int $aStart, ?int $aEnd, ?int $bStart, ?int $bEnd): bool {
        if ($aStart === null || $bStart === null) return false;
        return $aStart < $bEnd && $bStart < $aEnd;
    }

    private static function adviserOf(?int $groupId): ?int {
        return $groupId ? Group::whereKey($groupId)->value('adviser_id') : null;
    }

    /**
     * @param array{date: string, start: ?int, end: ?int, venue: ?string, group_id: ?int,
     *              panel_ids: int[], panel_names: string[]} $slot
     * @return array<int, array{schedule_id: ?int, group: ?string, reasons: string[]}>
     */
    public function conflicts(array $slot, ?int $excludeId, ?User $caller): array {
        $start = $slot['start'];
        $end = $slot['end'] ?? ($start !== null ? $start + self::DEFAULT_MINUTES : null);
        $ourAdviser = self::adviserOf($slot['group_id']);
        $ourIds = array_map('intval', $slot['panel_ids'] ?? []);
        $ourNames = array_values(array_filter(array_map('trim', $slot['panel_names'] ?? [])));

        $sameDay = DefenseSchedule::whereDate('defense_date', $slot['date'])
            ->when($excludeId, fn ($q) => $q->where('id', '!=', $excludeId))
            ->with('group:id,group_name,adviser_id', 'panel')
            ->get();

        $out = [];
        foreach ($sameDay as $other) {
            [$oStart, $oEnd] = self::window($other);
            if (!self::overlaps($start, $end, $oStart, $oEnd)) continue;

            $groupName = $other->group->group_name ?? 'another group';
            $when = self::label($oStart) . '–' . self::label($oEnd);
            $where = $other->venue ? "{$other->venue}, " : '';
            $reasons = [];

            if ($slot['group_id'] && (int) $other->group_id === (int) $slot['group_id']) {
                $reasons[] = "This group already has a defense from {$when}.";
            }
            if (!empty($slot['venue']) && $other->venue && strcasecmp(trim($other->venue), trim($slot['venue'])) === 0) {
                $reasons[] = "Room \"{$slot['venue']}\" is already booked by {$groupName} from {$when}.";
            }
            $otherAdviser = $other->group->adviser_id ?? null;
            if ($ourAdviser && $otherAdviser && (int) $ourAdviser === (int) $otherAdviser && (int) $other->group_id !== (int) $slot['group_id']) {
                $reasons[] = $caller && (int) $caller->id === (int) $ourAdviser
                    ? "You already have a defense scheduled at this time ({$groupName}, {$where}{$when})."
                    : User::whereKey($ourAdviser)->value('name') . " advises both groups and already has {$groupName}'s defense ({$where}{$when}).";
            }

            // Panelists: by account, and by name for older schedules.
            $theirIds = $other->panel->pluck('user_id')->map(fn ($id) => (int) $id)->all();
            foreach (array_intersect($ourIds, $theirIds) as $uid) {
                $name = $other->panel->firstWhere('user_id', $uid)?->user?->name ?? User::whereKey($uid)->value('name');
                $reasons[] = "{$name} is already on the panel of {$groupName} ({$where}{$when}).";
            }
            $theirNames = $other->panelists ? array_map('trim', explode(',', $other->panelists)) : [];
            $ourNamesNotById = array_udiff($ourNames, User::whereIn('id', array_intersect($ourIds, $theirIds))->pluck('name')->all(), 'strcasecmp');
            $nameOverlap = array_uintersect($ourNamesNotById, $theirNames, 'strcasecmp');
            if ($nameOverlap) {
                $reasons[] = 'Panelist(s) ' . implode(', ', $nameOverlap) . " already assigned to another defense at this time ({$groupName}, {$where}{$when}).";
            }

            if ($reasons) {
                $out[] = ['schedule_id' => $other->id, 'group' => $other->group->group_name ?? null, 'reasons' => array_values(array_unique($reasons))];
            }
        }
        return $out;
    }

    // A group's own adviser or members can't sit on its panel.
    public function conflictOfInterest(?int $groupId, array $panelIds, array $panelNames): array {
        $reasons = [];
        $adviserId = self::adviserOf($groupId);
        $adviserName = $adviserId ? User::whereKey($adviserId)->value('name') : null;
        $memberIds = $groupId ? GroupMember::where('group_id', $groupId)->pluck('user_id')->map(fn ($i) => (int) $i)->all() : [];
        $memberNames = $memberIds ? User::whereIn('id', $memberIds)->pluck('name')->all() : [];

        foreach ($panelIds as $id) {
            if ($adviserId && (int) $id === (int) $adviserId) {
                $reasons[] = "{$adviserName} is this group's adviser and can't also serve as a panelist for its defense.";
            }
            if (in_array((int) $id, $memberIds, true)) {
                $reasons[] = User::whereKey($id)->value('name') . " is a member of this group and can't be a panelist for their own defense.";
            }
        }
        foreach (array_filter(array_map('trim', $panelNames)) as $name) {
            if ($adviserName && strcasecmp($name, $adviserName) === 0) {
                $reasons[] = "{$adviserName} is this group's adviser and can't also serve as a panelist for its defense.";
            }
            foreach ($memberNames as $memberName) {
                if (strcasecmp($name, $memberName) === 0) {
                    $reasons[] = "{$memberName} is a member of this group and can't be a panelist for their own defense.";
                }
            }
        }
        $reasons = array_values(array_unique($reasons));
        return $reasons ? [['schedule_id' => null, 'group' => null, 'reasons' => $reasons]] : [];
    }
}
