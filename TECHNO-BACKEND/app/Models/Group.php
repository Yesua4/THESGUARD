<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Group extends Model {
    protected $table = 'groups';
    protected $fillable = [
        'group_name', 'batch', 'section', 'instructor_id', 'adviser_id', 'school_id'
    ];

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