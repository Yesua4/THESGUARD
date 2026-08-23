<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('groups', function (Blueprint $table) {
            $table->id();
            $table->string('group_name')->unique();
            $table->string('batch')->nullable();
            $table->string('section')->nullable();
            $table->foreignId('instructor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('adviser_id')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::create('group_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('group_id')->constrained('groups')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->boolean('is_leader')->default(false);
        });

        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('group_id')->nullable()->constrained('groups')->nullOnDelete();
            $table->string('title', 500);
            $table->text('abstract')->nullable();
            $table->text('objectives')->nullable();
            $table->string('keywords', 500)->nullable();
            $table->string('github_url', 500)->nullable();
            $table->string('batch', 20)->nullable();
            $table->foreignId('adviser_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('instructor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('status', ['ongoing', 'for_defense', 'approved', 'archived', 'flagged'])->default('ongoing');
            $table->float('similarity_score')->nullable();
            $table->enum('title_status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->text('title_feedback')->nullable();
        });

        Schema::create('project_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->boolean('is_leader')->default(false);
        });

        Schema::create('documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('type', ['proposal', 'chapter1', 'chapter2', 'chapter3', 'chapter4', 'chapter5', 'final_manuscript']);
            $table->unsignedInteger('version')->default(1);
            $table->string('file_path')->nullable();
            $table->string('github_repo')->nullable();
            $table->string('version_note', 500)->nullable();
            $table->enum('status', ['pending', 'under_review', 'approved', 'needs_revision'])->default('pending');
        });

        Schema::create('document_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_id')->constrained('documents')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedInteger('page_number');
            $table->text('selected_text')->nullable();
            $table->text('comment');
            $table->timestamp('created_at')->nullable()->useCurrent();
        });

        Schema::create('contributions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('action');
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('rooms', function (Blueprint $table) {
            $table->id();
            $table->string('room_name');
            $table->string('building')->nullable();
            $table->unsignedInteger('capacity')->nullable();
        });

        Schema::create('defense_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->nullable()->constrained('projects')->nullOnDelete();
            $table->foreignId('group_id')->constrained('groups')->cascadeOnDelete();
            $table->foreignId('adviser_id')->constrained('users')->cascadeOnDelete();
            $table->date('defense_date');
            $table->string('defense_time');
            $table->string('venue')->nullable();
            $table->text('panelists')->nullable();
            $table->string('status')->nullable();
        });

        Schema::create('similarity_results', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->foreignId('compared_to_project_id')->constrained('projects')->cascadeOnDelete();
            $table->float('title_score')->nullable();
            $table->float('abstract_score')->nullable();
            $table->float('objectives_score')->nullable();
            $table->float('overall_score')->nullable();
            $table->timestamp('checked_at')->nullable()->useCurrent();
        });
    }

    public function down(): void {
        Schema::dropIfExists('similarity_results');
        Schema::dropIfExists('defense_schedules');
        Schema::dropIfExists('rooms');
        Schema::dropIfExists('contributions');
        Schema::dropIfExists('document_comments');
        Schema::dropIfExists('documents');
        Schema::dropIfExists('project_members');
        Schema::dropIfExists('projects');
        Schema::dropIfExists('group_members');
        Schema::dropIfExists('groups');
    }
};
