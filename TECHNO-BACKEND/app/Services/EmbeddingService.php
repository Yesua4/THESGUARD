<?php
namespace App\Services;

use App\Models\Project;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class EmbeddingService {
    /**
     * Computes and caches SBERT embeddings for a project's title/abstract/
     * objectives via the similarity-service's /embed endpoint, so future
     * /check calls that compare against this project (as an archived
     * entry) don't need to re-encode its text. Best-effort: if the
     * similarity-service is unreachable, the project just keeps using the
     * live-encode fallback in /check -- this must never fail the caller's
     * request (same pattern as NotificationService/ActivityBroadcastService).
     */
    public function embedAndCache(Project $project): void {
        try {
            $response = Http::timeout(30)->post(config('services.similarity_url') . '/embed', [
                'title'      => $project->title ?? '',
                'abstract'   => $project->abstract ?? '',
                'objectives' => $project->objectives ?? '',
            ]);

            if ($response->successful()) {
                $data = $response->json();
                $project->forceFill([
                    'title_embedding'      => $data['title_embedding']      ?? null,
                    'abstract_embedding'   => $data['abstract_embedding']   ?? null,
                    'objectives_embedding' => $data['objectives_embedding'] ?? null,
                ])->save();
            }
        } catch (\Exception $e) {
            Log::warning('Embedding cache failed for project ' . $project->id . ': ' . $e->getMessage());
        }
    }
}
