<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class MinuteItem extends Model {
    protected $fillable = [
        'defense_minute_id', 'panelist_name', 'panelist_role', 'page_no', 'comment',
        'action_taken', 'status', 'addressed_by', 'addressed_at', 'verified_by', 'verified_at', 'created_by',
    ];
    protected $casts = [
        'addressed_at' => 'datetime',
        'verified_at'  => 'datetime',
    ];

    public function minute() {
        return $this->belongsTo(DefenseMinute::class, 'defense_minute_id');
    }

    public function addresser() {
        return $this->belongsTo(User::class, 'addressed_by');
    }

    public function verifier() {
        return $this->belongsTo(User::class, 'verified_by');
    }
}
