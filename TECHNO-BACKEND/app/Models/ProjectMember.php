<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class ProjectMember extends Model {
    protected $fillable = ['project_id', 'user_id', 'is_leader'];

    public function user() {
        return $this->belongsTo(User::class);
    }
}
