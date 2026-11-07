<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Panel comments & recommendations from a defense, written by the panelists
// (and the group's adviser, for anything the panel didn't catch). Separate
// from the adviser's minutes; visible to the students and the adviser, and
// used to fill the minutes per panelist.
return new class extends Migration {
    public function up(): void {
        Schema::create('panel_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('defense_schedule_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('author_role', 20); // chair | member1 | member2 | adviser
            $table->string('page_no', 20)->nullable();
            $table->text('comment');
            $table->timestamps();
            $table->index(['defense_schedule_id', 'author_role']);
        });
    }

    public function down(): void {
        Schema::dropIfExists('panel_comments');
    }
};
