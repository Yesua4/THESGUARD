<?php

namespace Tests\Feature;

use App\Models\Group;
use App\Models\Institute;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Institutes (capstone or thesis) inside a school; the school admin is the
// admin with no institute, the others are institute admins.
class InstituteTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private User $schoolAdmin;
    private Institute $ic;
    private Institute $ited;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'DNSC', 'slug' => 'dnsc', 'email' => 'd@d.com']);
        $this->schoolAdmin = User::factory()->role('admin')->school($this->school->id)->create();
        $this->ic   = Institute::create(['school_id' => $this->school->id, 'name' => 'Institute of Computing', 'research_type' => 'capstone']);
        $this->ited = Institute::create(['school_id' => $this->school->id, 'name' => 'ITED', 'research_type' => 'thesis']);
    }

    private function instituteAdmin(Institute $i): User
    {
        $u = User::factory()->role('admin')->school($this->school->id)->create();
        $u->forceFill(['institute_id' => $i->id])->save();
        return $u->fresh();
    }

    public function test_only_the_school_admin_manages_institutes(): void
    {
        Sanctum::actingAs($this->schoolAdmin);
        $this->postJson('/api/institutes', ['name' => 'IAAS', 'research_type' => 'thesis'])->assertCreated();
        $this->postJson('/api/institutes', ['name' => 'IAAS', 'research_type' => 'thesis'])->assertStatus(422); // same name
        $this->putJson("/api/institutes/{$this->ic->id}", ['name' => 'IC', 'research_type' => 'capstone'])->assertOk();

        foreach ([$this->instituteAdmin($this->ic), User::factory()->role('instructor')->school($this->school->id)->create()] as $u) {
            Sanctum::actingAs($u);
            $this->getJson('/api/institutes')->assertOk()->assertJsonCount(3);
            $this->postJson('/api/institutes', ['name' => 'X', 'research_type' => 'thesis'])->assertStatus(403);
            $this->deleteJson("/api/institutes/{$this->ited->id}")->assertStatus(403);
        }

        $other = School::create(['name' => 'O', 'slug' => 'o', 'email' => 'o@o.com']);
        Sanctum::actingAs(User::factory()->role('admin')->school($other->id)->create());
        $this->getJson('/api/institutes')->assertOk()->assertJsonCount(0);
        $this->putJson("/api/institutes/{$this->ic->id}", ['name' => 'Hacked', 'research_type' => 'thesis'])->assertStatus(404);
    }

    public function test_institute_admins_can_only_add_people_to_their_own_institute(): void
    {
        $icAdmin = $this->instituteAdmin($this->ic);
        Sanctum::actingAs($icAdmin);
        $new = fn (array $extra) => $this->postJson('/api/users', array_merge(
            ['name' => 'P ' . uniqid(), 'email' => uniqid() . '@x.com', 'password' => 'APassword12345', 'roles' => ['instructor']], $extra));

        $this->assertSame($this->ic->id, $new([])->assertCreated()->json('institute_id')); // defaults to own
        $new(['institute_id' => $this->ited->id])->assertStatus(403);
        $new(['institute_id' => null, 'roles' => ['admin']])->assertStatus(403); // can't create a school admin
        $this->putJson("/api/users/{$this->schoolAdmin->id}", ['name' => 'Changed'])->assertStatus(403); // not theirs to edit
        $this->putJson("/api/users/{$this->schoolAdmin->id}", ['institute_id' => $this->ic->id])->assertStatus(403);

        Sanctum::actingAs($this->schoolAdmin);
        $this->assertSame($this->ited->id, $new(['institute_id' => $this->ited->id])->assertCreated()->json('institute_id'));
        $this->assertNull($new(['roles' => ['admin']])->assertCreated()->json('institute_id')); // another school admin
    }

    // An institute admin must not be able to take over the school admin's
    // account (a reset shows the temporary password) or touch other institutes.
    public function test_institute_admins_cannot_manage_the_school_admin_or_other_institutes(): void
    {
        $icAdmin = $this->instituteAdmin($this->ic);
        $mine = User::factory()->role('instructor')->school($this->school->id)->create();
        $mine->forceFill(['institute_id' => $this->ic->id])->save();
        $theirs = User::factory()->role('instructor')->school($this->school->id)->create();
        $theirs->forceFill(['institute_id' => $this->ited->id])->save();

        Sanctum::actingAs($icAdmin);
        $this->postJson("/api/users/{$this->schoolAdmin->id}/reset-password")->assertStatus(403);
        $this->deleteJson("/api/users/{$this->schoolAdmin->id}")->assertStatus(403);
        $this->putJson("/api/users/{$this->schoolAdmin->id}", ['name' => 'Hijacked'])->assertStatus(403);
        $this->postJson("/api/users/{$theirs->id}/reset-password")->assertStatus(403);
        $this->deleteJson("/api/users/{$theirs->id}")->assertStatus(403);
        $this->assertSame($this->schoolAdmin->name, $this->schoolAdmin->fresh()->name);

        // Their own institute is fine, including another admin for it.
        $this->postJson("/api/users/{$mine->id}/reset-password")->assertOk();
        $this->putJson("/api/users/{$mine->id}", ['name' => 'Renamed'])->assertOk();
        $this->postJson('/api/users', ['name' => 'Second IC Admin', 'email' => 'ic2@x.com', 'password' => 'APassword12345', 'roles' => ['admin']])
            ->assertCreated()->assertJsonPath('institute_id', $this->ic->id);
        $this->deleteJson("/api/users/{$mine->id}")->assertOk();

        // The school admin can manage everyone.
        Sanctum::actingAs($this->schoolAdmin);
        $this->postJson("/api/users/{$icAdmin->id}/reset-password")->assertOk();
        $this->postJson("/api/users/{$theirs->id}/reset-password")->assertOk();
    }

    public function test_thesis_groups_have_no_pre_deployment_defense(): void
    {
        $adviser = User::factory()->role('adviser')->school($this->school->id)->create();
        $thesis   = Group::create(['group_name' => 'T', 'school_id' => $this->school->id, 'adviser_id' => $adviser->id, 'institute_id' => $this->ited->id]);
        $capstone = Group::create(['group_name' => 'C', 'school_id' => $this->school->id, 'adviser_id' => $adviser->id, 'institute_id' => $this->ic->id]);
        $this->assertSame('thesis', $thesis->fresh()->research_type);
        $this->assertSame('capstone', Group::create(['group_name' => 'None', 'school_id' => $this->school->id])->fresh()->research_type);

        Sanctum::actingAs($this->schoolAdmin);
        $day = 0;
        $defense = function (Group $g, string $type) use (&$day) { return $this->postJson('/api/schedules', [
            'group_id' => $g->id, 'defense_type' => $type, 'defense_date' => now()->addDays(7 + $day++)->toDateString(), 'start_time' => '09:00', 'end_time' => '10:00']); };
        $defense($thesis, 'pre_deployment')->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'Thesis groups have no pre-deployment'));
        $defense($thesis, 'outline')->assertSuccessful();
        $defense($capstone, 'pre_deployment')->assertSuccessful();
    }

    public function test_me_tells_the_app_which_institute_and_type(): void
    {
        $student = User::factory()->role('student')->school($this->school->id)->create();
        $student->forceFill(['institute_id' => $this->ited->id])->save();
        Sanctum::actingAs($student->fresh());
        $this->getJson('/api/me')->assertOk()
            ->assertJsonPath('user.institute.name', 'ITED')->assertJsonPath('user.institute.research_type', 'thesis');
    }
}
