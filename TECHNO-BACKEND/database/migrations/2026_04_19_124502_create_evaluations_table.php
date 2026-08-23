<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('evaluations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->foreignId('panelist_id')->constrained('users')->onDelete('cascade');
            $table->float('presentation_score')->nullable();
            $table->float('technical_score')->nullable();
            $table->float('documentation_score')->nullable();
            $table->float('qa_score')->nullable();
            $table->float('overall_score')->nullable();
            $table->string('recommendation')->default('revision');
            $table->text('remarks')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('evaluations');
    }
};
