<?php
namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

// "Your own account changed" -- roles or handled sections edited by the
// admin, enrolled from a class list, active role switched on another
// device. Sent on the user's private channel; the frontend refetches /me.
class AccountChanged implements ShouldBroadcastNow {
    use Dispatchable;

    public function __construct(public int $userId, public string $reason) {}

    public function broadcastOn(): array {
        return [new PrivateChannel('App.Models.User.' . $this->userId)];
    }

    public function broadcastAs(): string {
        return 'account.changed';
    }

    public function broadcastWith(): array {
        return ['reason' => $this->reason];
    }
}
