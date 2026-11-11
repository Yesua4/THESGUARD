<?php

namespace Tests\Feature;

use App\Models\Contribution;
use App\Models\DefenseSchedule;
use App\Models\Evaluation;
use App\Models\Group;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private User $admin;
    private User $adviser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school  = School::create(['name' => 'Report State College', 'slug' => 'rsc', 'email' => 'r@r.com']);
        $this->admin   = User::factory()->role('admin')->school($this->school->id)->create();
        $this->adviser = User::factory()->role('adviser')->school($this->school->id)->create(['name' => 'Ada Adviser']);
    }

    private function groupWithProject(string $section, string $year = '2026-2027'): array
    {
        $g = Group::create(['group_name' => "Group $section", 'school_id' => $this->school->id, 'section' => $section, 'batch' => $year, 'adviser_id' => $this->adviser->id]);
        $p = Project::create(['title' => "Project $section", 'school_id' => $this->school->id, 'group_id' => $g->id, 'batch' => $year,
            'adviser_id' => $this->adviser->id, 'status' => 'ongoing', 'title_status' => 'approved', 'similarity_score' => 45]);
        $a = User::factory()->role('student')->school($this->school->id)->create(['section' => $section]);
        $b = User::factory()->role('student')->school($this->school->id)->create(['section' => $section]);
        ProjectMember::create(['project_id' => $p->id, 'user_id' => $a->id, 'is_leader' => true]);
        ProjectMember::create(['project_id' => $p->id, 'user_id' => $b->id]);
        return [$g, $p, $a, $b];
    }

    public function test_only_admins_and_instructors_can_see_reports(): void
    {
        foreach (['student', 'adviser', 'panelist'] as $role) {
            Sanctum::actingAs(User::factory()->role($role)->school($this->school->id)->create());
            $this->getJson('/api/reports/projects')->assertStatus(403);
            $this->getJson('/api/reports/evaluations')->assertStatus(403);
        }
        Sanctum::actingAs($this->admin);
        $this->getJson('/api/reports/projects')->assertOk();
        $this->getJson('/api/reports/options')->assertOk()->assertJsonPath('school', 'Report State College');
    }

    public function test_student_shares_add_up_to_100_per_project_and_faculty_are_left_out(): void
    {
        [, $p, $a, $b] = $this->groupWithProject('BSIT 4A');
        foreach (range(1, 3) as $i) Contribution::create(['project_id' => $p->id, 'user_id' => $a->id, 'action' => 'x', 'description' => 'x']);
        Contribution::create(['project_id' => $p->id, 'user_id' => $b->id, 'action' => 'x', 'description' => 'x']);
        foreach (range(1, 5) as $i) Contribution::create(['project_id' => $p->id, 'user_id' => $this->adviser->id, 'action' => 'x', 'description' => 'x']);

        Sanctum::actingAs($this->admin);
        $rows = collect($this->getJson('/api/reports/contributions')->assertOk()->json());
        $this->assertCount(2, $rows);
        $this->assertNotContains('Ada Adviser', $rows->pluck('name'));
        $this->assertEquals(100, $rows->sum('percentage'));
        $this->assertEquals(75, $rows->firstWhere('count', 3)['percentage']);
    }

    public function test_academic_year_filter_accepts_a_long_dash_and_current_skips_archived(): void
    {
        $this->groupWithProject('BSIT 4A', '2026-2027');
        $this->groupWithProject('BSIT 4B', '2025-2026');
        Project::create(['title' => 'Old Library System', 'school_id' => $this->school->id, 'status' => 'archived', 'title_status' => 'approved', 'batch' => '2026-2027']);

        Sanctum::actingAs($this->admin);
        $this->getJson('/api/reports/projects?academic_year=' . urlencode("2026\u{2013}2027"))
            ->assertOk()->assertJsonCount(1)->assertJsonPath('0.title', 'Project BSIT 4A');
        $this->getJson('/api/reports/projects?scope=archived&academic_year=2026-2027')
            ->assertOk()->assertJsonCount(1)->assertJsonPath('0.title', 'Old Library System');
        $this->getJson('/api/reports/projects?scope=all')->assertOk()->assertJsonCount(3);
    }

    public function test_a_section_instructor_only_gets_their_sections(): void
    {
        $this->groupWithProject('BSIT 4A');
        $this->groupWithProject('BSIT 4B');
        $instructor = User::factory()->role('instructor')->school($this->school->id)->create();
        $instructor->syncHandledSections(['BSIT 4A']);

        Sanctum::actingAs($instructor->fresh());
        $titles = collect($this->getJson('/api/reports/projects')->assertOk()->json())->pluck('title');
        $this->assertEquals(['Project BSIT 4A'], $titles->all());
        $this->assertEquals(['BSIT 4A'], $this->getJson('/api/reports/options')->json('sections'));
        // Asking for the other section by name doesn't get around it.
        $this->getJson('/api/reports/projects?section=' . urlencode('BSIT 4B'))->assertOk()->assertJsonCount(0);
    }

    public function test_schedules_include_title_defenses_and_evaluations_report_verdicts(): void
    {
        [$g, $p] = $this->groupWithProject('BSIT 4A');
        $panelist = User::factory()->role('panelist')->school($this->school->id)->create(['name' => 'Paul Panel']);
        DefenseSchedule::create(['group_id' => $g->id, 'adviser_id' => $this->adviser->id, 'defense_type' => 'title', 'defense_date' => '2026-11-13', 'defense_time' => '09:00', 'start_time' => '09:00', 'end_time' => '10:00', 'venue' => 'Lab 1', 'status' => 'scheduled']);
        $outline = DefenseSchedule::create(['group_id' => $g->id, 'adviser_id' => $this->adviser->id, 'project_id' => $p->id, 'defense_type' => 'outline', 'defense_date' => '2026-12-01', 'defense_time' => '13:00', 'start_time' => '13:00', 'end_time' => '14:00', 'status' => 'completed', 'verdict' => 'passed_with_revisions']);
        Evaluation::create(['project_id' => $p->id, 'panelist_id' => $panelist->id, 'defense_schedule_id' => $outline->id,
            'group_total' => 88, 'individual_scores' => [['user_id' => 1, 'total' => 90], ['user_id' => 2, 'total' => 80]], 'verdict' => 'passed_with_revisions']);

        Sanctum::actingAs($this->admin);
        $this->getJson('/api/reports/schedules')->assertOk()->assertJsonCount(2)
            ->assertJsonPath('0.defense_type', 'title')->assertJsonPath('0.end_time', '10:00')->assertJsonPath('0.date', '2026-11-13');
        $this->getJson('/api/reports/schedules?defense_type=outline')->assertOk()->assertJsonCount(1);
        $this->getJson('/api/reports/evaluations')->assertOk()->assertJsonCount(1)
            ->assertJsonPath('0.panelist', 'Paul Panel')->assertJsonPath('0.individual_avg', 85)
            ->assertJsonPath('0.verdict', 'passed_with_revisions')->assertJsonPath('0.defense_type', 'outline');
    }

    public function test_another_schools_data_never_appears(): void
    {
        $this->groupWithProject('BSIT 4A');
        $other = School::create(['name' => 'Other', 'slug' => 'o', 'email' => 'o@o.com']);
        Sanctum::actingAs(User::factory()->role('admin')->school($other->id)->create());
        $this->getJson('/api/reports/projects?scope=all')->assertOk()->assertJsonCount(0);
        $this->getJson('/api/reports/schedules')->assertOk()->assertJsonCount(0);
    }
}
