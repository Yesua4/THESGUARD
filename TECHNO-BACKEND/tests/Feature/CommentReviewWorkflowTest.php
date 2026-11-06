<?php

namespace Tests\Feature;

use App\Models\DefenseSchedule;
use App\Models\Document;
use App\Models\DocumentComment;
use App\Models\DocumentCommentAttempt;
use App\Models\Group;
use App\Models\GroupMember;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Phases B-D: replies, student corrections tied to a real saved revision,
// and verification by the original commenter (or the group adviser).
// Mirrors the spec's scenarios A-H.
class CommentReviewWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private Project $project;
    private User $adviser;
    private User $student;
    private Document $v1;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $this->adviser = User::factory()->role('adviser')->school($this->school->id)->create(['name' => 'Maria Santos']);
        $this->student = User::factory()->role('student')->school($this->school->id)->create(['name' => 'Joshua Molid']);
        $group = Group::create(['group_name' => 'G1', 'school_id' => $this->school->id, 'adviser_id' => $this->adviser->id]);
        GroupMember::create(['group_id' => $group->id, 'user_id' => $this->student->id, 'is_leader' => 1]);
        $this->project = Project::create([
            'title' => 'ThesisGuard', 'school_id' => $this->school->id, 'status' => 'ongoing',
            'title_status' => 'approved', 'adviser_id' => $this->adviser->id, 'group_id' => $group->id,
        ]);
        ProjectMember::create(['project_id' => $this->project->id, 'user_id' => $this->student->id, 'is_leader' => 1]);
        $this->v1 = $this->version(1);
    }

    private function version(int $v): Document
    {
        return Document::create([
            'project_id' => $this->project->id, 'uploaded_by' => $this->student->id, 'type' => 'chapter1',
            'version' => $v, 'content' => "<p data-block-id=\"b1\">v{$v}</p>", 'status' => 'pending',
        ]);
    }

    private function url(DocumentComment $c, string $action = ''): string
    {
        return "/api/documents/{$c->document_id}/comments/{$c->id}" . ($action ? "/{$action}" : '');
    }

    private function adviserComments(): DocumentComment
    {
        Sanctum::actingAs($this->adviser);
        $id = $this->postJson("/api/documents/{$this->v1->id}/comments", [
            'page_number' => 1, 'selected_text' => 'The system improves research monitoring.',
            'anchor' => ['v' => 2, 'kind' => 'html', 'block_id' => 'b1', 'quote' => ['exact' => 'The system improves research monitoring.']],
            'comment' => 'Explain the specific monitoring features of ThesisGuard.',
        ])->assertStatus(201)->json('id');
        return DocumentComment::find($id);
    }

    private function lock(DocumentComment $c): int
    {
        return (int) $c->fresh()->lock_version;
    }

    // A: adviser comments -> saved, open, students notified with a deep link
    public function test_a_adviser_comment_is_saved_open_and_students_are_notified(): void
    {
        $c = $this->adviserComments();

        $this->assertSame('open', $c->review_status);
        $n = Notification::where('user_id', $this->student->id)->latest('id')->first();
        $this->assertSame($c->id, $n->comment_id);
        $this->assertSame($this->v1->id, $n->document_id);
    }

    public function test_students_cannot_open_top_level_comments(): void
    {
        Sanctum::actingAs($this->student);
        $this->postJson("/api/documents/{$this->v1->id}/comments", ['page_number' => 1, 'comment' => 'x'])->assertStatus(403);
    }

    // B: student sees it, with what they may do; viewing is recorded
    public function test_b_student_sees_the_comment_and_their_actions(): void
    {
        $c = $this->adviserComments();
        Sanctum::actingAs($this->student);

        $row = collect($this->getJson("/api/documents/{$this->v1->id}/comments")->assertOk()->json())->firstWhere('id', $c->id);
        $this->assertSame('Needs revision', $row['review_label']);
        $this->assertTrue($row['can']['start'] && $row['can']['submit'] && $row['can']['reply']);
        $this->assertFalse($row['can']['verify'] || $row['can']['resolve']);
        $this->assertSame($this->adviser->id, $row['verifier']['id']);
        $this->assertDatabaseHas('document_comment_events', ['comment_id' => $c->id, 'user_id' => $this->student->id, 'type' => 'viewed']);
    }

    public function test_replies_form_a_thread_and_notify_the_other_side(): void
    {
        $c = $this->adviserComments();
        Sanctum::actingAs($this->student);
        $this->postJson($this->url($c, 'replies'), ['body' => 'Should I add a table of features?'])->assertStatus(201);
        Sanctum::actingAs($this->adviser);
        $this->postJson($this->url($c, 'replies'), ['body' => 'A short paragraph is enough.'])->assertStatus(201);

        $thread = $this->getJson($this->url($c))->assertOk()->json('replies');
        $this->assertSame(['Should I add a table of features?', 'A short paragraph is enough.'], array_column($thread, 'body'));
        $this->assertTrue(Notification::where('user_id', $this->adviser->id)->where('comment_id', $c->id)->exists());
    }

    // C: student starts, edits (new saved version), submits -> awaiting, adviser notified
    public function test_c_student_submits_a_correction_against_a_new_version(): void
    {
        $c = $this->adviserComments();
        Sanctum::actingAs($this->student);
        $this->postJson($this->url($c, 'start'), ['lock_version' => $this->lock($c)])->assertOk()->assertJsonPath('review_status', 'in_progress');

        $v2 = $this->version(2);
        $this->postJson($this->url($c, 'submit'), [
            'lock_version' => $this->lock($c), 'revision_document_id' => $v2->id,
            'explanation' => 'I revised the paragraph and listed the monitoring features.',
        ])->assertOk()->assertJsonPath('review_status', 'awaiting_verification');

        $n = Notification::where('user_id', $this->adviser->id)->latest('id')->first();
        $this->assertStringContainsString('Joshua Molid has submitted a revision addressing your comment in Chapter 1', $n->message);
        $this->assertSame($c->id, $n->comment_id);
    }

    public function test_a_reply_alone_is_not_a_revision(): void
    {
        $c = $this->adviserComments();
        Sanctum::actingAs($this->student);

        // Same version the comment was made on -> refused.
        $this->postJson($this->url($c, 'submit'), [
            'lock_version' => $this->lock($c), 'revision_document_id' => $this->v1->id, 'explanation' => 'I fixed it already, trust me.',
        ])->assertStatus(422)->assertJsonValidationErrors('revision_document_id');
        // No explanation -> refused.
        $v2 = $this->version(2);
        $this->postJson($this->url($c, 'submit'), ['lock_version' => $this->lock($c), 'revision_document_id' => $v2->id, 'explanation' => 'done'])
            ->assertStatus(422)->assertJsonValidationErrors('explanation');
        $this->assertSame('open', $c->fresh()->review_status);
    }

    // D/E/F/G: reject -> reopened (history kept), resubmit needs a NEWER version, approve -> resolved
    public function test_d_to_g_reject_resubmit_approve_keeps_full_history(): void
    {
        $c = $this->adviserComments();
        $v2 = $this->version(2);
        Sanctum::actingAs($this->student);
        $this->postJson($this->url($c, 'submit'), ['lock_version' => $this->lock($c), 'revision_document_id' => $v2->id, 'explanation' => 'Added the features list.'])->assertOk();

        Sanctum::actingAs($this->adviser);
        $this->postJson($this->url($c, 'verify'), ['lock_version' => $this->lock($c), 'decision' => 'reject'])
            ->assertStatus(422)->assertJsonValidationErrors('note'); // must explain
        $this->postJson($this->url($c, 'verify'), ['lock_version' => $this->lock($c), 'decision' => 'reject', 'note' => 'Also mention defense scheduling.'])
            ->assertOk()->assertJsonPath('review_status', 'reopened');
        $this->assertTrue(Notification::where('user_id', $this->student->id)->where('title', 'like', '%Further revision%')->exists());

        Sanctum::actingAs($this->student);
        // Resubmitting the same v2 is refused -- a new saved revision is required.
        $this->postJson($this->url($c, 'submit'), ['lock_version' => $this->lock($c), 'revision_document_id' => $v2->id, 'explanation' => 'Resubmitting the same file.'])
            ->assertStatus(422);
        $v3 = $this->version(3);
        $this->postJson($this->url($c, 'submit'), ['lock_version' => $this->lock($c), 'revision_document_id' => $v3->id, 'explanation' => 'Added defense scheduling too.'])->assertOk();

        Sanctum::actingAs($this->adviser);
        $this->postJson($this->url($c, 'verify'), ['lock_version' => $this->lock($c), 'decision' => 'approve'])
            ->assertOk()->assertJsonPath('review_status', 'resolved')->assertJsonPath('resolved_by', $this->adviser->id);

        $attempts = DocumentCommentAttempt::where('comment_id', $c->id)->orderBy('attempt_no')->get();
        $this->assertSame(['rejected', 'approved'], $attempts->pluck('decision')->all());
        $this->assertSame('Also mention defense scheduling.', $attempts[0]->decision_note);
        $this->assertSame([$v2->id, $v3->id], $attempts->pluck('revision_document_id')->all());

        $types = collect($this->getJson($this->url($c))->json('events'))->pluck('type')->all();
        $this->assertSame(['created', 'revision_submitted', 'revision_requested', 'revision_submitted', 'approved'],
            array_values(array_filter($types, fn ($t) => $t !== 'viewed')));
        $this->assertSame('resolved', $c->fresh()->status, 'legacy status kept in sync');
    }

    // H: unauthorized users
    public function test_h_students_cannot_verify_or_resolve(): void
    {
        $c = $this->adviserComments();
        $v2 = $this->version(2);
        Sanctum::actingAs($this->student);
        $this->postJson($this->url($c, 'submit'), ['lock_version' => $this->lock($c), 'revision_document_id' => $v2->id, 'explanation' => 'Added the features list.'])->assertOk();

        $this->postJson($this->url($c, 'verify'), ['lock_version' => $this->lock($c), 'decision' => 'approve'])->assertStatus(403);
        $this->putJson($this->url($c, 'resolve'), ['status' => 'resolved'])->assertStatus(403);
        $this->assertSame('awaiting_verification', $c->fresh()->review_status);
    }

    public function test_h_another_faculty_member_cannot_verify_someone_elses_comment(): void
    {
        $c = $this->adviserComments();
        $v2 = $this->version(2);
        Sanctum::actingAs($this->student);
        $this->postJson($this->url($c, 'submit'), ['lock_version' => $this->lock($c), 'revision_document_id' => $v2->id, 'explanation' => 'Added the features list.'])->assertOk();

        $instructor = User::factory()->role('instructor')->school($this->school->id)->create();
        $this->project->update(['instructor_id' => $instructor->id]);
        Sanctum::actingAs($instructor);
        $this->postJson($this->url($c, 'verify'), ['lock_version' => $this->lock($c), 'decision' => 'approve'])->assertStatus(403);
    }

    public function test_h_admin_monitors_but_cannot_resolve(): void
    {
        $c = $this->adviserComments();
        $admin = User::factory()->role('admin')->school($this->school->id)->create();
        Sanctum::actingAs($admin);

        $this->getJson($this->url($c))->assertOk(); // can read the full history
        $this->putJson($this->url($c, 'resolve'), ['status' => 'resolved'])->assertStatus(403);
    }

    public function test_h_outsider_cannot_read_or_touch_the_comment(): void
    {
        $c = $this->adviserComments();
        $outsider = User::factory()->role('adviser')->school($this->school->id)->create();
        Sanctum::actingAs($outsider);

        $this->getJson($this->url($c))->assertStatus(403);
        $this->postJson($this->url($c, 'replies'), ['body' => 'hi'])->assertStatus(403);
    }

    public function test_comment_ids_cannot_be_mixed_across_documents(): void
    {
        $c = $this->adviserComments();
        $other = $this->version(2);
        Sanctum::actingAs($this->adviser);
        $this->getJson("/api/documents/{$other->id}/comments/{$c->id}")->assertStatus(404);
    }

    public function test_concurrent_status_change_is_refused_not_overwritten(): void
    {
        $c = $this->adviserComments();
        $stale = $this->lock($c);
        Sanctum::actingAs($this->student);
        $this->postJson($this->url($c, 'start'), ['lock_version' => $stale])->assertOk();
        // A second request still holding the old lock_version:
        $v2 = $this->version(2);
        $this->postJson($this->url($c, 'submit'), ['lock_version' => $stale, 'revision_document_id' => $v2->id, 'explanation' => 'Added the features list.'])
            ->assertStatus(409)->assertJsonPath('code', 'comment_conflict');
        $this->assertSame(0, DocumentCommentAttempt::where('comment_id', $c->id)->count(), 'rolled back');
    }

    public function test_adviser_verifies_on_behalf_of_a_panelist_no_longer_assigned(): void
    {
        $panelist = User::factory()->role('panelist')->school($this->school->id)->create(['name' => 'Dr. Panel']);
        $schedule = DefenseSchedule::create(['project_id' => $this->project->id, 'group_id' => $this->project->group_id, 'adviser_id' => $this->adviser->id, 'defense_date' => '2026-11-20', 'defense_time' => '09:00', 'venue' => 'Lab', 'panelists' => 'Dr. Panel', 'status' => 'scheduled']);
        Sanctum::actingAs($panelist);
        $id = $this->postJson("/api/documents/{$this->v1->id}/comments", ['page_number' => 1, 'comment' => 'Clarify scope.'])->assertStatus(201)->json('id');
        $c = DocumentComment::find($id);

        $v2 = $this->version(2);
        Sanctum::actingAs($this->student);
        $this->postJson($this->url($c, 'submit'), ['lock_version' => $this->lock($c), 'revision_document_id' => $v2->id, 'explanation' => 'Clarified the scope section.'])->assertOk();

        $schedule->update(['panelists' => 'Someone Else']); // panelist leaves the panel
        Sanctum::actingAs($this->adviser);
        $this->postJson($this->url($c, 'verify'), ['lock_version' => $this->lock($c), 'decision' => 'approve'])
            ->assertOk()->assertJsonPath('verified_on_behalf_of', $panelist->id);
    }

    public function test_comment_with_history_cannot_be_deleted(): void
    {
        $c = $this->adviserComments();
        Sanctum::actingAs($this->student);
        $this->postJson($this->url($c, 'replies'), ['body' => 'Noted.'])->assertStatus(201);
        Sanctum::actingAs($this->adviser);
        $this->deleteJson($this->url($c))->assertStatus(403);
        $this->assertNotNull($c->fresh());
    }

    public function test_verifier_can_reopen_a_resolved_comment_with_a_reason(): void
    {
        $c = $this->adviserComments();
        Sanctum::actingAs($this->adviser);
        $this->putJson($this->url($c, 'resolve'), ['status' => 'resolved'])->assertOk();
        $this->postJson($this->url($c, 'reopen'), ['lock_version' => $this->lock($c)])->assertStatus(422);
        $this->postJson($this->url($c, 'reopen'), ['lock_version' => $this->lock($c), 'note' => 'Saw a new issue here.'])
            ->assertOk()->assertJsonPath('review_status', 'reopened');
    }
}
