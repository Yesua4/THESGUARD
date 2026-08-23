<?php

namespace Tests\Feature;

use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// GET /api/schools used to accept a shared secret (X-ThesisGuard-Key) as an
// alternative to real login. That key came from a VITE_-prefixed env var,
// which Vite always inlines into the public JS bundle -- so it was a
// "secret" visible to anyone who opened devtools, no login required. It's
// been removed; only a real authenticated admin may view the directory now.
class SchoolDirectoryAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_request_is_rejected(): void
    {
        School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);

        $this->getJson('/api/schools')->assertStatus(401);
    }

    public function test_non_admin_cannot_view_school_directory(): void
    {
        School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $student = User::factory()->role('student')->create();

        Sanctum::actingAs($student);
        $this->getJson('/api/schools')->assertStatus(403);
    }

    public function test_a_key_header_no_longer_grants_access(): void
    {
        School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);

        $this->withHeaders(['X-ThesisGuard-Key' => 'ThesisGuard@AdminKey2026!'])
            ->getJson('/api/schools')
            ->assertStatus(401);
    }

    public function test_admin_can_view_school_directory(): void
    {
        School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $admin = User::factory()->role('admin')->create();

        Sanctum::actingAs($admin);
        $this->getJson('/api/schools')->assertStatus(200)->assertJsonCount(1);
    }
}
