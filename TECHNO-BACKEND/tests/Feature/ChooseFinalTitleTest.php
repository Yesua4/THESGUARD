<?php

namespace Tests\Feature;

use App\Models\Group;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChooseFinalTitleTest extends TestCase
{
    use RefreshDatabase;

    private function makeGroupWithTwoApprovedTitles(): array
    {
        $adviser = User::factory()->role('adviser')->create();
        $instructor = User::factory()->role('instructor')->create();
        $leader = User::factory()->role('student')->create();
        $member = User::factory()->role('student')->create();

        $group = Group::create([
            'group_name' => 'Group 1',
            'adviser_id' => $adviser->id,
            'instructor_id' => $instructor->id,
        ]);

        $chosen = Project::create([
            'title' => 'Title A', 'group_id' => $group->id,
            'adviser_id' => $adviser->id, 'instructor_id' => $instructor->id,
            'title_status' => 'approved', 'is_final_title' => false,
        ]);
        $sibling = Project::create([
            'title' => 'Title B', 'group_id' => $group->id,
            'adviser_id' => $adviser->id, 'instructor_id' => $instructor->id,
            'title_status' => 'approved', 'is_final_title' => false,
        ]);

        foreach ([$chosen, $sibling] as $project) {
            ProjectMember::create(['project_id' => $project->id, 'user_id' => $leader->id, 'is_leader' => true]);
            ProjectMember::create(['project_id' => $project->id, 'user_id' => $member->id, 'is_leader' => false]);
        }

        return compact('adviser', 'instructor', 'leader', 'member', 'group', 'chosen', 'sibling');
    }

    public function test_leader_choosing_a_title_finalizes_it_and_archives_the_sibling(): void
    {
        $data = $this->makeGroupWithTwoApprovedTitles();

        Sanctum::actingAs($data['leader']);
        $response = $this->postJson("/api/projects/{$data['chosen']->id}/choose-final");
        $response->assertStatus(200);

        $this->assertTrue($data['chosen']->fresh()->is_final_title);
        $siblingFresh = $data['sibling']->fresh();
        $this->assertFalse($siblingFresh->is_final_title);
        $this->assertEquals('archived', $siblingFresh->status);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $data['adviser']->id, 'type' => 'title_chosen', 'project_id' => $data['chosen']->id,
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $data['instructor']->id, 'type' => 'title_chosen', 'project_id' => $data['chosen']->id,
        ]);
    }

    public function test_non_leader_member_cannot_choose_final_title(): void
    {
        $data = $this->makeGroupWithTwoApprovedTitles();

        Sanctum::actingAs($data['member']);
        $this->postJson("/api/projects/{$data['chosen']->id}/choose-final")
            ->assertStatus(403);

        $this->assertFalse($data['chosen']->fresh()->is_final_title);
    }

    public function test_approving_the_only_title_for_a_group_auto_finalizes_it(): void
    {
        $adviser = User::factory()->role('adviser')->create();
        $group = Group::create(['group_name' => 'Solo Group', 'adviser_id' => $adviser->id]);
        $project = Project::create([
            'title' => 'Only Title', 'group_id' => $group->id,
            'title_status' => 'pending', 'is_final_title' => false,
        ]);

        Sanctum::actingAs($adviser);
        $this->putJson("/api/projects/{$project->id}", ['title_status' => 'approved'])
            ->assertStatus(200);

        $this->assertTrue($project->fresh()->is_final_title);
    }

    public function test_approving_a_second_title_for_a_group_does_not_auto_finalize_either(): void
    {
        $adviser = User::factory()->role('adviser')->create();
        $group = Group::create(['group_name' => 'Multi Group', 'adviser_id' => $adviser->id]);
        $first = Project::create([
            'title' => 'First', 'group_id' => $group->id,
            'title_status' => 'approved', 'is_final_title' => true,
        ]);
        $second = Project::create([
            'title' => 'Second', 'group_id' => $group->id,
            'title_status' => 'pending', 'is_final_title' => false,
        ]);

        Sanctum::actingAs($adviser);
        $this->putJson("/api/projects/{$second->id}", ['title_status' => 'approved'])
            ->assertStatus(200);

        $this->assertFalse($second->fresh()->is_final_title);
        $this->assertTrue($first->fresh()->is_final_title);
    }
}
