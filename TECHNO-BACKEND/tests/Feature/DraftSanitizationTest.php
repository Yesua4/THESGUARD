<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// In-app drafts are student-written HTML rendered to faculty as real HTML,
// so anything executable must be stripped before it's stored, while the
// formatting the editor produces survives.
class DraftSanitizationTest extends TestCase
{
    use RefreshDatabase;

    private function studentWithProject(): array
    {
        $school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $student = User::factory()->role('student')->school($school->id)->create();
        $project = Project::create(['title' => 'P', 'school_id' => $school->id, 'status' => 'ongoing', 'title_status' => 'approved']);
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $student->id, 'is_leader' => 1]);
        return [$student, $project];
    }

    public function test_saved_draft_has_scripts_and_handlers_removed(): void
    {
        [$student, $project] = $this->studentWithProject();
        Sanctum::actingAs($student);

        $this->postJson('/api/documents/save-draft', [
            'project_id' => $project->id,
            'type'       => 'chapter1',
            'content'    => '<p onclick="steal()">Intro</p><script>alert(localStorage.token)</script>'
                . '<img src="x" onerror="fetch(1)"><a href="javascript:alert(1)">bad</a><iframe src="https://evil"></iframe>',
        ])->assertSuccessful();

        $html = Document::where('project_id', $project->id)->latest('id')->value('content');
        $this->assertStringNotContainsString('<script', $html);
        $this->assertStringNotContainsString('onclick', $html);
        $this->assertStringNotContainsString('onerror', $html);
        $this->assertStringNotContainsString('javascript:', $html);
        $this->assertStringNotContainsString('<iframe', $html);
        $this->assertStringContainsString('Intro', $html);
    }

    public function test_editor_formatting_survives(): void
    {
        [$student, $project] = $this->studentWithProject();
        Sanctum::actingAs($student);

        $this->postJson('/api/documents/save-draft', [
            'project_id' => $project->id,
            'type'       => 'chapter1',
            'content'    => '<h1 style="text-align:center">Chapter 1</h1><p style="font-size:14px"><b>Bold</b> <i>it</i> <u>u</u></p>'
                . '<ul><li>one</li></ul><table border="1"><tr><td colspan="2">cell</td></tr></table>'
                . '<p data-page-break="true">Next page</p><a href="https://dnsc.edu.ph">site</a>',
        ])->assertSuccessful();

        $html = Document::where('project_id', $project->id)->latest('id')->value('content');
        foreach (['<h1 style="text-align:center;">', '<b>Bold</b>', '<li>one</li>', 'colspan="2"', 'data-page-break="true"', 'href="https://dnsc.edu.ph"'] as $kept) {
            $this->assertStringContainsString($kept, $html);
        }
    }
}
