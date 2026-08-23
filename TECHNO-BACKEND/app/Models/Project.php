<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Project extends Model {
    protected $fillable = [
        'title', 'abstract', 'objectives', 'keywords', 'group_id',
        'batch', 'program', 'adviser_id', 'instructor_id', 'status',
        'similarity_score', 'title_status', 'is_final_title', 'defense_verdict', 'github_url', 'title_feedback', 'school_id'
    ];
    protected $casts = [
        'is_final_title' => 'boolean',
    ];

    public function adviser() {
        return $this->belongsTo(User::class, 'adviser_id');
    }

    public function instructor() {
        return $this->belongsTo(User::class, 'instructor_id');
    }

    public function members() {
        return $this->hasMany(ProjectMember::class)->with('user');
    }

    public function documents() {
        return $this->hasMany(Document::class);
    }

    public function schedule() {
        return $this->hasOne(DefenseSchedule::class);
    }
    public function group() {
    return $this->belongsTo(Group::class);
    }
}