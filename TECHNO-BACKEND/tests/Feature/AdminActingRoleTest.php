<?php

namespace Tests\Feature;

use App\Models\AcademicTerm;
use App\Models\Group;
use App\Models\Project;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// The admin can switch into any role's screens without being assigned it,
// and keeps full admin access while doing so.
class AdminActingRoleTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $this->admin = User::factory()->role('admin')->school($this->school->id)->create();
    }

    public function test_admin_can_switch_into_every_role(): void
    {
        Sanctum::actingAs($this->admin);

        $this->getJson('/api/me')->assertJsonPath('user.roles', User::ADMIN_ACTABLE_ROLES);

        foreach (['instructor', 'adviser', 'panelist'] as $role) {
            $this->postJson('/api/me/switch-role', ['role' => $role])->assertOk()
                ->assertJsonPath('user.role', 'admin')
                ->assertJsonPath('user.acting_role', $role);
        }

        $this->postJson('/api/me/switch-role', ['role' => 'admin'])->assertOk()->assertJsonPath('user.acting_role', null);
    }

    public function test_admin_cannot_switch_into_student(): void
    {
        Sanctum::actingAs($this->admin);
        $this->postJson('/api/me/switch-role', ['role' => 'student'])->assertStatus(403);
        $this->assertNull($this->admin->fresh()->acting_role);
    }

    public function test_admin_left_acting_as_student_is_reset_to_admin(): void
    {
        $this->admin->forceFill(['acting_role' => 'student'])->save();
        Sanctum::actingAs($this->admin);
        $this->getJson('/api/me')->assertOk()->assertJsonPath('user.acting_role', null);
    }

    public function test_admin_keeps_admin_access_while_acting_as_another_role(): void
    {
        $this->admin->forceFill(['acting_role' => 'instructor'])->save();
        $other = User::factory()->role('instructor')->school($this->school->id)->create();
        $group = Group::create(['group_name' => 'Someone else', 'section' => 'BSIT 4D', 'school_id' => $this->school->id, 'instructor_id' => $other->id]);
        Sanctum::actingAs($this->admin->fresh());

        // Admin-only: academic calendar.
        $this->postJson('/api/terms', ['academic_year' => '2026-2027', 'name' => '1st Semester', 'start_date' => '2026-06-01', 'end_date' => '2026-08-31'])
            ->assertStatus(201);
        // Admin-only: changing someone's roles.
        $this->putJson("/api/users/{$other->id}", ['roles' => ['instructor', 'panelist']])->assertOk();
        // Sees every group, not just "her" sections.
        $this->assertTrue(collect($this->getJson('/api/groups')->json())->pluck('id')->contains($group->id));
    }

    public function test_admin_acting_as_panelist_can_submit_an_evaluation(): void
    {
        $project = Project::create(['title' => 'P', 'school_id' => $this->school->id, 'status' => 'for_defense']);
        $this->admin->forceFill(['acting_role' => 'panelist'])->save();
        Sanctum::actingAs($this->admin->fresh());

        $this->postJson('/api/evaluations', [
            'project_id' => $project->id, 'presentation_score' => 90, 'technical_score' => 90,
            'documentation_score' => 90, 'qa_score' => 90, 'recommendation' => 'passed',
        ])->assertSuccessful();
    }

    public function test_plain_admin_still_cannot_submit_an_evaluation(): void
    {
        $project = Project::create(['title' => 'P', 'school_id' => $this->school->id, 'status' => 'for_defense']);
        Sanctum::actingAs($this->admin);

        $this->postJson('/api/evaluations', [
            'project_id' => $project->id, 'presentation_score' => 90, 'technical_score' => 90,
            'documentation_score' => 90, 'qa_score' => 90, 'recommendation' => 'passed',
        ])->assertStatus(403);
    }

    public function test_non_admins_still_only_switch_to_assigned_roles(): void
    {
        $instructor = User::factory()->role('instructor')->school($this->school->id)->create();
        Sanctum::actingAs($instructor);

        $this->postJson('/api/me/switch-role', ['role' => 'admin'])->assertStatus(403);
        $this->postJson('/api/me/switch-role', ['role' => 'panelist'])->assertStatus(403);
        $this->assertSame('instructor', $instructor->fresh()->role);
        $this->assertNull($instructor->fresh()->acting_role);
    }

    public function test_acting_role_cannot_be_set_through_the_user_edit_form(): void
    {
        $instructor = User::factory()->role('instructor')->school($this->school->id)->create();
        Sanctum::actingAs($this->admin);

        $this->putJson("/api/users/{$instructor->id}", ['acting_role' => 'admin', 'name' => 'X'])->assertOk();
        $this->assertNull($instructor->fresh()->acting_role);
    }

    public function test_demoted_admin_loses_acting_role(): void
    {
        $second = User::factory()->role('admin')->school($this->school->id)->create();
        $second->forceFill(['acting_role' => 'panelist'])->save();
        Sanctum::actingAs($this->admin);

        $this->putJson("/api/users/{$second->id}", ['roles' => ['instructor']])->assertOk();

        $fresh = $second->fresh();
        $this->assertSame('instructor', $fresh->role);
        $this->assertNull($fresh->acting_role);
    }
}
