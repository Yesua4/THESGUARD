<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Minutes belong to a specific defense (so choosing "Panel Chair" fills in
// that defense's chair), and a minutes row can come from a panel comment
// ("fill from panel comments" never imports the same one twice).
return new class extends Migration {
    public function up(): void {
        Schema::table('defense_minutes', function (Blueprint $table) {
            $table->foreignId('defense_schedule_id')->nullable()->after('project_id')->constrained()->nullOnDelete();
        });
        Schema::table('minute_items', function (Blueprint $table) {
            $table->foreignId('panel_comment_id')->nullable()->after('defense_minute_id')->constrained('panel_comments')->nullOnDelete();
            $table->string('panel_role', 20)->nullable()->after('panelist_role'); // chair | member1 | member2 | adviser
        });
    }

    public function down(): void {
        Schema::table('minute_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('panel_comment_id');
            $table->dropColumn('panel_role');
        });
        Schema::table('defense_minutes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('defense_schedule_id');
        });
    }
};
