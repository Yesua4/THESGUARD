<?php

namespace Tests\Feature;

use App\Models\DefenseSchedule;
use App\Models\Group;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DefenseVerdictTest extends TestCase
{
    use RefreshDatabase;

    private function makeScheduledProject(): array
    {
        $adviser = User::factory()->role('adviser')->create();
        $panelistA = User::factory()->role('panelist')->create(['name' => 'Panelist A']);
        $panelistB = User::factory()->role('panelist')->create(['name' => 'Panelist B']);
        $group = Group::create(['group_name' => 'Group 1', 'adviser_id' => $adviser->id]);
        $project = Project::create([
            'title' => 'Some Title', 'group_id' => $group->id, 'adviser_id' => $adviser->id,
            'title_status' => 'approved', 'status' => 'for_defense',
        ]);
        DefenseSchedule::create([
            'group_id' => $group->id, 'project_id' => $project->id, 'adviser_id' => $adviser->id,
            'defense_date' => '2026-08-10', 'defense_time' => '10:00',
            'panelists' => 'Panelist A, Panelist B',
        ]);

        return compact('adviser', 'panelistA', 'panelistB', 'project');
    }

    private function submitEvaluation(User $panelist, Project $project, string $recommendation): void
    {
        Sanctum::actingAs($panelist);
        $this->postJson('/api/evaluations', [
            'project_id' => $project->id,
            'presentation_score' => 80, 'technical_score' => 80,
            'documentation_score' => 80, 'qa_score' => 80,
            'recommendation' => $recommendation,
        ])->assertSuccessful();
    }

    public function test_verdict_stays_pending_until_all_panelists_submit(): void
    {
        $data = $this->makeScheduledProject();
        $this->submitEvaluation($data['panelistA'], $data['project'], 'passed');

        $this->assertEquals('pending', $data['project']->fresh()->defense_verdict);
    }

    public function test_all_passed_yields_passed_verdict(): void
    {
        $data = $this->makeScheduledProject();
        $this->submitEvaluation($data['panelistA'], $data['project'], 'passed');
        $this->submitEvaluation($data['panelistB'], $data['project'], 'passed');

        $this->assertEquals('passed', $data['project']->fresh()->defense_verdict);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $data['adviser']->id, 'type' => 'defense_verdict', 'project_id' => $data['project']->id,
        ]);
    }

    public function test_any_failed_yields_failed_verdict(): void
    {
        $data = $this->makeScheduledProject();
        $this->submitEvaluation($data['panelistA'], $data['project'], 'passed');
        $this->submitEvaluation($data['panelistB'], $data['project'], 'failed');

        $this->assertEquals('failed', $data['project']->fresh()->defense_verdict);
    }

    public function test_revision_beats_passed_when_no_failures(): void
    {
        $data = $this->makeScheduledProject();
        $this->submitEvaluation($data['panelistA'], $data['project'], 'passed');
        $this->submitEvaluation($data['panelistB'], $data['project'], 'revision');

        $this->assertEquals('revision', $data['project']->fresh()->defense_verdict);
    }

    public function test_resubmitting_an_evaluation_recomputes_the_verdict(): void
    {
        $data = $this->makeScheduledProject();
        $this->submitEvaluation($data['panelistA'], $data['project'], 'passed');
        $this->submitEvaluation($data['panelistB'], $data['project'], 'passed');
        $this->assertEquals('passed', $data['project']->fresh()->defense_verdict);

        $this->submitEvaluation($data['panelistB'], $data['project'], 'failed');
        $this->assertEquals('failed', $data['project']->fresh()->defense_verdict);
    }
}
