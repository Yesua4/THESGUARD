<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// One "addressed -- ready for review" submission and the faculty verdict.
// A rejected attempt is kept; the next submission is a new row.
class DocumentCommentAttempt extends Model {
    protected $fillable = [
        'comment_id', 'attempt_no', 'submitted_by', 'revision_document_id', 'explanation',
        'original_text', 'decision', 'decided_by', 'decided_at', 'decision_note',
    ];

    protected $casts = ['decided_at' => 'datetime'];

    public function comment() { return $this->belongsTo(DocumentComment::class, 'comment_id'); }
    public function submitter() { return $this->belongsTo(User::class, 'submitted_by'); }
    public function decider() { return $this->belongsTo(User::class, 'decided_by'); }
    public function revision() { return $this->belongsTo(Document::class, 'revision_document_id'); }
}
