<?php

use App\Http\Controllers\DocumentController;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

// A school's admins and instructors: live refresh of User Accounts and the
// Class Roster when accounts are created/edited/enrolled. Checks the ACTIVE
// role, so a faculty member switched to panelist stops receiving these.
Broadcast::channel('School.{id}.staff', function ($user, $id) {
    return (int) $user->school_id === (int) $id
        && in_array($user->role, ['admin', 'instructor'], true);
});

// Everyone with access to a project (members, adviser, instructor, assigned
// panelists, admin -- same rule DocumentController uses for every read) can
// listen for live updates on it: new/resolved comments, status changes,
// new document versions, evaluation submissions.
Broadcast::channel('Project.{id}', function ($user, $id) {
    return DocumentController::userCanAccessProject($user, $id);
});
