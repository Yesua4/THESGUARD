<?php

namespace Tests\Feature;

use App\Models\DefenseSchedule;
use App\Models\DefenseSchedulePanelist;
use App\Models\Group;
use App\Models\GroupMember;
use App\Models\MinuteItem;
use App\Models\PanelComment;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Defense minutes: kept by the group's adviser, linked to a defense, with
// role -> name auto-fill and "fill from panel comments".
class MinutesFromDefenseTest extends TestCase
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
        $this->adviser = User::factory()->role('adviser')->school($school->id)->create(['name' => 'Rogelio Adviser']);
        $this->student = User::factory()->role('student')->school($school->id)->create();
        $this->chair = User::factory()->role('panelist')->school($school->id)->create(['name' => 'Analyn Casipe']);
        $group = Group::create(['group_name' => 'G1', 'school_id' => $school->id, 'adviser_id' => $this->adviser->id]);
        GroupMember::create(['group_id' => $group->id, 'user_id' => $this->student->id]);
        $this->project = Project::create(['title' => 'P', 'school_id' => $school->id, 'group_id' => $group->id, 'adviser_id' => $this->adviser->id, 'status' => 'for_defense']);
        ProjectMember::create(['project_id' => $this->project->id, 'user_id' => $this->student->id]);
        $this->schedule = DefenseSchedule::create(['group_id' => $group->id, 'adviser_id' => $this->adviser->id, 'defense_type' => 'outline', 'defense_date' => '2026-06-03', 'defense_time' => '09:00']);
        DefenseSchedulePanelist::create(['defense_schedule_id' => $this->schedule->id, 'user_id' => $this->chair->id, 'role' => 'chair']);
    }

    private function createMinutes(User $u)
    {
        Sanctum::actingAs($u);
        return $this->postJson("/api/projects/{$this->project->id}/minutes", ['defense_schedule_id' => $this->schedule->id]);
    }

    public function test_adviser_creates_minutes_from_the_defense(): void
    {
        $res = $this->createMinutes($this->adviser)->assertStatus(201);
        $this->assertSame('outline', $res->json('defense_type'));
        $this->assertSame($this->schedule->id, (int) $res->json('defense_schedule_id'));
    }

    public function test_panelists_instructors_and_students_cannot_create_minutes(): void
    {
        $this->createMinutes($this->chair)->assertStatus(403);
        $this->createMinutes($this->student)->assertStatus(403);
        $other = User::factory()->role('adviser')->school($this->project->school_id)->create();
        $this->createMinutes($other)->assertStatus(403);
    }

    public function test_choosing_a_role_fills_in_the_name(): void
    {
        $minuteId = $this->createMinutes($this->adviser)->json('id');
        $this->postJson("/api/minutes/{$minuteId}/items", ['panel_role' => 'chair', 'comment' => 'Add a review of related systems.'])
            ->assertStatus(201)->assertJsonPath('panelist_name', 'Analyn Casipe')->assertJsonPath('panelist_role', 'Panel Chair');
        $this->postJson("/api/minutes/{$minuteId}/items", ['panel_role' => 'adviser', 'comment' => 'Fix the diagram.'])
            ->assertStatus(201)->assertJsonPath('panelist_name', 'Rogelio Adviser');
    }

    public function test_panelist_cannot_add_items_to_the_minutes(): void
    {
        $minuteId = $this->createMinutes($this->adviser)->json('id');
        Sanctum::actingAs($this->chair);
        $this->postJson("/api/minutes/{$minuteId}/items", ['comment' => 'x'])->assertStatus(403);
    }

    public function test_fill_from_panel_comments_without_duplicates(): void
    {
        PanelComment::create(['project_id' => $this->project->id, 'defense_schedule_id' => $this->schedule->id, 'user_id' => $this->chair->id, 'author_role' => 'chair', 'page_no' => '12', 'comment' => 'Present similar projects.']);
        $minuteId = $this->createMinutes($this->adviser)->json('id');

        $this->postJson("/api/minutes/{$minuteId}/import-panel-comments")->assertOk()->assertJsonPath('imported', 1);
        $this->postJson("/api/minutes/{$minuteId}/import-panel-comments")->assertOk()->assertJsonPath('imported', 0);

        $item = MinuteItem::where('defense_minute_id', $minuteId)->sole();
        $this->assertSame('Analyn Casipe', $item->panelist_name);
        $this->assertSame('Panel Chair', $item->panelist_role);
        $this->assertSame('12', $item->page_no);
    }

    public function test_only_the_adviser_can_fill_from_panel_comments(): void
    {
        $minuteId = $this->createMinutes($this->adviser)->json('id');
        Sanctum::actingAs($this->student);
        $this->postJson("/api/minutes/{$minuteId}/import-panel-comments")->assertStatus(403);
    }
}
