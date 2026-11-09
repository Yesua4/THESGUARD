<?php
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\ScheduleController;
use App\Http\Controllers\SimilarityController;
use App\Http\Controllers\ContributionController;
use App\Http\Controllers\DocumentCommentController;
use App\Http\Controllers\GroupController;
use App\Http\Controllers\RoomController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\EvaluationController;
use App\Http\Controllers\SchoolController;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\DefenseMinutesController;
use App\Http\Controllers\ProjectChecklistController;
use App\Http\Controllers\ClassRosterController;
use App\Http\Controllers\AcademicTermController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;


Route::middleware('throttle:10,1')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/schools/register', [SchoolController::class, 'register']);
    Route::post('/password/forgot', [AuthController::class, 'forgotPassword']);
    Route::post('/password/reset', [AuthController::class, 'resetPassword']);
});
// Google Sign-In (link-only — see AuthController::handleGoogleCallback).
// Not behind the login throttle: this is a redirect flow through Google,
// not a credential-guessing surface.
Route::get('/auth/google/redirect', [AuthController::class, 'redirectToGoogle']);
Route::get('/auth/google/callback', [AuthController::class, 'handleGoogleCallback']);

// ONLYOFFICE Document Server -> ThesisGuard (no user login: signed,
// expiring URLs, and the callback also carries a JWT). See OnlyOfficeController.
Route::get('/onlyoffice/file/{id}', [\App\Http\Controllers\OnlyOfficeController::class, 'file'])
    ->middleware('signed:relative')->name('onlyoffice.file');
Route::post('/onlyoffice/callback/{id}', [\App\Http\Controllers\OnlyOfficeController::class, 'callback'])
    ->middleware('signed:relative')->name('onlyoffice.callback');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/me/switch-role', [AuthController::class, 'switchRole']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::put('profile/change-password', [AuthController::class, 'changePassword']);

    // Private/presence channel authorization for Reverb. This app is
    // API-only with Bearer-token Sanctum auth (no session cookies), so the
    // default Broadcast::routes() helper (which assumes session auth via
    // the 'web' middleware) isn't used -- this route sits in the same
    // auth:sanctum group as everything else instead. It's outside the
    // 'enrolled' group so a student waiting for enrollment can still listen
    // on their own channel and get in the moment they're enrolled; each
    // channel's own rule in routes/channels.php still decides access.
    Route::post('/broadcasting/auth', function (Request $request) {
        return Broadcast::auth($request);
    });

    // Everything else needs an enrolled account: a self-registered student
    // waits here until an instructor imports a class list with their
    // Student No. (see EnsureStudentEnrolled).
    // ...and a password of their own (see EnsurePasswordChanged).
    Route::middleware(['enrolled', 'password.changed'])->group(function () {
    Route::get('/capstone-stages', [\App\Http\Controllers\CapstoneStageController::class, 'index']);
    Route::post('/capstone-stages', [\App\Http\Controllers\CapstoneStageController::class, 'store']);
    Route::put('/capstone-stages/{id}', [\App\Http\Controllers\CapstoneStageController::class, 'update']);
    Route::delete('/capstone-stages/{id}', [\App\Http\Controllers\CapstoneStageController::class, 'destroy']);
    Route::get('/terms', [AcademicTermController::class, 'index']);
    Route::post('/terms', [AcademicTermController::class, 'store']);
    Route::put('/terms/{id}', [AcademicTermController::class, 'update']);
    Route::delete('/terms/{id}', [AcademicTermController::class, 'destroy']);
    Route::get('/roster', [ClassRosterController::class, 'index']);
    Route::post('/roster/import', [ClassRosterController::class, 'import']);
    Route::delete('/roster/{id}', [ClassRosterController::class, 'destroy']);
    Route::apiResource('projects', ProjectController::class);
    Route::apiResource('documents', DocumentController::class);
    Route::get('documents/{document}/file', [DocumentController::class, 'file']);
    Route::get('documents/{document}/preview', [DocumentController::class, 'preview']);
    Route::post('documents/save-draft', [DocumentController::class, 'saveDraft']);
    Route::get('documents/{id}/edit-content', [DocumentController::class, 'editContent']);
    Route::post('schedules/check', [ScheduleController::class, 'check']);
    Route::apiResource('schedules', ScheduleController::class);
    Route::get('contributions', [ContributionController::class, 'index']);
    Route::get('contributions/{project}', [ContributionController::class, 'index']);
    Route::post('contributions', [ContributionController::class, 'store']);
    Route::get('projects/{project}/tasks', [TaskController::class, 'index']);
    Route::post('tasks', [TaskController::class, 'store']);
    Route::put('tasks/{id}', [TaskController::class, 'update']);
    Route::delete('tasks/{id}', [TaskController::class, 'destroy']);
    Route::get('documents/{document}/comments', [DocumentCommentController::class, 'index']);
    Route::post('documents/{document}/comments', [DocumentCommentController::class, 'store']);
    Route::put('documents/{document}/comments/{comment}/resolve', [DocumentCommentController::class, 'resolve']);
    Route::delete('documents/{document}/comments/{comment}', [DocumentCommentController::class, 'destroy']);
    Route::get('comment-review', [\App\Http\Controllers\CommentDashboardController::class, 'index']);
    // Verified comment workflow (replies, student corrections, faculty verification).
    Route::get('documents/{document}/comments/{comment}', [\App\Http\Controllers\CommentReviewController::class, 'show']);
    Route::post('documents/{document}/comments/{comment}/replies', [\App\Http\Controllers\CommentReviewController::class, 'reply']);
    Route::post('documents/{document}/comments/{comment}/start', [\App\Http\Controllers\CommentReviewController::class, 'start']);
    Route::post('documents/{document}/comments/{comment}/submit', [\App\Http\Controllers\CommentReviewController::class, 'submit']);
    Route::post('documents/{document}/comments/{comment}/verify', [\App\Http\Controllers\CommentReviewController::class, 'verify']);
    Route::post('documents/{document}/comments/{comment}/reopen', [\App\Http\Controllers\CommentReviewController::class, 'reopen']);
    Route::post('similarity/check', [SimilarityController::class, 'check']);
    Route::post('similarity/explain', [SimilarityController::class, 'explain']);
    Route::get('users', [AuthController::class, 'users']);
    Route::put('users/{id}', [AuthController::class, 'updateUser']);
    Route::post('/users', [AuthController::class, 'createUser']);
    Route::apiResource('groups', GroupController::class);
    Route::put('groups/{id}/panel', [GroupController::class, 'setPanel']);
    Route::put('groups/{id}/recommendation', [GroupController::class, 'recommend']);
    Route::put('groups/{id}/stage-instructors', [GroupController::class, 'setStageInstructors']);
    Route::get('students', [GroupController::class, 'students']);
    Route::get('advisers', [GroupController::class, 'advisers']);
    Route::apiResource('rooms', RoomController::class);
    Route::post('/projects/import', [ProjectController::class, 'importArchived']);
    Route::get('/archive', [ProjectController::class, 'archive']);
    Route::get('/projects/{project}/panel-comments', [\App\Http\Controllers\PanelCommentController::class, 'index']);
    Route::post('/projects/{project}/panel-comments', [\App\Http\Controllers\PanelCommentController::class, 'store']);
    Route::put('/panel-comments/{id}', [\App\Http\Controllers\PanelCommentController::class, 'update']);
    Route::delete('/panel-comments/{id}', [\App\Http\Controllers\PanelCommentController::class, 'destroy']);
    Route::get('/projects/{project}/minutes', [DefenseMinutesController::class, 'index']);
    Route::post('/projects/{project}/minutes', [DefenseMinutesController::class, 'store']);
    Route::delete('/minutes/{id}', [DefenseMinutesController::class, 'destroy']);
    Route::post('/minutes/{id}/items', [DefenseMinutesController::class, 'storeItem']);
    Route::post('/minutes/{id}/import-panel-comments', [DefenseMinutesController::class, 'importPanelComments']);
    Route::get('/onlyoffice/status', [\App\Http\Controllers\OnlyOfficeController::class, 'status']);
    Route::get('/documents/{id}/onlyoffice', [\App\Http\Controllers\OnlyOfficeController::class, 'config']);
    Route::put('/minute-items/{id}', [DefenseMinutesController::class, 'updateItem']);
    Route::delete('/minute-items/{id}', [DefenseMinutesController::class, 'destroyItem']);
    Route::get('/projects/{project}/checklists', [ProjectChecklistController::class, 'index']);
    Route::post('/projects/{project}/checklists', [ProjectChecklistController::class, 'store']);
    Route::put('/checklist-items/{id}', [ProjectChecklistController::class, 'update']);
    Route::delete('/checklist-items/{id}', [ProjectChecklistController::class, 'destroy']);
    Route::get('/projects/{id}/similarity', [ProjectController::class, 'similarityDetail']);
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::put('/notifications/{id}/read', [NotificationController::class, 'markRead']);
    Route::put('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/projects/{id}/recheck-similarity', [ProjectController::class, 'recheckSimilarity']);
    Route::post('/projects/{id}/choose-final', [ProjectController::class, 'chooseFinal']);
    Route::put('/projects/{id}/final-abstract', [ProjectController::class, 'finalAbstract']);
    Route::get('/reports/projects', [ReportController::class, 'projects']);
    Route::get('/reports/similarity', [ReportController::class, 'similarity']);
    Route::get('/reports/schedules', [ReportController::class, 'schedules']);
    Route::get('/reports/contributions', [ReportController::class, 'contributions']);
    Route::get('/reports/document-revisions', [ReportController::class, 'documentRevisions']);
    Route::delete('/users/{id}', [AuthController::class, 'deleteUser']);
    Route::post('/users/{id}/reset-password', [AuthController::class, 'resetUserPassword']);
    Route::get('evaluations', [EvaluationController::class, 'index']);
    Route::post('evaluations', [EvaluationController::class, 'store']);
    Route::get('evaluations/project/{projectId}', [EvaluationController::class, 'show']);
    Route::put('documents/{document}/status', [DocumentController::class, 'updateStatus']);
    Route::get('/school/plan', [SchoolController::class, 'plan']);
    Route::get('/schools', [SchoolController::class, 'index']);
    Route::post('/users/import', [AuthController::class, 'importUsers']);
    }); // enrolled
});