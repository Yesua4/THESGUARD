<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('notifications', function (Blueprint $table) {
            $table->unsignedBigInteger('document_id')->nullable()->after('project_id');
        });
    }

    public function down(): void {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropColumn('document_id');
        });
    }
};
