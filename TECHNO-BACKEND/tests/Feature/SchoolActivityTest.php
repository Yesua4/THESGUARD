<?php

namespace Tests\Feature;

use App\Events\SchoolActivity;
use App\Models\Group;
use App\Models\Project;
use App\Models\Room;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Every save/delete of a school's data sends one "these kinds changed"
// signal to that school's channel, so list pages refresh live -- including
// for items that weren't on screen yet (new groups, newly archived projects).
class SchoolActivityTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private User $instructor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
        $this->instructor = User::factory()->role('instructor')->school($this->school->id)->create();
    }

    private function sent(string $type): bool
    {
        return Event::dispatched(SchoolActivity::class, fn ($e) => $e->schoolId === $this->school->id && in_array($type, $e->types, true))->isNotEmpty();
    }

    public function test_creating_a_group_signals_groups_and_projects_once(): void
    {
        $students = User::factory()->count(3)->role('student')->school($this->school->id)->create();
        Event::fake([SchoolActivity::class]);
        Sanctum::actingAs($this->instructor);

        $this->postJson('/api/groups', [
            'group_name' => 'Alpha', 'members' => $students->pluck('id')->all(), 'leader_id' => $students[0]->id,
        ])->assertStatus(201);

        // Group + 3 members saved, but only one combined broadcast.
        Event::assertDispatchedTimes(SchoolActivity::class, 1);
        $this->assertTrue($this->sent('groups'));
        $this->assertTrue($this->sent('projects'));
    }

    public function test_changing_group_members_signals_groups(): void
    {
        $group = Group::create(['group_name' => 'Beta', 'school_id' => $this->school->id]);
        $student = User::factory()->role('student')->school($this->school->id)->create();
        Event::fake([SchoolActivity::class]);
        Sanctum::actingAs($this->instructor);

        $this->putJson("/api/groups/{$group->id}", ['members' => [$student->id], 'leader_id' => $student->id])->assertOk();

        $this->assertTrue($this->sent('groups'));
    }

    public function test_archiving_a_project_signals_projects(): void
    {
        $project = Project::create(['title' => 'Old', 'school_id' => $this->school->id, 'status' => 'approved']);
        $admin = User::factory()->role('admin')->school($this->school->id)->create();
        Event::fake([SchoolActivity::class]);
        Sanctum::actingAs($admin);

        $this->putJson("/api/projects/{$project->id}", ['status' => 'archived'])->assertOk();

        $this->assertTrue($this->sent('projects'));
    }

    public function test_child_rows_are_routed_to_their_projects_school(): void
    {
        $other = School::create(['name' => 'Other', 'slug' => 'other', 'email' => 'o@b.com']);
        $project = Project::create(['title' => 'Elsewhere', 'school_id' => $other->id, 'status' => 'ongoing']);
        app(\App\Services\LiveUpdateService::class)->flush(); // drop setUp's own pending signals
        Event::fake([SchoolActivity::class]);

        \App\Models\Task::create(['project_id' => $project->id, 'title' => 'Write ch. 1', 'created_by' => $this->instructor->id]);
        app(\App\Services\LiveUpdateService::class)->flush();

        Event::assertDispatched(SchoolActivity::class, fn ($e) => $e->schoolId === $other->id && in_array('tasks', $e->types));
        Event::assertNotDispatched(SchoolActivity::class, fn ($e) => $e->schoolId === $this->school->id);
    }

    public function test_rooms_have_no_school_so_they_go_to_the_editors_school(): void
    {
        $admin = User::factory()->role('admin')->school($this->school->id)->create();
        Event::fake([SchoolActivity::class]);
        Sanctum::actingAs($admin);

        $this->postJson('/api/rooms', ['room_name' => 'Lab 1', 'building' => 'IC', 'capacity' => 30])->assertSuccessful();

        $this->assertTrue($this->sent('rooms'));
    }

    public function test_a_failing_broadcast_never_fails_the_request(): void
    {
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'k', 'broadcasting.connections.reverb.secret' => 's',
            'broadcasting.connections.reverb.app_id' => '1',
            'broadcasting.connections.reverb.options.host' => '127.0.0.1', 'broadcasting.connections.reverb.options.port' => 1,
        ]);
        app('Illuminate\Broadcasting\BroadcastManager')->purge();
        Sanctum::actingAs($this->instructor);

        $this->postJson('/api/groups', ['group_name' => 'Gamma', 'members' => [$this->instructor->id], 'leader_id' => $this->instructor->id])
            ->assertStatus(201);
    }

    // ── Channel authorization ──────────────────────────────────

    private function authorize(User $user, string $channel)
    {
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'test-key',
            'broadcasting.connections.reverb.secret' => 'test-secret',
            'broadcasting.connections.reverb.app_id' => '1',
        ]);
        app('Illuminate\Broadcasting\BroadcastManager')->purge();
        require base_path('routes/channels.php');

        Sanctum::actingAs($user);
        return $this->postJson('/api/broadcasting/auth', ['socket_id' => '1234.5678', 'channel_name' => 'private-' . $channel]);
    }

    public function test_anyone_in_the_school_can_listen(): void
    {
        $student = User::factory()->role('student')->school($this->school->id)->create();
        $this->authorize($student, "School.{$this->school->id}")->assertOk();
    }

    public function test_other_schools_and_unenrolled_students_cannot_listen(): void
    {
        $other = School::create(['name' => 'Other', 'slug' => 'other', 'email' => 'o@b.com']);
        $outsider = User::factory()->role('admin')->school($other->id)->create();
        $this->authorize($outsider, "School.{$this->school->id}")->assertStatus(403);

        $noSchool = User::factory()->role('student')->create();
        $this->authorize($noSchool, "School.{$this->school->id}")->assertStatus(403);
    }
}
