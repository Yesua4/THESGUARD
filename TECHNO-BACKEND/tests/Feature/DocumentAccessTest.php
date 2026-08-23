<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DocumentAccessTest extends TestCase
{
    use RefreshDatabase;

    private function makeProjectWithDocument(): array
    {
        $project = Project::create(['title' => 'Test Thesis', 'title_status' => 'approved']);
        $owner = User::factory()->role('student')->create();
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $owner->id, 'is_leader' => true]);

        Storage::fake('local');
        $path = UploadedFile::fake()->create('proposal.pdf', 10, 'application/pdf')
            ->store("documents/{$project->id}", 'local');

        $document = Document::create([
            'project_id' => $project->id,
            'uploaded_by' => $owner->id,
            'type' => 'proposal',
            'version' => 1,
            'file_path' => $path,
            'status' => 'pending',
        ]);

        return [$project, $owner, $document];
    }

    public function test_unauthenticated_request_gets_401(): void
    {
        [, , $document] = $this->makeProjectWithDocument();

        $this->getJson("/api/documents/{$document->id}/file")->assertStatus(401);
    }

    public function test_user_not_on_project_gets_403(): void
    {
        [, , $document] = $this->makeProjectWithDocument();
        $stranger = User::factory()->role('student')->create();

        Sanctum::actingAs($stranger);
        $this->getJson("/api/documents/{$document->id}/file")->assertStatus(403);
    }

    public function test_project_member_can_fetch_their_own_document(): void
    {
        [, $owner, $document] = $this->makeProjectWithDocument();

        Sanctum::actingAs($owner);
        $this->getJson("/api/documents/{$document->id}/file")
            ->assertStatus(200)
            ->assertHeader('content-type', 'application/pdf');
    }

    public function test_admin_can_fetch_any_document(): void
    {
        [, , $document] = $this->makeProjectWithDocument();
        $admin = User::factory()->role('admin')->create();

        Sanctum::actingAs($admin);
        $this->getJson("/api/documents/{$document->id}/file")->assertStatus(200);
    }

    public function test_pdf_document_is_previewable_via_preview_endpoint(): void
    {
        [, $owner, $document] = $this->makeProjectWithDocument();

        Sanctum::actingAs($owner);
        $this->getJson("/api/documents/{$document->id}/preview")
            ->assertStatus(200)
            ->assertHeader('content-type', 'application/pdf');
    }
}
