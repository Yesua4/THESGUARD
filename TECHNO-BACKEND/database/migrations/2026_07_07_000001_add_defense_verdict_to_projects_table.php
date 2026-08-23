<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Each panelist already submits their own rubric score + recommendation
// (passed/failed/revision), but nothing combines multiple panelists'
// verdicts into a single defense outcome — someone had to manually read
// every evaluation row to know if a group actually passed. This column
// holds the computed consolidated result.
return new class extends Migration {
    public function up(): void {
        Schema::table('projects', function (Blueprint $table) {
            $table->enum('defense_verdict', ['pending', 'passed', 'failed', 'revision'])
                ->default('pending')->after('is_final_title');
        });
    }

    public function down(): void {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('defense_verdict');
        });
    }
};
