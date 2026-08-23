<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Marks which one of a group's (possibly several) approved title proposals
// is the one they've actually committed to. A group can submit and get more
// than one title approved before picking a final one — without this flag,
// nothing tells the adviser/instructor which title is "the" thesis, and
// document uploads have no reliable project to attach to.
return new class extends Migration {
    public function up(): void {
        Schema::table('projects', function (Blueprint $table) {
            $table->boolean('is_final_title')->default(false)->after('title_status');
        });
    }

    public function down(): void {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('is_final_title');
        });
    }
};
