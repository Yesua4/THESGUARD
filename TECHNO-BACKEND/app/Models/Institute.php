<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// An institute within a school and the kind of research its groups do.
class Institute extends Model {
    public const TYPES = ['capstone', 'thesis'];

    protected $fillable = ['school_id', 'name', 'research_type'];

    public function users() {
        return $this->hasMany(User::class);
    }

    public function groups() {
        return $this->hasMany(Group::class);
    }
}
