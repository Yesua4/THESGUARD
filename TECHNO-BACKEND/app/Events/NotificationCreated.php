<?php
namespace App\Events;

use App\Models\Notification;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

// Broadcasts the instant a notification is created, so every connected
// client for that user updates live instead of waiting on the 30-second
// poll. Uses ShouldBroadcastNow (not ShouldBroadcast) for the same reason
// NotificationService sends mail synchronously: QUEUE_CONNECTION=database
// has no guarantee a queue worker is actually running in a school
// deployment, and a queued broadcast that never gets picked up would just
// silently never arrive.
class NotificationCreated implements ShouldBroadcastNow {
    use Dispatchable;

    public function __construct(public Notification $notification) {}

    public function broadcastOn(): array {
        return [new PrivateChannel('App.Models.User.' . $this->notification->user_id)];
    }

    public function broadcastAs(): string {
        return 'notification.created';
    }

    public function broadcastWith(): array {
        return [
            'id'         => $this->notification->id,
            'type'       => $this->notification->type,
            'title'      => $this->notification->title,
            'message'    => $this->notification->message,
            'project_id' => $this->notification->project_id,
            'document_id'=> $this->notification->document_id,
            'is_read'    => $this->notification->is_read,
            'created_at' => $this->notification->created_at->toIso8601String(),
        ];
    }
}
