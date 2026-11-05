<?php

namespace Tests\Feature;

use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// A faculty member can hold several roles (e.g. instructor + adviser +
// panelist). users.role is the ACTIVE role; user_roles holds the assigned
// ones. These tests cover assigning roles (admin only), switching between
// them (assigned roles only), and pickers finding people by assigned role.
class MultiRoleTest extends TestCase
{
    use RefreshDatabase;

    private School $school;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
    }

    private function faculty(array $roles): User
    {
        $user = User::factory()->role($roles[0])->school($this->school->id)->create();
        $user->syncRoles($roles);
        return $user->fresh();
    }

    public function test_admin_can_create_a_user_with_multiple_roles(): void
    {
        $admin = User::factory()->role('admin')->school($this->school->id)->create();
        Sanctum::actingAs($admin);

        $res = $this->postJson('/api/users', [
            'name' => 'Rogelio Magsangkay',
            'email' => 'rogelio@example.com',
            'password' => 'a-long-password-123',
            'roles' => ['instructor', 'adviser', 'panelist'],
        ])->assertStatus(201);

        $this->assertEqualsCanonicalizing(['instructor', 'adviser', 'panelist'], $res->json('roles'));
        $this->assertSame('instructor', $res->json('role'));
    }

    public function test_admin_can_edit_a_users_roles(): void
    {
        $admin = User::factory()->role('admin')->school($this->school->id)->create();
        $rogelio = $this->faculty(['panelist']);
        Sanctum::actingAs($admin);

        $res = $this->putJson("/api/users/{$rogelio->id}", ['roles' => ['instructor', 'panelist']])->assertOk();

        $this->assertEqualsCanonicalizing(['instructor', 'panelist'], $res->json('roles'));
        $this->assertSame('panelist', $res->json('role'), 'active role is kept while still assigned');
    }

    public function test_removing_the_active_role_falls_back_to_a_remaining_role(): void
    {
        $admin = User::factory()->role('admin')->school($this->school->id)->create();
        $rogelio = $this->faculty(['panelist', 'adviser']);
        Sanctum::actingAs($admin);

        $res = $this->putJson("/api/users/{$rogelio->id}", ['roles' => ['adviser']])->assertOk();

        $this->assertSame(['adviser'], $res->json('roles'));
        $this->assertSame('adviser', $res->json('role'));
    }

    public function test_student_cannot_be_combined_with_other_roles(): void
    {
        $admin = User::factory()->role('admin')->school($this->school->id)->create();
        Sanctum::actingAs($admin);

        $this->postJson('/api/users', [
            'name' => 'Mixed',
            'email' => 'mixed@example.com',
            'password' => 'a-long-password-123',
            'roles' => ['student', 'panelist'],
        ])->assertStatus(422);
    }

    public function test_admin_cannot_be_combined_with_other_roles(): void
    {
        $admin = User::factory()->role('admin')->school($this->school->id)->create();
        $rogelio = $this->faculty(['instructor']);
        Sanctum::actingAs($admin);

        $this->putJson("/api/users/{$rogelio->id}", ['roles' => ['admin', 'instructor']])->assertStatus(422);
    }

    public function test_instructor_cannot_change_roles(): void
    {
        $instructor = $this->faculty(['instructor']);
        $student = User::factory()->role('student')->school($this->school->id)->create();
        Sanctum::actingAs($instructor);

        $this->putJson("/api/users/{$student->id}", ['roles' => ['panelist']])->assertOk();
        $this->assertSame(['student'], $student->fresh()->assignedRoles());
    }

    public function test_instructor_cannot_edit_a_multi_role_faculty_account(): void
    {
        $instructor = $this->faculty(['instructor']);
        $rogelio = $this->faculty(['adviser', 'panelist']);
        Sanctum::actingAs($instructor);

        $this->putJson("/api/users/{$rogelio->id}", ['name' => 'Hacked'])->assertStatus(403);
    }

    public function test_user_can_switch_to_an_assigned_role(): void
    {
        $rogelio = $this->faculty(['instructor', 'adviser', 'panelist']);
        Sanctum::actingAs($rogelio);

        $res = $this->postJson('/api/me/switch-role', ['role' => 'panelist'])->assertOk();

        $this->assertSame('panelist', $res->json('user.role'));
        $this->assertSame('panelist', $rogelio->fresh()->role);
    }

    public function test_user_cannot_switch_to_an_unassigned_role(): void
    {
        $rogelio = $this->faculty(['instructor', 'panelist']);
        Sanctum::actingAs($rogelio);

        $this->postJson('/api/me/switch-role', ['role' => 'admin'])->assertStatus(403);
        $this->assertSame('instructor', $rogelio->fresh()->role);
    }

    public function test_student_cannot_switch_to_any_other_role(): void
    {
        $student = User::factory()->role('student')->school($this->school->id)->create();
        Sanctum::actingAs($student);

        $this->postJson('/api/me/switch-role', ['role' => 'adviser'])->assertStatus(403);
    }

    public function test_switching_role_changes_permissions(): void
    {
        $rogelio = $this->faculty(['panelist', 'instructor']);
        $student = User::factory()->role('student')->school($this->school->id)->create();
        Sanctum::actingAs($rogelio);

        // As panelist: cannot manage accounts.
        $this->putJson("/api/users/{$student->id}", ['section' => 'BSIT 4A'])->assertStatus(403);

        $this->postJson('/api/me/switch-role', ['role' => 'instructor'])->assertOk();
        Sanctum::actingAs($rogelio->fresh());

        // As instructor: can.
        $this->putJson("/api/users/{$student->id}", ['section' => 'BSIT 4A'])->assertOk();
    }

    public function test_me_returns_assigned_roles(): void
    {
        $rogelio = $this->faculty(['instructor', 'panelist']);
        Sanctum::actingAs($rogelio);

        $this->getJson('/api/me')->assertOk()
            ->assertJsonPath('user.role', 'instructor')
            ->assertJsonPath('user.roles', ['instructor', 'panelist']);
    }

    public function test_panelist_picker_includes_faculty_currently_active_as_another_role(): void
    {
        $admin = User::factory()->role('admin')->school($this->school->id)->create();
        $rogelio = $this->faculty(['instructor', 'panelist']); // active: instructor
        $plainInstructor = $this->faculty(['instructor']);
        Sanctum::actingAs($admin);

        $ids = collect($this->getJson('/api/users?role=panelist')->assertOk()->json())->pluck('id');

        $this->assertTrue($ids->contains($rogelio->id));
        $this->assertFalse($ids->contains($plainInstructor->id));
    }

    public function test_adviser_picker_includes_faculty_currently_active_as_panelist(): void
    {
        $admin = User::factory()->role('admin')->school($this->school->id)->create();
        $rogelio = $this->faculty(['panelist', 'adviser']); // active: panelist
        Sanctum::actingAs($admin);

        $ids = collect($this->getJson('/api/advisers')->assertOk()->json())->pluck('id');

        $this->assertTrue($ids->contains($rogelio->id));
    }

    public function test_admin_cannot_change_own_roles(): void
    {
        $admin = User::factory()->role('admin')->school($this->school->id)->create();
        Sanctum::actingAs($admin);

        $this->putJson("/api/users/{$admin->id}", ['roles' => ['instructor']])->assertStatus(403);
        $this->assertSame('admin', $admin->fresh()->role);
    }
}
