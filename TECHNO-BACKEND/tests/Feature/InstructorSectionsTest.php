<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Group;
use App\Models\Project;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// The admin assigns the sections an instructor handles (e.g. BSIT 4A/4B/4C).
// A section-scoped instructor only sees and manages students, groups and
// projects in those sections; an instructor with no sections assigned keeps
// the school-wide view.
class InstructorSectionsTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $this->admin = User::factory()->role('admin')->school($this->school->id)->create();
    }

    private function instructor(array $sections = []): User
    {
        $user = User::factory()->role('instructor')->school($this->school->id)->create();
        $user->syncHandledSections($sections);
        return $user->fresh();
    }

    private function student(string $section): User
    {
        return User::factory()->role('student')->school($this->school->id)->create(['section' => $section]);
    }

    private function groupWithProject(string $section): array
    {
        $group = Group::create(['group_name' => 'G ' . $section . uniqid(), 'section' => $section, 'school_id' => $this->school->id]);
        $project = Project::create(['title' => 'Project ' . $section, 'group_id' => $group->id, 'school_id' => $this->school->id, 'status' => 'ongoing']);
        return [$group, $project];
    }

    public function test_admin_can_assign_sections_to_an_instructor(): void
    {
        $padios = $this->instructor();
        Sanctum::actingAs($this->admin);

        $res = $this->putJson("/api/users/{$padios->id}", ['handled_sections' => ['bsit 4a', 'BSIT 4B', ' BSIT  4C ']])->assertOk();

        $this->assertSame(['BSIT 4A', 'BSIT 4B', 'BSIT 4C'], $res->json('handled_sections'));
    }

    public function test_admin_can_create_an_instructor_with_sections(): void
    {
        Sanctum::actingAs($this->admin);

        $res = $this->postJson('/api/users', [
            'name' => 'Rosebud Padios', 'email' => 'padios@example.com', 'password' => 'a-long-password-123',
            'roles' => ['instructor'], 'handled_sections' => ['BSIT 4A', 'BSIT 4B'],
        ])->assertStatus(201);

        $this->assertSame(['BSIT 4A', 'BSIT 4B'], $res->json('handled_sections'));
    }

    public function test_sections_are_dropped_when_instructor_role_is_removed(): void
    {
        $padios = $this->instructor(['BSIT 4A']);
        $padios->syncRoles(['instructor', 'panelist']);
        Sanctum::actingAs($this->admin);

        $res = $this->putJson("/api/users/{$padios->id}", ['roles' => ['panelist']])->assertOk();

        $this->assertSame([], $res->json('handled_sections'));
    }

    public function test_instructor_cannot_assign_sections(): void
    {
        $padios = $this->instructor(['BSIT 4A']);
        $other = $this->instructor();
        Sanctum::actingAs($padios);

        // Not a student account -> 403, and sections untouched.
        $this->putJson("/api/users/{$other->id}", ['handled_sections' => ['BSIT 4A']])->assertStatus(403);
        $this->assertSame([], $other->fresh()->handledSectionNames());
    }

    public function test_scoped_instructor_sees_only_students_in_their_sections(): void
    {
        $padios = $this->instructor(['BSIT 4A', 'BSIT 4B']);
        $in = $this->student('BSIT 4A');
        $out = $this->student('BSIT 4D');
        Sanctum::actingAs($padios);

        $ids = collect($this->getJson('/api/users')->assertOk()->json())->pluck('id');
        $this->assertTrue($ids->contains($in->id));
        $this->assertFalse($ids->contains($out->id));

        $ids = collect($this->getJson('/api/students')->assertOk()->json())->pluck('id');
        $this->assertTrue($ids->contains($in->id));
        $this->assertFalse($ids->contains($out->id));
    }

    public function test_unscoped_instructor_still_sees_all_students(): void
    {
        $instructor = $this->instructor();
        $a = $this->student('BSIT 4A');
        $d = $this->student('BSIT 4D');
        Sanctum::actingAs($instructor);

        $ids = collect($this->getJson('/api/users')->assertOk()->json())->pluck('id');
        $this->assertTrue($ids->contains($a->id) && $ids->contains($d->id));
    }

    public function test_scoped_instructor_can_edit_own_section_student_but_not_others(): void
    {
        $padios = $this->instructor(['BSIT 4A']);
        $in = $this->student('BSIT 4A');
        $out = $this->student('BSIT 4D');
        Sanctum::actingAs($padios);

        $this->putJson("/api/users/{$in->id}", ['name' => 'Renamed'])->assertOk();
        $this->putJson("/api/users/{$out->id}", ['name' => 'Renamed'])->assertStatus(403);
        $this->deleteJson("/api/users/{$out->id}")->assertStatus(403);
        // Nor move their own student into a section they don't handle.
        $this->putJson("/api/users/{$in->id}", ['section' => 'BSIT 4D'])->assertStatus(403);
    }

    public function test_scoped_instructor_creates_students_only_in_their_sections(): void
    {
        $padios = $this->instructor(['BSIT 4A', 'BSIT 4B']);
        Sanctum::actingAs($padios);

        $this->postJson('/api/users', [
            'name' => 'Ok', 'email' => 'ok@example.com', 'password' => 'a-long-password-123', 'role' => 'student', 'section' => 'BSIT 4B',
        ])->assertStatus(201);

        $this->postJson('/api/users', [
            'name' => 'No', 'email' => 'no@example.com', 'password' => 'a-long-password-123', 'role' => 'student', 'section' => 'BSIT 4D',
        ])->assertStatus(422);
    }

    public function test_scoped_instructor_sees_only_groups_and_projects_in_their_sections(): void
    {
        $padios = $this->instructor(['BSIT 4A']);
        [$gIn, $pIn] = $this->groupWithProject('BSIT 4A');
        [$gOut, $pOut] = $this->groupWithProject('BSIT 4D');
        Sanctum::actingAs($padios);

        $groupIds = collect($this->getJson('/api/groups')->assertOk()->json())->pluck('id');
        $this->assertTrue($groupIds->contains($gIn->id));
        $this->assertFalse($groupIds->contains($gOut->id));

        $projectIds = collect($this->getJson('/api/projects')->assertOk()->json())->pluck('id');
        $this->assertTrue($projectIds->contains($pIn->id));
        $this->assertFalse($projectIds->contains($pOut->id));
    }

    public function test_scoped_instructor_cannot_edit_or_delete_another_sections_group(): void
    {
        $padios = $this->instructor(['BSIT 4A']);
        [$gIn] = $this->groupWithProject('BSIT 4A');
        [$gOut] = $this->groupWithProject('BSIT 4D');
        Sanctum::actingAs($padios);

        $this->putJson("/api/groups/{$gIn->id}", ['batch' => '2026'])->assertOk();
        $this->putJson("/api/groups/{$gOut->id}", ['batch' => '2026'])->assertStatus(403);
        $this->deleteJson("/api/groups/{$gOut->id}")->assertStatus(403);
    }

    public function test_scoped_instructor_can_open_documents_of_their_sections_projects(): void
    {
        $padios = $this->instructor(['BSIT 4A']);
        [, $pIn] = $this->groupWithProject('BSIT 4A');
        [, $pOut] = $this->groupWithProject('BSIT 4D');

        $this->assertTrue(\App\Http\Controllers\Concerns\AuthorizesDocumentAccess::userCanAccessProject($padios, $pIn->id));
        $this->assertFalse(\App\Http\Controllers\Concerns\AuthorizesDocumentAccess::userCanAccessProject($padios, $pOut->id));
    }

    public function test_sections_do_not_limit_the_same_person_as_another_role(): void
    {
        // Rogelio is instructor (BSIT 4A) + panelist; as panelist the section
        // scope doesn't apply.
        $rogelio = $this->instructor(['BSIT 4A']);
        $rogelio->syncRoles(['instructor', 'panelist']);
        $rogelio->update(['role' => 'panelist']);

        $this->assertNull($rogelio->fresh()->sectionScope());
    }

    public function test_me_returns_handled_sections(): void
    {
        $padios = $this->instructor(['BSIT 4B', 'BSIT 4A']);
        Sanctum::actingAs($padios);

        $this->getJson('/api/me')->assertOk()->assertJsonPath('user.handled_sections', ['BSIT 4A', 'BSIT 4B']);
    }
}
