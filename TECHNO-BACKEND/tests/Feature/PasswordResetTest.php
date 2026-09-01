<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

// This app hashes every password with a custom "pepper" appended
// (PASSWORD_PEPPER) before Hash::make() -- login, register, and
// changePassword all do this consistently. The whole point of this test is
// to prove the reset flow does too: a naive use of Laravel's default
// password broker would silently skip the pepper and lock the user out of
// their own newly-reset password, even though the reset itself "succeeds".
class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_full_reset_flow_and_user_can_login_with_new_password(): void
    {
        $user = User::factory()->create(['email' => 'reset-me@example.com']);

        $this->postJson('/api/password/forgot', ['email' => $user->email])
            ->assertStatus(200);

        $token = Password::createToken($user);

        $this->postJson('/api/password/reset', [
            'email' => $user->email,
            'token' => $token,
            'password' => 'brandNewPassword123',
            'password_confirmation' => 'brandNewPassword123',
        ])->assertStatus(200);

        // The real proof: login must work with the new password through the
        // exact same peppered-hash check every other login uses.
        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'brandNewPassword123',
        ])->assertStatus(200)->assertJsonStructure(['token']);
    }

    public function test_old_password_no_longer_works_after_reset(): void
    {
        $user = User::factory()->create([
            'email' => 'reset-me2@example.com',
            'password' => \Illuminate\Support\Facades\Hash::make('oldPassword123' . env('PASSWORD_PEPPER', '')),
        ]);

        $token = Password::createToken($user);
        $this->postJson('/api/password/reset', [
            'email' => $user->email,
            'token' => $token,
            'password' => 'newPassword456',
            'password_confirmation' => 'newPassword456',
        ])->assertStatus(200);

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'oldPassword123',
        ])->assertStatus(422);
    }

    public function test_invalid_token_is_rejected(): void
    {
        $user = User::factory()->create(['email' => 'reset-me3@example.com']);

        $this->postJson('/api/password/reset', [
            'email' => $user->email,
            'token' => 'not-a-real-token',
            'password' => 'somePassword123',
            'password_confirmation' => 'somePassword123',
        ])->assertStatus(422);
    }

    public function test_forgot_password_does_not_reveal_whether_email_exists(): void
    {
        $res1 = $this->postJson('/api/password/forgot', ['email' => 'nobody-real@example.com']);
        $user = User::factory()->create(['email' => 'real-user@example.com']);
        $res2 = $this->postJson('/api/password/forgot', ['email' => $user->email]);

        $res1->assertStatus(200);
        $res2->assertStatus(200);
        $this->assertSame($res1->json('message'), $res2->json('message'));
    }
}
