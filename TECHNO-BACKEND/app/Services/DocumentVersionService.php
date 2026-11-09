<?php
namespace App\Services;

use App\Models\Contribution;
use App\Models\Document;
use App\Models\Project;

// Records a new version of a project's document (an upload, or a save from
// the ONLYOFFICE editor): the version number, the uploader's contribution,
// a notification to the adviser and instructor, and the live update.
class DocumentVersionService {
    public const TYPE_LABELS = [
        'proposal'         => 'Proposal',
        'chapter1'         => 'Chapter 1',
        'chapter2'         => 'Chapter 2',
        'chapter3'         => 'Chapter 3',
        'chapter4'         => 'Chapter 4',
        'chapter5'         => 'Chapter 5',
        'final_manuscript' => 'Final Manuscript',
    ];

    public function __construct(
        private NotificationService $notifications,
        private ActivityBroadcastService $activity,
    ) {}

    public function create(Project $project, string $type, int $userId, string $path, ?string $note, ?string $githubRepo = null, string $verb = 'Uploaded'): Document {
        $lastVersion = Document::where('project_id', $project->id)->where('type', $type)->max('version') ?? 0;

        // PDFs preview as-is; Word files are converted to PDF the first time
        // someone opens them (see DocumentController::preview) so saving never
        // waits on LibreOffice.
        $document = Document::create([
            'project_id'     => $project->id,
            'uploaded_by'    => $userId,
            'type'           => $type,
            'version'        => $lastVersion + 1,
            'file_path'      => $path,
            'preview_path'   => null,
            'preview_status' => str_ends_with(strtolower($path), '.pdf') ? 'unsupported' : 'pending',
            'github_repo'    => $githubRepo,
            'version_note'   => $note,
            'status'         => 'pending',
        ]);

        $label = self::TYPE_LABELS[$type] ?? $type;
        Contribution::create([
            'project_id'  => $project->id,
            'user_id'     => $userId,
            'action'      => 'document_uploaded',
            'description' => "{$verb} {$label} (v{$document->version})" . ($note ? ": {$note}" : ''),
        ]);

        foreach (array_filter([$project->adviser_id, $project->instructor_id]) as $notifyId) {
            $this->notifications->send(
                $notifyId, 'document_uploaded', 'New Document Submitted',
                "A new {$label} (v{$document->version}) was submitted for \"{$project->title}\".",
                $project->id, $document->id
            );
        }

        $this->activity->broadcast($project->id, 'document_uploaded', ['document' => $document->load('uploader')]);

        return $document;
    }
}
