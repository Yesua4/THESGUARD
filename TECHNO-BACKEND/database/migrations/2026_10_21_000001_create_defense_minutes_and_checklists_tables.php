<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Defense minutes (one row per defense session, mirroring the paper minutes
// form: panelist / page no. / comment / action taken) and per-project
// checklists (pre-deployment readiness and final manuscript routing).
// Plain string columns instead of enums so this runs unchanged on MySQL,
// PostgreSQL and SQLite.
return new class extends Migration {
    public function up(): void {
        Schema::create('defense_minutes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->foreignId('school_id')->nullable()->constrained('schools')->nullOnDelete();
            $table->string('defense_type', 30); // outline, pre_deployment, final
            $table->date('defense_date')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('minute_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('defense_minute_id')->constrained('defense_minutes')->cascadeOnDelete();
            $table->string('panelist_name');
            $table->string('panelist_role', 50)->nullable(); // e.g. Panel Chairman, Panel Member
            $table->string('page_no', 20)->nullable();
            $table->text('comment');
            $table->text('action_taken')->nullable();
            $table->string('status', 20)->default('pending'); // pending, addressed, verified
            $table->foreignId('addressed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('addressed_at')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('verified_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('project_checklist_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->foreignId('school_id')->nullable()->constrained('schools')->nullOnDelete();
            $table->string('checklist_type', 30); // pre_deployment, manuscript_routing
            $table->string('item_key', 60)->nullable(); // set for default items, null for custom ones
            $table->string('label');
            $table->string('responsible_role', 20);
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_done')->default(false);
            $table->foreignId('done_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('done_at')->nullable();
            $table->text('remarks')->nullable();
            $table->timestamps();
            $table->unique(['project_id', 'checklist_type', 'item_key']);
        });
    }

    public function down(): void {
        Schema::dropIfExists('project_checklist_items');
        Schema::dropIfExists('minute_items');
        Schema::dropIfExists('defense_minutes');
    }
};
