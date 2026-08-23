<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Document extends Model {
    protected $fillable = [
        'project_id', 'uploaded_by', 'type',
        'version', 'file_path', 'content', 'preview_path', 'preview_status',
        'version_note', 'status', 'github_repo'
    ];

    public function uploader() {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function project() {
        return $this->belongsTo(Project::class);
    }
}
