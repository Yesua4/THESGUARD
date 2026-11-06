<?php
namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

// "Something in this school changed" -- carries only WHICH kinds of data
// changed (e.g. ['groups', 'projects']), never the data itself. Every page
// listening for one of those kinds refetches through its own, already
// permission-checked API endpoint, so this can safely go to everyone in
// the school (School.{id}, see routes/channels.php).
//
// Fired once per request per school by LiveUpdateService, from model
// saved/deleted hooks registered in AppServiceProvider -- so every write
// path is covered, including ones added later.
class SchoolActivity implements ShouldBroadcastNow {
    use Dispatchable;

    public function __construct(public int $schoolId, public array $types) {}

    public function broadcastOn(): array {
        return [new PrivateChannel('School.' . $this->schoolId)];
    }

    public function broadcastAs(): string {
        return 'school.activity';
    }

    public function broadcastWith(): array {
        return ['types' => array_values($this->types)];
    }
}
