<?php

namespace Tests\Feature;

use App\Http\Controllers\Concerns\AuthorizesDocumentAccess;
use App\Models\DefenseSchedule;
use App\Models\Group;
use App\Models\GroupMember;
use App\Models\Project;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Defense types, start-end times, panels with roles (permanent from the
// outline defense on), and conflict detection on overlapping times.
class DefensePanelScheduleTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private User $instructor;
    private array $p = [];
    private Group $g1;
    private Group $g2;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $this->instructor = User::factory()->role('instructor')->school($this->school->id)->create();
        foreach (['Rogelio', 'Loja', 'Anana', 'Jerson', 'Padios', 'Lolong', 'Masangkay'] as $n) {
            $this->p[$n] = User::factory()->role('panelist')->school($this->school->id)->create(['name' => $n]);
        }
        $a1 = User::factory()->role('adviser')->school($this->school->id)->create();
        $a2 = User::factory()->role('adviser')->school($this->school->id)->create();
        $this->g1 = Group::create(['group_name' => 'Group 1', 'school_id' => $this->school->id, 'adviser_id' => $a1->id]);
        $this->g2 = Group::create(['group_name' => 'Group 2', 'school_id' => $this->school->id, 'adviser_id' => $a2->id]);
    }

    private function panel(array $names): array
    {
        $roles = ['chair', 'member1', 'member2'];
        return array_map(fn ($n, $i) => ['role' => $roles[$i], 'user_id' => $this->p[$n]->id], $names, array_keys($names));
    }

    private function schedule(Group $g, array $extra)
    {
        Sanctum::actingAs($this->instructor);
        return $this->postJson('/api/schedules', array_merge([
            'group_id' => $g->id, 'defense_type' => 'title', 'defense_date' => '2026-07-31',
            'start_time' => '13:00', 'end_time' => '14:00', 'venue' => 'Comlab 1',
        ], $extra));
    }

    public function test_same_room_same_time_is_a_conflict(): void
    {
        $this->schedule($this->g1, ['panel' => $this->panel(['Rogelio', 'Loja', 'Anana'])])->assertStatus(201);
        $res = $this->schedule($this->g2, ['panel' => $this->panel(['Jerson', 'Padios'])])->assertStatus(409);
        $reasons = collect($res->json('conflicts'))->pluck('reasons')->flatten()->implode(' ');
        $this->assertStringContainsString('Room "Comlab 1" is already booked by Group 1 from 1:00 PM–2:00 PM', $reasons);
    }

    public function test_same_panelist_in_two_rooms_at_once_is_a_conflict(): void
    {
        $this->schedule($this->g1, ['panel' => $this->panel(['Rogelio', 'Loja'])])->assertStatus(201);
        $res = $this->schedule($this->g2, ['venue' => 'Comlab 2', 'panel' => $this->panel(['Rogelio', 'Jerson'])])->assertStatus(409);
        $this->assertStringContainsString('Rogelio is already on the panel of Group 1', json_encode($res->json('conflicts')));
    }

    public function test_overlapping_times_conflict_but_back_to_back_does_not(): void
    {
        $this->schedule($this->g1, ['panel' => $this->panel(['Rogelio'])])->assertStatus(201);
        $this->schedule($this->g2, ['start_time' => '13:30', 'end_time' => '14:30', 'venue' => 'Comlab 2', 'panel' => $this->panel(['Rogelio'])])->assertStatus(409);
        $this->schedule($this->g2, ['start_time' => '14:00', 'end_time' => '15:00', 'panel' => $this->panel(['Rogelio'])])->assertStatus(201);
    }

    public function test_one_instructor_can_schedule_two_groups_at_the_same_time_in_different_rooms(): void
    {
        $this->schedule($this->g1, ['panel' => $this->panel(['Rogelio'])])->assertStatus(201);
        $this->schedule($this->g2, ['venue' => 'Comlab 2', 'panel' => $this->panel(['Jerson'])])->assertStatus(201);
    }

    public function test_end_time_must_be_after_start(): void
    {
        $this->schedule($this->g1, ['start_time' => '14:00', 'end_time' => '13:00'])->assertStatus(422)->assertJsonValidationErrors('end_time');
    }

    public function test_check_reports_conflicts_without_saving(): void
    {
        $this->schedule($this->g1, ['panel' => $this->panel(['Rogelio'])])->assertStatus(201);
        Sanctum::actingAs($this->instructor);
        $res = $this->postJson('/api/schedules/check', [
            'group_id' => $this->g2->id, 'defense_type' => 'title', 'defense_date' => '2026-07-31',
            'start_time' => '13:00', 'end_time' => '14:00', 'venue' => 'Comlab 3', 'panel' => $this->panel(['Rogelio']),
        ])->assertOk();
        $this->assertCount(1, $res->json('conflicts'));
        $this->assertSame(1, DefenseSchedule::count());
    }

    public function test_panel_from_the_outline_defense_carries_to_the_next_defenses(): void
    {
        // Title defense: any panel, not saved as the group's panel.
        $this->schedule($this->g1, ['defense_date' => '2026-06-01', 'panel' => $this->panel(['Padios', 'Loja'])])->assertStatus(201);
        $this->assertSame(0, $this->g1->panel()->count());

        // Outline defense with Lolong (chair), Masangkay, Anana -> becomes the group's panel.
        $this->schedule($this->g1, ['defense_type' => 'outline', 'defense_date' => '2026-08-01', 'panel' => $this->panel(['Lolong', 'Masangkay', 'Anana'])])->assertStatus(201);
        $this->assertSame(['chair' => 'Lolong', 'member1' => 'Masangkay', 'member2' => 'Anana'],
            $this->g1->panel()->get()->mapWithKeys(fn ($p) => [$p->role => $p->user->name])->all());

        // Pre-deployment with no panel given -> the same panel, automatically.
        $res = $this->schedule($this->g1, ['defense_type' => 'pre_deployment', 'defense_date' => '2026-10-01'])->assertStatus(201);
        $this->assertSame(['Lolong', 'Masangkay', 'Anana'], collect($res->json('panel'))->sortBy(fn ($p) => array_search($p['role'], ['chair', 'member1', 'member2']))->pluck('user.name')->values()->all());
        $this->assertSame('Lolong, Masangkay, Anana', $res->json('panelists'));
    }

    public function test_instructor_sets_a_groups_permanent_panel_with_roles(): void
    {
        Sanctum::actingAs($this->instructor);
        $this->putJson("/api/groups/{$this->g1->id}/panel", ['panel' => $this->panel(['Padios', 'Lolong', 'Anana'])])
            ->assertOk()->assertJsonCount(3, 'panel');

        // Schedule an outline defense with no panel -> filled from the group.
        $res = $this->schedule($this->g1, ['defense_type' => 'outline'])->assertStatus(201);
        $this->assertSame('Padios', collect($res->json('panel'))->firstWhere('role', 'chair')['user']['name']);
    }

    public function test_only_panelists_and_not_the_groups_own_adviser_or_members(): void
    {
        $student = User::factory()->role('student')->school($this->school->id)->create();
        GroupMember::create(['group_id' => $this->g1->id, 'user_id' => $student->id, 'is_leader' => 1]);
        Sanctum::actingAs($this->instructor);

        $this->putJson("/api/groups/{$this->g1->id}/panel", ['panel' => [['role' => 'chair', 'user_id' => $student->id]]])->assertStatus(422);
        $adviser = User::find($this->g1->adviser_id);
        $adviser->syncRoles(['adviser', 'panelist']);
        $this->putJson("/api/groups/{$this->g1->id}/panel", ['panel' => [['role' => 'chair', 'user_id' => $adviser->id]]])
            ->assertStatus(422)->assertJsonValidationErrors('panel');
    }

    public function test_students_cannot_set_panels(): void
    {
        $student = User::factory()->role('student')->school($this->school->id)->create();
        Sanctum::actingAs($student);
        $this->putJson("/api/groups/{$this->g1->id}/panel", ['panel' => $this->panel(['Padios'])])->assertStatus(403);
    }

    public function test_a_permanent_panelist_can_open_the_groups_project(): void
    {
        $project = Project::create(['title' => 'P', 'school_id' => $this->school->id, 'group_id' => $this->g1->id, 'status' => 'ongoing']);
        $this->assertFalse(AuthorizesDocumentAccess::userCanAccessProject($this->p['Lolong'], $project->id));

        Sanctum::actingAs($this->instructor);
        $this->putJson("/api/groups/{$this->g1->id}/panel", ['panel' => $this->panel(['Lolong'])])->assertOk();

        $this->assertTrue(AuthorizesDocumentAccess::userCanAccessProject($this->p['Lolong'], $project->id));
    }
}
