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
}
