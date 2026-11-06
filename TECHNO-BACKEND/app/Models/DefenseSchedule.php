<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class DefenseSchedule extends Model {
    public const TYPES = ['title', 'outline', 'pre_deployment', 'final'];
    public const TYPE_LABELS = [
        'title' => 'Title Defense', 'outline' => 'Outline Defense',
        'pre_deployment' => 'Pre-Deployment Defense', 'final' => 'Final Defense',
    ];
    public const ROLES = ['chair', 'member1', 'member2'];
    public const ROLE_LABELS = ['chair' => 'Panel Chair', 'member1' => 'Panel Member 1', 'member2' => 'Panel Member 2'];

    protected $fillable = [
        'project_id', 'group_id', 'adviser_id', 'defense_type',
        'defense_date', 'defense_time', 'start_time', 'end_time',
        'venue', 'panelists', 'status'
    ];

    public function panel() {
        return $this->hasMany(DefenseSchedulePanelist::class)->with('user:id,name')->orderBy('role'); // chair, member1, member2
    }

    public function project() {
        return $this->belongsTo(Project::class)->with('members');
    }

    public function group() {
        return $this->belongsTo(\App\Models\Group::class)->with('members');
    }

    public function adviser() {
        return $this->belongsTo(User::class, 'adviser_id');
    }

    // Panelists are assigned by free-text name on the schedule rather than a
    // normalized relation (see ScheduleController/EvaluationController for the
    // same matching pattern), so "which projects is this panelist assigned to"
    // has to be resolved by name-matching against every schedule's panelists list.
    //
    // Panels are now also real accounts: a panelist on a defense's panel, or
    // on a group's permanent panel, sees that group's projects too.
    public static function projectIdsForPanelist(User $user) {
        $byName = static::whereNotNull('panelists')->get()
            ->filter(function ($schedule) use ($user) {
                $names = array_map('trim', explode(',', $schedule->panelists));
                return collect($names)->contains(fn($n) => $n !== '' && strcasecmp($n, $user->name) === 0);
            });

        $scheduleIds = DefenseSchedulePanelist::where('user_id', $user->id)->pluck('defense_schedule_id');
        $byAccount = static::whereIn('id', $scheduleIds)->get();
        $groupIds = $byName->pluck('group_id')
            ->merge($byAccount->pluck('group_id'))
            ->merge(GroupPanelist::where('user_id', $user->id)->pluck('group_id'))
            ->filter()->unique();

        return $byName->pluck('project_id')
            ->merge($byAccount->pluck('project_id'))
            ->merge(Project::whereIn('group_id', $groupIds)->pluck('id'))
            ->filter()
            ->unique()
            ->values();
    }
}
