<?php
namespace App\Services;

use App\Events\AccountChanged;
use App\Events\SchoolActivity;
use App\Events\SchoolDirectoryChanged;
use App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Throwable;

// Best-effort live updates -- same rules as NotificationService and
// ActivityBroadcastService: broadcast immediately (no guaranteed queue
// worker) and never let a broadcast failure fail the request that caused it.
class LiveUpdateService {

    /**
     * Which kinds of data each model's rows feed. A save/delete of one of
     * these tells every page in that school showing those kinds to refetch.
     * The frontend uses the same names (src/hooks/useSchoolActivity.js).
     */
    public const MODEL_TYPES = [
        Models\Project::class              => ['projects'],
        Models\ProjectMember::class        => ['projects', 'groups'],
        Models\SimilarityResult::class     => ['projects'],
        Models\Group::class                => ['groups', 'projects'],
        Models\GroupMember::class          => ['groups', 'users'],
        Models\DefenseSchedule::class      => ['schedules'],
        Models\DefenseSchedulePanelist::class => ['schedules'],
        Models\GroupPanelist::class        => ['groups', 'schedules'],
        Models\Room::class                 => ['rooms'],
        Models\Document::class             => ['documents'],
        Models\DocumentComment::class      => ['documents', 'comments'],
        Models\DocumentCommentReply::class => ['comments'],
        Models\DocumentCommentAttempt::class => ['comments'],
        Models\DocumentCommentEvent::class => ['comments'],
        Models\Evaluation::class           => ['evaluations', 'projects'],
        Models\Task::class                 => ['tasks', 'contributions'],
        Models\Contribution::class         => ['contributions'],
        Models\DefenseMinute::class        => ['minutes'],
        Models\MinuteItem::class           => ['minutes'],
        Models\ProjectChecklistItem::class => ['checklists'],
        Models\User::class                 => ['users'],
        Models\UserRole::class             => ['users'],
        Models\InstructorSection::class    => ['users'],
        Models\ClassRosterEntry::class     => ['roster'],
        Models\AcademicTerm::class         => ['terms', 'groups'],
        Models\CapstoneStage::class        => ['terms', 'groups'],
    ];

    /** @var array<int, array<string, true>> school id => set of types */
    private array $pending = [];
    private bool $flushScheduled = false;

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

    // Called from the model hooks: remember what changed; one combined
    // SchoolActivity per school goes out when the request finishes (so a
    // 38-student import is one broadcast, not 38+).
    public function modelChanged(Model $model): void {
        $types = self::MODEL_TYPES[get_class($model)] ?? null;
        if (!$types) return;

        try {
            $schoolId = $this->schoolIdFor($model) ?? auth()->user()?->school_id;
        } catch (Throwable $e) {
            return; // never let live updates break a write
        }
        if (!$schoolId) return;

        foreach ($types as $type) {
            $this->pending[(int) $schoolId][$type] = true;
        }
        if (!$this->flushScheduled) {
            $this->flushScheduled = true;
            app()->terminating(fn () => $this->flush());
        }
    }

    public function flush(): void {
        $pending = $this->pending;
        $this->pending = [];
        $this->flushScheduled = false;

        foreach ($pending as $schoolId => $types) {
            try {
                broadcast(new SchoolActivity($schoolId, array_keys($types)));
            } catch (Throwable $e) {
                Log::warning("Failed to broadcast school activity for school {$schoolId}: {$e->getMessage()}");
            }
        }
    }

    // Finds the school a row belongs to from whatever link it has.
    private function schoolIdFor(Model $model): ?int {
        $a = fn (string $key) => $model->getAttributes()[$key] ?? null;

        if ($id = $a('school_id')) return (int) $id;
        if ($id = $a('project_id')) return Models\Project::whereKey($id)->value('school_id');
        if ($id = $a('group_id')) return Models\Group::whereKey($id)->value('school_id');
        if ($id = $a('document_id')) {
            return Models\Project::whereKey(Models\Document::whereKey($id)->value('project_id'))->value('school_id');
        }
        if ($id = $a('comment_id')) {
            $docId = Models\DocumentComment::whereKey($id)->value('document_id');
            return Models\Project::whereKey(Models\Document::whereKey($docId)->value('project_id'))->value('school_id');
        }
        if ($id = $a('defense_minute_id')) return Models\DefenseMinute::whereKey($id)->value('school_id');
        if ($id = $a('user_id')) return Models\User::whereKey($id)->value('school_id');
        return null;
    }
}
