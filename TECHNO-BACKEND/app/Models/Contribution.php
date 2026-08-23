<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Contribution extends Model {
    protected $fillable = [
        'project_id', 'user_id', 'action', 'description'
    ];

    public function user() {
        return $this->belongsTo(User::class);
    }

    public function project() {
        return $this->belongsTo(Project::class);
    }
}