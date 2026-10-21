<?php

namespace Tests\Feature;

use App\Http\Controllers\ProjectChecklistController;
use App\Models\Project;
use App\Models\ProjectChecklistItem;
use App\Models\ProjectMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProjectChecklistTest extends TestCase
{
    use RefreshDatabase;

    private User $adviser;
    private User $student;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adviser = User::factory()->role('adviser')->create();
        $this->student = User::factory()->role('student')->create();
        $this->project = Project::create(['title' => 'ThesisGuard', 'title_status' => 'approved', 'adviser_id' => $this->adviser->id]);
        ProjectMember::create(['project_id' => $this->project->id, 'user_id' => $this->student->id, 'is_leader' => true]);
    }

    private function item(string $key): ProjectChecklistItem
    {
        return ProjectChecklistItem::where('project_id', $this->project->id)->where('item_key', $key)->firstOrFail();
    }

    public function test_opening_checklists_creates_default_items_once(): void
    {
        Sanctum::actingAs($this->student);

        $first = $this->getJson("/api/projects/{$this->project->id}/checklists")->assertStatus(200);
        $this->assertCount(count(ProjectChecklistController::TEMPLATES['pre_deployment']), $first->json('pre_deployment'));
        $this->assertCount(count(ProjectChecklistController::TEMPLATES['manuscript_routing']), $first->json('manuscript_routing'));

        $this->getJson("/api/projects/{$this->project->id}/checklists");
        $this->assertSame(
            count(ProjectChecklistController::TEMPLATES['pre_deployment']) + count(ProjectChecklistController::TEMPLATES['manuscript_routing']),
            ProjectChecklistItem::where('project_id', $this->project->id)->count()
        );
    }

    public function test_items_can_only_be_signed_off_by_the_responsible_role(): void
    {
        Sanctum::actingAs($this->student);
        $this->getJson("/api/projects/{$this->project->id}/checklists");

        $this->putJson('/api/checklist-items/' . $this->item('testing_done')->id, ['is_done' => true])
            ->assertStatus(200)->assertJson(['is_done' => true, 'done_by' => $this->student->id]);
        $this->putJson('/api/checklist-items/' . $this->item('adviser_approval')->id, ['is_done' => true])
            ->assertStatus(403);

        Sanctum::actingAs($this->adviser);
        $this->putJson('/api/checklist-items/' . $this->item('adviser_approval')->id, ['is_done' => true])
            ->assertStatus(200)->assertJson(['is_done' => true]);
    }

    public function test_outsider_cannot_view_checklists(): void
    {
        Sanctum::actingAs(User::factory()->role('student')->create());
        $this->getJson("/api/projects/{$this->project->id}/checklists")->assertStatus(403);
    }

    public function test_staff_can_add_custom_item_but_students_cannot(): void
    {
        $payload = ['checklist_type' => 'manuscript_routing', 'label' => 'Statistician sign-off', 'responsible_role' => 'instructor'];

        Sanctum::actingAs($this->student);
        $this->postJson("/api/projects/{$this->project->id}/checklists", $payload)->assertStatus(403);

        Sanctum::actingAs($this->adviser);
        $this->postJson("/api/projects/{$this->project->id}/checklists", $payload)->assertStatus(201);
    }
}
