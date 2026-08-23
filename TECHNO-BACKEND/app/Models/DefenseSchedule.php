<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class DefenseSchedule extends Model {
    protected $fillable = [
        'project_id', 'group_id', 'adviser_id',
        'defense_date', 'defense_time',
        'venue', 'panelists', 'status'
    ];

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
    public static function projectIdsForPanelist(User $user) {
        return static::whereNotNull('panelists')->get()
            ->filter(function ($schedule) use ($user) {
                $names = array_map('trim', explode(',', $schedule->panelists));
                return collect($names)->contains(fn($n) => $n !== '' && strcasecmp($n, $user->name) === 0);
            })
            ->pluck('project_id')
            ->filter()
            ->unique()
            ->values();
    }
}
