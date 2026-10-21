<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\School;
use App\Models\SimilarityResult;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Panel recommendation (outline defense): students should be able to view
// approved capstones of previous batches and their own similarity reports.
class StudentArchiveAccessTest extends TestCase
{
    use RefreshDatabase;

    private School $school;
    private School $otherSchool;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school      = School::create(['name' => 'DNSC', 'slug' => 'dnsc', 'email' => 'a@dnsc.test']);
        $this->otherSchool = School::create(['name' => 'Other', 'slug' => 'other', 'email' => 'b@other.test']);
    }

    private function student(?int $schoolId = null): User
    {
        return User::factory()->role('student')->school($schoolId ?? $this->school->id)->create();
    }

    public function test_student_sees_only_own_schools_completed_archive(): void
    {
        $archived  = Project::create(['title' => 'Old Capstone', 'abstract' => 'A', 'status' => 'archived', 'school_id' => $this->school->id]);
        Project::create(['title' => 'Ongoing Work', 'status' => 'ongoing', 'school_id' => $this->school->id]);
        Project::create(['title' => 'Other School Capstone', 'status' => 'archived', 'school_id' => $this->otherSchool->id]);
        // An alternate title a group dropped via chooseFinal(): archived but never completed.
        $group = \App\Models\Group::create(['group_name' => 'G1', 'school_id' => $this->school->id]);
        Project::create(['title' => 'Dropped Alternate', 'status' => 'archived', 'group_id' => $group->id, 'is_final_title' => false, 'school_id' => $this->school->id]);

        Sanctum::actingAs($this->student());
        $response = $this->getJson('/api/archive')->assertStatus(200);

        $this->assertSame([$archived->id], collect($response->json())->pluck('id')->all());
    }

    public function test_student_can_open_archived_capstone_but_not_another_groups_project(): void
    {
        $archived = Project::create(['title' => 'Old Capstone', 'abstract' => 'Public abstract', 'status' => 'archived', 'school_id' => $this->school->id]);
        $ongoing  = Project::create(['title' => 'Another Group', 'status' => 'ongoing', 'school_id' => $this->school->id]);

        Sanctum::actingAs($this->student());

        $this->getJson("/api/projects/{$archived->id}")
            ->assertStatus(200)
            ->assertJson(['abstract' => 'Public abstract'])
            ->assertJsonMissingPath('documents');
        $this->getJson("/api/projects/{$ongoing->id}")->assertStatus(403);
    }

    public function test_project_from_another_school_is_forbidden(): void
    {
        $foreign = Project::create(['title' => 'Foreign', 'status' => 'archived', 'school_id' => $this->otherSchool->id]);
        $adviser = User::factory()->role('adviser')->school($this->school->id)->create();

        Sanctum::actingAs($adviser);
        $this->getJson("/api/projects/{$foreign->id}")->assertStatus(403);
        $this->getJson("/api/projects/{$foreign->id}/similarity")->assertStatus(403);
    }

    public function test_student_sees_own_similarity_report_and_not_others(): void
    {
        $student = $this->student();
        $own     = Project::create(['title' => 'Mine', 'status' => 'ongoing', 'school_id' => $this->school->id]);
        ProjectMember::create(['project_id' => $own->id, 'user_id' => $student->id, 'is_leader' => true]);
        $archived = Project::create(['title' => 'Old', 'abstract' => 'Old abstract', 'status' => 'archived', 'school_id' => $this->school->id]);
        SimilarityResult::create([
            'project_id' => $own->id, 'compared_to_project_id' => $archived->id,
            'title_score' => 50, 'abstract_score' => 40, 'objectives_score' => 30, 'overall_score' => 42,
        ]);
        $someoneElse = Project::create(['title' => 'Theirs', 'status' => 'ongoing', 'school_id' => $this->school->id]);

        Sanctum::actingAs($student);
        $this->getJson("/api/projects/{$own->id}/similarity")
            ->assertStatus(200)
            ->assertJson(['matched_title' => 'Old', 'matched_abstract' => 'Old abstract']);
        $this->getJson("/api/projects/{$someoneElse->id}/similarity")->assertStatus(403);
    }

    public function test_student_does_not_get_full_text_of_an_in_progress_match(): void
    {
        $student = $this->student();
        $own     = Project::create(['title' => 'Mine', 'status' => 'ongoing', 'school_id' => $this->school->id]);
        ProjectMember::create(['project_id' => $own->id, 'user_id' => $student->id, 'is_leader' => true]);
        $approved = Project::create(['title' => 'Current Group', 'abstract' => 'Private abstract', 'status' => 'approved', 'school_id' => $this->school->id]);
        SimilarityResult::create([
            'project_id' => $own->id, 'compared_to_project_id' => $approved->id,
            'title_score' => 50, 'abstract_score' => 40, 'objectives_score' => 30, 'overall_score' => 42,
        ]);

        Sanctum::actingAs($student);
        $this->getJson("/api/projects/{$own->id}/similarity")
            ->assertStatus(200)
            ->assertJson(['matched_title' => 'Current Group', 'matched_abstract' => null]);
    }
}
