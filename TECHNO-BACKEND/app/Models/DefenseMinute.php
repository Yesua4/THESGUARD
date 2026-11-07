<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class DefenseMinute extends Model {
    protected $fillable = [
        'project_id', 'defense_schedule_id', 'school_id', 'defense_type', 'defense_date', 'notes', 'recorded_by',
    ];
    protected $casts = [
        'defense_date' => 'date',
    ];

    public function project() {
        return $this->belongsTo(Project::class);
    }

    public function items() {
        return $this->hasMany(MinuteItem::class)->orderBy('id');
    }

    public function schedule() {
        return $this->belongsTo(DefenseSchedule::class, 'defense_schedule_id');
    }

    public function recorder() {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
