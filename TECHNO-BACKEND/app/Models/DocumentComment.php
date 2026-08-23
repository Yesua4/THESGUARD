<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class DocumentComment extends Model {
    protected $table = 'document_comments';
    protected $fillable = [
        'document_id', 'user_id', 'page_number',
        'selected_text', 'anchor', 'comment',
        'status', 'resolved_at', 'resolved_by'
    ];

    protected $casts = [
        'anchor'      => 'array',
        'resolved_at' => 'datetime',
    ];

    public function user() {
        return $this->belongsTo(User::class);
    }

    public function document() {
        return $this->belongsTo(Document::class);
    }

    public function resolver() {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}
