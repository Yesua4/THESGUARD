<?php

namespace Tests\Feature;

use App\Models\Group;
use App\Models\Project;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Faculty who are both instructor and adviser: in instructor mode they see
// the groups they handle as instructor; their advisees show only after they
// switch to adviser mode.
class InstructorAdviseeVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private User $other;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $this->other = User::factory()->role('instructor')->school($this->school->id)->create();
    }

    private function faculty(array $roles, array $sections = []): User
    {
        $u = User::factory()->role('instructor')->school($this->school->id)->create();
        $u->syncRoles($roles);
        if ($sections) $u->syncHandledSections($sections);
        return $u->fresh();
    }

    private function group(string $name, string $section, ?int $instructor, ?int $adviser): Group
    {
        $g = Group::create(['group_name' => $name, 'section' => $section, 'school_id' => $this->school->id,
            'instructor_id' => $instructor, 'adviser_id' => $adviser]);
        Project::create(['title' => "Project $name", 'group_id' => $g->id, 'school_id' => $this->school->id,
            'instructor_id' => $instructor, 'adviser_id' => $adviser, 'status' => 'ongoing']);
        return $g;
    }

    private function groupNames(): array
    {
        return collect($this->getJson('/api/groups')->assertOk()->json())->pluck('group_name')->sort()->values()->all();
    }

    public function test_section_instructor_who_also_advises_sees_advisees_only_in_adviser_mode(): void
    {
        $me = $this->faculty(['instructor', 'adviser'], ['BSIT 1-G']);
        $this->group('Mine', 'BSIT 1-G', $me->id, null);
        $this->group('Advisee', 'BSIT 4B', $this->other->id, $me->id);

        Sanctum::actingAs($me);
        $this->assertSame(['Mine'], $this->groupNames());
        $projects = collect($this->getJson('/api/projects')->assertOk()->json())->pluck('title')->all();
        $this->assertSame(['Project Mine'], $projects);

        $this->postJson('/api/me/switch-role', ['role' => 'adviser'])->assertOk();
        Sanctum::actingAs($me->fresh());
        $this->assertSame(['Advisee'], $this->groupNames());
    }

    public function test_advisee_in_one_of_my_sections_is_still_hidden_in_instructor_mode(): void
    {
        $me = $this->faculty(['instructor', 'adviser'], ['BSIT 4B']);
        $this->group('Advisee', 'BSIT 4B', $this->other->id, $me->id);
        $this->group('Section group', 'BSIT 4B', $this->other->id, null);

        Sanctum::actingAs($me);
        $this->assertSame(['Section group'], $this->groupNames());
    }

    public function test_instructor_without_sections_sees_the_school_except_their_own_advisees(): void
    {
        $me = $this->faculty(['instructor', 'adviser']);
        $this->group('Mine', 'BSIT 1-G', $me->id, null);
        $this->group('Advisee', 'BSIT 4B', $this->other->id, $me->id);
        $this->group('Someone else', 'BSIT 3A', $this->other->id, null);

        Sanctum::actingAs($me);
        $this->assertSame(['Mine', 'Someone else'], $this->groupNames());
    }

    public function test_a_group_I_both_instruct_and_advise_shows_in_instructor_mode(): void
    {
        $me = $this->faculty(['instructor', 'adviser'], ['BSIT 1-G']);
        $this->group('Both', 'BSIT 4B', $me->id, $me->id);

        Sanctum::actingAs($me);
        $this->assertSame(['Both'], $this->groupNames());
    }

    public function test_instructor_without_the_adviser_role_still_sees_a_group_they_are_set_as_adviser_of(): void
    {
        $me = $this->faculty(['instructor'], ['BSIT 1-G']);
        $this->group('Advised', 'BSIT 4B', $this->other->id, $me->id);

        Sanctum::actingAs($me);
        $this->assertSame(['Advised'], $this->groupNames(), 'no adviser mode to switch to, so it must stay visible');
    }
}
