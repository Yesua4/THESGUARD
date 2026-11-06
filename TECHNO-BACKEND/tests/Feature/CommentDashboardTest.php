<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\DocumentComment;
use App\Models\Group;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Phase G: comment progress per user, and "Awaiting my verification".
class CommentDashboardTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private User $adviser;
    private User $student;
    private Document $doc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $this->adviser = User::factory()->role('adviser')->school($this->school->id)->create();
        $this->student = User::factory()->role('student')->school($this->school->id)->create();
        $this->doc = $this->projectWithDoc($this->adviser, $this->student, 'Mine');
    }

    private function projectWithDoc(User $adviser, User $student, string $title, ?int $schoolId = null): Document
    {
        $schoolId ??= $this->school->id;
        $group = Group::create(['group_name' => 'G-' . $title, 'school_id' => $schoolId, 'adviser_id' => $adviser->id]);
        $project = Project::create(['title' => $title, 'school_id' => $schoolId, 'status' => 'ongoing', 'title_status' => 'approved', 'adviser_id' => $adviser->id, 'group_id' => $group->id]);
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $student->id, 'is_leader' => 1]);
        return Document::create(['project_id' => $project->id, 'uploaded_by' => $student->id, 'type' => 'chapter1', 'version' => 1, 'content' => '<p>x</p>', 'status' => 'pending']);
    }

    private function comment(Document $doc, User $author, string $status): DocumentComment
    {
        return DocumentComment::create(['document_id' => $doc->id, 'user_id' => $author->id, 'page_number' => 1, 'comment' => "c-{$status}", 'review_status' => $status, 'status' => $status === 'resolved' ? 'resolved' : 'open']);
    }

    public function test_student_sees_counts_for_their_own_project_only(): void
    {
        foreach (['open', 'open', 'in_progress', 'awaiting_verification', 'resolved'] as $s) $this->comment($this->doc, $this->adviser, $s);
        $otherStudent = User::factory()->role('student')->school($this->school->id)->create();
        $otherDoc = $this->projectWithDoc($this->adviser, $otherStudent, 'Theirs');
        $this->comment($otherDoc, $this->adviser, 'open');
        Sanctum::actingAs($this->student);

        $res = $this->getJson('/api/comment-review')->assertOk();
        $this->assertSame(5, $res->json('counts.total'));
        $this->assertSame(2, $res->json('counts.open'));
        $this->assertSame(1, $res->json('counts.resolved'));
        $this->assertSame([], $res->json('awaiting_my_verification'));
    }

    public function test_faculty_sees_corrections_awaiting_their_verification(): void
    {
        $awaiting = $this->comment($this->doc, $this->adviser, 'awaiting_verification');
        $this->comment($this->doc, $this->adviser, 'open');
        $instructor = User::factory()->role('instructor')->school($this->school->id)->create();
        $this->doc->project->update(['instructor_id' => $instructor->id]);
        $byInstructor = $this->comment($this->doc, $instructor, 'awaiting_verification');
        Sanctum::actingAs($this->adviser);

        $mine = collect($this->getJson('/api/comment-review')->assertOk()->json('awaiting_my_verification'))->pluck('id');
        $this->assertTrue($mine->contains($awaiting->id));
        $this->assertFalse($mine->contains($byInstructor->id), "someone else's comment is theirs to verify");
    }

    public function test_other_schools_and_unassigned_projects_are_excluded(): void
    {
        $this->comment($this->doc, $this->adviser, 'open');
        $otherSchool = School::create(['name' => 'Other', 'slug' => 'other', 'email' => 'o@b.com']);
        $foreignAdviser = User::factory()->role('adviser')->school($otherSchool->id)->create();
        $foreignStudent = User::factory()->role('student')->school($otherSchool->id)->create();
        $this->comment($this->projectWithDoc($foreignAdviser, $foreignStudent, 'Foreign', $otherSchool->id), $foreignAdviser, 'open');
        $unassigned = User::factory()->role('adviser')->school($this->school->id)->create();

        Sanctum::actingAs($unassigned);
        $this->assertSame(0, $this->getJson('/api/comment-review')->assertOk()->json('counts.total'));

        Sanctum::actingAs($this->adviser);
        $this->assertSame(1, $this->getJson('/api/comment-review')->json('counts.total'));
    }
}
