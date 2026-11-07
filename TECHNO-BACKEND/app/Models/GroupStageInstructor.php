<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// Which instructor handles a group in one capstone stage.
class GroupStageInstructor extends Model {
    protected $fillable = ['group_id', 'capstone_stage_id', 'user_id'];

    public function user() { return $this->belongsTo(User::class); }
    public function stage() { return $this->belongsTo(CapstoneStage::class, 'capstone_stage_id'); }
}
