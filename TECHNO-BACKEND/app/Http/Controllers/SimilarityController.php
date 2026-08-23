<?php
namespace App\Http\Controllers;
use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class SimilarityController extends Controller {

    public function check(Request $request) {
        $data = $request->validate([
            'title'      => 'required|string',
            'abstract'   => 'required|string',
            'objectives' => 'required|string',
        ]);

        $archived = Project::whereIn('status', ['approved', 'archived'])
            ->get(['id', 'title', 'abstract', 'objectives'])
            ->map(fn($p) => [
                'id'         => $p->id,
                'title'      => $p->title ?? '',
                'abstract'   => $p->abstract ?? '',
                'objectives' => $p->objectives ?? '',
            ])
            ->toArray();

        try {
            $response = Http::timeout(30)->post(config('services.similarity_url') . '/check', [
                'new_project' => [
                    'title'      => $data['title'],
                    'abstract'   => $data['abstract'],
                    'objectives' => $data['objectives'],
                ],
                'archived' => $archived,
            ]);

            if ($response->successful()) {
                return response()->json($response->json());
            }
            throw new \Exception('Python service returned error');

        } catch (\Exception $e) {
            // Fallback to PHP cosine similarity
            $svc = new \App\Services\SimilarityService();
            $results = $svc->checkAgainstArchive($data,
                Project::whereIn('status', ['approved','archived'])->get()
            );
            $top = $results[0] ?? null;
            return response()->json([
                'overall_score'    => $top ? $top['overall_score']    : 0,
                'title_score'      => $top ? $top['title_score']      : 0,
                'abstract_score'   => $top ? $top['abstract_score']   : 0,
                'objectives_score' => $top ? $top['objectives_score'] : 0,
                'matches'          => $results ?? [],
            ]);
        }
    }

    // Sentence-level SEMANTIC explanation (via SBERT), as opposed to the
    // frontend's verbatim/lexical phrase highlighter (utils/textOverlap.js).
    // Surfaces paraphrased overlap that exact-string matching would miss.
    public function explain(Request $request) {
        $data = $request->validate([
            'own_text'   => 'required|string',
            'other_text' => 'required|string',
        ]);

        try {
            $response = Http::timeout(15)->post(config('services.similarity_url') . '/explain', $data);
            if ($response->successful()) {
                return response()->json($response->json());
            }
            throw new \Exception('Python service returned error');
        } catch (\Exception $e) {
            return response()->json(['segments' => [], 'error' => 'Semantic explanation unavailable'], 200);
        }
    }
}
