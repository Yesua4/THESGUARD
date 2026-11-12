<?php

namespace Tests\Feature;

use App\Models\Group;
use App\Models\Project;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Moving a section from one instructor to another moves that section's
// groups (and their projects) to the new instructor.
class SectionHandoverTest extends TestCase
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

    private function instructor(array $sections): User
    {
        $u = User::factory()->role('instructor')->school($this->school->id)->create();
        $u->syncHandledSections($sections);
        return $u->fresh();
    }

    private function group(string $section, User $instructor): array
    {
        $g = Group::create(['group_name' => 'G' . uniqid(), 'section' => $section, 'school_id' => $this->school->id, 'instructor_id' => $instructor->id]);
        $p = Project::create(['title' => 'P', 'group_id' => $g->id, 'school_id' => $this->school->id, 'instructor_id' => $instructor->id, 'status' => 'ongoing']);
        return [$g, $p];
    }

    private function setSections(User $u, array $sections): void
    {
        Sanctum::actingAs($this->admin);
        $this->putJson("/api/users/{$u->id}", ['handled_sections' => $sections])->assertOk();
    }

    public function test_remove_from_old_then_add_to_new_moves_the_groups(): void
    {
        $jerson = $this->instructor(['BSIT 4A', 'BSIT 4B']);
        $rosebud = $this->instructor(['BSIT 1-G']);
        [$molid, $project] = $this->group('BSIT 4B', $jerson);

        $this->setSections($jerson, ['BSIT 4A']);
        $this->assertSame($jerson->id, $molid->fresh()->instructor_id, 'nobody handles 4B yet, so it stays');

        $this->setSections($rosebud, ['BSIT 1-G', 'BSIT 4B']);
        $this->assertSame($rosebud->id, $molid->fresh()->instructor_id);
        $this->assertSame($rosebud->id, $project->fresh()->instructor_id);

        // Jerson no longer sees it as instructor.
        Sanctum::actingAs($jerson->fresh());
        $this->assertCount(0, $this->getJson('/api/groups')->assertOk()->json());
    }

    public function test_add_to_new_then_remove_from_old_moves_the_groups(): void
    {
        $jerson = $this->instructor(['BSIT 4A', 'BSIT 4B']);
        $rosebud = $this->instructor(['BSIT 1-G']);
        [$molid] = $this->group('BSIT 4B', $jerson);

        $this->setSections($rosebud, ['BSIT 1-G', 'BSIT 4B']);
        $this->assertSame($jerson->id, $molid->fresh()->instructor_id, 'Jerson still handles 4B (shared for now)');

        $this->setSections($jerson, ['BSIT 4A']);
        $this->assertSame($rosebud->id, $molid->fresh()->instructor_id);
    }

    public function test_a_group_without_an_instructor_goes_to_whoever_gets_the_section(): void
    {
        $rosebud = $this->instructor(['BSIT 1-G']);
        $g = Group::create(['group_name' => 'No instructor', 'section' => 'BSIT 4B', 'school_id' => $this->school->id]);

        $this->setSections($rosebud, ['BSIT 1-G', 'bsit 4b']);
        $this->assertSame($rosebud->id, $g->fresh()->instructor_id);
    }

    public function test_when_two_others_handle_the_section_the_group_is_left_alone(): void
    {
        $jerson = $this->instructor(['BSIT 4B']);
        $a = $this->instructor(['BSIT 4B']);
        $b = $this->instructor(['BSIT 4B']);
        [$molid] = $this->group('BSIT 4B', $jerson);

        $this->setSections($jerson, ['BSIT 4A']);
        $this->assertSame($jerson->id, $molid->fresh()->instructor_id, 'no single new owner, so nothing is guessed');
    }

    public function test_other_sections_and_other_schools_are_not_touched(): void
    {
        $jerson = $this->instructor(['BSIT 4A']);
        $rosebud = $this->instructor(['BSIT 1-G']);
        [$other] = $this->group('BSIT 4A', $jerson);

        $otherSchool = School::create(['name' => 'Other', 'slug' => 'other', 'email' => 'o@b.com']);
        $foreign = Group::create(['group_name' => 'Foreign', 'section' => 'BSIT 4B', 'school_id' => $otherSchool->id]);

        $this->setSections($rosebud, ['BSIT 1-G', 'BSIT 4B']);
        $this->assertSame($jerson->id, $other->fresh()->instructor_id);
        $this->assertNull($foreign->fresh()->instructor_id);
    }
}
