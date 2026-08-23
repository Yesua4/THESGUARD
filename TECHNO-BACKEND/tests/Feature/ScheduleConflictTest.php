<?php

namespace Tests\Feature;

use App\Models\DefenseSchedule;
use App\Models\Group;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ScheduleConflictTest extends TestCase
{
    use RefreshDatabase;

    public function test_double_booking_same_venue_adviser_and_panelist_is_rejected(): void
    {
        $adviser = User::factory()->role('adviser')->create();
        $group1 = Group::create(['group_name' => 'Group 1', 'adviser_id' => $adviser->id]);
        $group2 = Group::create(['group_name' => 'Group 2', 'adviser_id' => $adviser->id]);

        DefenseSchedule::create([
            'group_id' => $group1->id,
            'adviser_id' => $adviser->id,
            'defense_date' => '2026-08-10',
            'defense_time' => '10:00',
            'venue' => 'Room A',
            'panelists' => 'Dr Panel One',
        ]);

        Sanctum::actingAs($adviser);
        $response = $this->postJson('/api/schedules', [
            'group_id' => $group2->id,
            'defense_date' => '2026-08-10',
            'defense_time' => '10:00',
            'venue' => 'Room A',
            'panelists' => 'Dr Panel One',
        ]);

        $response->assertStatus(409);
        $reasons = implode(' ', $response->json('conflicts.0.reasons'));
        $this->assertStringContainsString('already have a defense', $reasons);
        $this->assertStringContainsString('Room A', $reasons);
        $this->assertStringContainsString('Dr Panel One', $reasons);
    }

    public function test_same_day_different_time_is_not_a_conflict(): void
    {
        $adviser = User::factory()->role('adviser')->create();
        $group1 = Group::create(['group_name' => 'Group 1', 'adviser_id' => $adviser->id]);
        $group2 = Group::create(['group_name' => 'Group 2', 'adviser_id' => $adviser->id]);

        DefenseSchedule::create([
            'group_id' => $group1->id,
            'adviser_id' => $adviser->id,
            'defense_date' => '2026-08-10',
            'defense_time' => '10:00',
            'venue' => 'Room A',
        ]);

        Sanctum::actingAs($adviser);
        $this->postJson('/api/schedules', [
            'group_id' => $group2->id,
            'defense_date' => '2026-08-10',
            'defense_time' => '13:00',
            'venue' => 'Room A',
        ])->assertStatus(201);
    }

    public function test_updating_a_schedule_does_not_conflict_with_itself(): void
    {
        $adviser = User::factory()->role('adviser')->create();
        $group = Group::create(['group_name' => 'Group 1', 'adviser_id' => $adviser->id]);

        $schedule = DefenseSchedule::create([
            'group_id' => $group->id,
            'adviser_id' => $adviser->id,
            'defense_date' => '2026-08-10',
            'defense_time' => '10:00',
            'venue' => 'Room A',
        ]);

        Sanctum::actingAs($adviser);
        $this->putJson("/api/schedules/{$schedule->id}", ['venue' => 'Room A'])
            ->assertStatus(200);
    }

    public function test_updating_into_another_schedules_slot_is_still_caught(): void
    {
        $adviser = User::factory()->role('adviser')->create();
        $group1 = Group::create(['group_name' => 'Group 1', 'adviser_id' => $adviser->id]);
        $group2 = Group::create(['group_name' => 'Group 2', 'adviser_id' => $adviser->id]);

        DefenseSchedule::create([
            'group_id' => $group1->id,
            'adviser_id' => $adviser->id,
            'defense_date' => '2026-08-10',
            'defense_time' => '10:00',
            'venue' => 'Room A',
        ]);
        $schedule2 = DefenseSchedule::create([
            'group_id' => $group2->id,
            'adviser_id' => $adviser->id,
            'defense_date' => '2026-08-10',
            'defense_time' => '13:00',
            'venue' => 'Room A',
        ]);

        Sanctum::actingAs($adviser);
        $this->putJson("/api/schedules/{$schedule2->id}", ['defense_time' => '10:00'])
            ->assertStatus(409);
    }
}
