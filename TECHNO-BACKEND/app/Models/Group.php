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
}