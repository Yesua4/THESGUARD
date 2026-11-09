<?php

namespace Tests\Feature;

use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Staff "Reset password", the shared default password, and the forced
// "choose your own password" step.
class PasswordResetByStaffTest extends TestCase
{
    use RefreshDatabase;

    private School $school;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'S', 'slug' => 's', 'email' => 's@s.com']);
    }

    private function pepper(): string
    {
        return (string) config('app.password_pepper', env('PASSWORD_PEPPER', ''));
    }

    private function userWithPassword(string $role, string $password): User
    {
        $u = User::factory()->role($role)->school($this->school->id)->create();
        $u->forceFill(['password' => Hash::make($password . $this->pepper())])->save();
        return $u;
    }

    public function test_instructor_resets_a_students_password_and_they_must_choose_a_new_one(): void
    {
        $instructor = User::factory()->role('instructor')->school($this->school->id)->create();
        $student = $this->userWithPassword('student', 'OldPassword123!');

        Sanctum::actingAs($instructor);
        $temp = $this->postJson("/api/users/{$student->id}/reset-password")->assertOk()->json('temporary_password');
        $this->assertMatchesRegularExpression('/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/', $temp);

        // The old password no longer works; the temporary one does.
        $this->postJson('/api/login', ['email' => $student->email, 'password' => 'OldPassword123!'])->assertStatus(422);
        $login = $this->postJson('/api/login', ['email' => $student->email, 'password' => $temp])->assertOk();
        $this->assertTrue($login->json('user.must_change_password'));

        // Until they choose their own, everything else is closed.
        $fresh = $student->fresh();
        Sanctum::actingAs($fresh);
        $this->getJson('/api/projects')->assertStatus(403)->assertJsonPath('code', 'password_change_required');
        $this->getJson('/api/me')->assertOk();

        $this->putJson('/api/profile/change-password', [
            'current_password' => $temp, 'new_password' => 'MyOwnPassword99', 'new_password_confirmation' => 'MyOwnPassword99',
        ])->assertOk()->assertJsonPath('user.must_change_password', false);

        Sanctum::actingAs($student->fresh());
        $this->getJson('/api/projects')->assertOk();
    }

    public function test_students_advisers_and_panelists_cannot_reset_passwords(): void
    {
        $target = User::factory()->role('student')->school($this->school->id)->create();
        foreach (['student', 'adviser', 'panelist'] as $role) {
            Sanctum::actingAs(User::factory()->role($role)->school($this->school->id)->create());
            $this->postJson("/api/users/{$target->id}/reset-password")->assertStatus(403);
        }
    }

    public function test_instructor_cannot_reset_a_staff_password_or_another_schools(): void
    {
        $instructor = User::factory()->role('instructor')->school($this->school->id)->create();
        Sanctum::actingAs($instructor);
        $admin = User::factory()->role('admin')->school($this->school->id)->create();
        $this->postJson("/api/users/{$admin->id}/reset-password")->assertStatus(403);

        $other = School::create(['name' => 'O', 'slug' => 'o', 'email' => 'o@o.com']);
        $outsider = User::factory()->role('student')->school($other->id)->create();
        $this->postJson("/api/users/{$outsider->id}/reset-password")->assertStatus(403);
    }

    public function test_signing_in_with_the_shared_default_password_requires_a_new_one(): void
    {
        $student = $this->userWithPassword('student', User::DEFAULT_PASSWORD);
        $this->postJson('/api/login', ['email' => $student->email, 'password' => User::DEFAULT_PASSWORD])
            ->assertOk()->assertJsonPath('user.must_change_password', true);

        // ...can't just set the default again, but can choose their own.
        Sanctum::actingAs($student->fresh());
        $this->putJson('/api/profile/change-password', [
            'current_password' => User::DEFAULT_PASSWORD, 'new_password' => User::DEFAULT_PASSWORD, 'new_password_confirmation' => User::DEFAULT_PASSWORD,
        ])->assertStatus(422);
        $this->putJson('/api/profile/change-password', [
            'current_password' => User::DEFAULT_PASSWORD, 'new_password' => 'AnotherGood1234', 'new_password_confirmation' => 'AnotherGood1234',
        ])->assertOk();
    }

    public function test_a_normal_password_sign_in_is_not_affected(): void
    {
        $student = $this->userWithPassword('student', 'PersonalPass2026');
        $this->postJson('/api/login', ['email' => $student->email, 'password' => 'PersonalPass2026'])
            ->assertOk()->assertJsonPath('user.must_change_password', false);
    }
}
