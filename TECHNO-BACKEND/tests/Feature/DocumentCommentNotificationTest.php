<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Group;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DocumentCommentNotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_commenting_on_a_document_notifies_the_adviser_with_project_and_document_ids(): void
    {
        $adviser = User::factory()->role('adviser')->create();
        $student = User::factory()->role('student')->create();
        $group = Group::create(['group_name' => 'Group 1', 'adviser_id' => $adviser->id]);
        $project = Project::create(['title' => 'Test Thesis', 'title_status' => 'approved', 'group_id' => $group->id, 'adviser_id' => $adviser->id]);
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $student->id, 'is_leader' => true]);
        $document = Document::create([
            'project_id' => $project->id,
            'uploaded_by' => $student->id,
            'type' => 'proposal',
            'version' => 1,
            'file_path' => "documents/{$project->id}/test.pdf",
            'status' => 'pending',
        ]);

        Sanctum::actingAs($student);
        $this->postJson("/api/documents/{$document->id}/comments", [
            'page_number' => 1,
            'comment' => 'Please revise the introduction.',
        ])->assertStatus(201);

        $notification = Notification::where('user_id', $adviser->id)->where('type', 'comment')->first();
        $this->assertNotNull($notification, 'Adviser should be notified when a student comments.');
        $this->assertSame($project->id, $notification->project_id);
        $this->assertSame($document->id, $notification->document_id);
        $this->assertNotNull($notification->created_at);
    }

    public function test_commenter_does_not_notify_themselves(): void
    {
        $adviser = User::factory()->role('adviser')->create();
        $student = User::factory()->role('student')->create();
        $group = Group::create(['group_name' => 'Group 1', 'adviser_id' => $adviser->id]);
        $project = Project::create(['title' => 'Test Thesis', 'title_status' => 'approved', 'group_id' => $group->id, 'adviser_id' => $adviser->id]);
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $student->id, 'is_leader' => true]);
        $document = Document::create([
            'project_id' => $project->id,
            'uploaded_by' => $student->id,
            'type' => 'proposal',
            'version' => 1,
            'file_path' => "documents/{$project->id}/test.pdf",
            'status' => 'pending',
        ]);

        Sanctum::actingAs($adviser);
        $this->postJson("/api/documents/{$document->id}/comments", [
            'page_number' => 1,
            'comment' => 'Looks good.',
        ])->assertStatus(201);

        $this->assertDatabaseMissing('notifications', ['user_id' => $adviser->id, 'type' => 'comment']);
    }
}
