<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// 2026_03_31_123640_update_users_role_enum widened the role enum to include
// 'instructor', but only on MySQL -- its driver guard was written to skip
// SQLite (which has no native enum type) and accidentally skipped Postgres
// too, which does enforce the enum via a CHECK constraint. On Supabase the
// users_role_check constraint was still stuck at the original 4-role list,
// so creating or editing any user with role=instructor fails with a
// database constraint violation (surfaced to the browser as a generic
// 500 Server Error). MySQL doesn't need this migration -- it was already
// fixed by the earlier one.
return new class extends Migration {
    public function up(): void {
        if (DB::getDriverName() !== 'pgsql') return;

        DB::statement("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check");
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role::text = ANY (ARRAY['admin','adviser','student','panelist','instructor']::text[]))");
    }

    public function down(): void {
        if (DB::getDriverName() !== 'pgsql') return;

        DB::statement("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check");
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role::text = ANY (ARRAY['admin','adviser','student','panelist']::text[]))");
    }
};
