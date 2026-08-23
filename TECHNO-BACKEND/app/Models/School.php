<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class School extends Model
{
    protected $fillable = [
        'name', 'slug', 'email', 'address', 'is_active'
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    // ── Relationships ──────────────────────────────────────────
    public function users()
    {
        return $this->hasMany(User::class);
    }

    public function groups()
    {
        return $this->hasMany(Group::class);
    }

    public function projects()
    {
        return $this->hasMany(Project::class);
    }
}
