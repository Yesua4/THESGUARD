<?php
namespace App\Http\Controllers;
use App\Http\Controllers\Concerns\AuthorizesDocumentAccess;
use App\Models\Contribution;
use App\Models\DefenseSchedule;
use App\Models\Document;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Services\DocumentPreviewService;
use App\Services\NotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DocumentController extends Controller {
    use AuthorizesDocumentAccess;

    public function __construct(private NotificationService $notifications) {}

    public function index(Request $request) {
        $user  = $request->user();
        $query = Document::with('uploader', 'project');

        if ($user->role === 'student') {
            $projectIds = ProjectMember::where('user_id', $user->id)->pluck('project_id');
            $query->whereIn('project_id', $projectIds);
        } elseif ($user->role === 'adviser') {
            // Adviser belongs to a group — find all projects under those groups
            $groupIds   = \App\Models\Group::where('adviser_id', $user->id)->pluck('id');
            $projectIds = Project::whereIn('group_id', $groupIds)->pluck('id');
            $query->whereIn('project_id', $projectIds);
        } elseif ($user->role === 'instructor') {
            // Instructor sees documents from:
            // 1. Their CLASS — projects where instructor_id = their ID
            // 2. Their ADVISORY — projects under groups where adviser_id = their ID
            $classProjectIds    = Project::where('instructor_id', $user->id)->pluck('id');
            $advisoryGroupIds   = \App\Models\Group::where('adviser_id', $user->id)->pluck('id');
            $advisoryProjectIds = Project::whereIn('group_id', $advisoryGroupIds)->pluck('id');
            $allProjectIds      = $classProjectIds->merge($advisoryProjectIds)->unique();
            $query->whereIn('project_id', $allProjectIds);
        } elseif ($user->role === 'panelist') {
            // Panelist sees documents only for projects whose defense schedule
            // names them as a panelist (matched by name — see DefenseSchedule::projectIdsForPanelist).
            $query->whereIn('project_id', DefenseSchedule::projectIdsForPanelist($user));
        }

        return response()->json($query->orderBy('id', 'desc')->get());
    }

    public function store(Request $request) {
        $request->validate([
            'project_id'     => 'required|integer|exists:projects,id',
            'type'           => 'required|in:proposal,chapter1,chapter2,chapter3,chapter4,chapter5,final_manuscript',
            'version_note'   => 'nullable|string|max:500',
            'file'           => 'required|file|mimes:pdf,docx,doc|max:20480',
            'github_repo'    => 'nullable|url',
        ]);

        $project = Project::findOrFail($request->project_id);
        $this->authorizeDocumentAccess($request->user(), $project->id);
        // Panelists pass the membership check above (they can be scheduled
        // to review this project's documents), but uploading a new document
        // version is a submission action reserved for the project side
        // (student/adviser/instructor/admin) -- not the reviewer.
        abort_if($request->user()->role === 'panelist', 403, 'Panelists cannot upload documents.');

        if ($project->title_status !== 'approved') {
            return response()->json(['message' => 'Title must be approved before uploading documents.'], 403);
        }

        $lastVersion = Document::where('project_id', $request->project_id)
            ->where('type', $request->type)
            ->max('version') ?? 0;

        $path = $request->file('file')->store("documents/{$request->project_id}", 'local');

        // PDFs preview as-is; Word files get converted so both can go through
        // the same in-app viewer instead of falling back to download-only.
        $previewPath = null;
        $previewStatus = 'unsupported';
        if (!str_ends_with(strtolower($path), '.pdf')) {
            $previewPath = app(DocumentPreviewService::class)->convertToPdf($path);
            $previewStatus = $previewPath ? 'ready' : 'failed';
        }

        $document = Document::create([
            'project_id'      => $request->project_id,
            'uploaded_by'     => $request->user()->id,
            'type'            => $request->type,
            'version'         => $lastVersion + 1,
            'file_path'       => $path,
            'preview_path'    => $previewPath,
            'preview_status'  => $previewStatus,
            'github_repo'     => $request->github_repo,
            'version_note'    => $request->version_note,
            'status'          => 'pending',
        ]);

        // Log contribution for the uploader
        $typeLabels = [
            'proposal'         => 'Proposal',
            'chapter1'         => 'Chapter 1',
            'chapter2'         => 'Chapter 2',
            'chapter3'         => 'Chapter 3',
            'chapter4'         => 'Chapter 4',
            'chapter5'         => 'Chapter 5',
            'final_manuscript' => 'Final Manuscript',
        ];

        Contribution::create([
            'project_id'  => $project->id,
            'user_id'     => $request->user()->id,
            'action'      => 'document_uploaded',
            'description' => "Uploaded {$typeLabels[$request->type]} (v{$document->version})" . ($request->version_note ? ": {$request->version_note}" : ''),
        ]);

        // Notify adviser and instructor
        $notifyUserIds = array_filter([
            $project->adviser_id,
            $project->instructor_id,
        ]);

        foreach ($notifyUserIds as $userId) {
            $this->notifications->send(
                $userId, 'document_uploaded', '📄 New Document Submitted',
                "A new {$typeLabels[$request->type]} (v{$document->version}) was uploaded for \"{$project->title}\".",
                $project->id, $document->id
            );
        }

        return response()->json($document->load('uploader'), 201);
    }

    // Converts an already-uploaded Word document (.docx/.doc) to HTML so it
    // can be opened directly in the in-app rich-text editor, instead of only
    // being viewable/downloadable. PDFs aren't supported — there's no
    // reasonable way to turn a PDF's fixed layout back into editable rich
    // text, so those stay view/download-only.
    public function editContent(Request $request, $id) {
        $document = Document::findOrFail($id);
        $this->authorizeDocumentAccess($request->user(), $document->project_id);

        if (!$document->file_path) {
            return response()->json(['message' => 'This document has no uploaded file to edit.'], 422);
        }
        if (str_ends_with(strtolower($document->file_path), '.pdf')) {
            return response()->json(['message' => 'PDF files cannot be opened for in-app editing. Download it, edit it, and re-upload if changes are needed.'], 422);
        }

        $html = app(DocumentPreviewService::class)->convertToHtml($document->file_path);
        if ($html === null) {
            return response()->json(['message' => 'Could not convert this document for editing. You can still download it and edit it locally.'], 422);
        }

        return response()->json([
            'html'       => $html,
            'type'       => $document->type,
            'project_id' => $document->project_id,
        ]);
    }

    // In-app rich-text drafting: saves edited chapter content as a NEW document
    // version (content-only, no uploaded file), following the same
    // one-row-per-version pattern as file uploads in store().
    public function saveDraft(Request $request) {
        $data = $request->validate([
            'project_id'   => 'required|integer|exists:projects,id',
            'type'         => 'required|in:proposal,chapter1,chapter2,chapter3,chapter4,chapter5,final_manuscript',
            'content'      => 'required|string',
            'version_note' => 'nullable|string|max:500',
        ]);

        $this->authorizeDocumentAccess($request->user(), $data['project_id']);
        $project = Project::findOrFail($data['project_id']);
        if ($project->title_status !== 'approved') {
            return response()->json(['message' => 'Title must be approved before editing documents.'], 403);
        }

        $lastVersion = Document::where('project_id', $data['project_id'])
            ->where('type', $data['type'])
            ->max('version') ?? 0;

        $document = Document::create([
            'project_id'   => $data['project_id'],
            'uploaded_by'  => $request->user()->id,
            'type'         => $data['type'],
            'version'      => $lastVersion + 1,
            'content'      => $data['content'],
            'version_note' => $data['version_note'] ?? 'Edited in-app',
            'status'       => 'pending',
        ]);

        $typeLabels = [
            'proposal' => 'Proposal', 'chapter1' => 'Chapter 1', 'chapter2' => 'Chapter 2',
            'chapter3' => 'Chapter 3', 'chapter4' => 'Chapter 4', 'chapter5' => 'Chapter 5',
            'final_manuscript' => 'Final Manuscript',
        ];
        Contribution::create([
            'project_id'  => $project->id,
            'user_id'     => $request->user()->id,
            'action'      => 'document_edited',
            'description' => "Edited {$typeLabels[$data['type']]} (v{$document->version}) in-app",
        ]);

        return response()->json($document->load('uploader'), 201);
    }

    public function show(Request $request, $id) {
        $document = Document::with('uploader', 'project')->findOrFail($id);
        $this->authorizeDocumentAccess($request->user(), $document->project_id);
        return response()->json($document);
    }

    public function file(Request $request, $id) {
        $document = Document::findOrFail($id);
        $this->authorizeDocumentAccess($request->user(), $document->project_id);

        if (!$document->file_path || !Storage::disk('local')->exists($document->file_path)) {
            return response()->json(['message' => 'File not found'], 404);
        }

        return Storage::disk('local')->response($document->file_path);
    }

    // Serves a PDF-renderable version of the document for the in-app viewer:
    // the original file when it's already a PDF, otherwise the converted
    // preview (if generation succeeded). Distinct from file(), which always
    // serves the original bytes for download.
    public function preview(Request $request, $id) {
        $document = Document::findOrFail($id);
        $this->authorizeDocumentAccess($request->user(), $document->project_id);

        $isPdf = $document->file_path && str_ends_with(strtolower($document->file_path), '.pdf');
        $path  = $isPdf ? $document->file_path : $document->preview_path;

        if (!$path || !Storage::disk('local')->exists($path)) {
            return response()->json(['message' => 'Preview not available for this document.'], 404);
        }

        return Storage::disk('local')->response($path, null, ['Content-Type' => 'application/pdf']);
    }

    public function update(Request $request, $id) {
        $document = Document::findOrFail($id);
        $this->authorizeDocumentAccess($request->user(), $document->project_id);

        $data = $request->validate([
            'status'       => 'sometimes|in:pending,under_review,approved,needs_revision',
            'version_note' => 'nullable|string|max:500',
            'github_repo'  => 'nullable|url',
        ]);

        if (isset($data['status'])) {
            abort_unless(in_array($request->user()->role, ['adviser', 'instructor', 'admin']), 403, 'Only advisers, instructors, or admins can change document status.');
        }

        $oldStatus = $document->status;

        $document->update($data);

        if (isset($data['status']) && $data['status'] !== $oldStatus) {
            $project = Project::find($document->project_id);
            $members = ProjectMember::where('project_id', $document->project_id)->get();

            $typeLabels = [
                'proposal'         => 'Proposal',
                'chapter1'         => 'Chapter 1',
                'chapter2'         => 'Chapter 2',
                'chapter3'         => 'Chapter 3',
                'chapter4'         => 'Chapter 4',
                'chapter5'         => 'Chapter 5',
                'final_manuscript' => 'Final Manuscript',
            ];

            $statusMessages = [
                'approved'       => ['📄 Document Approved',        "Your {$typeLabels[$document->type]} (v{$document->version}) has been approved."],
                'needs_revision' => ['📄 Document Needs Revision',   "Your {$typeLabels[$document->type]} (v{$document->version}) needs revision. Check the comments."],
                'under_review'   => ['📄 Document Under Review',     "Your {$typeLabels[$document->type]} (v{$document->version}) is now under review."],
            ];

            if (isset($statusMessages[$data['status']])) {
                [$title, $message] = $statusMessages[$data['status']];
                foreach ($members as $member) {
                    $this->notifications->send(
                        $member->user_id, 'document_status', $title, $message,
                        $document->project_id, $document->id
                    );
                }
            }
        }

        return response()->json($document);
    }

    public function updateStatus(Request $request, $id) {
        abort_unless(in_array($request->user()->role, ['adviser', 'instructor', 'admin']), 403, 'Only advisers, instructors, or admins can change document status.');

        $document = Document::findOrFail($id);
        $data     = $request->validate([
            'status' => 'required|in:pending,under_review,approved,needs_revision',
        ]);

        $oldStatus = $document->status;
        $document->update($data);

        if ($data['status'] !== $oldStatus) {
            $members = ProjectMember::where('project_id', $document->project_id)->get();
            $typeLabels = [
                'proposal' => 'Proposal', 'chapter1' => 'Chapter 1',
                'chapter2' => 'Chapter 2', 'chapter3' => 'Chapter 3',
                'chapter4' => 'Chapter 4', 'chapter5' => 'Chapter 5',
                'final_manuscript' => 'Final Manuscript',
            ];
            $statusMessages = [
                'approved'       => ['📄 Document Approved',       "Your {$typeLabels[$document->type]} has been approved."],
                'needs_revision' => ['📄 Document Needs Revision',  "Your {$typeLabels[$document->type]} needs revision."],
                'under_review'   => ['📄 Document Under Review',    "Your {$typeLabels[$document->type]} is under review."],
            ];
            if (isset($statusMessages[$data['status']])) {
                [$title, $message] = $statusMessages[$data['status']];
                foreach ($members as $member) {
                    $this->notifications->send(
                        $member->user_id, 'document_status', $title, $message,
                        $document->project_id, $document->id
                    );
                }
            }
        }

        return response()->json($document);
    }

    public function destroy(Request $request, $id) {
        $document = Document::findOrFail($id);
        $this->authorizeDocumentAccess($request->user(), $document->project_id);
        // Panelists pass the membership check above (they need read access
        // to review documents), but review is all they should be able to do
        // -- they must never be able to delete a document they're evaluating.
        abort_if($request->user()->role === 'panelist', 403, 'Panelists cannot delete documents.');

        if ($document->file_path) {
            Storage::disk('local')->delete($document->file_path);
        }
        if ($document->preview_path) {
            Storage::disk('local')->delete($document->preview_path);
        }
        $document->delete();
        return response()->json(['message' => 'Deleted']);
    }
}