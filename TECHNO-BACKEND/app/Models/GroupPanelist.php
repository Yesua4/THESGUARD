<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// A member of a group's permanent panel (outline -> final defense).
class GroupPanelist extends Model {
    protected $fillable = ['group_id', 'user_id', 'role'];

    public function user() { return $this->belongsTo(User::class); }
    public function group() { return $this->belongsTo(Group::class); }
}
