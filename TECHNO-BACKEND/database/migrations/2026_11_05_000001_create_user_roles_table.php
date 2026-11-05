<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Multi-role accounts: a faculty member can be instructor + adviser +
// panelist at once. users.role stays as the ACTIVE role (what every
// existing authorization check reads); this table holds every role the
// admin ASSIGNED, which is what "switch role" is allowed to pick from.
// A plain table instead of a JSON column so lookups like "everyone who
// can be a panelist" are the same query on MySQL, Postgres and SQLite.
return new class extends Migration {
    public function up(): void {
        Schema::create('user_roles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role', 20);
            $table->unique(['user_id', 'role']);
            $table->index('role');
        });

        // Backfill: every existing account is assigned its current role.
        DB::table('users')->select('id', 'role')->whereNotNull('role')->orderBy('id')
            ->chunk(500, function ($users) {
                DB::table('user_roles')->insert(
                    $users->map(fn ($u) => ['user_id' => $u->id, 'role' => $u->role])->all()
                );
            });
    }

    public function down(): void {
        Schema::dropIfExists('user_roles');
    }
};
