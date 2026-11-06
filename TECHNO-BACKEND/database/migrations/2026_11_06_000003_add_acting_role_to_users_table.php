<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The admin can step into any role's screens (instructor, adviser,
// panelist, student) without losing admin access. users.role stays
// 'admin' -- every permission check keeps passing -- and acting_role only
// decides which screens/menu the frontend shows. Null = plain admin.
return new class extends Migration {
    public function up(): void {
        Schema::table('users', function (Blueprint $table) {
            $table->string('acting_role', 20)->nullable()->after('role');
        });
    }

    public function down(): void {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('acting_role');
        });
    }
};
