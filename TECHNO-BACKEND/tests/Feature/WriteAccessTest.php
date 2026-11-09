<?php

namespace Tests\Feature;

use App\Models\AcademicTerm;
use App\Models\CapstoneStage;
use App\Models\ClassRosterEntry;
use App\Models\DefenseMinute;
use App\Models\DefenseSchedule;
use App\Models\Document;
use App\Models\DocumentComment;
use App\Models\Group;
use App\Models\GroupMember;
use App\Models\MinuteItem;
use App\Models\Notification;
use App\Models\PanelComment;
use App\Models\Project;
use App\Models\ProjectChecklistItem;
use App\Models\ProjectMember;
use App\Models\Room;
use App\Models\School;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Nobody can change things that aren't theirs: another school's anything,
// or (for advisers, panelists, students) another group's things. The admin
// and instructors do manage their whole school, by design.
class WriteAccessTest extends TestCase
{
    use RefreshDatabase;

    private static int $k = 0;

    private function world(string $tag, ?School $school = null): array
    {
        $school ??= School::create(['name' => "$tag School", 'slug' => strtolower($tag), 'email' => strtolower($tag) . '@s.com']);
        $u = [];
        foreach (['admin', 'instructor', 'adviser', 'panelist', 'student'] as $role) {
            $u[$role] = User::factory()->role($role)->school($school->id)->create(['name' => "$tag $role"]);
        }
        $group = Group::create(['group_name' => "$tag-G", 'school_id' => $school->id, 'adviser_id' => $u['adviser']->id, 'instructor_id' => $u['instructor']->id]);
        GroupMember::create(['group_id' => $group->id, 'user_id' => $u['student']->id, 'is_leader' => true]);
        $project = Project::create(['title' => "$tag-P", 'school_id' => $school->id, 'group_id' => $group->id, 'adviser_id' => $u['adviser']->id, 'instructor_id' => $u['instructor']->id, 'status' => 'for_defense', 'title_status' => 'approved']);
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $u['student']->id, 'is_leader' => true]);
        $doc = Document::create(['project_id' => $project->id, 'uploaded_by' => $u['student']->id, 'type' => 'chapter1', 'version' => 1, 'content' => '<p>x</p>', 'status' => 'pending']);
        $comment = DocumentComment::create(['document_id' => $doc->id, 'user_id' => $u['adviser']->id, 'page_number' => 1, 'comment' => 'fix', 'status' => 'open']);
        $schedule = DefenseSchedule::create(['group_id' => $group->id, 'project_id' => $project->id, 'adviser_id' => $u['adviser']->id, 'defense_type' => 'outline', 'defense_date' => '2026-12-01', 'defense_time' => '09:00', 'start_time' => '09:00', 'end_time' => '10:00']);
        $room = Room::create(['room_name' => "$tag-R", 'school_id' => $school->id]);
        $task = Task::create(['project_id' => $project->id, 'created_by' => $u['student']->id, 'title' => 'T']);
        $check = ProjectChecklistItem::create(['project_id' => $project->id, 'school_id' => $school->id, 'checklist_type' => 'pre_deployment', 'label' => 'L', 'responsible_role' => 'student', 'sort_order' => 1]);
        $minute = DefenseMinute::create(['project_id' => $project->id, 'school_id' => $school->id, 'defense_type' => 'outline', 'recorded_by' => $u['adviser']->id]);
        $item = MinuteItem::create(['defense_minute_id' => $minute->id, 'panelist_name' => 'X', 'comment' => 'c', 'status' => 'pending', 'created_by' => $u['adviser']->id]);
        $pc = PanelComment::create(['project_id' => $project->id, 'defense_schedule_id' => $schedule->id, 'user_id' => $u['adviser']->id, 'author_role' => 'adviser', 'comment' => 'pc']);
        $stage = CapstoneStage::create(['school_id' => $school->id, 'name' => "$tag Cap", 'year_level' => (self::$k++ % 4) + 1, 'term_no' => 2]);
        $term = AcademicTerm::create(['school_id' => $school->id, 'academic_year' => '2026-2027', 'name' => "$tag Sem", 'start_date' => '2026-08-01', 'end_date' => '2026-12-15']);
        $roster = ClassRosterEntry::create(['school_id' => $school->id, 'student_id' => "$tag-001", 'name' => 'R', 'section' => 'BSIT 4A', 'instructor_id' => $u['instructor']->id]);
        $notif = Notification::create(['user_id' => $u['student']->id, 'type' => 'x', 'title' => 't', 'message' => 'm']);
        return compact('school', 'u', 'group', 'project', 'doc', 'comment', 'schedule', 'room', 'task', 'check', 'minute', 'item', 'pc', 'stage', 'term', 'roster', 'notif');
    }

    private function attempts(array $t): array
    {
        $d = $t['doc']->id; $c = $t['comment']->id; $p = $t['project']->id; $g = $t['group']->id;
        return [
            ['PUT', "/api/capstone-stages/{$t['stage']->id}", ['name' => 'Hacked', 'year_level' => 4, 'term_no' => 3]],
            ['DELETE', "/api/capstone-stages/{$t['stage']->id}", []],
            ['PUT', "/api/checklist-items/{$t['check']->id}", ['is_done' => true]],
            ['DELETE', "/api/checklist-items/{$t['check']->id}", []],
            ['POST', '/api/contributions', ['project_id' => $p, 'action' => 'x', 'description' => 'hack']],
            ['POST', '/api/documents/save-draft', ['project_id' => $p, 'type' => 'chapter2', 'content' => '<p>hack</p>']],
            ['PUT', "/api/documents/$d", ['version_note' => 'hack']],
            ['DELETE', "/api/documents/$d", []],
            ['POST', "/api/documents/$d/comments", ['page_number' => 1, 'comment' => 'hack']],
            ['DELETE', "/api/documents/$d/comments/$c", []],
            ['PUT', "/api/documents/$d/comments/$c/resolve", []],
            ['POST', "/api/documents/$d/comments/$c/replies", ['body' => 'hack']],
            ['POST', "/api/documents/$d/comments/$c/verify", ['decision' => 'accept']],
            ['PUT', "/api/documents/$d/status", ['status' => 'approved']],
            ['POST', '/api/evaluations', ['project_id' => $p, 'presentation_score' => 90, 'technical_score' => 90, 'documentation_score' => 90, 'qa_score' => 90, 'recommendation' => 'passed']],
            ['PUT', "/api/groups/$g", ['group_name' => 'Hacked']],
            ['DELETE', "/api/groups/$g", []],
            ['PUT', "/api/groups/$g/panel", ['panel' => []]],
            ['PUT', "/api/groups/$g/recommendation", ['recommended_for' => 'final']],
            ['PUT', "/api/groups/$g/stage-instructors", ['assignments' => []]],
            ['PUT', "/api/minute-items/{$t['item']->id}", ['comment' => 'hack']],
            ['DELETE', "/api/minute-items/{$t['item']->id}", []],
            ['DELETE', "/api/minutes/{$t['minute']->id}", []],
            ['POST', "/api/minutes/{$t['minute']->id}/items", ['comment' => 'hack']],
            ['PUT', "/api/notifications/{$t['notif']->id}/read", []],
            ['PUT', "/api/panel-comments/{$t['pc']->id}", ['comment' => 'hack']],
            ['DELETE', "/api/panel-comments/{$t['pc']->id}", []],
            ['POST', "/api/projects/$p/choose-final", []],
            ['PUT', "/api/projects/$p/final-abstract", ['abstract' => 'hack']],
            ['POST', "/api/projects/$p/recheck-similarity", []],
            ['PUT', "/api/projects/$p", ['title' => 'Hacked']],
            ['DELETE', "/api/projects/$p", []],
            ['POST', "/api/projects/$p/checklists", ['label' => 'hack', 'checklist_type' => 'pre_deployment', 'responsible_role' => 'student']],
            ['POST', "/api/projects/$p/minutes", ['defense_type' => 'outline']],
            ['POST', "/api/projects/$p/panel-comments", ['defense_schedule_id' => $t['schedule']->id, 'comment' => 'hack']],
            ['PUT', "/api/rooms/{$t['room']->id}", ['room_name' => 'Hacked']],
            ['DELETE', "/api/rooms/{$t['room']->id}", []],
            ['DELETE', "/api/roster/{$t['roster']->id}", []],
            ['PUT', "/api/schedules/{$t['schedule']->id}", ['venue' => 'Hacked']],
            ['DELETE', "/api/schedules/{$t['schedule']->id}", []],
            ['POST', '/api/tasks', ['project_id' => $p, 'title' => 'hack']],
            ['PUT', "/api/tasks/{$t['task']->id}", ['title' => 'hack']],
            ['DELETE', "/api/tasks/{$t['task']->id}", []],
            ['PUT', "/api/terms/{$t['term']->id}", ['academic_year' => '2026-2027', 'name' => 'Hacked', 'start_date' => '2026-08-01', 'end_date' => '2026-12-15']],
            ['DELETE', "/api/terms/{$t['term']->id}", []],
            ['PUT', "/api/users/{$t['u']['student']->id}", ['name' => 'Hacked']],
            ['DELETE', "/api/users/{$t['u']['student']->id}", []],
            ['POST', '/api/schedules', ['group_id' => $g, 'defense_date' => '2026-12-09', 'start_time' => '13:00', 'end_time' => '14:00']],
            ['POST', '/api/groups', ['group_name' => 'X-' . uniqid(), 'member_ids' => [$t['u']['student']->id]]],
        ];
    }

    private function allowed(string $which, array $roles): array
    {
        $out = [];
        foreach ($roles as $role) {
            $n = ++self::$k;
            $a = $this->world("Alpha$n");
            $target = $which === 'other school' ? $this->world("Beta$n") : $this->world("Alpha{$n}x", $a['school']);
            foreach ($this->attempts($target) as [$m, $url, $body]) {
                Sanctum::actingAs($a['u'][$role]);
                $status = $this->json($m, $url, $body)->status();
                if ($status < 300 || $status >= 500) $out[] = "$role $m $url -> $status";
            }
        }
        return $out;
    }

    public function test_nobody_can_change_another_schools_things(): void
    {
        $this->assertSame([], $this->allowed('other school', ['admin', 'instructor', 'adviser', 'panelist', 'student']));
    }

    public function test_advisers_panelists_and_students_cannot_change_other_groups_things(): void
    {
        $this->assertSame([], $this->allowed('same school', ['adviser', 'panelist', 'student']));
    }
}
