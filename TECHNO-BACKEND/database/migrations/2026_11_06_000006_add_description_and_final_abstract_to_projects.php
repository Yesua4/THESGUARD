<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// A title proposal has no abstract yet -- students write a short Project
// Description. `abstract` stays the text used for similarity checks:
//   - while a proposal: the project description (copied in);
//   - after the final defense: replaced by the real final abstract
//     (abstract_is_final = true). `description` keeps the original.
// So every new proposal is compared against past projects' final
// abstracts when they exist, and their descriptions otherwise.
return new class extends Migration {
    public function up(): void {
        Schema::table('projects', function (Blueprint $table) {
            $table->text('description')->nullable()->after('title');
            $table->boolean('abstract_is_final')->default(false)->after('abstract');
        });

        // Existing proposals: what students typed into "Abstract" was really
        // their description. Imported archive records (no group) carry real
        // abstracts from past capstones.
        DB::table('projects')->whereNull('description')->update(['description' => DB::raw('abstract')]);
        DB::table('projects')->whereNull('group_id')->where('status', 'archived')->whereNotNull('abstract')
            ->update(['abstract_is_final' => true]);
    }

    public function down(): void {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn(['description', 'abstract_is_final']);
        });
    }
};
