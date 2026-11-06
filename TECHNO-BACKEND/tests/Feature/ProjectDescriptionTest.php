<?php

namespace Tests\Feature;

use App\Models\AcademicTerm;
use App\Models\Group;
use App\Models\GroupMember;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Title proposals carry a Project Description (no abstract yet), the
// instructor/A.Y. are filled in automatically, and once a project passes
// its final defense its real abstract is what future proposals are
// compared against.
class ProjectDescriptionTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private User $student;
    private User $instructor;
    private Group $group;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(['*' => Http::response(['overall_score' => 0, 'matches' => []], 200)]);
        $this->school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $this->instructor = User::factory()->role('instructor')->school($this->school->id)->create(['name' => 'Rosebud Padios']);
        $this->instructor->syncHandledSections(['BSIT 2-A']);
        $creator = User::factory()->role('instructor')->school($this->school->id)->create();
        $this->student = User::factory()->role('student')->school($this->school->id)->create(['section' => 'BSIT 2-A']);
        $term = AcademicTerm::create(['school_id' => $this->school->id, 'academic_year' => '2026-2027', 'name' => '2nd Semester', 'start_date' => '2026-11-01', 'end_date' => '2027-03-15']);
        $this->group = Group::create(['group_name' => 'G1', 'school_id' => $this->school->id, 'section' => 'BSIT 2-A', 'batch' => '2026-2027', 'academic_term_id' => $term->id, 'instructor_id' => $creator->id]);
        GroupMember::create(['group_id' => $this->group->id, 'user_id' => $this->student->id, 'is_leader' => 1]);
    }

    private function propose(array $extra = [])
    {
        Sanctum::actingAs($this->student);
        return $this->postJson('/api/projects', array_merge([
            'title' => 'QR Attendance Monitoring', 'group_id' => $this->group->id,
            'description' => 'A web system that tracks attendance with QR codes and alerts parents.',
        ], $extra));
    }

    public function test_proposal_stores_the_description_as_the_comparison_text(): void
    {
        $p = $this->propose()->assertStatus(201)->json();
        $this->assertSame('A web system that tracks attendance with QR codes and alerts parents.', $p['description']);
        $this->assertSame($p['description'], $p['abstract']);
        $this->assertFalse($p['abstract_is_final']);
    }

    public function test_instructor_and_academic_year_are_filled_in_from_the_group(): void
    {
        $someoneElse = User::factory()->role('instructor')->school($this->school->id)->create();
        $p = $this->propose(['instructor_id' => $someoneElse->id, 'batch' => '1999-2000'])->assertStatus(201)->json();

        $this->assertSame($this->instructor->id, $p['instructor_id'], 'the instructor handling the section');
        $this->assertSame('2026-2027', $p['batch']);
    }

    public function test_old_clients_sending_abstract_still_work(): void
    {
        $p = $this->propose(['description' => null, 'abstract' => 'Old field name.'])->assertStatus(201)->json();
        $this->assertSame('Old field name.', $p['description']);
    }

    public function test_final_abstract_only_after_passing_and_replaces_the_comparison_text(): void
    {
        $id = $this->propose()->json('id');
        $abstract = str_repeat('This study developed an attendance platform using QR codes. ', 3);

        Sanctum::actingAs($this->student);
        $this->putJson("/api/projects/{$id}/final-abstract", ['abstract' => $abstract])->assertStatus(422); // not finished yet

        Project::find($id)->update(['defense_verdict' => 'passed', 'is_final_title' => true]);
        $this->putJson("/api/projects/{$id}/final-abstract", ['abstract' => 'too short'])->assertStatus(422);
        $res = $this->putJson("/api/projects/{$id}/final-abstract", ['abstract' => $abstract])->assertOk();

        $this->assertTrue($res->json('abstract_is_final'));
        $this->assertSame(trim($abstract), $res->json('abstract'));
        $this->assertSame('A web system that tracks attendance with QR codes and alerts parents.', $res->json('description'), 'description kept');

        // Editing the description later no longer touches the final abstract.
        Sanctum::actingAs($this->instructor);
        $this->putJson("/api/projects/{$id}", ['description' => 'changed'])->assertOk();
        $this->assertSame(trim($abstract), Project::find($id)->abstract);
    }

    public function test_outsiders_cannot_set_a_final_abstract(): void
    {
        $id = $this->propose()->json('id');
        Project::find($id)->update(['defense_verdict' => 'passed', 'is_final_title' => true]);
        $outsider = User::factory()->role('student')->school($this->school->id)->create();
        Sanctum::actingAs($outsider);

        $this->putJson("/api/projects/{$id}/final-abstract", ['abstract' => str_repeat('x', 60)])->assertStatus(403);
    }

    public function test_new_proposals_are_compared_against_past_final_abstracts(): void
    {
        $past = Project::create([
            'title' => 'Old QR system', 'school_id' => $this->school->id, 'status' => 'archived',
            'description' => 'old description', 'abstract' => 'THE REAL FINAL ABSTRACT', 'abstract_is_final' => true,
        ]);

        $this->propose()->assertStatus(201);

        Http::assertSent(function ($req) use ($past) {
            if (!str_ends_with($req->url(), '/check')) return false;
            $row = collect($req['archived'])->firstWhere('id', $past->id);
            return $row && $row['abstract'] === 'THE REAL FINAL ABSTRACT'
                && $req['new_project']['abstract'] === 'A web system that tracks attendance with QR codes and alerts parents.';
        });
    }
}
