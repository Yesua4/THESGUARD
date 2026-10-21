<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class ProjectChecklistItem extends Model {
    protected $fillable = [
        'project_id', 'school_id', 'checklist_type', 'item_key', 'label', 'responsible_role',
        'sort_order', 'is_done', 'done_by', 'done_at', 'remarks',
    ];
    protected $casts = [
        'is_done' => 'boolean',
        'done_at' => 'datetime',
    ];

    public function project() {
        return $this->belongsTo(Project::class);
    }

    // Not named doneBy(): that would serialize as "done_by" and shadow the column.
    public function completer() {
        return $this->belongsTo(User::class, 'done_by');
    }
}
