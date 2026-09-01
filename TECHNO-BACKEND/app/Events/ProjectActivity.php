<?php
namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

// Single generic "something changed on this project" event, broadcast to
// everyone currently viewing it (Project.{id} -- see routes/channels.php
// for who's allowed to listen). $type tells the frontend what happened
// (comment_created, comment_resolved, comment_deleted, document_uploaded,
// document_status_changed, project_updated, evaluation_submitted) and
// $payload carries whatever that event needs to update the UI without a
// refetch. One event class instead of one per activity type, same way
// NotificationCreated covers every notification type.
class ProjectActivity implements ShouldBroadcastNow {
    use Dispatchable;

    public function __construct(
        public int $projectId,
        public string $type,
        public array $payload = []
    ) {}

    public function broadcastOn(): array {
        return [new PrivateChannel('Project.' . $this->projectId)];
    }

    public function broadcastAs(): string {
        return 'project.activity';
    }

    public function broadcastWith(): array {
        return [
            'project_id' => $this->projectId,
            'type'       => $this->type,
            'payload'    => $this->payload,
        ];
    }
}
