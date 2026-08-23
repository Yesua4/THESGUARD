<?php

namespace Tests\Feature;

use App\Models\Group;
use App\Models\GroupMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PanelistConflictOfInterestTest extends TestCase
{
    use RefreshDatabase;

    public function test_scheduling_the_groups_own_adviser_as_a_panelist_is_rejected(): void
    {
        $adviser = User::factory()->role('adviser')->create(['name' => 'Adviser Person']);
        $group = Group::create(['group_name' => 'Group 1', 'adviser_id' => $adviser->id]);

        Sanctum::actingAs($adviser);
        $response = $this->postJson('/api/schedules', [
            'group_id' => $group->id,
            'defense_date' => '2026-08-10',
            'defense_time' => '10:00',
            'venue' => 'Room A',
            'panelists' => 'Adviser Person, Dr Someone Else',
        ]);

        $response->assertStatus(409);
        $reasons = implode(' ', $response->json('conflicts.0.reasons'));
        $this->assertStringContainsString("can't also serve as a panelist", $reasons);
    }

    public function test_scheduling_a_group_member_as_a_panelist_is_rejected(): void
    {
        $adviser = User::factory()->role('adviser')->create();
        $student = User::factory()->role('student')->create(['name' => 'Student Person']);
        $group = Group::create(['group_name' => 'Group 1', 'adviser_id' => $adviser->id]);
        GroupMember::create(['group_id' => $group->id, 'user_id' => $student->id, 'is_leader' => true]);

        Sanctum::actingAs($adviser);
        $response = $this->postJson('/api/schedules', [
            'group_id' => $group->id,
            'defense_date' => '2026-08-10',
            'defense_time' => '10:00',
            'venue' => 'Room A',
            'panelists' => 'Student Person',
        ]);

        $response->assertStatus(409);
        $reasons = implode(' ', $response->json('conflicts.0.reasons'));
        $this->assertStringContainsString("can't be a panelist for their own defense", $reasons);
    }

    public function test_scheduling_with_unrelated_panelists_succeeds(): void
    {
        $adviser = User::factory()->role('adviser')->create();
        $group = Group::create(['group_name' => 'Group 1', 'adviser_id' => $adviser->id]);

        Sanctum::actingAs($adviser);
        $this->postJson('/api/schedules', [
            'group_id' => $group->id,
            'defense_date' => '2026-08-10',
            'defense_time' => '10:00',
            'venue' => 'Room A',
            'panelists' => 'Dr Panel One, Dr Panel Two',
        ])->assertStatus(201);
    }
}
