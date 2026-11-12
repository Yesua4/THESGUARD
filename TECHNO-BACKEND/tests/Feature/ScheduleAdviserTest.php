<?php

namespace Tests\Feature;

use App\Models\DefenseSchedule;
use App\Models\Group;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// A defense's adviser is the group's adviser -- never whoever scheduled it.
class ScheduleAdviserTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private User $instructor;
    private User $adviser;
    private Group $group;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        // An instructor who is also an adviser (like Rosebud), scheduling another adviser's group.
        $this->instructor = User::factory()->role('instructor')->school($this->school->id)->create();
        $this->instructor->syncRoles(['instructor', 'adviser']);
        $this->instructor = $this->instructor->fresh();
        $this->adviser = User::factory()->role('adviser')->school($this->school->id)->create(['name' => 'Nelma']);
        $this->group = Group::create(['group_name' => 'Group Abrigo', 'school_id' => $this->school->id,
            'instructor_id' => $this->instructor->id, 'adviser_id' => $this->adviser->id]);
    }

    private function schedule(): DefenseSchedule
    {
        Sanctum::actingAs($this->instructor);
        $id = $this->postJson('/api/schedules', [
            'group_id' => $this->group->id, 'defense_type' => 'title', 'defense_date' => '2026-11-20',
            'start_time' => '08:00', 'end_time' => '09:00', 'venue' => 'AB 3-1',
        ])->assertStatus(201)->json('id');
        return DefenseSchedule::findOrFail($id);
    }

    public function test_scheduling_saves_the_groups_adviser_not_the_scheduler(): void
    {
        $this->assertSame($this->adviser->id, (int) $this->schedule()->adviser_id);
    }

    public function test_an_old_record_shows_the_groups_real_adviser(): void
    {
        $s = $this->schedule();
        $s->update(['adviser_id' => $this->instructor->id]); // how older records were saved

        Sanctum::actingAs($this->instructor);
        $row = collect($this->getJson('/api/schedules')->assertOk()->json())->firstWhere('id', $s->id);
        $this->assertSame($this->adviser->id, $row['adviser_id']);
        $this->assertSame('Nelma', $row['adviser']['name']);
    }

    public function test_adviser_mode_shows_only_the_defenses_of_groups_they_advise(): void
    {
        $s = $this->schedule();
        $s->update(['adviser_id' => $this->instructor->id]); // old record naming the scheduler

        $this->instructor->forceFill(['role' => 'adviser'])->save(); // switched to adviser mode
        Sanctum::actingAs($this->instructor->fresh());
        $this->assertCount(0, $this->getJson('/api/schedules')->assertOk()->json());

        Sanctum::actingAs($this->adviser);
        $this->assertCount(1, $this->getJson('/api/schedules')->assertOk()->json());
    }

    public function test_changing_the_groups_adviser_updates_its_defenses(): void
    {
        $s = $this->schedule();
        $new = User::factory()->role('adviser')->school($this->school->id)->create();

        Sanctum::actingAs($this->instructor);
        $this->putJson("/api/groups/{$this->group->id}", ['adviser_id' => $new->id])->assertOk();
        $this->assertSame($new->id, (int) $s->fresh()->adviser_id);
    }
}
