<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// These tables were part of the reconstructed baseline and never had
// created_at/updated_at at all — meaning there's no audit trail of when a
// proposal, upload, group assignment, or defense schedule was actually made.
// Existing rows get NULL timestamps since there's no way to know retroactively.
return new class extends Migration {
    private array $tables = [
        'projects', 'documents', 'groups', 'group_members',
        'project_members', 'defense_schedules', 'rooms',
    ];

    public function up(): void {
        foreach ($this->tables as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->timestamps();
            });
        }
    }

    public function down(): void {
        foreach ($this->tables as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropTimestamps();
            });
        }
    }
};
