<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Sections an instructor handles (e.g. BSIT 4A, 4B, 4C), assigned by the
// admin. An instructor with sections only sees/manages students, groups and
// projects in those sections; one with none keeps the school-wide view.
return new class extends Migration {
    public function up(): void {
        Schema::create('instructor_sections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('section', 100);
            $table->unique(['user_id', 'section']);
        });
    }

    public function down(): void {
        Schema::dropIfExists('instructor_sections');
    }
};
