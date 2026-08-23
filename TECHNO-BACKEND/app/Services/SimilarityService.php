<?php
namespace App\Services;

class SimilarityService {
    public function cosineSimilarity(string $a, string $b): float {
        $freqA = $this->termFreq($a);
        $freqB = $this->termFreq($b);
        $terms = array_unique(array_merge(array_keys($freqA), array_keys($freqB)));
        $dot = $magA = $magB = 0;
        foreach ($terms as $t) {
            $va = $freqA[$t] ?? 0; $vb = $freqB[$t] ?? 0;
            $dot += $va * $vb; $magA += $va * $va; $magB += $vb * $vb;
        }
        if ($magA == 0 || $magB == 0) return 0.0;
        return round(($dot / (sqrt($magA) * sqrt($magB))) * 100, 2);
    }

    private function termFreq(string $text): array {
        $text  = strtolower(preg_replace('/[^a-zA-Z0-9\s]/', '', $text));
        $words = array_filter(explode(' ', $text));
        $freq  = [];
        foreach ($words as $w) $freq[$w] = ($freq[$w] ?? 0) + 1;
        return $freq;
    }

    public function checkAgainstArchive(array $new, $archived): array {
        $results = [];
        foreach ($archived as $old) {
            $t = $this->cosineSimilarity($new['title'],      $old->title);
            $a = $this->cosineSimilarity($new['abstract'],   $old->abstract   ?? '');
            $o = $this->cosineSimilarity($new['objectives'], $old->objectives  ?? '');
            $overall = round(($t + $a + $o) / 3, 2);
            if ($overall > 5) $results[] = [
                'compared_to_id'   => $old->id,
                'compared_title'   => $old->title,
                'title_score'      => $t,
                'abstract_score'   => $a,
                'objectives_score' => $o,
                'overall_score'    => $overall,
            ];
        }
        usort($results, fn($x,$y) => $y['overall_score'] <=> $x['overall_score']);
        return $results;
    }
}