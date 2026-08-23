<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Group;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Round 2 of the access-control audit fixes: DocumentController::store/update,
// ProjectController::update/destroy, ScheduleController, GroupController.
class AccessControlFixesRound2Test extends TestCase
{
    use RefreshDatabase;

    // ── DocumentController::store ────────────────────────────────────

    public function test_stranger_cannot_upload_into_someone_elses_project(): void
    {
        $project = Project::create(['title' => 'T', 'title_status' => 'approved']);
        $stranger = User::factory()->role('student')->create();

        Storage::fake('local');
        Sanctum::actingAs($stranger);
        $this->postJson('/api/documents', [
            'project_id' => $project->id,
            'type'       => 'chapter1',
            'file'       => UploadedFile::fake()->create('c1.pdf', 5, 'application/pdf'),
        ])->assertStatus(403);

        $this->assertDatabaseCount('documents', 0);
    }

    public function test_panelist_cannot_upload_a_document(): void
    {
        $project  = Project::create(['title' => 'T', 'title_status' => 'approved']);
        $panelist = User::factory()->role('panelist')->create();

        Storage::fake('local');
        Sanctum::actingAs($panelist);
        $this->postJson('/api/documents', [
            'project_id' => $project->id,
            'type'       => 'chapter1',
            'file'       => UploadedFile::fake()->create('c1.pdf', 5, 'application/pdf'),
        ])->assertStatus(403);
    }

    public function test_project_member_can_upload_a_document(): void
    {
        $project = Project::create(['title' => 'T', 'title_status' => 'approved']);
        $student = User::factory()->role('student')->create();
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $student->id, 'is_leader' => true]);

        Storage::fake('local');
        Sanctum::actingAs($student);
        $this->postJson('/api/documents', [
            'project_id' => $project->id,
            'type'       => 'chapter1',
            'file'       => UploadedFile::fake()->create('c1.pdf', 5, 'application/pdf'),
        ])->assertStatus(201);
    }

    // ── DocumentController::update ───────────────────────────────────

    public function test_stranger_cannot_edit_document_metadata(): void
    {
        $project = Project::create(['title' => 'T', 'title_status' => 'approved']);
        $owner   = User::factory()->role('student')->create();
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $owner->id, 'is_leader' => true]);
        $document = Document::create([
            'project_id' => $project->id, 'uploaded_by' => $owner->id,
            'type' => 'proposal', 'version' => 1, 'status' => 'pending',
        ]);
        $stranger = User::factory()->role('student')->create();

        Sanctum::actingAs($stranger);
        $this->putJson("/api/documents/{$document->id}", ['version_note' => 'hacked'])
            ->assertStatus(403);
    }

    // ── ProjectController::update ────────────────────────────────────

    public function test_student_cannot_self_approve_title(): void
    {
        $project = Project::create(['title' => 'T', 'title_status' => 'pending']);
        $student = User::factory()->role('student')->create();
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $student->id, 'is_leader' => true]);

        Sanctum::actingAs($student);
        $this->putJson("/api/projects/{$project->id}", ['title_status' => 'approved'])
            ->assertStatus(403);

        $this->assertSame('pending', $project->fresh()->title_status);
    }

    public function test_adviser_can_approve_title(): void
    {
        $project = Project::create(['title' => 'T', 'title_status' => 'pending']);
        $adviser = User::factory()->role('adviser')->create();

        Sanctum::actingAs($adviser);
        $this->putJson("/api/projects/{$project->id}", ['title_status' => 'approved'])
            ->assertStatus(200);

        $this->assertSame('approved', $project->fresh()->title_status);
    }

    public function test_member_can_edit_their_own_pending_proposal(): void
    {
        $project = Project::create(['title' => 'Old Title', 'title_status' => 'pending']);
        $student = User::factory()->role('student')->create();
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $student->id, 'is_leader' => true]);

        Sanctum::actingAs($student);
        $this->putJson("/api/projects/{$project->id}", ['title' => 'New Title'])
            ->assertStatus(200);

        $this->assertSame('New Title', $project->fresh()->title);
    }

    public function test_member_cannot_edit_proposal_once_approved(): void
    {
        $project = Project::create(['title' => 'Old Title', 'title_status' => 'approved']);
        $student = User::factory()->role('student')->create();
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $student->id, 'is_leader' => true]);

        Sanctum::actingAs($student);
        $this->putJson("/api/projects/{$project->id}", ['title' => 'New Title'])
            ->assertStatus(403);
    }

    public function test_non_member_cannot_edit_a_project(): void
    {
        $project  = Project::create(['title' => 'T', 'title_status' => 'pending']);
        $stranger = User::factory()->role('student')->create();

        Sanctum::actingAs($stranger);
        $this->putJson("/api/projects/{$project->id}", ['title' => 'Hacked'])
            ->assertStatus(403);
    }

    // ── ProjectController::destroy ───────────────────────────────────

    public function test_member_can_withdraw_own_pending_proposal(): void
    {
        $project = Project::create(['title' => 'T', 'title_status' => 'pending']);
        $student = User::factory()->role('student')->create();
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $student->id, 'is_leader' => true]);

        Sanctum::actingAs($student);
        $this->deleteJson("/api/projects/{$project->id}")->assertStatus(200);
        $this->assertDatabaseMissing('projects', ['id' => $project->id]);
    }

    public function test_member_cannot_withdraw_after_title_approved(): void
    {
        $project = Project::create(['title' => 'T', 'title_status' => 'approved']);
        $student = User::factory()->role('student')->create();
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $student->id, 'is_leader' => true]);

        Sanctum::actingAs($student);
        $this->deleteJson("/api/projects/{$project->id}")->assertStatus(403);
    }

    public function test_stranger_cannot_delete_any_project(): void
    {
        $project  = Project::create(['title' => 'T', 'title_status' => 'pending']);
        $stranger = User::factory()->role('student')->create();

        Sanctum::actingAs($stranger);
        $this->deleteJson("/api/projects/{$project->id}")->assertStatus(403);
    }

    public function test_admin_can_delete_any_project(): void
    {
        $project = Project::create(['title' => 'T', 'title_status' => 'approved']);
        $admin   = User::factory()->role('admin')->create();

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/projects/{$project->id}")->assertStatus(200);
    }

    // ── ScheduleController ────────────────────────────────────────────

    public function test_student_cannot_create_a_defense_schedule(): void
    {
        $group   = Group::create(['group_name' => 'G1']);
        $student = User::factory()->role('student')->create();

        Sanctum::actingAs($student);
        $this->postJson('/api/schedules', [
            'group_id' => $group->id, 'defense_date' => '2026-01-01', 'defense_time' => '10:00',
        ])->assertStatus(403);
    }

    public function test_adviser_can_create_a_defense_schedule(): void
    {
        $group   = Group::create(['group_name' => 'G1']);
        $adviser = User::factory()->role('adviser')->create();

        Sanctum::actingAs($adviser);
        $this->postJson('/api/schedules', [
            'group_id' => $group->id, 'defense_date' => '2026-01-01', 'defense_time' => '10:00',
        ])->assertStatus(201);
    }

    // ── GroupController ───────────────────────────────────────────────

    public function test_student_cannot_create_a_group(): void
    {
        $leader = User::factory()->role('student')->create();

        Sanctum::actingAs($leader);
        $this->postJson('/api/groups', [
            'group_name' => 'Sneaky Group',
            'members'    => [$leader->id],
            'leader_id'  => $leader->id,
        ])->assertStatus(403);
    }

    public function test_instructor_can_create_a_group(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        $leader     = User::factory()->role('student')->create();

        Sanctum::actingAs($instructor);
        $this->postJson('/api/groups', [
            'group_name' => 'Real Group',
            'members'    => [$leader->id],
            'leader_id'  => $leader->id,
        ])->assertStatus(201);
    }

    public function test_student_cannot_delete_a_group(): void
    {
        $group   = Group::create(['group_name' => 'G1']);
        $student = User::factory()->role('student')->create();

        Sanctum::actingAs($student);
        $this->deleteJson("/api/groups/{$group->id}")->assertStatus(403);
        $this->assertDatabaseHas('groups', ['id' => $group->id]);
    }
}
