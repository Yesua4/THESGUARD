<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Evaluation extends Model
{
    protected $fillable = [
        'project_id',
        'panelist_id',
        'presentation_score',
        'technical_score',
        'documentation_score',
        'qa_score',
        'overall_score',
        'recommendation',
        'remarks',
        'defense_schedule_id',
        'individual_scores',
        'group_documentation',
        'group_software',
        'group_total',
        'verdict',
        'comply_by',
    ];

    protected $casts = [
        'individual_scores' => 'array',
        'comply_by'         => 'date:Y-m-d',
    ];

    public function schedule() {
        return $this->belongsTo(DefenseSchedule::class, 'defense_schedule_id');
    }

    public function panelist() {
        return $this->belongsTo(User::class, 'panelist_id');
    }

    public function project() {
        return $this->belongsTo(Project::class);
    }
}
