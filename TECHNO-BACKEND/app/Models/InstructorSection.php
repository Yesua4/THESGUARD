<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InstructorSection extends Model {
    public $timestamps = false;

    protected $fillable = ['user_id', 'section'];

    public function user() {
        return $this->belongsTo(User::class);
    }
}
