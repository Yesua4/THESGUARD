<?php
namespace App\Exceptions;

// Thrown inside a transaction to roll it back when a comment's lock_version
// no longer matches (someone else changed it first). Mapped to HTTP 409.
class CommentConflict extends \RuntimeException {}
