<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// A panelist of one specific defense, with their role on it.
class DefenseSchedulePanelist extends Model {
    protected $fillable = ['defense_schedule_id', 'user_id', 'role'];

    public function user() { return $this->belongsTo(User::class); }
    public function schedule() { return $this->belongsTo(DefenseSchedule::class, 'defense_schedule_id'); }
}
