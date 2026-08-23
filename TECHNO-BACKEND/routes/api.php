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



Route::middleware('throttle:10,1')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/schools/register', [SchoolController::class, 'register']);
});
// Google Sign-In (link-only — see AuthController::handleGoogleCallback).
// Not behind the login throttle: this is a redirect flow through Google,
// not a credential-guessing surface.
Route::get('/auth/google/redirect', [AuthController::class, 'redirectToGoogle']);
Route::get('/auth/google/callback', [AuthController::class, 'handleGoogleCallback']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::apiResource('projects', ProjectController::class);
    Route::apiResource('documents', DocumentController::class);
    Route::get('documents/{document}/file', [DocumentController::class, 'file']);
    Route::get('documents/{document}/preview', [DocumentController::class, 'preview']);
    Route::post('documents/save-draft', [DocumentController::class, 'saveDraft']);
    Route::get('documents/{id}/edit-content', [DocumentController::class, 'editContent']);
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
    Route::post('similarity/check', [SimilarityController::class, 'check']);
    Route::post('similarity/explain', [SimilarityController::class, 'explain']);
    Route::get('users', [AuthController::class, 'users']);
    Route::put('users/{id}', [AuthController::class, 'updateUser']);
    Route::post('/users', [AuthController::class, 'createUser']);
    Route::apiResource('groups', GroupController::class);
    Route::get('students', [GroupController::class, 'students']);
    Route::get('advisers', [GroupController::class, 'advisers']);
    Route::apiResource('rooms', RoomController::class);
    Route::get('/projects/{id}/similarity', [ProjectController::class, 'similarityDetail']);
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::put('/notifications/{id}/read', [NotificationController::class, 'markRead']);
    Route::put('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/projects/{id}/recheck-similarity', [ProjectController::class, 'recheckSimilarity']);
    Route::post('/projects/{id}/choose-final', [ProjectController::class, 'chooseFinal']);
    Route::get('/reports/projects', [ReportController::class, 'projects']);
    Route::get('/reports/similarity', [ReportController::class, 'similarity']);
    Route::get('/reports/schedules', [ReportController::class, 'schedules']);
    Route::get('/reports/contributions', [ReportController::class, 'contributions']);
    Route::get('/reports/document-revisions', [ReportController::class, 'documentRevisions']);
    Route::delete('/users/{id}', [AuthController::class, 'deleteUser']);
    Route::get('evaluations', [EvaluationController::class, 'index']);
    Route::post('evaluations', [EvaluationController::class, 'store']);
    Route::get('evaluations/project/{projectId}', [EvaluationController::class, 'show']);
    Route::put('profile/change-password', [AuthController::class, 'changePassword']);
    Route::put('documents/{document}/status', [DocumentController::class, 'updateStatus']);
    Route::get('/evaluations', [EvaluationController::class, 'index']);
    Route::post('/evaluations', [EvaluationController::class, 'store']);
    Route::get('/evaluations/project/{projectId}', [EvaluationController::class, 'show']);
    Route::get('/school/plan', [SchoolController::class, 'plan']);
    Route::get('/schools', [SchoolController::class, 'index']);
    Route::post('/users/import', [AuthController::class, 'importUsers']);
});