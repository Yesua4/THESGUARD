<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\DocumentComment;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Phase A: comments remember the text they're on (quote + context + block id)
// and unresolved comments follow the chapter into newer versions without
// being moved off the version they were made on.
class CommentAnchoringTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private Project $project;
    private User $adviser;
    private User $student;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $this->adviser = User::factory()->role('adviser')->school($this->school->id)->create();
        $this->student = User::factory()->role('student')->school($this->school->id)->create();
        $this->project = Project::create([
            'title' => 'P', 'school_id' => $this->school->id, 'status' => 'ongoing',
            'title_status' => 'approved', 'adviser_id' => $this->adviser->id,
        ]);
        ProjectMember::create(['project_id' => $this->project->id, 'user_id' => $this->student->id, 'is_leader' => 1]);
    }

    private function version(int $v, string $type = 'chapter1'): Document
    {
        return Document::create([
            'project_id' => $this->project->id, 'uploaded_by' => $this->student->id, 'type' => $type,
            'version' => $v, 'content' => "<p data-block-id=\"b1\">Version {$v} text.</p>", 'status' => 'pending',
        ]);
    }

    private function htmlAnchor(): array
    {
        return [
            'v' => 2, 'kind' => 'html', 'block_id' => 'b1', 'start' => 4, 'end' => 32,
            'quote' => ['exact' => 'system improves research monitoring', 'prefix' => 'The ', 'suffix' => '.'],
        ];
    }

    public function test_adviser_can_comment_on_a_draft_with_a_text_anchor(): void
    {
        $v1 = $this->version(1);
        Sanctum::actingAs($this->adviser);

        $res = $this->postJson("/api/documents/{$v1->id}/comments", [
            'page_number' => 1, 'selected_text' => 'system improves research monitoring',
            'anchor' => $this->htmlAnchor(), 'comment' => 'Explain the specific monitoring features.',
        ])->assertStatus(201);

        $this->assertSame('b1', $res->json('anchor.block_id'));
        $this->assertSame('system improves research monitoring', $res->json('anchor.quote.exact'));
    }

    public function test_legacy_rectangle_anchors_are_still_accepted(): void
    {
        $v1 = $this->version(1);
        Sanctum::actingAs($this->adviser);

        $this->postJson("/api/documents/{$v1->id}/comments", [
            'page_number' => 2, 'anchor' => [['x' => 0.1, 'y' => 0.2, 'width' => 0.3, 'height' => 0.02]], 'comment' => 'Old style',
        ])->assertStatus(201);
    }

    // Every part of the anchor must be stored, not just the quote: without the
    // boxes and offsets the highlight can't be drawn where the text is.
    public function test_the_whole_anchor_is_saved_not_just_the_quote(): void
    {
        $v1 = $this->version(1);
        Sanctum::actingAs($this->adviser);
        $rects = [['x' => 0.1, 'y' => 0.4, 'width' => 0.5, 'height' => 0.02], ['x' => 0.1, 'y' => 0.42, 'width' => 0.2, 'height' => 0.02]];

        $pdf = $this->postJson("/api/documents/{$v1->id}/comments", [
            'page_number' => 1, 'selected_text' => 'GPS-based location services', 'comment' => 'Which library?',
            'anchor' => ['v' => 2, 'kind' => 'pdf', 'rects' => $rects, 'start' => 120, 'end' => 147,
                'quote' => ['exact' => 'GPS-based location services', 'prefix' => 'Utilize ', 'suffix' => ' to']],
        ])->assertStatus(201)->json('id');
        $saved = DocumentComment::find($pdf)->anchor;
        $this->assertSame(2, $saved['v']);
        $this->assertSame(120, $saved['start']);
        $this->assertSame(147, $saved['end']);
        $this->assertCount(2, $saved['rects']);
        $this->assertEquals(0.4, $saved['rects'][0]['y']);

        $html = $this->postJson("/api/documents/{$v1->id}/comments", [
            'page_number' => 1, 'comment' => 'x', 'anchor' => $this->htmlAnchor(),
        ])->assertStatus(201)->json('id');
        $this->assertSame(4, DocumentComment::find($html)->anchor['start']);
        $this->assertSame(32, DocumentComment::find($html)->anchor['end']);

        $point = $this->postJson("/api/documents/{$v1->id}/comments", [
            'page_number' => 1, 'comment' => 'Pinned here', 'anchor' => ['x' => 0.25, 'y' => 0.75],
        ])->assertStatus(201)->json('id');
        $this->assertEquals(['x' => 0.25, 'y' => 0.75], DocumentComment::find($point)->anchor);

        $legacy = $this->postJson("/api/documents/{$v1->id}/comments", [
            'page_number' => 1, 'comment' => 'Old style', 'anchor' => $rects,
        ])->assertStatus(201)->json('id');
        $this->assertCount(2, DocumentComment::find($legacy)->anchor);
    }

    public function test_bad_or_oversized_anchors_are_rejected(): void
    {
        $v1 = $this->version(1);
        Sanctum::actingAs($this->adviser);

        $this->postJson("/api/documents/{$v1->id}/comments", ['page_number' => 1, 'anchor' => ['kind' => 'video'], 'comment' => 'x'])
            ->assertStatus(422);
        $this->postJson("/api/documents/{$v1->id}/comments", [
            'page_number' => 1, 'comment' => 'x',
            'anchor' => ['kind' => 'pdf', 'rects' => array_fill(0, 2000, ['x' => 0.123456, 'y' => 0.123456, 'width' => 0.1, 'height' => 0.1])],
        ])->assertStatus(422);
    }

    public function test_unresolved_comments_from_earlier_versions_follow_the_chapter(): void
    {
        $v1 = $this->version(1);
        $v2 = $this->version(2);
        $chapter2 = $this->version(1, 'chapter2');
        $open = DocumentComment::create(['document_id' => $v1->id, 'user_id' => $this->adviser->id, 'page_number' => 1, 'comment' => 'Open on v1', 'anchor' => $this->htmlAnchor()]);
        DocumentComment::create(['document_id' => $v1->id, 'user_id' => $this->adviser->id, 'page_number' => 1, 'comment' => 'Resolved on v1', 'status' => 'resolved']);
        DocumentComment::create(['document_id' => $chapter2->id, 'user_id' => $this->adviser->id, 'page_number' => 1, 'comment' => 'Other chapter']);
        $own = DocumentComment::create(['document_id' => $v2->id, 'user_id' => $this->adviser->id, 'page_number' => 1, 'comment' => 'On v2']);
        Sanctum::actingAs($this->student);

        $list = collect($this->getJson("/api/documents/{$v2->id}/comments")->assertOk()->json())->keyBy('id');

        $this->assertEqualsCanonicalizing([$open->id, $own->id], $list->keys()->all());
        $this->assertTrue($list[$open->id]['carried']);
        $this->assertSame(1, $list[$open->id]['origin_version']);
        $this->assertSame($v1->id, $list[$open->id]['document_id'], 'never moved off the version it was made on');
        $this->assertFalse($list[$own->id]['carried']);
    }

    public function test_earlier_versions_do_not_show_comments_from_later_ones(): void
    {
        $v1 = $this->version(1);
        $v2 = $this->version(2);
        DocumentComment::create(['document_id' => $v2->id, 'user_id' => $this->adviser->id, 'page_number' => 1, 'comment' => 'On v2']);
        Sanctum::actingAs($this->adviser);

        $this->getJson("/api/documents/{$v1->id}/comments")->assertOk()->assertJsonCount(0);
    }

    public function test_outsiders_cannot_read_or_add_comments(): void
    {
        $v1 = $this->version(1);
        $outsider = User::factory()->role('adviser')->school($this->school->id)->create();
        Sanctum::actingAs($outsider);

        $this->getJson("/api/documents/{$v1->id}/comments")->assertStatus(403);
        $this->postJson("/api/documents/{$v1->id}/comments", ['page_number' => 1, 'comment' => 'x', 'anchor' => $this->htmlAnchor()])->assertStatus(403);
    }

    public function test_draft_block_ids_survive_saving(): void
    {
        Sanctum::actingAs($this->student);
        $this->postJson('/api/documents/save-draft', [
            'project_id' => $this->project->id, 'type' => 'chapter3',
            'content' => '<p data-block-id="b7x">Para</p><h2 data-block-id="b8y">Head</h2>',
        ])->assertSuccessful();

        $html = Document::where('type', 'chapter3')->value('content');
        $this->assertStringContainsString('data-block-id="b7x"', $html);
        $this->assertStringContainsString('data-block-id="b8y"', $html);
    }
}
