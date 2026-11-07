<?php

namespace Tests\Feature;

use App\Models\DefenseSchedule;
use App\Models\DefenseSchedulePanelist;
use App\Models\Group;
use App\Models\GroupMember;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Panel comments & recommendations: written by the defense's panelists (and
// the group's adviser), read by the students and the adviser.
class PanelCommentTest extends TestCase
{
    use RefreshDatabase;

    private Project $project;
    private User $adviser;
    private User $student;
    private User $chair;
    private DefenseSchedule $schedule;

    protected function setUp(): void
    {
        parent::setUp();
        $school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $this->adviser = User::factory()->role('adviser')->school($school->id)->create();
        $this->student = User::factory()->role('student')->school($school->id)->create();
        $this->chair = User::factory()->role('panelist')->school($school->id)->create(['name' => 'Analyn Casipe']);
        $group = Group::create(['group_name' => 'G1', 'school_id' => $school->id, 'adviser_id' => $this->adviser->id]);
        GroupMember::create(['group_id' => $group->id, 'user_id' => $this->student->id]);
        $this->project = Project::create(['title' => 'P', 'school_id' => $school->id, 'group_id' => $group->id, 'adviser_id' => $this->adviser->id, 'status' => 'for_defense']);
        ProjectMember::create(['project_id' => $this->project->id, 'user_id' => $this->student->id]);
        $this->schedule = DefenseSchedule::create(['group_id' => $group->id, 'adviser_id' => $this->adviser->id, 'defense_type' => 'outline', 'defense_date' => '2026-06-03', 'defense_time' => '09:00']);
        DefenseSchedulePanelist::create(['defense_schedule_id' => $this->schedule->id, 'user_id' => $this->chair->id, 'role' => 'chair']);
    }

    private function add(User $u, string $text)
    {
        Sanctum::actingAs($u);
        return $this->postJson("/api/projects/{$this->project->id}/panel-comments", ['defense_schedule_id' => $this->schedule->id, 'page_no' => '12', 'comment' => $text]);
    }

    public function test_panelist_writes_with_their_panel_role(): void
    {
        $this->add($this->chair, 'Present similar existing projects.')->assertStatus(201)->assertJsonPath('author_role', 'chair');
    }

    public function test_adviser_can_add_what_the_panel_missed(): void
    {
        $this->add($this->adviser, 'Also fix the chapter 3 diagram.')->assertStatus(201)->assertJsonPath('author_role', 'adviser');
    }

    public function test_students_and_outsiders_cannot_write(): void
    {
        $this->add($this->student, 'x')->assertStatus(403);
        $this->add(User::factory()->role('panelist')->create(), 'x')->assertStatus(403);
    }

    public function test_students_and_adviser_can_read_them_ordered_by_role(): void
    {
        $this->add($this->adviser, 'Adviser note')->assertStatus(201);
        $this->add($this->chair, 'Chair note')->assertStatus(201);

        Sanctum::actingAs($this->student);
        $res = $this->getJson("/api/projects/{$this->project->id}/panel-comments")->assertOk();
        $this->assertSame(['Chair note', 'Adviser note'], array_column($res->json('comments'), 'comment'));
        $this->assertNull($res->json('defenses.0.my_role'));
    }

    public function test_outsiders_cannot_read(): void
    {
        Sanctum::actingAs(User::factory()->role('student')->create());
        $this->getJson("/api/projects/{$this->project->id}/panel-comments")->assertStatus(403);
    }

    public function test_only_the_author_edits_or_deletes(): void
    {
        $id = $this->add($this->chair, 'Original')->json('id');
        Sanctum::actingAs($this->adviser);
        $this->putJson("/api/panel-comments/{$id}", ['comment' => 'Hacked'])->assertStatus(403);
        $this->deleteJson("/api/panel-comments/{$id}")->assertStatus(403);
        Sanctum::actingAs($this->chair);
        $this->putJson("/api/panel-comments/{$id}", ['comment' => 'Edited'])->assertOk()->assertJsonPath('comment', 'Edited');
    }
}
