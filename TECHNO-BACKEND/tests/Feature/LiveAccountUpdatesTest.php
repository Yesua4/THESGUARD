<?php

namespace Tests\Feature;

use App\Events\AccountChanged;
use App\Events\SchoolDirectoryChanged;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use Tests\TestCase;

// Account and roster changes are pushed live: the affected user's own
// channel (roles/sections/enrollment) and the school's staff channel
// (User Accounts and Class Roster lists).
class LiveAccountUpdatesTest extends TestCase
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

    private function classList(array $students): UploadedFile
    {
        $sheet = new Spreadsheet();
        $rows = [['#', 'Student No.', 'Name', 'Program']];
        foreach ($students as $i => [$no, $name]) $rows[] = [$i + 1, $no, $name, 'BSIT'];
        $rows[] = [];
        $rows[] = ['Section:', '', 'BSIT 1-G'];
        $sheet->getActiveSheet()->fromArray($rows, null, 'A1');
        $path = tempnam(sys_get_temp_dir(), 'cls') . '.xls';
        IOFactory::createWriter($sheet, 'Xls')->save($path);
        return new UploadedFile($path, 'Class-List.xls', null, null, true);
    }

    public function test_admin_editing_roles_notifies_that_user_and_the_school_staff(): void
    {
        Event::fake([AccountChanged::class, SchoolDirectoryChanged::class]);
        $rogelio = User::factory()->role('instructor')->school($this->school->id)->create();
        Sanctum::actingAs($this->admin);

        $this->putJson("/api/users/{$rogelio->id}", ['roles' => ['instructor', 'panelist'], 'handled_sections' => ['BSIT 4A']])->assertOk();

        Event::assertDispatched(AccountChanged::class, fn ($e) => $e->userId === $rogelio->id);
        Event::assertDispatched(SchoolDirectoryChanged::class, fn ($e) => $e->schoolId === $this->school->id);
    }

    public function test_switching_role_notifies_the_users_other_sessions(): void
    {
        Event::fake([AccountChanged::class]);
        $rogelio = User::factory()->role('instructor')->school($this->school->id)->create();
        $rogelio->syncRoles(['instructor', 'panelist']);
        Sanctum::actingAs($rogelio->fresh());

        $this->postJson('/api/me/switch-role', ['role' => 'panelist'])->assertOk();

        Event::assertDispatched(AccountChanged::class, fn ($e) => $e->userId === $rogelio->id && $e->reason === 'role_switched');
    }

    public function test_class_list_import_lets_a_waiting_student_in_live(): void
    {
        $this->postJson('/api/register', [
            'last_name' => 'Reyes', 'first_name' => 'Maria', 'student_id' => '2026-00002',
            'email' => 'maria@example.com', 'password' => 'a-long-password-123',
        ])->assertStatus(201);
        $maria = User::where('email', 'maria@example.com')->first();

        Event::fake([AccountChanged::class, SchoolDirectoryChanged::class]);
        Sanctum::actingAs($this->admin);
        $this->post('/api/roster/import', ['file' => $this->classList([['2026-00002', 'REYES, MARIA']])], ['Accept' => 'application/json'])->assertOk();

        Event::assertDispatched(AccountChanged::class, fn ($e) => $e->userId === $maria->id && $e->reason === 'enrolled');
        Event::assertDispatched(SchoolDirectoryChanged::class, fn ($e) => $e->schoolId === $this->school->id);
    }

    public function test_student_signing_up_after_import_refreshes_the_staff_lists(): void
    {
        Sanctum::actingAs($this->admin);
        $this->post('/api/roster/import', ['file' => $this->classList([['2026-00002', 'REYES, MARIA']])], ['Accept' => 'application/json'])->assertOk();

        Event::fake([SchoolDirectoryChanged::class]);
        $this->postJson('/api/register', [
            'last_name' => 'Reyes', 'first_name' => 'Maria', 'student_id' => '2026-00002',
            'email' => 'maria@example.com', 'password' => 'a-long-password-123',
        ])->assertStatus(201);

        Event::assertDispatched(SchoolDirectoryChanged::class, fn ($e) => $e->schoolId === $this->school->id && $e->type === 'student_registered');
    }

    public function test_creating_and_deleting_users_refreshes_the_staff_lists(): void
    {
        Event::fake([SchoolDirectoryChanged::class]);
        Sanctum::actingAs($this->admin);

        $id = $this->postJson('/api/users', [
            'name' => 'New', 'email' => 'new@example.com', 'password' => 'a-long-password-123', 'role' => 'student',
        ])->assertStatus(201)->json('id');
        $this->deleteJson("/api/users/{$id}")->assertOk();

        Event::assertDispatchedTimes(SchoolDirectoryChanged::class, 2);
    }

    public function test_a_failing_broadcast_never_fails_the_request(): void
    {
        config(['broadcasting.default' => 'reverb', 'broadcasting.connections.reverb.options.host' => '127.0.0.1', 'broadcasting.connections.reverb.options.port' => 1]);
        config(['broadcasting.connections.reverb.key' => 'k', 'broadcasting.connections.reverb.secret' => 's', 'broadcasting.connections.reverb.app_id' => '1']);
        app('Illuminate\Broadcasting\BroadcastManager')->purge();
        $rogelio = User::factory()->role('instructor')->school($this->school->id)->create();
        Sanctum::actingAs($this->admin);

        $this->putJson("/api/users/{$rogelio->id}", ['roles' => ['instructor', 'panelist']])->assertOk();
    }

    // ── Channel authorization (real Reverb driver, no network needed) ──

    private function useRealBroadcaster(): void
    {
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'test-key',
            'broadcasting.connections.reverb.secret' => 'test-secret',
            'broadcasting.connections.reverb.app_id' => '1',
        ]);
        app('Illuminate\Broadcasting\BroadcastManager')->purge();
        require base_path('routes/channels.php');
    }

    private function authorize(User $user, string $channel)
    {
        Sanctum::actingAs($user);
        return $this->postJson('/api/broadcasting/auth', ['socket_id' => '1234.5678', 'channel_name' => 'private-' . $channel]);
    }

    public function test_school_staff_channel_allows_admins_and_instructors_of_that_school(): void
    {
        $this->useRealBroadcaster();
        $instructor = User::factory()->role('instructor')->school($this->school->id)->create();

        $this->authorize($this->admin, "School.{$this->school->id}.staff")->assertOk();
        $this->authorize($instructor, "School.{$this->school->id}.staff")->assertOk();
    }

    public function test_school_staff_channel_rejects_students_panelists_and_other_schools(): void
    {
        $this->useRealBroadcaster();
        $other = School::create(['name' => 'Other', 'slug' => 'other', 'email' => 'o@b.com']);
        $student = User::factory()->role('student')->school($this->school->id)->create();
        $panelist = User::factory()->role('panelist')->school($this->school->id)->create();
        $otherAdmin = User::factory()->role('admin')->school($other->id)->create();

        $this->authorize($student, "School.{$this->school->id}.staff")->assertStatus(403);
        $this->authorize($panelist, "School.{$this->school->id}.staff")->assertStatus(403);
        $this->authorize($otherAdmin, "School.{$this->school->id}.staff")->assertStatus(403);
    }

    public function test_waiting_student_can_listen_on_their_own_channel_only(): void
    {
        $this->useRealBroadcaster();
        $this->postJson('/api/register', [
            'last_name' => 'Reyes', 'first_name' => 'Maria', 'student_id' => '2026-00002',
            'email' => 'maria@example.com', 'password' => 'a-long-password-123',
        ])->assertStatus(201);
        $maria = User::where('email', 'maria@example.com')->first();

        $this->authorize($maria, "App.Models.User.{$maria->id}")->assertOk();
        $this->authorize($maria, "App.Models.User.{$this->admin->id}")->assertStatus(403);
    }
}
