<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The school's capstone plan, set by the admin: which year level and which
// term of the school year each stage is taken in, e.g.
//   Capstone 1 -> 2nd year, 2nd term;  Capstone 2 -> 3rd year, 1st term.
// A group's current stage is worked out from the academic calendar (see
// CapstoneStageService), so it advances by itself as terms pass.
return new class extends Migration {
    public function up(): void {
        Schema::create('capstone_stages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('school_id')->constrained()->cascadeOnDelete();
            $table->string('name', 50);
            $table->unsignedTinyInteger('year_level');
            $table->unsignedTinyInteger('term_no');
            $table->timestamps();
            $table->unique(['school_id', 'year_level', 'term_no']);
        });

        // Year level of the group's members when it was formed (from their
        // section, e.g. "BSIT 2-A" -> 2). The calendar moves it forward.
        Schema::table('groups', function (Blueprint $table) {
            $table->unsignedTinyInteger('start_year_level')->nullable()->after('academic_term_id');
        });
    }

    public function down(): void {
        Schema::table('groups', function (Blueprint $table) {
            $table->dropColumn('start_year_level');
        });
        Schema::dropIfExists('capstone_stages');
    }
};
