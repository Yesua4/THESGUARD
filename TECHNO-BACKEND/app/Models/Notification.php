<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Notification extends Model {
    protected $fillable = ['user_id', 'type', 'title', 'message', 'is_read', 'project_id', 'document_id'];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'is_read' => 'boolean',
    ];

    public function user() {
        return $this->belongsTo(User::class);
    }

    public function project() {
        return $this->belongsTo(Project::class);
    }

    public function document() {
        return $this->belongsTo(Document::class);
    }
}
