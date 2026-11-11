<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Archived projects keep their adviser's name as plain text, so the record
// stays complete even after that adviser's account is removed (or when an
// imported name never matched an account). Existing names are copied over.
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasColumn('projects', 'adviser_name')) {
            Schema::table('projects', function (Blueprint $table) {
                $table->string('adviser_name')->nullable();
            });
        }

        // Plain per-row copy: works the same on MySQL, PostgreSQL and SQLite.
        DB::table('projects')
            ->whereNull('adviser_name')->whereNotNull('adviser_id')
            ->orderBy('id')
            ->get(['id', 'adviser_id'])
            ->each(function ($p) {
                $name = DB::table('users')->where('id', $p->adviser_id)->value('name');
                if ($name) DB::table('projects')->where('id', $p->id)->update(['adviser_name' => $name]);
            });
    }

    public function down(): void
    {
        if (Schema::hasColumn('projects', 'adviser_name')) {
            Schema::table('projects', fn (Blueprint $table) => $table->dropColumn('adviser_name'));
        }
    }
};
