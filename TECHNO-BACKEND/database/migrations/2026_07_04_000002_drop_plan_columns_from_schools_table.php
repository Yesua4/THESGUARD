<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('schools', function (Blueprint $table) {
            $table->dropColumn(['plan', 'plan_expires_at']);
        });
    }

    public function down(): void {
        Schema::table('schools', function (Blueprint $table) {
            $table->string('plan')->default('free');
            $table->timestamp('plan_expires_at')->nullable();
        });
    }
};
