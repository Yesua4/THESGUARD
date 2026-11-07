<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Before a group can be approved for a defense it is first RECOMMENDED for
// it (title / outline / pre_deployment / final), usually by its adviser.
// Shown in Manage Groups and All Projects; scheduling defaults to it.
return new class extends Migration {
    public function up(): void {
        Schema::table('groups', function (Blueprint $table) {
            $table->string('recommended_for', 20)->nullable()->after('adviser_id');
            $table->foreignId('recommended_by')->nullable()->after('recommended_for')->constrained('users')->nullOnDelete();
            $table->timestamp('recommended_at')->nullable()->after('recommended_by');
        });
    }

    public function down(): void {
        Schema::table('groups', function (Blueprint $table) {
            $table->dropConstrainedForeignId('recommended_by');
            $table->dropColumn(['recommended_for', 'recommended_at']);
        });
    }
};
