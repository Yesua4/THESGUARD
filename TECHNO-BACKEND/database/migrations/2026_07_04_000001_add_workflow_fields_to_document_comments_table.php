<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('document_comments', function (Blueprint $table) {
            $table->timestamp('updated_at')->nullable()->after('created_at');
            $table->enum('status', ['open', 'resolved'])->default('open')->after('comment');
            $table->timestamp('resolved_at')->nullable()->after('status');
            $table->foreignId('resolved_by')->nullable()->after('resolved_at')->constrained('users')->nullOnDelete();
            $table->json('anchor')->nullable()->after('selected_text');
        });
    }

    public function down(): void {
        Schema::table('document_comments', function (Blueprint $table) {
            $table->dropForeign(['resolved_by']);
            $table->dropColumn(['updated_at', 'status', 'resolved_at', 'resolved_by', 'anchor']);
        });
    }
};
