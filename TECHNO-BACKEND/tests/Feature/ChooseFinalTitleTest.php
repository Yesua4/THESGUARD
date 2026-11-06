<?php

namespace Tests\Feature;

use App\Models\Group;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Approving titles means "approved for title defense". The FINAL title is
// set by faculty after the title defense -- never by students, never
// automatically.
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

    public function test_instructor_sets_the_final_title_and_the_others_are_archived(): void
    {
        $data = $this->makeGroupWithTwoApprovedTitles();

        Sanctum::actingAs($data['instructor']);
        $this->postJson("/api/projects/{$data['chosen']->id}/choose-final")->assertOk();

        $this->assertTrue($data['chosen']->fresh()->is_final_title);
        $sibling = $data['sibling']->fresh();
        $this->assertFalse($sibling->is_final_title);
        $this->assertSame('archived', $sibling->status);
        // The group and the adviser are told; the instructor who did it isn't.
        foreach (['leader', 'member', 'adviser'] as $who) {
            $this->assertDatabaseHas('notifications', ['user_id' => $data[$who]->id, 'type' => 'title_chosen']);
        }
        $this->assertDatabaseMissing('notifications', ['user_id' => $data['instructor']->id, 'type' => 'title_chosen']);
    }

    public function test_adviser_can_also_set_the_final_title(): void
    {
        $data = $this->makeGroupWithTwoApprovedTitles();
        Sanctum::actingAs($data['adviser']);
        $this->postJson("/api/projects/{$data['sibling']->id}/choose-final")->assertOk();
        $this->assertTrue($data['sibling']->fresh()->is_final_title);
    }

    public function test_students_cannot_set_the_final_title_not_even_the_leader(): void
    {
        $data = $this->makeGroupWithTwoApprovedTitles();

        foreach (['leader', 'member'] as $who) {
            Sanctum::actingAs($data[$who]);
            $this->postJson("/api/projects/{$data['chosen']->id}/choose-final")->assertStatus(403);
        }
        $this->assertFalse($data['chosen']->fresh()->is_final_title);
    }

    public function test_faculty_who_do_not_handle_the_group_cannot_set_it(): void
    {
        $data = $this->makeGroupWithTwoApprovedTitles();
        Sanctum::actingAs(User::factory()->role('adviser')->create());
        $this->postJson("/api/projects/{$data['chosen']->id}/choose-final")->assertStatus(403);
    }

    public function test_a_title_not_approved_for_defense_cannot_be_set_as_final(): void
    {
        $data = $this->makeGroupWithTwoApprovedTitles();
        $data['chosen']->update(['title_status' => 'pending']);
        Sanctum::actingAs($data['instructor']);
        $this->postJson("/api/projects/{$data['chosen']->id}/choose-final")->assertStatus(422);
    }

    public function test_approving_the_only_title_does_not_make_it_final(): void
    {
        $adviser = User::factory()->role('adviser')->create();
        $group = Group::create(['group_name' => 'Solo Group', 'adviser_id' => $adviser->id]);
        $project = Project::create([
            'title' => 'Only Title', 'group_id' => $group->id,
            'title_status' => 'pending', 'is_final_title' => false,
        ]);

        Sanctum::actingAs($adviser);
        $this->putJson("/api/projects/{$project->id}", ['title_status' => 'approved'])->assertOk();

        $this->assertFalse($project->fresh()->is_final_title, 'approved for title defense, not final');
    }
}
