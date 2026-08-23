<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Evaluation;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Regression tests for the access-control gaps found in the codebase audit:
// several mutating endpoints had no role check at all, letting any
// authenticated user reach actions that should be restricted. Each test
// here locks in the fix so the gap can't silently reopen.
class AccessControlFixesTest extends TestCase
{
    use RefreshDatabase;

    // ── AuthController: user management ─────────────────────────────

    public function test_student_cannot_promote_self_to_admin(): void
    {
        $student = User::factory()->role('student')->create();

        Sanctum::actingAs($student);
        $this->putJson("/api/users/{$student->id}", ['role' => 'admin'])
            ->assertStatus(403);

        $this->assertSame('student', $student->fresh()->role);
    }

    public function test_student_cannot_delete_another_user(): void
    {
        $student = User::factory()->role('student')->create();
        $victim  = User::factory()->role('student')->create();

        Sanctum::actingAs($student);
        $this->deleteJson("/api/users/{$victim->id}")->assertStatus(403);
        $this->assertDatabaseHas('users', ['id' => $victim->id]);
    }

    public function test_admin_can_update_any_user_role(): void
    {
        $admin  = User::factory()->role('admin')->create();
        $target = User::factory()->role('student')->create();

        Sanctum::actingAs($admin);
        $this->putJson("/api/users/{$target->id}", ['role' => 'adviser'])
            ->assertStatus(200);

        $this->assertSame('adviser', $target->fresh()->role);
    }

    public function test_instructor_can_manage_a_student_account(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        $student    = User::factory()->role('student')->create();

        Sanctum::actingAs($instructor);
        $this->putJson("/api/users/{$student->id}", ['section' => 'BSIT 3A'])
            ->assertStatus(200);

        $this->assertSame('BSIT 3A', $student->fresh()->section);
    }

    public function test_instructor_cannot_manage_an_adviser_account(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        $adviser    = User::factory()->role('adviser')->create();

        Sanctum::actingAs($instructor);
        $this->putJson("/api/users/{$adviser->id}", ['section' => 'x'])
            ->assertStatus(403);
    }

    public function test_instructor_cannot_change_a_students_role_even_via_update(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        $student    = User::factory()->role('student')->create();

        Sanctum::actingAs($instructor);
        $this->putJson("/api/users/{$student->id}", ['role' => 'admin'])
            ->assertStatus(200); // request succeeds, but role field is silently dropped

        $this->assertSame('student', $student->fresh()->role);
    }

    public function test_instructor_creating_a_user_is_always_forced_to_student_role(): void
    {
        $instructor = User::factory()->role('instructor')->create();

        Sanctum::actingAs($instructor);
        $res = $this->postJson('/api/users', [
            'name'     => 'New Person',
            'email'    => 'newperson@example.com',
            'password' => 'password1234',
            'role'     => 'admin', // attempted escalation via a hidden/forged field
        ])->assertStatus(201);

        $this->assertSame('student', $res->json('role'));
    }

    // ── ReportController ─────────────────────────────────────────────

    public function test_student_cannot_view_reports(): void
    {
        $student = User::factory()->role('student')->create();

        Sanctum::actingAs($student);
        $this->getJson('/api/reports/similarity')->assertStatus(403);
        $this->getJson('/api/reports/contributions')->assertStatus(403);
    }

    public function test_instructor_can_view_reports(): void
    {
        $instructor = User::factory()->role('instructor')->create();

        Sanctum::actingAs($instructor);
        $this->getJson('/api/reports/projects')->assertStatus(200);
    }

    // ── EvaluationController ─────────────────────────────────────────

    public function test_student_cannot_submit_an_evaluation(): void
    {
        $student = User::factory()->role('student')->create();
        $project = Project::create(['title' => 'T', 'title_status' => 'approved']);

        Sanctum::actingAs($student);
        $this->postJson('/api/evaluations', [
            'project_id'          => $project->id,
            'presentation_score'  => 90,
            'technical_score'     => 90,
            'documentation_score' => 90,
            'qa_score'            => 90,
            'recommendation'      => 'passed',
        ])->assertStatus(403);

        $this->assertDatabaseCount('evaluations', 0);
    }

    public function test_student_cannot_list_all_evaluations(): void
    {
        $student = User::factory()->role('student')->create();

        Sanctum::actingAs($student);
        $this->getJson('/api/evaluations')->assertStatus(403);
    }

    public function test_panelist_can_still_submit_and_list_their_own_evaluations(): void
    {
        $panelist = User::factory()->role('panelist')->create();
        $project  = Project::create(['title' => 'T', 'title_status' => 'approved']);

        Sanctum::actingAs($panelist);
        $this->postJson('/api/evaluations', [
            'project_id'          => $project->id,
            'presentation_score'  => 90,
            'technical_score'     => 90,
            'documentation_score' => 90,
            'qa_score'            => 90,
            'recommendation'      => 'passed',
        ])->assertStatus(201);

        $this->getJson('/api/evaluations')->assertStatus(200)->assertJsonCount(1);
    }

    // ── DocumentController::destroy ──────────────────────────────────

    private function makeProjectWithDocument(): array
    {
        $project = Project::create(['title' => 'Test Thesis', 'title_status' => 'approved']);
        $owner = User::factory()->role('student')->create();
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $owner->id, 'is_leader' => true]);

        Storage::fake('local');
        $path = UploadedFile::fake()->create('proposal.pdf', 10, 'application/pdf')
            ->store("documents/{$project->id}", 'local');

        $document = Document::create([
            'project_id'  => $project->id,
            'uploaded_by' => $owner->id,
            'type'        => 'proposal',
            'version'     => 1,
            'file_path'   => $path,
            'status'      => 'pending',
        ]);

        return [$project, $owner, $document];
    }

    public function test_stranger_cannot_delete_a_document(): void
    {
        [, , $document] = $this->makeProjectWithDocument();
        $stranger = User::factory()->role('student')->create();

        Sanctum::actingAs($stranger);
        $this->deleteJson("/api/documents/{$document->id}")->assertStatus(403);
        $this->assertDatabaseHas('documents', ['id' => $document->id]);
    }

    public function test_project_member_can_delete_their_own_document(): void
    {
        [, $owner, $document] = $this->makeProjectWithDocument();

        Sanctum::actingAs($owner);
        $this->deleteJson("/api/documents/{$document->id}")->assertStatus(200);
        $this->assertDatabaseMissing('documents', ['id' => $document->id]);
    }
}
