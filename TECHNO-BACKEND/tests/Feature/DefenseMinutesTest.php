<?php

namespace Tests\Feature;

use App\Models\DefenseMinute;
use App\Models\MinuteItem;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DefenseMinutesTest extends TestCase
{
    use RefreshDatabase;

    private User $adviser;
    private User $student;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adviser = User::factory()->role('adviser')->create();
        $this->student = User::factory()->role('student')->create();
        $this->project = Project::create(['title' => 'ThesisGuard', 'title_status' => 'approved', 'adviser_id' => $this->adviser->id]);
        ProjectMember::create(['project_id' => $this->project->id, 'user_id' => $this->student->id, 'is_leader' => true]);
    }

    private function minuteWithItem(): MinuteItem
    {
        $minute = DefenseMinute::create(['project_id' => $this->project->id, 'defense_type' => 'outline', 'recorded_by' => $this->adviser->id]);
        return MinuteItem::create(['defense_minute_id' => $minute->id, 'panelist_name' => 'Panel Member', 'comment' => 'Revise the objectives.']);
    }

    public function test_adviser_records_minutes_and_panel_comment(): void
    {
        Sanctum::actingAs($this->adviser);

        $minuteId = $this->postJson("/api/projects/{$this->project->id}/minutes", [
            'defense_type' => 'outline', 'defense_date' => '2026-06-03',
        ])->assertStatus(201)->json('id');

        $this->postJson("/api/minutes/{$minuteId}/items", [
            'panelist_name' => 'Jerson M. Viagedor', 'panelist_role' => 'Panel Member', 'comment' => 'Revise the objectives.',
        ])->assertStatus(201)->assertJson(['status' => 'pending']);

        // The group gets told there is a new recommendation to act on.
        $this->assertDatabaseHas('notifications', ['user_id' => $this->student->id, 'type' => 'minutes_comment']);
    }

    public function test_student_cannot_record_minutes(): void
    {
        Sanctum::actingAs($this->student);
        $this->postJson("/api/projects/{$this->project->id}/minutes", ['defense_type' => 'outline'])->assertStatus(403);
    }

    public function test_student_records_action_taken_but_cannot_verify(): void
    {
        $item = $this->minuteWithItem();
        Sanctum::actingAs($this->student);

        $this->putJson("/api/minute-items/{$item->id}", [
            'action_taken' => 'Revised the general and specific objectives in Chapter 1.', 'status' => 'addressed',
        ])->assertStatus(200)->assertJson(['status' => 'addressed', 'addressed_by' => $this->student->id]);

        $this->putJson("/api/minute-items/{$item->id}", ['status' => 'verified'])->assertStatus(403);
        $this->putJson("/api/minute-items/{$item->id}", ['comment' => 'Changed'])->assertStatus(403);

        $this->assertDatabaseHas('contributions', ['user_id' => $this->student->id, 'action' => 'minutes_addressed']);
        $this->assertDatabaseHas('notifications', ['user_id' => $this->adviser->id, 'type' => 'minutes_addressed']);
    }

    public function test_adviser_verifies_action_taken(): void
    {
        $item = $this->minuteWithItem();
        $item->update(['status' => 'addressed', 'action_taken' => 'Done.']);

        Sanctum::actingAs($this->adviser);
        $this->putJson("/api/minute-items/{$item->id}", ['status' => 'verified'])
            ->assertStatus(200)
            ->assertJson(['status' => 'verified', 'verified_by' => $this->adviser->id]);
    }

    public function test_outsider_cannot_see_or_change_minutes(): void
    {
        $item     = $this->minuteWithItem();
        $outsider = User::factory()->role('student')->create();

        Sanctum::actingAs($outsider);
        $this->getJson("/api/projects/{$this->project->id}/minutes")->assertStatus(403);
        $this->putJson("/api/minute-items/{$item->id}", ['action_taken' => 'x'])->assertStatus(403);
    }

    public function test_member_can_list_minutes(): void
    {
        $this->minuteWithItem();
        Sanctum::actingAs($this->student);

        $this->getJson("/api/projects/{$this->project->id}/minutes")
            ->assertStatus(200)
            ->assertJsonPath('0.items.0.comment', 'Revise the objectives.');
    }
}
