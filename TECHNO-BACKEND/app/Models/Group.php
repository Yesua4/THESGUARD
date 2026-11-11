<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Group extends Model {
    protected $table = 'groups';
    protected $fillable = [
        'group_name', 'batch', 'academic_term_id', 'start_year_level', 'section', 'instructor_id', 'adviser_id', 'school_id',
        'recommended_for', 'recommended_by', 'recommended_at', 'institute_id',
    ];

    protected $with = ['institute'];
    // capstone | thesis, from the group's institute (no institute = capstone).
    protected $appends = ['research_type'];

    public function institute() {
        return $this->belongsTo(Institute::class)->select(['id', 'name', 'research_type']);
    }

    public function getResearchTypeAttribute(): string {
        return $this->institute?->research_type ?? 'capstone';
    }

    protected $casts = ['recommended_at' => 'datetime'];

    public function recommender() {
        return $this->belongsTo(User::class, 'recommended_by');
    }

    public function stageInstructors() {
        return $this->hasMany(GroupStageInstructor::class)->with('user:id,name');
    }

    // Permanent panel for the outline -> final defenses.
    public function panel() {
        return $this->hasMany(GroupPanelist::class)->with('user:id,name')->orderBy('role'); // chair, member1, member2
    }

    public function term() {
        return $this->belongsTo(AcademicTerm::class, 'academic_term_id');
    }

    public function instructor() {
        return $this->belongsTo(User::class, 'instructor_id');
    }

    public function adviser() {
        return $this->belongsTo(User::class, 'adviser_id');
    }

    public function members() {
        return $this->hasMany(GroupMember::class)->with('user');
    }

    public function projects() {
        return $this->hasMany(Project::class);
    }

    public function leader() {
        return $this->hasOne(GroupMember::class)->where('is_leader', 1)->with('user');
    }

    /**
     * Limits a groups query to what a section-scoped instructor handles: groups
     * in their sections, plus groups they created or advise. No-op for anyone
     * without a section scope.
     */
    public function scopeVisibleToInstructor($query, User $user) {
        $sections = $user->sectionScope();
        if ($sections === null) {
            return $query;
        }
        return $query->where(fn ($q) => $q
            ->where(fn ($s) => User::whereSectionIn($s, 'section', $sections))
            ->orWhere('instructor_id', $user->id)
            ->orWhere('adviser_id', $user->id)
            // assigned as the instructor of one of its capstone stages
            ->orWhereIn('id', GroupStageInstructor::where('user_id', $user->id)->select('group_id'))
        );
    }

    // Groups in a section-scoped instructor's sections (empty when unscoped).
    public static function idsInSectionsOf(User $user) {
        $sections = $user->sectionScope();
        if ($sections === null) {
            return collect();
        }
        return User::whereSectionIn(static::query(), 'section', $sections)
            ->when($user->school_id, fn ($q) => $q->where('school_id', $user->school_id))
            ->pluck('id');
    }

    public function isManageableBy(User $user): bool {
        return $user->role === 'admin'
            || $user->sectionScope() === null
            || $user->handlesSection($this->section)
            || (int) $this->instructor_id === (int) $user->id
            || (int) $this->adviser_id === (int) $user->id;
    }
}