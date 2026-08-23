<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('documents', function (Blueprint $table) {
            $table->string('preview_path')->nullable()->after('file_path');
            $table->enum('preview_status', ['unsupported', 'ready', 'failed'])->default('unsupported')->after('preview_path');
        });
    }

    public function down(): void {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropColumn(['preview_path', 'preview_status']);
        });
    }
};
