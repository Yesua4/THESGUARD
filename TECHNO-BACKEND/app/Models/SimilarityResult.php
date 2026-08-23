<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class SimilarityResult extends Model {
    public $timestamps = false;
    protected $table = 'similarity_results';
    protected $fillable = [
        'project_id',
        'compared_to_project_id',
        'title_score',
        'abstract_score',
        'objectives_score',
        'overall_score',
    ];

    protected $casts = [
        'checked_at' => 'datetime',
    ];

    public function project() {
        return $this->belongsTo(Project::class);
    }

    public function comparedTo() {
        return $this->belongsTo(Project::class, 'compared_to_project_id');
    }
}
