<?php

namespace Tests\Feature;

use App\Models\DefenseSchedule;
use App\Models\DefenseSchedulePanelist;
use App\Models\Evaluation;
use App\Models\Group;
use App\Models\GroupMember;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Evaluations follow the school's defense evaluation sheet, one per panelist
// per defense, with a consolidated verdict once the whole panel has evaluated.
class EvaluationSheetTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private Project $project;
    private array $students;
    private User $chair;
    private User $member;
    private DefenseSchedule $schedule;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $adviser = User::factory()->role('adviser')->school($this->school->id)->create();
        $group = Group::create(['group_name' => 'G1', 'school_id' => $this->school->id, 'adviser_id' => $adviser->id]);
        $this->project = Project::create(['title' => 'P', 'school_id' => $this->school->id, 'group_id' => $group->id, 'adviser_id' => $adviser->id, 'status' => 'for_defense']);
        $this->students = User::factory()->count(2)->role('student')->school($this->school->id)->create()->all();
        foreach ($this->students as $s) {
            GroupMember::create(['group_id' => $group->id, 'user_id' => $s->id]);
            ProjectMember::create(['project_id' => $this->project->id, 'user_id' => $s->id]);
        }
        $this->chair = User::factory()->role('panelist')->school($this->school->id)->create(['name' => 'Chair']);
        $this->member = User::factory()->role('panelist')->school($this->school->id)->create(['name' => 'Member']);
        $this->schedule = $this->defense('pre_deployment');
    }

    private function defense(string $type): DefenseSchedule
    {
        $s = DefenseSchedule::create(['group_id' => $this->project->group_id, 'adviser_id' => $this->project->adviser_id, 'defense_type' => $type, 'defense_date' => '2026-10-01', 'defense_time' => '09:00', 'start_time' => '09:00', 'end_time' => '10:00', 'panelists' => 'Chair, Member']);
        DefenseSchedulePanelist::create(['defense_schedule_id' => $s->id, 'user_id' => $this->chair->id, 'role' => 'chair']);
        DefenseSchedulePanelist::create(['defense_schedule_id' => $s->id, 'user_id' => $this->member->id, 'role' => 'member1']);
        return $s;
    }

    private function sheet(User $panelist, string $verdict, array $extra = [], ?DefenseSchedule $schedule = null)
    {
        Sanctum::actingAs($panelist);
        return $this->postJson('/api/evaluations', array_merge([
            'project_id' => $this->project->id,
            'defense_schedule_id' => ($schedule ?? $this->schedule)->id,
            'individual' => [
                ['user_id' => $this->students[0]->id, 'disposition' => 27, 'delivery' => 60],
                ['user_id' => $this->students[1]->id, 'disposition' => 25, 'delivery' => 55.5],
            ],
            'documentation' => 45, 'software' => 40, 'verdict' => $verdict,
        ], $extra));
    }

    public function test_sheet_scores_and_totals_are_saved(): void
    {
        $res = $this->sheet($this->chair, 'passed_with_revisions')->assertStatus(201);

        $this->assertSame(85.0, (float) $res->json('group_total'));
        $this->assertEquals([87, 80.5], array_column($res->json('individual_scores'), 'total'));
        $this->assertSame('passed', $res->json('recommendation'));
    }

    public function test_scores_cannot_exceed_the_sheets_weights(): void
    {
        $this->sheet($this->chair, 'failed', ['documentation' => 60])->assertStatus(422)->assertJsonValidationErrors('documentation');
        $this->sheet($this->chair, 'failed', ['individual' => [['user_id' => $this->students[0]->id, 'disposition' => 31, 'delivery' => 10]]])
            ->assertStatus(422)->assertJsonValidationErrors('individual.0.disposition');
    }

    public function test_conditional_pass_needs_a_comply_by_date(): void
    {
        $this->sheet($this->chair, 'conditional')->assertStatus(422)->assertJsonValidationErrors('comply_by');
        $this->sheet($this->chair, 'conditional', ['comply_by' => '2026-11-15'])->assertStatus(201)->assertJsonPath('comply_by', '2026-11-15');
    }

    public function test_only_this_defenses_panelists_can_evaluate(): void
    {
        $outsider = User::factory()->role('panelist')->school($this->school->id)->create();
        $this->sheet($outsider, 'passed_no_revisions')->assertStatus(403);
    }

    public function test_individual_grades_are_only_for_the_groups_presenters(): void
    {
        $stranger = User::factory()->role('student')->school($this->school->id)->create();
        $this->sheet($this->chair, 'passed_no_revisions', ['individual' => [['user_id' => $stranger->id, 'disposition' => 20, 'delivery' => 50]]])->assertStatus(422);
    }

    public function test_verdict_is_consolidated_once_the_whole_panel_has_evaluated(): void
    {
        $this->sheet($this->chair, 'passed_no_revisions')->assertStatus(201);
        $this->assertNull($this->schedule->fresh()->verdict, 'waits for every panelist');

        $this->sheet($this->member, 'conditional', ['comply_by' => '2026-11-15'])->assertStatus(201);
        $this->assertSame('conditional', $this->schedule->fresh()->verdict);
        $this->assertSame('completed', $this->schedule->fresh()->status);
        $this->assertSame('revision', $this->project->fresh()->defense_verdict);
        $this->assertDatabaseHas('notifications', ['user_id' => $this->students[0]->id, 'type' => 'defense_verdict']);
    }

    public function test_each_defense_has_its_own_evaluation(): void
    {
        $final = $this->defense('final');
        $this->sheet($this->chair, 'passed_with_revisions')->assertStatus(201);
        $this->sheet($this->chair, 'passed_no_revisions', [], $final)->assertStatus(201);
        // Re-submitting the pre-deployment one updates it, not the final one.
        $this->sheet($this->chair, 'failed')->assertOk();

        $this->assertSame(2, Evaluation::where('panelist_id', $this->chair->id)->count());
        $this->assertSame('passed_no_revisions', Evaluation::where('defense_schedule_id', $final->id)->value('verdict'));
    }

    public function test_evaluations_are_private_to_people_who_can_see_the_project(): void
    {
        $this->sheet($this->chair, 'passed_no_revisions')->assertStatus(201);

        Sanctum::actingAs(User::factory()->role('student')->school($this->school->id)->create());
        $this->getJson("/api/evaluations/project/{$this->project->id}")->assertStatus(403);

        Sanctum::actingAs($this->students[0]);
        $this->getJson("/api/evaluations/project/{$this->project->id}")->assertOk()->assertJsonCount(1);
    }
}
