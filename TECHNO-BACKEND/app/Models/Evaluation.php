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
    ];

    public function panelist() {
        return $this->belongsTo(User::class, 'panelist_id');
    }

    public function project() {
        return $this->belongsTo(Project::class);
    }
}
