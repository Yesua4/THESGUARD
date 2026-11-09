<?php

namespace Tests\Feature;

use App\Models\DefenseSchedule;
use App\Models\Document;
use App\Models\Group;
use App\Models\GroupMember;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\Room;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Who-can-see-what audit: two schools; every role in school A opens every
// list. Nothing from school B may show up, and staff-only lists are closed
// to students.
class RoleVisibilityAuditTest extends TestCase
{
    use RefreshDatabase;

    private array $a = [];
    private array $b = [];

    private function makeSchool(string $tag): array
    {
        $school = School::create(['name' => "$tag School", 'slug' => strtolower($tag), 'email' => strtolower($tag) . '@s.com']);
        $u = [];
        foreach (['admin', 'instructor', 'adviser', 'panelist', 'student'] as $role) {
            $u[$role] = User::factory()->role($role)->school($school->id)->create(['name' => "$tag $role person"]);
        }
        $group = Group::create(['group_name' => "$tag-GROUP", 'school_id' => $school->id, 'adviser_id' => $u['adviser']->id, 'instructor_id' => $u['instructor']->id]);
        GroupMember::create(['group_id' => $group->id, 'user_id' => $u['student']->id, 'is_leader' => true]);
        $project = Project::create(['title' => "$tag-SECRET-TITLE", 'school_id' => $school->id, 'group_id' => $group->id, 'adviser_id' => $u['adviser']->id, 'instructor_id' => $u['instructor']->id, 'status' => 'for_defense', 'title_status' => 'approved']);
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $u['student']->id, 'is_leader' => true]);
        $doc = Document::create(['project_id' => $project->id, 'uploaded_by' => $u['student']->id, 'type' => 'chapter1', 'version' => 1, 'content' => "<p>$tag-DOC</p>", 'status' => 'pending']);
        $schedule = DefenseSchedule::create(['group_id' => $group->id, 'project_id' => $project->id, 'adviser_id' => $u['adviser']->id, 'defense_type' => 'outline', 'defense_date' => '2026-12-01', 'defense_time' => '09:00', 'start_time' => '09:00', 'end_time' => '10:00', 'venue' => "$tag-ROOM"]);
        $room = Room::create(['room_name' => "$tag-ROOM", 'building' => 'Main'] + (\Schema::hasColumn('rooms', 'school_id') ? ['school_id' => $school->id] : []));
        return compact('school', 'u', 'group', 'project', 'doc', 'schedule', 'room');
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->a = $this->makeSchool('Alpha');
        $this->b = $this->makeSchool('Beta');
    }

    private const LISTS = [
        '/api/advisers', '/api/archive', '/api/capstone-stages', '/api/comment-review', '/api/contributions',
        '/api/documents', '/api/evaluations', '/api/groups', '/api/projects', '/api/reports/contributions',
        '/api/reports/document-revisions', '/api/reports/projects', '/api/reports/schedules', '/api/reports/similarity',
        '/api/rooms', '/api/roster', '/api/schedules', '/api/students', '/api/terms', '/api/users', '/api/notifications',
    ];

    private function bUrls(): array
    {
        $b = $this->b;
        return [
            "/api/projects/{$b['project']->id}", "/api/groups/{$b['group']->id}", "/api/documents/{$b['doc']->id}",
            "/api/schedules/{$b['schedule']->id}", "/api/rooms/{$b['room']->id}", "/api/projects/{$b['project']->id}/minutes",
            "/api/projects/{$b['project']->id}/panel-comments", "/api/projects/{$b['project']->id}/checklists",
            "/api/projects/{$b['project']->id}/tasks", "/api/projects/{$b['project']->id}/similarity",
            "/api/evaluations/project/{$b['project']->id}", "/api/contributions/{$b['project']->id}",
            "/api/documents/{$b['doc']->id}/comments",
        ];
    }

    public function test_no_role_sees_another_schools_data(): void
    {
        \App\Models\Contribution::create(['project_id' => $this->b['project']->id, 'user_id' => $this->b['u']['student']->id, 'action' => 'upload', 'description' => 'Beta upload']);
        foreach (['admin', 'instructor', 'adviser', 'panelist', 'student'] as $role) {
            Sanctum::actingAs($this->a['u'][$role]);
            foreach (self::LISTS as $url) {
                $res = $this->getJson($url);
                $this->assertStringNotContainsString('Beta', $res->getContent(), "$role sees the other school's data in $url");
            }
            foreach ($this->bUrls() as $url) {
                $status = $this->getJson($url)->status();
                $this->assertContains($status, [403, 404], "$role can open the other school's $url (got $status)");
            }
        }
    }

    public function test_staff_lists_are_closed_to_other_roles(): void
    {
        foreach (['adviser', 'panelist', 'student'] as $role) {
            Sanctum::actingAs($this->a['u'][$role]);
            foreach (['/api/users', '/api/students', '/api/advisers', '/api/roster'] as $url) {
                $this->getJson($url)->assertStatus(403);
            }
        }
        foreach (['admin', 'instructor'] as $role) {
            Sanctum::actingAs($this->a['u'][$role]);
            foreach (['/api/users', '/api/students', '/api/advisers'] as $url) {
                $this->getJson($url)->assertOk();
            }
        }
    }

    public function test_only_admin_and_instructor_manage_rooms(): void
    {
        foreach (['adviser', 'panelist', 'student'] as $role) {
            Sanctum::actingAs($this->a['u'][$role]);
            $this->postJson('/api/rooms', ['room_name' => 'X'])->assertStatus(403);
            $this->deleteJson("/api/rooms/{$this->a['room']->id}")->assertStatus(403);
            $this->getJson('/api/rooms')->assertOk()->assertJsonFragment(['room_name' => 'Alpha-ROOM']);
        }
        Sanctum::actingAs($this->a['u']['instructor']);
        $this->postJson('/api/rooms', ['room_name' => 'Comlab 9'])->assertStatus(201)->assertJsonPath('school_id', $this->a['school']->id);
    }

    public function test_within_a_school_people_only_see_their_own_groups(): void
    {
        $sid = $this->a['school']->id;
        $s2 = User::factory()->role('student')->school($sid)->create(['name' => 'Other student']);
        $adv2 = User::factory()->role('adviser')->school($sid)->create(['name' => 'Other adviser']);
        $g2 = Group::create(['group_name' => 'OTHERGROUP', 'school_id' => $sid, 'adviser_id' => $adv2->id]);
        GroupMember::create(['group_id' => $g2->id, 'user_id' => $s2->id]);
        $p2 = Project::create(['title' => 'OTHERTITLE', 'school_id' => $sid, 'group_id' => $g2->id, 'adviser_id' => $adv2->id, 'status' => 'for_defense', 'title_status' => 'approved']);
        ProjectMember::create(['project_id' => $p2->id, 'user_id' => $s2->id]);
        Document::create(['project_id' => $p2->id, 'uploaded_by' => $s2->id, 'type' => 'chapter1', 'version' => 1, 'content' => '<p>OTHERDOC</p>', 'status' => 'pending']);
        \App\Models\Contribution::create(['project_id' => $p2->id, 'user_id' => $s2->id, 'action' => 'upload', 'description' => 'OTHERCONTRIB']);
        \App\Models\DefenseSchedulePanelist::create(['defense_schedule_id' => $this->a['schedule']->id, 'user_id' => $this->a['u']['panelist']->id, 'role' => 'chair']);
        DefenseSchedule::create(['group_id' => $g2->id, 'project_id' => $p2->id, 'adviser_id' => $adv2->id, 'defense_type' => 'outline', 'defense_date' => '2026-12-02', 'defense_time' => '09:00', 'venue' => 'OTHERVENUE']);

        foreach (['adviser', 'panelist', 'student'] as $role) {
            Sanctum::actingAs($this->a['u'][$role]);
            foreach (self::LISTS as $url) {
                $res = $this->getJson($url);
                if ($res->status() >= 400) continue;
                $this->assertDoesNotMatchRegularExpression('/OTHER(GROUP|TITLE|DOC|CONTRIB|VENUE)|Other student/', $res->getContent(), "$role sees another group's data in $url");
            }
            // ...but still sees their own.
            $this->getJson('/api/projects')->assertOk()->assertJsonFragment(['title' => 'Alpha-SECRET-TITLE']);
        }
    }
}
