<?php

namespace Tests\Feature;

use App\Http\Controllers\Concerns\AuthorizesDocumentAccess;
use App\Models\AcademicTerm;
use App\Models\CapstoneStage;
use App\Models\Group;
use App\Models\Project;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Capstone 1 and Capstone 2 can have different instructors; the current
// stage's instructor becomes the group's instructor automatically.
class StageInstructorTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private User $admin;
    private User $padios;
    private User $jerson;
    private CapstoneStage $cap1;
    private CapstoneStage $cap2;
    private Group $group;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $this->admin = User::factory()->role('admin')->school($this->school->id)->create();
        $this->padios = User::factory()->role('instructor')->school($this->school->id)->create(['name' => 'Padios']);
        $this->jerson = User::factory()->role('instructor')->school($this->school->id)->create(['name' => 'Jerson']);
        $t2 = AcademicTerm::create(['school_id' => $this->school->id, 'academic_year' => '2026-2027', 'name' => '2nd Semester', 'start_date' => '2026-11-01', 'end_date' => '2027-03-15']);
        AcademicTerm::create(['school_id' => $this->school->id, 'academic_year' => '2026-2027', 'name' => '1st Semester', 'start_date' => '2026-06-01', 'end_date' => '2026-10-15']);
        AcademicTerm::create(['school_id' => $this->school->id, 'academic_year' => '2027-2028', 'name' => '1st Semester', 'start_date' => '2027-06-01', 'end_date' => '2027-10-15']);
        $this->cap1 = CapstoneStage::create(['school_id' => $this->school->id, 'name' => 'Capstone 1', 'year_level' => 2, 'term_no' => 2]);
        $this->cap2 = CapstoneStage::create(['school_id' => $this->school->id, 'name' => 'Capstone 2', 'year_level' => 3, 'term_no' => 1]);
        $this->group = Group::create(['group_name' => 'G1', 'school_id' => $this->school->id, 'section' => 'BSIT 2-A', 'academic_term_id' => $t2->id, 'start_year_level' => 2, 'instructor_id' => $this->padios->id]);
        $this->project = Project::create(['title' => 'P', 'school_id' => $this->school->id, 'group_id' => $this->group->id, 'status' => 'ongoing']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function assign(array $byStage)
    {
        Sanctum::actingAs($this->admin);
        return $this->putJson("/api/groups/{$this->group->id}/stage-instructors", [
            'assignments' => collect($byStage)->map(fn ($u, $stageId) => ['capstone_stage_id' => $stageId, 'user_id' => $u?->id])->values()->all(),
        ]);
    }

    private function currentInstructorAt(string $date): ?string
    {
        Carbon::setTestNow($date . ' 12:00:00');
        Sanctum::actingAs($this->admin);
        return collect($this->getJson('/api/groups')->json())->firstWhere('id', $this->group->id)['current_instructor']['name'] ?? null;
    }

    public function test_the_current_stages_instructor_is_the_groups_instructor(): void
    {
        $this->assign([$this->cap1->id => $this->padios, $this->cap2->id => $this->jerson])->assertOk()->assertJsonCount(2, 'stage_instructors');

        $this->assertSame('Padios', $this->currentInstructorAt('2026-12-01'));          // Capstone 1
        $this->assertSame($this->padios->id, $this->project->fresh()->instructor_id);

        $this->assertSame('Jerson', $this->currentInstructorAt('2027-07-01'));          // Capstone 2, automatically
        $this->assertSame($this->jerson->id, $this->project->fresh()->instructor_id);
    }

    public function test_both_stage_instructors_can_open_the_groups_project(): void
    {
        $this->assign([$this->cap1->id => $this->padios, $this->cap2->id => $this->jerson])->assertOk();
        Carbon::setTestNow('2027-07-01 12:00:00');
        $this->jerson->syncHandledSections(['BSIT 9-Z']); // scoped to an unrelated section

        $this->assertTrue(AuthorizesDocumentAccess::userCanAccessProject($this->jerson->fresh(), $this->project->id));
        $this->assertTrue(AuthorizesDocumentAccess::userCanAccessProject($this->padios->fresh(), $this->project->id), 'Capstone 1 instructor keeps access to the history');
    }

    public function test_unassigned_stage_falls_back_to_the_section_instructor(): void
    {
        $sectionInstructor = User::factory()->role('instructor')->school($this->school->id)->create(['name' => 'Section Person']);
        $sectionInstructor->syncHandledSections(['BSIT 2-A']);
        $this->assign([$this->cap1->id => $this->padios])->assertOk();

        $this->assertSame('Section Person', $this->currentInstructorAt('2027-07-01')); // Capstone 2 not assigned
    }

    public function test_only_instructors_can_be_assigned_and_only_by_staff(): void
    {
        $panelist = User::factory()->role('panelist')->school($this->school->id)->create();
        Sanctum::actingAs($this->admin);
        $this->putJson("/api/groups/{$this->group->id}/stage-instructors", ['assignments' => [['capstone_stage_id' => $this->cap1->id, 'user_id' => $panelist->id]]])
            ->assertStatus(422);

        $student = User::factory()->role('student')->school($this->school->id)->create();
        Sanctum::actingAs($student);
        $this->putJson("/api/groups/{$this->group->id}/stage-instructors", ['assignments' => [['capstone_stage_id' => $this->cap1->id, 'user_id' => $this->padios->id]]])
            ->assertStatus(403);
    }

    public function test_clearing_a_stage(): void
    {
        $this->assign([$this->cap1->id => $this->padios])->assertOk();
        $this->assign([$this->cap1->id => null])->assertOk()->assertJsonCount(0, 'stage_instructors');
    }
}
