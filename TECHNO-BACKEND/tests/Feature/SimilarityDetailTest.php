<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\SimilarityResult;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SimilarityDetailTest extends TestCase
{
    use RefreshDatabase;

    public function test_similarity_detail_includes_matched_text_for_highlighting(): void
    {
        $matched = Project::create([
            'title' => 'Archived Thesis',
            'abstract' => 'This study focuses on automated library systems.',
            'objectives' => 'To build a catalog system.',
            'status' => 'archived',
        ]);
        $project = Project::create([
            'title' => 'New Thesis',
            'abstract' => 'This proposal focuses on automated library systems.',
            'objectives' => 'To design a catalog system.',
        ]);
        SimilarityResult::create([
            'project_id' => $project->id,
            'compared_to_project_id' => $matched->id,
            'title_score' => 90,
            'abstract_score' => 85,
            'objectives_score' => 70,
            'overall_score' => 83,
        ]);

        $user = User::factory()->role('admin')->create();
        Sanctum::actingAs($user);

        $response = $this->getJson("/api/projects/{$project->id}/similarity");

        $response->assertStatus(200)
            ->assertJson([
                'matched_title' => 'Archived Thesis',
                'own_abstract' => 'This proposal focuses on automated library systems.',
                'matched_abstract' => 'This study focuses on automated library systems.',
            ]);
    }
}
