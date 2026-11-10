<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// Runtime key/value settings (see the app_settings migration).
class AppSetting extends Model {
    protected $fillable = ['key', 'value', 'expires_at'];
    protected $casts = ['expires_at' => 'datetime'];

    // The value, or null if it's missing or has expired.
    public static function get(string $key): ?string {
        $row = static::where('key', $key)->first();
        if (!$row || ($row->expires_at && $row->expires_at->isPast())) return null;
        return $row->value;
    }

    public static function put(string $key, ?string $value, ?\DateTimeInterface $expiresAt = null): void {
        static::updateOrCreate(['key' => $key], ['value' => $value, 'expires_at' => $expiresAt]);
    }
}
