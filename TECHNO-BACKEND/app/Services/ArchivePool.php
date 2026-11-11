<?php
namespace App\Services;

use App\Models\Project;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

// The projects a new proposal is compared against (archived + approved), for
// one school. The archive's embeddings are large (~35 KB a project), and
// pulling hundreds of them from the database on every check used up the
// database plan's data-transfer (egress) quota. So the archived part is kept
// in this server's file cache and re-read only when the archive changes
// (count or latest update differs). Approved projects are few and always
// read fresh.
class ArchivePool {
    public static function for(?int $schoolId, ?int $exceptId = null) {
        $archived = fn () => Project::where('status', 'archived')
            ->when($schoolId, fn ($q) => $q->where('school_id', $schoolId));

        $version = $archived()->selectRaw('count(*) as n, max(updated_at) as m, max(id) as i')->first();
        $key = 'archive_pool:' . ($schoolId ?? 'all') . ':' . md5(($version->n ?? 0) . '|' . ($version->m ?? '') . '|' . ($version->i ?? 0));
        try {
            $rows = Cache::store(app()->environment('testing') ? 'array' : 'file')->remember($key, now()->addDay(), fn () => $archived()->get());
        } catch (\Throwable $e) {
            Log::warning('Archive pool cache unavailable: ' . $e->getMessage());
            $rows = $archived()->get();
        }

        $approved = Project::where('status', 'approved')
            ->when($schoolId, fn ($q) => $q->where('school_id', $schoolId))->get();

        return $rows->concat($approved)
            ->when($exceptId, fn ($c) => $c->where('id', '!=', $exceptId))
            ->values();
    }
}
