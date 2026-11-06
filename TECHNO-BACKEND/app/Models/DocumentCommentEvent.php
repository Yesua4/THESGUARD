<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// Append-only timeline entry for a comment (who did what, when, and why).
// Nothing in the app updates or deletes these.
class DocumentCommentEvent extends Model {
    public const UPDATED_AT = null;

    protected $fillable = ['comment_id', 'user_id', 'type', 'from_status', 'to_status', 'note', 'document_id', 'attempt_id'];

    public function comment() { return $this->belongsTo(DocumentComment::class, 'comment_id'); }
    public function user() { return $this->belongsTo(User::class); }
}
