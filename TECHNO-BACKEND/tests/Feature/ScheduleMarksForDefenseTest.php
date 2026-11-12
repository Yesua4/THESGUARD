<?php

namespace Tests\Feature;

use App\Models\Group;
use App\Models\Project;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Scheduling an outline / pre-deployment / final defense puts the group's
// final title "For Defense" automatically (no manual status step).
class ScheduleMarksForDefenseTest extends TestCase
{
    use RefreshDatabase;

    private User $instructor;
    private Group $group;
    private Project $final;
    private Project $other;

    protected function setUp(): void
    {
        parent::setUp();
        $school = School::create(['name' => 'S', 'slug' => 's', 'email' => 's@s.com']);
        $this->instructor = User::factory()->role('instructor')->school($school->id)->create();
        $adviser = User::factory()->role('adviser')->school($school->id)->create();
        $this->group = Group::create(['group_name' => 'G', 'school_id' => $school->id, 'instructor_id' => $this->instructor->id, 'adviser_id' => $adviser->id]);
        $this->final = Project::create(['title' => 'Final', 'group_id' => $this->group->id, 'school_id' => $school->id, 'title_status' => 'approved', 'is_final_title' => true, 'status' => 'ongoing']);
        $this->other = Project::create(['title' => 'Not chosen', 'group_id' => $this->group->id, 'school_id' => $school->id, 'title_status' => 'approved', 'is_final_title' => false, 'status' => 'archived']);
    }

    private function schedule(string $type)
    {
        Sanctum::actingAs($this->instructor);
        return $this->postJson('/api/schedules', [
            'group_id' => $this->group->id, 'defense_type' => $type, 'defense_date' => '2026-11-20',
            'start_time' => '08:00', 'end_time' => '09:00', 'venue' => 'AB 3-1',
        ])->assertStatus(201);
    }

    public function test_scheduling_the_outline_defense_puts_the_final_title_for_defense(): void
    {
        $this->schedule('outline');
        $this->assertSame('for_defense', $this->final->fresh()->status);
        $this->assertSame('archived', $this->other->fresh()->status, 'a title that was not chosen is untouched');
    }

    public function test_a_title_defense_does_not_change_the_status(): void
    {
        $this->schedule('title');
        $this->assertSame('ongoing', $this->final->fresh()->status);
    }

    public function test_an_approved_or_archived_project_is_not_moved_back(): void
    {
        $this->final->update(['status' => 'approved']);
        $this->schedule('final');
        $this->assertSame('approved', $this->final->fresh()->status);
    }

    public function test_changing_a_title_defense_into_an_outline_defense_also_marks_it(): void
    {
        $id = $this->schedule('title')->json('id');
        $this->putJson("/api/schedules/{$id}", ['defense_type' => 'outline'])->assertOk();
        $this->assertSame('for_defense', $this->final->fresh()->status);
    }
}
