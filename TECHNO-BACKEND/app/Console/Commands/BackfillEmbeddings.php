<?php

namespace App\Console\Commands;

use App\Models\Project;
use App\Services\EmbeddingService;
use Illuminate\Console\Command;

class BackfillEmbeddings extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:backfill-embeddings';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Compute and cache SBERT embeddings for every project missing them (one-time, run after the embedding-cache migration)';

    public function handle(EmbeddingService $embedder)
    {
        $projects = Project::whereNull('title_embedding')
            ->whereNotNull('title')
            ->get();

        $total = $projects->count();
        $this->info("Backfilling embeddings for {$total} project(s)...");
        $bar = $this->output->createProgressBar($total);

        $failed = 0;
        foreach ($projects as $project) {
            $embedder->embedAndCache($project);
            if (!$project->fresh()->title_embedding) {
                $failed++;
            }
            $bar->advance();
        }
        $bar->finish();
        $this->newLine();

        $this->info("Done. " . ($total - $failed) . " succeeded, {$failed} failed (see logs).");
    }
}
