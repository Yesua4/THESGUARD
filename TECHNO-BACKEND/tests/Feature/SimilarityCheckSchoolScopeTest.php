<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// The Similarity Detection tool must only compare against the checker's own
// school, so one school never sees another school's archived titles.
class SimilarityCheckSchoolScopeTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_manual_checker_only_uses_the_users_own_school(): void
    {
        $mine  = School::create(['name' => 'Mine', 'slug' => 'mine', 'email' => 'm@m.com']);
        $other = School::create(['name' => 'Other', 'slug' => 'other', 'email' => 'o@o.com']);
        Project::create(['title' => 'Our Library System', 'school_id' => $mine->id, 'status' => 'archived', 'title_status' => 'approved']);
        Project::create(['title' => 'Their Secret Capstone', 'school_id' => $other->id, 'status' => 'archived', 'title_status' => 'approved']);

        Http::fake(['*' => Http::response(['overall_score' => 0, 'matches' => []], 200)]);
        Sanctum::actingAs(User::factory()->role('adviser')->school($mine->id)->create());

        $this->postJson('/api/similarity/check', ['title' => 'Library', 'abstract' => 'Books', 'objectives' => 'Track books'])->assertOk();

        Http::assertSent(function (HttpRequest $req) {
            $titles = collect($req['archived'] ?? [])->pluck('title');
            return $titles->contains('Our Library System') && !$titles->contains('Their Secret Capstone');
        });
    }

    // The embeddings are large; lists must not carry them (they used up the
    // database's data-transfer quota), but similarity checks still need them.
    public function test_project_lists_leave_out_embeddings_but_checks_still_use_them(): void
    {
        $school = School::create(['name' => 'Mine', 'slug' => 'mine', 'email' => 'm@m.com']);
        $vector = array_fill(0, 384, 0.01);
        $p = Project::create(['title' => 'Archived Library', 'school_id' => $school->id, 'status' => 'archived', 'title_status' => 'approved']);
        $p->forceFill(['title_embedding' => $vector, 'abstract_embedding' => $vector, 'objectives_embedding' => $vector])->save();

        Sanctum::actingAs(User::factory()->role('admin')->school($school->id)->create());
        $row = collect($this->getJson('/api/projects')->assertOk()->json())->firstWhere('title', 'Archived Library');
        $this->assertNotNull($row);
        $this->assertArrayNotHasKey('title_embedding', $row);
        $this->assertArrayNotHasKey('abstract_embedding', $row);

        Http::fake(['*' => Http::response(['overall_score' => 0, 'matches' => []], 200)]);
        Sanctum::actingAs(User::factory()->role('adviser')->school($school->id)->create());
        $this->postJson('/api/similarity/check', ['title' => 'Library', 'abstract' => 'Books', 'objectives' => 'Track'])->assertOk();
        Http::assertSent(fn (HttpRequest $req) => count(collect($req['archived'] ?? [])->firstWhere('title', 'Archived Library')['title_embedding'] ?? []) === 384);
    }
}
