<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void {
        // MySQL-only syntax: SQLite (used in testing, see phpunit.xml) has no
        // native ENUM type, so the preceding migration's Schema::enum() call
        // already stores 'role' as an unconstrained column there — nothing
        // to widen.
        if (DB::getDriverName() !== 'mysql') return;
        DB::statement("ALTER TABLE users MODIFY COLUMN role ENUM('admin','adviser','student','panelist','instructor') NOT NULL DEFAULT 'student'");
    }

    public function down(): void {
        if (DB::getDriverName() !== 'mysql') return;
        DB::statement("ALTER TABLE users MODIFY COLUMN role ENUM('admin','adviser','student','panelist') NOT NULL DEFAULT 'student'");
    }
};
