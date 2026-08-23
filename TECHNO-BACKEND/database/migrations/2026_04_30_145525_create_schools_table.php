<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('schools', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('email')->unique();
            $table->string('address')->nullable();
            $table->string('plan')->default('free'); // free, pro, institutional
            $table->timestamp('plan_expires_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Add school_id to users
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('school_id')->nullable()->constrained('schools')->nullOnDelete();
        });

        // Add school_id to groups
        Schema::table('groups', function (Blueprint $table) {
            $table->foreignId('school_id')->nullable()->constrained('schools')->nullOnDelete();
        });

        // Add school_id to projects
        Schema::table('projects', function (Blueprint $table) {
            $table->foreignId('school_id')->nullable()->constrained('schools')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropForeign(['school_id']);
            $table->dropColumn('school_id');
        });
        Schema::table('groups', function (Blueprint $table) {
            $table->dropForeign(['school_id']);
            $table->dropColumn('school_id');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['school_id']);
            $table->dropColumn('school_id');
        });
        Schema::dropIfExists('schools');
    }
};
