<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Room extends Model {
    // `capacity` column is kept for old rows but no longer used.
    protected $fillable = ['school_id', 'room_name', 'building'];
}
