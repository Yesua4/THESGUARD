<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Verified comment resolution (phases B-D):
//   open -> in_progress -> awaiting_verification -> resolved
//                        awaiting_verification -> reopened -> in_progress -> ...
//
// review_status is a NEW string column rather than widening the existing
// `status` enum: changing an enum's allowed values is engine-specific
// (MySQL enum, Postgres CHECK, SQLite table rebuild -- see the users.role
// fix migration). `status` stays as open/resolved and is kept in sync, so
// everything that already reads it keeps working.
return new class extends Migration {
    public function up(): void {
        Schema::table('document_comments', function (Blueprint $table) {
            $table->string('review_status', 30)->default('open')->after('status');
            // Optimistic locking: a status change must name the version it saw.
            $table->unsignedInteger('lock_version')->default(0)->after('review_status');
            // Set when the group's adviser verifies a comment whose author is
            // no longer assigned to the project.
            $table->foreignId('verified_on_behalf_of')->nullable()->after('resolved_by')->constrained('users')->nullOnDelete();
            $table->index(['document_id', 'review_status']);
        });
        DB::table('document_comments')->where('status', 'resolved')->update(['review_status' => 'resolved']);

        // Threaded discussion. Replies are never edited or deleted.
        Schema::create('document_comment_replies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('comment_id')->constrained('document_comments')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->text('body');
            $table->timestamps();
            $table->index(['comment_id', 'created_at']);
        });

        // Each "addressed -- ready for review" submission and its verdict.
        // Never overwritten: a rejected attempt stays, the next is a new row.
        Schema::create('document_comment_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('comment_id')->constrained('document_comments')->cascadeOnDelete();
            $table->unsignedInteger('attempt_no');
            $table->foreignId('submitted_by')->constrained('users')->cascadeOnDelete();
            // The saved revision (a newer version of the chapter) the fix is in.
            $table->foreignId('revision_document_id')->nullable()->constrained('documents')->nullOnDelete();
            $table->text('explanation');
            $table->text('original_text')->nullable();
            $table->string('decision', 20)->default('pending'); // pending | approved | rejected
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->text('decision_note')->nullable();
            $table->timestamps();
            $table->unique(['comment_id', 'attempt_no']);
        });

        // Append-only timeline of everything that happened to a comment.
        Schema::create('document_comment_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('comment_id')->constrained('document_comments')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('type', 40);   // created, viewed, replied, status_changed, revision_submitted, approved, revision_requested, reopened, resolved
            $table->string('from_status', 30)->nullable();
            $table->string('to_status', 30)->nullable();
            $table->text('note')->nullable();
            $table->foreignId('document_id')->nullable()->constrained('documents')->nullOnDelete();
            $table->foreignId('attempt_id')->nullable()->constrained('document_comment_attempts')->nullOnDelete();
            $table->timestamp('created_at')->nullable();
            $table->index(['comment_id', 'created_at']);
        });

        // Notifications can point at one exact comment (deep link).
        Schema::table('notifications', function (Blueprint $table) {
            $table->unsignedBigInteger('comment_id')->nullable()->after('document_id');
        });
    }

    public function down(): void {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropColumn('comment_id');
        });
        Schema::dropIfExists('document_comment_events');
        Schema::dropIfExists('document_comment_attempts');
        Schema::dropIfExists('document_comment_replies');
        Schema::table('document_comments', function (Blueprint $table) {
            $table->dropIndex(['document_id', 'review_status']);
            $table->dropConstrainedForeignId('verified_on_behalf_of');
            $table->dropColumn(['review_status', 'lock_version']);
        });
    }
};
