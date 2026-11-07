<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Evaluations follow the school's defense evaluation sheet:
//   Individual grade (per presenter, 100): Disposition 30 + Delivery & Presentation 70
//   Group grade (100): Documentation 50 + Software 50
//   Verdict: passed (no revisions) / passed (with revisions) / conditional / failed
//           (+ "comply by" date for a conditional pass)
// One evaluation per panelist per DEFENSE (outline, pre-deployment, final...),
// so a later defense doesn't overwrite an earlier one. Old columns stay for
// old rows; `recommendation` is kept in step (passed / revision / failed).
return new class extends Migration {
    public function up(): void {
        Schema::table('evaluations', function (Blueprint $table) {
            $table->foreignId('defense_schedule_id')->nullable()->after('project_id')->constrained()->nullOnDelete();
            $table->json('individual_scores')->nullable()->after('qa_score');
            $table->float('group_documentation')->nullable()->after('individual_scores');
            $table->float('group_software')->nullable()->after('group_documentation');
            $table->float('group_total')->nullable()->after('group_software');
            $table->string('verdict', 30)->nullable()->after('recommendation');
            $table->date('comply_by')->nullable()->after('verdict');
            $table->index(['defense_schedule_id', 'panelist_id']);
        });
        Schema::table('defense_schedules', function (Blueprint $table) {
            // Consolidated panel verdict for this defense, once everyone has evaluated.
            $table->string('verdict', 30)->nullable()->after('status');
        });
    }

    public function down(): void {
        Schema::table('defense_schedules', function (Blueprint $table) {
            $table->dropColumn('verdict');
        });
        Schema::table('evaluations', function (Blueprint $table) {
            $table->dropIndex(['defense_schedule_id', 'panelist_id']);
            $table->dropConstrainedForeignId('defense_schedule_id');
            $table->dropColumn(['individual_scores', 'group_documentation', 'group_software', 'group_total', 'verdict', 'comply_by']);
        });
    }
};
