<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CapstoneStage extends Model {
    protected $fillable = ['school_id', 'name', 'year_level', 'term_no'];

    protected $casts = ['year_level' => 'integer', 'term_no' => 'integer'];
}
