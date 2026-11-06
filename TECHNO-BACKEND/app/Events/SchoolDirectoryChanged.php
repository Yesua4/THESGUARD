<?php
namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

// "The school's accounts or class roster changed" -- user created, edited
// or deleted, class list imported, a student signed up and was enrolled.
// Sent to the school's staff channel (admins and instructors, see
// routes/channels.php) so User Accounts and Class Roster refresh live.
class SchoolDirectoryChanged implements ShouldBroadcastNow {
    use Dispatchable;

    public function __construct(public int $schoolId, public string $type) {}

    public function broadcastOn(): array {
        return [new PrivateChannel('School.' . $this->schoolId . '.staff')];
    }

    public function broadcastAs(): string {
        return 'directory.changed';
    }

    public function broadcastWith(): array {
        return ['type' => $this->type];
    }
}
