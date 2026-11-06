<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Defense scheduling, properly:
//  - defense_type: title | outline | pre_deployment | final
//  - start_time / end_time ("HH:MM") so overlaps can be detected, not just
//    identical start times (defense_time is kept = start, for old screens)
//  - panels are real accounts with roles (chair, member1, member2):
//      group_panelists           the group's permanent panel (outline -> final)
//      defense_schedule_panelists the panel of one specific defense (title
//                                 defense panels can differ per defense)
// The old free-text `panelists` column stays, filled from the panel, so
// existing name-based lookups keep working.
return new class extends Migration {
    public function up(): void {
        Schema::table('defense_schedules', function (Blueprint $table) {
            $table->string('defense_type', 20)->nullable()->after('adviser_id');
            $table->string('start_time', 5)->nullable()->after('defense_time');
            $table->string('end_time', 5)->nullable()->after('start_time');
        });
        // Old rows: start = defense_time when it's already HH:MM.
        foreach (DB::table('defense_schedules')->select('id', 'defense_time')->get() as $row) {
            if (preg_match('/^(\d{1,2}):(\d{2})/', (string) $row->defense_time, $m)) {
                DB::table('defense_schedules')->where('id', $row->id)
                    ->update(['start_time' => str_pad($m[1], 2, '0', STR_PAD_LEFT) . ':' . $m[2]]);
            }
        }

        Schema::create('group_panelists', function (Blueprint $table) {
            $table->id();
            $table->foreignId('group_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role', 20); // chair | member1 | member2
            $table->timestamps();
            $table->unique(['group_id', 'role']);
            $table->unique(['group_id', 'user_id']);
        });

        Schema::create('defense_schedule_panelists', function (Blueprint $table) {
            $table->id();
            $table->foreignId('defense_schedule_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role', 20);
            $table->timestamps();
            $table->unique(['defense_schedule_id', 'role']);
            $table->unique(['defense_schedule_id', 'user_id']);
            $table->index('user_id');
        });
    }

    public function down(): void {
        Schema::dropIfExists('defense_schedule_panelists');
        Schema::dropIfExists('group_panelists');
        Schema::table('defense_schedules', function (Blueprint $table) {
            $table->dropColumn(['defense_type', 'start_time', 'end_time']);
        });
    }
};
