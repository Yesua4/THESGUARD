<?php
namespace App\Services;

use App\Events\AccountChanged;
use App\Events\SchoolDirectoryChanged;
use Illuminate\Support\Facades\Log;
use Throwable;

// Best-effort live updates for account/directory changes -- same rules as
// NotificationService and ActivityBroadcastService: broadcast immediately
// (no guaranteed queue worker) and never let a broadcast failure fail the
// request that caused it.
class LiveUpdateService {
    public function account(?int $userId, string $reason): void {
        if (!$userId) return;
        try {
            broadcast(new AccountChanged($userId, $reason));
        } catch (Throwable $e) {
            Log::warning("Failed to broadcast account change ({$reason}) for user {$userId}: {$e->getMessage()}");
        }
    }

    public function directory(?int $schoolId, string $type): void {
        if (!$schoolId) return;
        try {
            broadcast(new SchoolDirectoryChanged($schoolId, $type));
        } catch (Throwable $e) {
            Log::warning("Failed to broadcast directory change ({$type}) for school {$schoolId}: {$e->getMessage()}");
        }
    }
}
