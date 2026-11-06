<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class DocumentComment extends Model {
    protected $table = 'document_comments';
    protected $fillable = [
        'document_id', 'user_id', 'page_number',
        'selected_text', 'anchor', 'comment',
        'status', 'resolved_at', 'resolved_by',
        'review_status', 'lock_version', 'verified_on_behalf_of',
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

    public function onBehalfOf() {
        return $this->belongsTo(User::class, 'verified_on_behalf_of');
    }

    public function replies() {
        return $this->hasMany(DocumentCommentReply::class, 'comment_id')->orderBy('created_at')->orderBy('id');
    }

    public function attempts() {
        return $this->hasMany(DocumentCommentAttempt::class, 'comment_id')->orderBy('attempt_no');
    }

    public function events() {
        return $this->hasMany(DocumentCommentEvent::class, 'comment_id')->orderBy('created_at')->orderBy('id');
    }
}
