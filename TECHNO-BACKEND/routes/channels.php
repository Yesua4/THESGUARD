<?php

use App\Http\Controllers\DocumentController;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

// Everyone with access to a project (members, adviser, instructor, assigned
// panelists, admin -- same rule DocumentController uses for every read) can
// listen for live updates on it: new/resolved comments, status changes,
// new document versions, evaluation submissions.
Broadcast::channel('Project.{id}', function ($user, $id) {
    return DocumentController::userCanAccessProject($user, $id);
});
