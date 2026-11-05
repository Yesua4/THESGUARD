<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Students register themselves (name parts, Student No., email); instructors
// enroll them by importing the registrar's class list, matched on Student No.
// class_roster keeps every imported row, so a student who hasn't signed up
// yet is enrolled automatically the moment they do.
return new class extends Migration {
    public function up(): void {
        Schema::table('users', function (Blueprint $table) {
            $table->string('last_name')->nullable()->after('name');
            $table->string('first_name')->nullable()->after('last_name');
            $table->string('middle_name')->nullable()->after('first_name');
            // Set only by self-registration; cleared when a class-list import
            // enrolls them. Accounts created by staff are never pending.
            $table->boolean('awaiting_enrollment')->default(false)->after('section');
        });

        Schema::create('class_roster', function (Blueprint $table) {
            $table->id();
            $table->foreignId('school_id')->constrained()->cascadeOnDelete();
            $table->string('student_id', 50);
            $table->string('name');              // as printed on the class list
            $table->string('section', 100);
            $table->string('program', 100)->nullable();
            $table->foreignId('instructor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('name_mismatch')->default(false);
            $table->timestamp('enrolled_at')->nullable();
            $table->timestamps();
            $table->unique(['school_id', 'student_id']);
            $table->index('student_id');
        });
    }

    public function down(): void {
        Schema::dropIfExists('class_roster');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['last_name', 'first_name', 'middle_name', 'awaiting_enrollment']);
        });
    }
};
