<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// A message in a comment's thread. Never edited or deleted.
class DocumentCommentReply extends Model {
    protected $fillable = ['comment_id', 'user_id', 'body'];

    public function comment() { return $this->belongsTo(DocumentComment::class, 'comment_id'); }
    public function user() { return $this->belongsTo(User::class); }
}
