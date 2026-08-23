<?php

namespace Tests\Feature;

use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_succeeds_with_correct_credentials(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password' . env('PASSWORD_PEPPER'))]);

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'correct-password',
        ])->assertStatus(200)->assertJsonStructure(['user', 'token']);
    }

    public function test_login_fails_with_wrong_password(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password' . env('PASSWORD_PEPPER'))]);

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ])->assertStatus(422);
    }

    public function test_login_response_never_contains_plan_or_limits_fields(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password' . env('PASSWORD_PEPPER'))]);

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'correct-password',
        ]);

        $response->assertStatus(200);
        $this->assertArrayNotHasKey('plan', $response->json('school') ?? []);
        $this->assertArrayNotHasKey('limits', $response->json());
    }

    public function test_login_is_rate_limited_after_repeated_failures(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password' . env('PASSWORD_PEPPER'))]);

        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/login', ['email' => $user->email, 'password' => 'wrong'])
                ->assertStatus(422);
        }

        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'wrong'])
            ->assertStatus(429);
    }

    public function test_school_registration_creates_school_and_admin_without_plan_cap(): void
    {
        $response = $this->postJson('/api/schools/register', [
            'school_name' => 'Test School',
            'school_email' => 'testschool@example.com',
            'admin_name' => 'Admin Person',
            'admin_email' => 'admin@example.com',
            'admin_password' => 'password12345',
            'admin_password_confirmation' => 'password12345',
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('schools', ['email' => 'testschool@example.com']);
        $this->assertArrayNotHasKey('plan', $response->json('school'));
    }
}
