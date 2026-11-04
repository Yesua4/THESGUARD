<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// 2026_07_06_000001_add_preview_fields_to_documents_table only allowed
// ['unsupported', 'ready', 'failed'] for preview_status. The fix that stopped
// document upload from blocking on a synchronous LibreOffice conversion
// introduced a 4th value, 'pending', set at upload time for non-PDF files --
// but the DB-level check constraint (enum on MySQL, CHECK on Postgres/SQLite)
// never got widened to allow it, so every non-PDF document upload in
// production started failing with a check-constraint violation, surfaced to
// the browser as a generic 500 "Server Error" (same failure shape as the
// users_role_check gap fixed in 2026_08_24_000001).
return new class extends Migration {
    private array $widened = ['unsupported', 'ready', 'failed', 'pending'];
    private array $original = ['unsupported', 'ready', 'failed'];

    public function up(): void {
        $this->apply($this->widened);
    }

    public function down(): void {
        $this->apply($this->original);
    }

    private function apply(array $values): void {
        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            $list = "'" . implode("','", $values) . "'";
            DB::statement("ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_preview_status_check");
            DB::statement("ALTER TABLE documents ADD CONSTRAINT documents_preview_status_check CHECK (preview_status::text = ANY (ARRAY[{$list}]::text[]))");
            return;
        }

        if ($driver === 'mysql') {
            $list = "'" . implode("','", $values) . "'";
            DB::statement("ALTER TABLE documents MODIFY preview_status ENUM({$list}) NOT NULL DEFAULT 'unsupported'");
            return;
        }

        // sqlite (tests): no ALTER CONSTRAINT support, so rebuild the column
        // via Laravel's own schema builder instead of raw SQL.
        Schema::table('documents', function (Blueprint $table) use ($values) {
            $table->enum('preview_status', $values)->default('unsupported')->change();
        });
    }
};
