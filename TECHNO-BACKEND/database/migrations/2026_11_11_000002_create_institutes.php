<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Institutes inside a school (e.g. Institute of Computing = capstone,
// ITED = thesis). People and groups may belong to one. Nothing changes for
// existing data: no institute means "capstone", as before.
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('institutes')) {
            Schema::create('institutes', function (Blueprint $table) {
                $table->id();
                $table->foreignId('school_id')->constrained('schools')->cascadeOnDelete();
                $table->string('name');
                $table->string('research_type', 20)->default('capstone'); // capstone | thesis
                $table->timestamps();
                $table->unique(['school_id', 'name']);
            });
        }
        foreach (['users', 'groups'] as $t) {
            if (!Schema::hasColumn($t, 'institute_id')) {
                Schema::table($t, function (Blueprint $table) {
                    $table->foreignId('institute_id')->nullable()->constrained('institutes')->nullOnDelete();
                });
            }
        }
    }

    public function down(): void
    {
        foreach (['users', 'groups'] as $t) {
            if (Schema::hasColumn($t, 'institute_id')) {
                Schema::table($t, function (Blueprint $table) {
                    $table->dropConstrainedForeignId('institute_id');
                });
            }
        }
        Schema::dropIfExists('institutes');
    }
};
