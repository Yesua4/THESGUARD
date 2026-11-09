<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Rooms belong to a school (they were shared by every school before).
// Existing rooms go to the school when there's only one; otherwise they
// stay unassigned (still visible to everyone) until an admin re-adds them.
return new class extends Migration {
    public function up(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->foreignId('school_id')->nullable()->after('id')->constrained('schools')->nullOnDelete();
        });

        $schools = DB::table('schools')->pluck('id');
        if ($schools->count() === 1) {
            DB::table('rooms')->whereNull('school_id')->update(['school_id' => $schools->first()]);
        }
    }

    public function down(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->dropConstrainedForeignId('school_id');
        });
    }
};
