<?php
namespace App\Services;

use App\Events\ProjectActivity;
use Illuminate\Support\Facades\Log;
use Throwable;

// Best-effort live-update broadcaster for a project's activity feed --
// mirrors NotificationService's broadcast handling exactly (same
// ShouldBroadcastNow + try/catch reasoning: no guaranteed queue worker,
// and a broadcast failure must never break the actual request).
class ActivityBroadcastService {
    public function broadcast(int $projectId, string $type, array $payload = []): void {
        try {
            broadcast(new ProjectActivity($projectId, $type, $payload));
        } catch (Throwable $e) {
            Log::warning("Failed to broadcast project activity ({$type}) for project {$projectId}: {$e->getMessage()}");
        }
    }
}
