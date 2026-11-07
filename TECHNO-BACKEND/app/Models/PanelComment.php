<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PanelComment extends Model {
    protected $fillable = ['project_id', 'defense_schedule_id', 'user_id', 'author_role', 'page_no', 'comment'];

    public function user() { return $this->belongsTo(User::class); }
    public function schedule() { return $this->belongsTo(DefenseSchedule::class, 'defense_schedule_id'); }
}
