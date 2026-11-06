<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The school's academic calendar, set by the admin: each academic year
// ("2026-2027") is split into named terms (1st Semester, 2nd Semester,
// Summer, or trimesters) with start/end dates. The current term is the one
// whose dates contain today. Groups record which term they were formed in.
return new class extends Migration {
    public function up(): void {
        Schema::create('academic_terms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('school_id')->constrained()->cascadeOnDelete();
            $table->string('academic_year', 20);   // e.g. 2026-2027
            $table->string('name', 50);            // e.g. 1st Semester
            $table->date('start_date');
            $table->date('end_date');
            $table->timestamps();
            $table->unique(['school_id', 'academic_year', 'name']);
            $table->index(['school_id', 'start_date']);
        });

        Schema::table('groups', function (Blueprint $table) {
            $table->foreignId('academic_term_id')->nullable()->after('batch')
                ->constrained('academic_terms')->nullOnDelete();
        });
    }

    public function down(): void {
        Schema::table('groups', function (Blueprint $table) {
            $table->dropConstrainedForeignId('academic_term_id');
        });
        Schema::dropIfExists('academic_terms');
    }
};
