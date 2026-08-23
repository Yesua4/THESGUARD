<?php
namespace App\Services;

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
    public function send(int $userId, string $type, string $title, string $message, ?int $projectId = null, ?int $documentId = null): Notification {
        $notification = Notification::create([
            'user_id'     => $userId,
            'type'        => $type,
            'title'       => $title,
            'message'     => $message,
            'project_id'  => $projectId,
            'document_id' => $documentId,
            'is_read'     => false,
        ]);

        $this->emailUser($userId, $title, $message);

        return $notification;
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
