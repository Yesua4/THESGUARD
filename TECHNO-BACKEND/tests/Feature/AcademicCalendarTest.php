<?php

namespace Tests\Feature;

use App\Events\SchoolActivity;
use App\Models\AcademicTerm;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// The admin sets the academic calendar (years split into dated terms); the
// system knows which term today falls in; groups record their term.
class AcademicCalendarTest extends TestCase
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

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function term(string $name, string $start, string $end, string $year = '2026-2027'): AcademicTerm
    {
        return AcademicTerm::create(['school_id' => $this->school->id, 'academic_year' => $year, 'name' => $name, 'start_date' => $start, 'end_date' => $end]);
    }

    public function test_admin_can_add_a_term(): void
    {
        Sanctum::actingAs($this->admin);

        $this->postJson('/api/terms', [
            'academic_year' => '2026 – 2027', 'name' => '1st Semester', 'start_date' => '2026-06-01', 'end_date' => '2026-08-31',
        ])->assertStatus(201)->assertJsonPath('academic_year', '2026-2027');
    }

    public function test_only_the_admin_can_change_the_calendar(): void
    {
        $instructor = User::factory()->role('instructor')->school($this->school->id)->create();
        $term = $this->term('1st Semester', '2026-06-01', '2026-08-31');
        Sanctum::actingAs($instructor);

        $this->postJson('/api/terms', ['academic_year' => '2026-2027', 'name' => '2nd Semester', 'start_date' => '2026-09-01', 'end_date' => '2026-11-30'])->assertStatus(403);
        $this->putJson("/api/terms/{$term->id}", ['academic_year' => '2026-2027', 'name' => 'X', 'start_date' => '2026-06-01', 'end_date' => '2026-08-31'])->assertStatus(403);
        $this->deleteJson("/api/terms/{$term->id}")->assertStatus(403);
        // ...but everyone in the school can read it.
        $this->getJson('/api/terms')->assertOk()->assertJsonCount(1, 'terms');
    }

    public function test_overlapping_terms_are_rejected(): void
    {
        $this->term('1st Semester', '2026-06-01', '2026-08-31');
        Sanctum::actingAs($this->admin);

        $this->postJson('/api/terms', ['academic_year' => '2026-2027', 'name' => '2nd Semester', 'start_date' => '2026-08-15', 'end_date' => '2026-11-30'])
            ->assertStatus(422)->assertJsonValidationErrors('start_date');
    }

    public function test_end_date_must_not_be_before_start(): void
    {
        Sanctum::actingAs($this->admin);
        $this->postJson('/api/terms', ['academic_year' => '2026-2027', 'name' => '1st Semester', 'start_date' => '2026-08-31', 'end_date' => '2026-06-01'])
            ->assertStatus(422)->assertJsonValidationErrors('end_date');
    }

    public function test_current_term_follows_the_date(): void
    {
        $first = $this->term('1st Semester', '2026-06-01', '2026-08-31');
        $second = $this->term('2nd Semester', '2026-09-01', '2026-11-30');
        Sanctum::actingAs($this->admin);

        Carbon::setTestNow('2026-07-10 12:00:00');
        $this->getJson('/api/terms')->assertJsonPath('current_term_id', $first->id);

        Carbon::setTestNow('2026-10-05 12:00:00');
        $this->getJson('/api/terms')->assertJsonPath('current_term_id', $second->id);

        Carbon::setTestNow('2026-12-15 12:00:00');
        $this->getJson('/api/terms')->assertJsonPath('current_term_id', null);
    }

    public function test_term_switches_at_midnight_philippine_time_not_utc(): void
    {
        $this->term('1st Semester', '2026-06-01', '2026-08-31');
        $second = $this->term('2nd Semester', '2026-09-01', '2026-11-30');
        Sanctum::actingAs($this->admin);

        // 2026-08-31 17:00 UTC is already Sept 1, 01:00 in Manila.
        Carbon::setTestNow(Carbon::parse('2026-08-31 17:00:00', 'UTC'));
        $this->getJson('/api/terms')->assertJsonPath('current_term_id', $second->id);
    }

    public function test_group_takes_its_academic_year_from_the_chosen_term(): void
    {
        $term = $this->term('2nd Semester', '2026-09-01', '2026-11-30');
        $instructor = User::factory()->role('instructor')->school($this->school->id)->create();
        $student = User::factory()->role('student')->school($this->school->id)->create();
        Sanctum::actingAs($instructor);

        $res = $this->postJson('/api/groups', [
            'group_name' => 'Alpha', 'academic_term_id' => $term->id, 'batch' => 'ignored',
            'members' => [$student->id], 'leader_id' => $student->id,
        ])->assertStatus(201);

        $this->assertSame('2026-2027', $res->json('batch'));
        $this->assertSame($term->id, $res->json('academic_term_id'));
        $this->assertSame('2nd Semester', collect($this->getJson('/api/groups')->json())->firstWhere('id', $res->json('id'))['term']['name']);
    }

    public function test_group_cannot_use_another_schools_term(): void
    {
        $other = School::create(['name' => 'Other', 'slug' => 'other', 'email' => 'o@b.com']);
        $foreign = AcademicTerm::create(['school_id' => $other->id, 'academic_year' => '2026-2027', 'name' => '1st Semester', 'start_date' => '2026-06-01', 'end_date' => '2026-08-31']);
        $instructor = User::factory()->role('instructor')->school($this->school->id)->create();
        $student = User::factory()->role('student')->school($this->school->id)->create();
        Sanctum::actingAs($instructor);

        $this->postJson('/api/groups', [
            'group_name' => 'Beta', 'academic_term_id' => $foreign->id, 'members' => [$student->id], 'leader_id' => $student->id,
        ])->assertStatus(422);
    }

    public function test_calendar_changes_are_live(): void
    {
        Event::fake([SchoolActivity::class]);
        Sanctum::actingAs($this->admin);

        $this->postJson('/api/terms', ['academic_year' => '2026-2027', 'name' => '1st Semester', 'start_date' => '2026-06-01', 'end_date' => '2026-08-31'])->assertStatus(201);

        Event::assertDispatched(SchoolActivity::class, fn ($e) => $e->schoolId === $this->school->id && in_array('terms', $e->types));
    }
}
