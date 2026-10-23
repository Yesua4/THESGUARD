<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            // Cached SBERT embeddings (384-float arrays), computed once by
            // the similarity-service's /embed endpoint when title/abstract/
            // objectives is saved. Lets /check skip re-encoding this
            // project's text every time it's compared against as an
            // archived entry -- only the new submission being checked
            // still needs a live encode.
            $table->json('title_embedding')->nullable();
            $table->json('abstract_embedding')->nullable();
            $table->json('objectives_embedding')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn(['title_embedding', 'abstract_embedding', 'objectives_embedding']);
        });
    }
};
