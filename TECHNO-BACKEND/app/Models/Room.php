<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Room extends Model {
    // `capacity` column is kept for old rows but no longer used.
    protected $fillable = ['room_name', 'building'];
}
