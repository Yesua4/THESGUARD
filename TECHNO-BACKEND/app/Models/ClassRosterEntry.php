<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// One row of an imported class list. user_id is filled once the student with
// this Student No. has an account (now or when they register later).
class ClassRosterEntry extends Model {
    protected $table = 'class_roster';

    protected $fillable = [
        'school_id', 'student_id', 'name', 'section', 'program',
        'instructor_id', 'user_id', 'name_mismatch', 'enrolled_at',
    ];

    protected $casts = [
        'name_mismatch' => 'boolean',
        'enrolled_at'   => 'datetime',
    ];

    public function user() {
        return $this->belongsTo(User::class);
    }

    public function instructor() {
        return $this->belongsTo(User::class, 'instructor_id');
    }
}
