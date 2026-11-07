<?php

namespace Tests\Feature;

use App\Models\Group;
use App\Models\GroupMember;
use App\Models\Notification;
use App\Models\Project;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// "Recommended for: <defense>" comes before a group is approved for it.
class GroupRecommendationTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private User $adviser;
    private User $student;
    private Group $group;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $this->adviser = User::factory()->role('adviser')->school($this->school->id)->create(['name' => 'Ma. Adviser']);
        $this->student = User::factory()->role('student')->school($this->school->id)->create();
        $this->group = Group::create(['group_name' => 'Group 1', 'school_id' => $this->school->id, 'adviser_id' => $this->adviser->id]);
        GroupMember::create(['group_id' => $this->group->id, 'user_id' => $this->student->id, 'is_leader' => 1]);
    }

    public function test_adviser_recommends_the_group_and_students_are_notified(): void
    {
        Sanctum::actingAs($this->adviser);
        $this->putJson("/api/groups/{$this->group->id}/recommendation", ['recommended_for' => 'outline'])
            ->assertOk()->assertJsonPath('recommended_for', 'outline')->assertJsonPath('recommender.name', 'Ma. Adviser');

        $n = Notification::where('user_id', $this->student->id)->latest('id')->first();
        $this->assertStringContainsString('recommended for the Outline Defense', $n->message);
    }

    public function test_recommendation_can_be_cleared(): void
    {
        Sanctum::actingAs($this->adviser);
        $this->putJson("/api/groups/{$this->group->id}/recommendation", ['recommended_for' => 'title'])->assertOk();
        $this->putJson("/api/groups/{$this->group->id}/recommendation", ['recommended_for' => null])
            ->assertOk()->assertJsonPath('recommended_for', null)->assertJsonPath('recommended_by', null);
    }

    public function test_other_advisers_and_students_cannot_recommend(): void
    {
        Sanctum::actingAs(User::factory()->role('adviser')->school($this->school->id)->create());
        $this->putJson("/api/groups/{$this->group->id}/recommendation", ['recommended_for' => 'title'])->assertStatus(403);

        Sanctum::actingAs($this->student);
        $this->putJson("/api/groups/{$this->group->id}/recommendation", ['recommended_for' => 'title'])->assertStatus(403);
        $this->assertNull($this->group->fresh()->recommended_for);
    }

    public function test_instructor_and_admin_can_recommend(): void
    {
        Sanctum::actingAs(User::factory()->role('instructor')->school($this->school->id)->create());
        $this->putJson("/api/groups/{$this->group->id}/recommendation", ['recommended_for' => 'final'])->assertOk();

        Sanctum::actingAs(User::factory()->role('admin')->school($this->school->id)->create());
        $this->putJson("/api/groups/{$this->group->id}/recommendation", ['recommended_for' => 'pre_deployment'])->assertOk();
    }

    public function test_recommendation_shows_in_all_projects(): void
    {
        Project::create(['title' => 'P', 'school_id' => $this->school->id, 'group_id' => $this->group->id, 'status' => 'ongoing']);
        $this->group->update(['recommended_for' => 'outline', 'recommended_by' => $this->adviser->id]);
        Sanctum::actingAs($this->adviser);

        $this->getJson('/api/projects')->assertOk()->assertJsonPath('0.group.recommended_for', 'outline');
    }

    public function test_scheduling_a_defense_without_a_recommendation_warns_but_does_not_block(): void
    {
        $instructor = User::factory()->role('instructor')->school($this->school->id)->create();
        Sanctum::actingAs($instructor);
        $payload = ['group_id' => $this->group->id, 'defense_type' => 'outline', 'defense_date' => '2026-08-01', 'start_time' => '09:00', 'end_time' => '10:00'];

        $warnings = $this->postJson('/api/schedules/check', $payload)->assertOk()->json('warnings');
        $this->assertStringContainsString("hasn't been recommended for the Outline Defense", implode(' ', $warnings));
        $this->postJson('/api/schedules', $payload)->assertStatus(201);

        $this->group->update(['recommended_for' => 'outline']);
        $this->assertSame([], $this->postJson('/api/schedules/check', array_merge($payload, ['defense_date' => '2026-08-02']))->json('warnings'));
    }
}
