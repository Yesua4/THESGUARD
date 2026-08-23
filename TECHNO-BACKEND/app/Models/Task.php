<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Task extends Model {
    protected $fillable = [
        'project_id', 'assigned_to', 'created_by',
        'title', 'description', 'due_date', 'is_completed', 'completed_at',
    ];
    protected $casts = [
        'is_completed' => 'boolean',
        'due_date'     => 'date',
        'completed_at' => 'datetime',
    ];

    public function project() {
        return $this->belongsTo(Project::class);
    }

    public function assignee() {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function creator() {
        return $this->belongsTo(User::class, 'created_by');
    }
}
