<?php
namespace App\Services;

use App\Events\NotificationCreated;
use App\Mail\NotificationMail;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

// Central place to raise a notification: always records the in-app row, and
// best-effort emails the user too (in-app-only reaches nobody who isn't
// already logged in). Mail is sent synchronously rather than queued, since
// there's no guarantee a queue worker is running in a school deployment —
// a failed send is logged and swallowed so it never breaks the request.
class NotificationService {
    public function send(int $userId, string $type, string $title, string $message, ?int $projectId = null, ?int $documentId = null, ?int $commentId = null): Notification {
        // No emojis in titles/messages: they look different on every phone.
        $title = self::stripEmoji($title);
        $message = self::stripEmoji($message);
        $notification = Notification::create([
            'user_id'     => $userId,
            'type'        => $type,
            'title'       => $title,
            'message'     => $message,
            'project_id'  => $projectId,
            'document_id' => $documentId,
            'comment_id'  => $commentId,
            'is_read'     => false,
        ]);

        $this->emailUser($userId, $title, $message);

        try {
            broadcast(new NotificationCreated($notification));
        } catch (Throwable $e) {
            Log::warning("Failed to broadcast notification to user {$userId}: {$e->getMessage()}");
        }

        return $notification;
    }

    public static function stripEmoji(string $text): string {
        $clean = preg_replace('/[\x{1F000}-\x{1FAFF}\x{2600}-\x{2712}\x{2714}\x{2716}-\x{27BF}\x{23F0}-\x{23FF}\x{2B50}\x{2B07}\x{FE0F}\x{200D}]/u', '', $text);
        return trim(preg_replace('/\s{2,}/', ' ', $clean ?? $text));
    }

    private function emailUser(int $userId, string $title, string $message): void {
        try {
            $user = User::find($userId);
            if (!$user || !$user->email) return;
            Mail::to($user->email)->send(new NotificationMail($title, $message));
        } catch (Throwable $e) {
            Log::warning("Failed to email notification to user {$userId}: {$e->getMessage()}");
        }
    }
}
