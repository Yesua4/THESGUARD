<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The instructor of each capstone stage for a group -- Capstone 1 and
// Capstone 2 are often handled by different instructors. The current
// stage's instructor is the group's instructor (see CapstoneStageService).
return new class extends Migration {
    public function up(): void {
        Schema::create('group_stage_instructors', function (Blueprint $table) {
            $table->id();
            $table->foreignId('group_id')->constrained()->cascadeOnDelete();
            $table->foreignId('capstone_stage_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['group_id', 'capstone_stage_id']);
            $table->index('user_id');
        });
    }

    public function down(): void {
        Schema::dropIfExists('group_stage_instructors');
    }
};
