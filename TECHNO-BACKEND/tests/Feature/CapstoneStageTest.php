<?php

namespace Tests\Feature;

use App\Models\AcademicTerm;
use App\Models\CapstoneStage;
use App\Models\Group;
use App\Models\GroupMember;
use App\Models\School;
use App\Models\User;
use App\Services\CapstoneStageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Admin-set capstone plan; a group's stage advances by itself with the
// calendar; a group's section comes from its members.
class CapstoneStageTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private User $admin;
    private User $instructor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $this->admin = User::factory()->role('admin')->school($this->school->id)->create();
        $this->instructor = User::factory()->role('instructor')->school($this->school->id)->create();
        // Two school years, two semesters each, plus a summer in the first.
        foreach ([
            ['2026-2027', '1st Semester', '2026-06-01', '2026-10-15'],
            ['2026-2027', '2nd Semester', '2026-11-01', '2027-03-15'],
            ['2026-2027', 'Summer',       '2027-04-01', '2027-05-15'],
            ['2027-2028', '1st Semester', '2027-06-01', '2027-10-15'],
            ['2027-2028', '2nd Semester', '2027-11-01', '2028-03-15'],
        ] as [$y, $n, $s, $e]) {
            AcademicTerm::create(['school_id' => $this->school->id, 'academic_year' => $y, 'name' => $n, 'start_date' => $s, 'end_date' => $e]);
        }
        CapstoneStage::create(['school_id' => $this->school->id, 'name' => 'Capstone 1', 'year_level' => 2, 'term_no' => 2]);
        CapstoneStage::create(['school_id' => $this->school->id, 'name' => 'Capstone 2', 'year_level' => 3, 'term_no' => 1]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function students(string $section, int $n = 3)
    {
        return User::factory()->count($n)->role('student')->school($this->school->id)->create(['section' => $section]);
    }

    private function createGroup(array $memberIds): array
    {
        Sanctum::actingAs($this->instructor);
        return $this->postJson('/api/groups', ['group_name' => 'G' . uniqid(), 'members' => $memberIds, 'leader_id' => $memberIds[0]])
            ->assertStatus(201)->json();
    }

    private function stageAt(string $date, int $groupId): ?array
    {
        Carbon::setTestNow($date . ' 12:00:00');
        Sanctum::actingAs($this->instructor);
        return collect($this->getJson('/api/groups')->json())->firstWhere('id', $groupId)['capstone'];
    }

    public function test_year_level_is_read_from_the_section(): void
    {
        $this->assertSame(1, CapstoneStageService::yearLevelOf('BSIT 1-G'));
        $this->assertSame(4, CapstoneStageService::yearLevelOf('BSIT 4A'));
        $this->assertNull(CapstoneStageService::yearLevelOf('IRREGULAR'));
    }

    public function test_group_section_comes_from_its_members(): void
    {
        $s = $this->students('bsit 2-a');
        Carbon::setTestNow('2026-12-01 12:00:00');
        $g = $this->createGroup($s->pluck('id')->all());

        $this->assertSame('BSIT 2-A', $g['section']);
        $this->assertSame(2, $g['start_year_level']);
    }

    public function test_stage_advances_by_itself_through_the_calendar(): void
    {
        Carbon::setTestNow('2026-12-01 12:00:00'); // 2nd year, 2nd semester
        $g = $this->createGroup($this->students('BSIT 2-A')->pluck('id')->all());

        $now = $this->stageAt('2026-12-01', $g['id']);
        $this->assertSame('Capstone 1', $now['stage']);
        $this->assertSame([2, 2], [$now['year_level'], $now['term_no']]);

        // Summer: still Capstone 1 (Capstone 2 hasn't started).
        $this->assertSame('Capstone 1', $this->stageAt('2027-04-20', $g['id'])['stage']);

        // Next school year, 1st semester -> 3rd year -> Capstone 2, automatically.
        $later = $this->stageAt('2027-07-01', $g['id']);
        $this->assertSame('Capstone 2', $later['stage']);
        $this->assertSame([3, 1], [$later['year_level'], $later['term_no']]);
    }

    public function test_group_formed_before_capstone_has_no_stage_yet(): void
    {
        Carbon::setTestNow('2026-07-01 12:00:00'); // 2nd year, 1st semester
        $g = $this->createGroup($this->students('BSIT 2-B')->pluck('id')->all());
        $this->assertNull($this->stageAt('2026-07-01', $g['id'])['stage']);
    }

    public function test_group_section_follows_its_members_when_their_section_changes(): void
    {
        Carbon::setTestNow('2026-12-01 12:00:00');
        $s = $this->students('BSIT 2-A');
        $g = $this->createGroup($s->pluck('id')->all());

        foreach ($s as $u) $u->update(['section' => 'BSIT 3-A']); // new class list next year

        $this->assertSame('BSIT 3-A', Group::find($g['id'])->section);
        $this->assertSame(2, Group::find($g['id'])->start_year_level, 'starting year level is kept');
    }

    public function test_only_the_admin_can_change_the_capstone_plan(): void
    {
        Sanctum::actingAs($this->instructor);
        $this->postJson('/api/capstone-stages', ['name' => 'Capstone 3', 'year_level' => 3, 'term_no' => 2])->assertStatus(403);
        $this->getJson('/api/capstone-stages')->assertOk()->assertJsonCount(2);

        Sanctum::actingAs($this->admin);
        $this->postJson('/api/capstone-stages', ['name' => 'Capstone 3', 'year_level' => 3, 'term_no' => 2])->assertStatus(201);
        // Same year level + term twice is refused.
        $this->postJson('/api/capstone-stages', ['name' => 'Other', 'year_level' => 3, 'term_no' => 2])
            ->assertStatus(422)->assertJsonValidationErrors('term_no');
    }
}
