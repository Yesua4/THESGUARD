<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class GroupMember extends Model {
    protected $table = 'group_members';
    protected $fillable = ['group_id', 'user_id', 'is_leader'];

    public function user() {
        return $this->belongsTo(User::class);
    }

    public function group() {
        return $this->belongsTo(Group::class);
    }
}
