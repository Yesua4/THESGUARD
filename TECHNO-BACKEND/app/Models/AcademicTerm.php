<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

class AcademicTerm extends Model {
    protected $fillable = ['school_id', 'academic_year', 'name', 'start_date', 'end_date'];

    protected $casts = [
        'start_date' => 'date:Y-m-d',
        'end_date'   => 'date:Y-m-d',
    ];

    // "Today" in the school's local time (the server runs on UTC; without
    // this the term would flip over at 8 AM Philippine time, not midnight).
    public static function today(): string {
        return Carbon::now(config('app.calendar_timezone', 'Asia/Manila'))->toDateString();
    }

    // The term whose dates contain today, for a school (null between terms
    // or when the admin hasn't set up the calendar).
    public static function currentFor(?int $schoolId): ?self {
        if (!$schoolId) return null;
        $today = static::today();
        return static::where('school_id', $schoolId)
            ->whereDate('start_date', '<=', $today)
            ->whereDate('end_date', '>=', $today)
            ->orderBy('start_date')
            ->first();
    }

    public function label(): string {
        return "{$this->name}, A.Y. {$this->academic_year}";
    }
}
