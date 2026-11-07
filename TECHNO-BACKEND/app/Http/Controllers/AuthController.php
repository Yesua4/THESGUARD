<?php
namespace App\Http\Controllers;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Laravel\Socialite\Facades\Socialite;

class AuthController extends Controller {

    private function pepper(): string {
        return env('PASSWORD_PEPPER', '');
    }

    // Student self-registration. The student gives their name, Student No.
    // and email; an instructor later enrolls them by importing the class
    // list (matched on Student No.). If that class list was already
    // imported, they're enrolled right away.
    public function register(Request $request, \App\Services\ClassRosterService $roster) {
        $request->merge([
            'student_id' => \App\Services\ClassRosterService::normalizeStudentId($request->input('student_id')),
        ]);
        $data = $request->validate([
            'last_name'   => 'required|string|max:100',
            'first_name'  => 'required|string|max:100',
            'middle_name' => 'nullable|string|max:100',
            'email'       => 'required|email|unique:users',
            'password'    => 'required|min:12',
            'student_id'  => ['required', 'string', 'max:50', function ($attr, $value, $fail) {
                if (User::whereRaw('UPPER(TRIM(student_id)) = ?', [$value])->exists()) {
                    $fail('This Student No. is already registered. If it is yours, ask your instructor for help.');
                }
            }],
        ], [], ['student_id' => 'Student No.']);

        $data = array_map(fn ($v) => is_string($v) ? trim(preg_replace('/\s+/', ' ', $v)) : $v, $data);
        $data['middle_name'] = ($data['middle_name'] ?? '') ?: null;
        $data['name'] = implode(' ', array_filter([$data['first_name'], $data['middle_name'], $data['last_name']]));

        // Role is NEVER accepted from the request -- self-registered users
        // are always students. school_id can't be self-assigned either; it
        // comes from the class-list import.
        $data['role']      = 'student';
        $data['school_id'] = null;
        $data['password']  = Hash::make($data['password'] . $this->pepper());

        $user = User::create($data);
        $user->forceFill(['awaiting_enrollment' => true])->save();
        $user->syncRoles(['student']);
        if ($entry = $roster->claimForNewStudent($user)) {
            app(\App\Services\LiveUpdateService::class)->directory($entry->school_id, 'student_registered');
        }

        $token = $user->createToken('auth_token')->plainTextToken;
        $user = $user->fresh();
        $school = $user->school_id ? ['id' => $user->school->id, 'name' => $user->school->name] : null;
        return response()->json(['user' => $user->append(['roles', 'handled_sections']), 'token' => $token, 'school' => $school], 201);
    }

    public function login(Request $request) {
        $request->validate([
            'email'    => 'required|email',
            'password' => 'required',
        ]);
        $user = User::where('email', $request->email)->first();
        if (!$user || !Hash::check($request->password . $this->pepper(), $user->password))
            throw ValidationException::withMessages(['email' => 'Invalid credentials.']);
        $token = $user->createToken('auth_token')->plainTextToken;

        $schoolInfo = null;
        if ($user->school_id) {
            $school = $user->school;
            $schoolInfo = [
                'id'   => $school->id,
                'name' => $school->name,
            ];
        }

        return response()->json([
            'user'   => $user->append(['roles', 'handled_sections']),
            'token'  => $token,
            'school' => $schoolInfo,
        ]);
    }

    public function me(Request $request) {
        $user = $request->user();
        // An admin left acting as a student (no longer allowed) goes back to admin.
        if ($user->role === 'admin' && $user->acting_role && !in_array($user->acting_role, User::ADMIN_ACTABLE_ROLES, true)) {
            $user->forceFill(['acting_role' => null])->save();
        }
        $schoolInfo = null;
        if ($user->school_id) {
            $school = $user->school;
            $schoolInfo = [
                'id'   => $school->id,
                'name' => $school->name,
            ];
        }
        return response()->json([
            'user'   => $user->append(['roles', 'handled_sections']),
            'school' => $schoolInfo,
        ]);
    }

    // Switch the active role to another role the admin assigned to this
    // account. Every authorization check reads users.role, so this is all
    // it takes for the sidebar, pages and permissions to follow.
    public function switchRole(Request $request) {
        $data = $request->validate([
            'role' => 'required|string|in:' . implode(',', User::ROLES),
        ]);

        $user = $request->user();
        abort_unless($user->canSwitchTo($data['role']), 403, 'That role is not assigned to your account.');

        if ($user->role === 'admin') {
            // The admin keeps role=admin (and all access); only the screens change.
            $acting = $data['role'] === 'admin' ? null : $data['role'];
            if ($user->acting_role !== $acting) {
                $user->forceFill(['acting_role' => $acting])->save();
                app(\App\Services\LiveUpdateService::class)->account($user->id, 'role_switched');
            }
        } elseif ($user->role !== $data['role']) {
            $user->role = $data['role'];
            $user->save();
            app(\App\Services\LiveUpdateService::class)->account($user->id, 'role_switched');
        }

        return response()->json(['user' => $user->append(['roles', 'handled_sections'])]);
    }

    // ── Google Sign-In (link-only: succeeds only for emails that already
    //    have a ThesisGuard account, created normally by an admin/instructor).
    //    First successful Google login just links google_id/avatar to that
    //    existing account — it never creates a new account or assigns a role.
    public function redirectToGoogle() {
        return Socialite::driver('google')->stateless()->redirect();
    }

    public function handleGoogleCallback(Request $request) {
        $frontend = rtrim(env('FRONTEND_URL', 'http://localhost:5173'), '/');

        try {
            $googleUser = Socialite::driver('google')->stateless()->user();
        } catch (\Exception $e) {
            return redirect($frontend . '/oauth-callback?error=' . urlencode('Google sign-in failed. Please try again.'));
        }

        $user = User::where('email', $googleUser->getEmail())->first();

        if (!$user) {
            return redirect($frontend . '/oauth-callback?error=' . urlencode(
                'No ThesisGuard account found for ' . $googleUser->getEmail() . '. Ask your instructor or administrator to create one first.'
            ));
        }

        if (!$user->google_id) {
            $user->update([
                'google_id' => $googleUser->getId(),
                'avatar'    => $googleUser->getAvatar(),
            ]);
        }

        $token = $user->createToken('auth_token')->plainTextToken;
        return redirect($frontend . '/oauth-callback?token=' . urlencode($token));
    }

    public function logout(Request $request) {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out']);
    }

    // ── List users — scoped to same school ───────────────────
    public function users(Request $request) {
        $user  = $request->user();
        $query = User::query()->with('roleAssignments', 'sectionAssignments');

        if ($user->school_id) {
            $query->where('school_id', $user->school_id);
        }

        // An instructor assigned to specific sections only sees the student
        // accounts in those sections (staff accounts stay visible -- they're
        // needed for adviser/panelist pickers).
        if ($sections = $user->sectionScope()) {
            $query->where(fn ($q) => $q
                ->where('role', '!=', 'student')
                ->orWhere(fn ($s) => User::whereSectionIn($s, 'section', $sections))
            );
        }

        // Matches anyone who HAS the role, not just whoever is currently
        // using it -- an instructor who is also a panelist must still show
        // up in the panelist picker.
        if ($request->filled('role')) {
            $query->withRole($request->query('role'));
        }

        return response()->json($query->get()->each->append(['roles', 'handled_sections']));
    }

    public function updateUser(Request $request, $id) {
        $caller = $request->user();
        abort_unless(in_array($caller->role, ['admin', 'instructor']), 403, 'Only administrators and instructors can manage user accounts.');

        $data = $request->validate([
            'name'       => 'sometimes|string|max:255',
            'email'      => 'sometimes|email|unique:users,email,' . $id,
            'role'       => 'sometimes|in:' . implode(',', User::ROLES),
            'roles'      => 'sometimes|array|min:1',
            'roles.*'    => 'string|in:' . implode(',', User::ROLES),
            'student_id' => 'nullable|string|unique:users,student_id,' . $id,
            'section'    => 'nullable|string|max:100',
            'handled_sections'   => 'sometimes|array',
            'handled_sections.*' => 'string|max:100',
        ]);

        $user = User::findOrFail($id);
        $handledSections = $data['handled_sections'] ?? null;
        unset($data['handled_sections']);

        // Instructors may only manage student accounts, and may never change
        // a role (that would let an instructor promote a student to admin,
        // or move a student out from under this restriction entirely).
        if ($caller->role !== 'admin') {
            $this->assertInstructorCanManage($caller, $user);
            unset($data['role'], $data['roles']);
            $handledSections = null;
            if (array_key_exists('section', $data)) {
                abort_unless($caller->handlesSection($data['section']), 403, 'You can only move students into sections you handle.');
            }
        }

        // `roles` is the full set of assigned roles; a lone `role` (older
        // clients) means "this is now the only role".
        $roles = $data['roles'] ?? (isset($data['role']) ? [$data['role']] : null);
        unset($data['role'], $data['roles']);

        if ($roles !== null) {
            $roles = array_values(array_unique($roles));
            $unchanged = empty(array_diff($roles, $user->assignedRoles())) && empty(array_diff($user->assignedRoles(), $roles));
            abort_if($caller->id === $user->id && !$unchanged, 403, 'You cannot change the roles on your own account.');
            if ($error = User::validateRoleSet($roles)) {
                return response()->json(['message' => $error, 'errors' => ['roles' => [$error]]], 422);
            }
        }

        $user->update($data);
        if ($roles !== null) {
            $user->syncRoles($roles);
        }
        $this->applyHandledSections($user->fresh(), $handledSections);

        $live = app(\App\Services\LiveUpdateService::class);
        $live->account($user->id, 'account_updated');
        $live->directory($user->school_id ?? $caller->school_id, 'user_updated');

        return response()->json($user->fresh()->append(['roles', 'handled_sections']));
    }

    public function createUser(Request $request) {
        $caller = $request->user();
        abort_unless(in_array($caller->role, ['admin', 'instructor']), 403, 'Only administrators and instructors can manage user accounts.');

        $data = $request->validate([
            'name'       => 'required|string|max:255',
            'email'      => 'required|email|unique:users,email',
            'password'   => 'required|min:12',
            'role'       => 'required_without:roles|in:' . implode(',', User::ROLES),
            'roles'      => 'required_without:role|array|min:1',
            'roles.*'    => 'string|in:' . implode(',', User::ROLES),
            'student_id' => 'nullable|string|unique:users,student_id',
            'section'    => 'nullable|string|max:100',
            'handled_sections'   => 'sometimes|array',
            'handled_sections.*' => 'string|max:100',
        ]);

        $roles = array_values(array_unique($data['roles'] ?? [$data['role']]));
        $handledSections = $data['handled_sections'] ?? null;
        unset($data['roles'], $data['handled_sections']);

        // Instructors can only ever create student accounts, regardless of
        // what role value is submitted -- the frontend already hides this
        // field for them, but the server must not trust that.
        if ($caller->role !== 'admin') {
            $roles = ['student'];
            $handledSections = null;

            // A section-scoped instructor's new students must land in one of
            // their sections, or they'd vanish from that instructor's list.
            if ($scope = $caller->sectionScope()) {
                if (empty($data['section']) && count($scope) === 1) {
                    $data['section'] = $scope[0];
                }
                if (!$caller->handlesSection($data['section'] ?? null)) {
                    $msg = 'Choose one of your sections: ' . implode(', ', $scope) . '.';
                    return response()->json(['message' => $msg, 'errors' => ['section' => [$msg]]], 422);
                }
            }
        }

        if ($error = User::validateRoleSet($roles)) {
            return response()->json(['message' => $error, 'errors' => ['roles' => [$error]]], 422);
        }

        $data['role']      = $roles[0];
        $data['school_id'] = $caller->school_id ?? null;
        $data['password']  = Hash::make($data['password'] . $this->pepper());
        $user = User::create($data);
        $user->syncRoles($roles);
        $this->applyHandledSections($user, $handledSections);
        app(\App\Services\LiveUpdateService::class)->directory($user->school_id, 'user_created');
        return response()->json($user->fresh()->append(['roles', 'handled_sections']), 201);
    }

    public function deleteUser(Request $request, $id) {
        $caller = $request->user();
        abort_unless(in_array($caller->role, ['admin', 'instructor']), 403, 'Only administrators and instructors can manage user accounts.');

        if ($caller->id == $id) {
            return response()->json(['message' => 'Cannot delete your own account.'], 403);
        }

        $user = User::findOrFail($id);
        if ($caller->role !== 'admin') {
            $this->assertInstructorCanManage($caller, $user);
        }

        $schoolId = $user->school_id;
        $user->delete();
        app(\App\Services\LiveUpdateService::class)->directory($schoolId, 'user_deleted');
        return response()->json(['message' => 'Deleted']);
    }

    // Instructors manage student accounts only -- and, once the admin has
    // assigned them sections, only students in those sections.
    private function assertInstructorCanManage(User $caller, User $target): void {
        abort_unless($target->assignedRoles() === ['student'], 403, 'Instructors can only manage student accounts.');
        abort_unless($caller->handlesSection($target->section), 403, 'You can only manage students in the sections you handle.');
    }

    // Sections only mean something for instructors: set them when given, and
    // clear them if the account no longer has the instructor role.
    private function applyHandledSections(User $user, ?array $sections): void {
        if (!$user->hasRole('instructor')) {
            $user->syncHandledSections([]);
        } elseif ($sections !== null) {
            $user->syncHandledSections($sections);
        }
    }

    public function changePassword(Request $request) {
        $request->validate([
            'current_password' => 'required',
            'new_password'     => 'required|min:12|confirmed',
        ]);

        $user = $request->user();

        if (!Hash::check($request->current_password . $this->pepper(), $user->password)) {
            return response()->json(['message' => 'Current password is incorrect.'], 422);
        }

        $user->update([
            'password' => Hash::make($request->new_password . $this->pepper())
        ]);

        return response()->json(['message' => 'Password changed successfully.']);
    }

    // Sends a reset link (via User::sendPasswordResetNotification, overridden
    // on the model to point at the SPA's own /reset-password page instead of
    // Laravel's default backend route). Always returns the same generic
    // message regardless of whether the email exists, so this can't be used
    // to enumerate registered accounts.
    public function forgotPassword(Request $request) {
        $request->validate(['email' => 'required|email']);

        \Illuminate\Support\Facades\Password::sendResetLink(
            $request->only('email')
        );

        return response()->json([
            'message' => 'If an account exists for that email, a password reset link has been sent.',
        ]);
    }

    // Laravel's password broker validates the token/email pair against the
    // password_reset_tokens table itself -- this only needs to supply the
    // callback that actually writes the new password, and it must apply the
    // same pepper as every other password write in this app (login,
    // register, changePassword) or the user would be locked out of their
    // own newly-reset password.
    public function resetPassword(Request $request) {
        $data = $request->validate([
            'email'    => 'required|email',
            'token'    => 'required',
            'password' => 'required|min:12|confirmed',
        ]);

        $status = \Illuminate\Support\Facades\Password::reset(
            $data,
            function ($user, $password) {
                $user->forceFill([
                    'password' => Hash::make($password . $this->pepper()),
                ])->save();
            }
        );

        if ($status !== \Illuminate\Support\Facades\Password::PASSWORD_RESET) {
            return response()->json(['message' => __($status)], 422);
        }

        return response()->json(['message' => 'Password has been reset successfully.']);
    }

    public function importUsers(Request $request) {
    abort_unless(in_array($request->user()->role, ['admin', 'instructor']), 403, 'Only administrators and instructors can manage user accounts.');
    $request->validate([
        'file' => 'required|file|mimes:csv,txt|max:2048',
    ]);

    $admin = $request->user();

    $csv = \League\Csv\Reader::createFromPath($request->file('file')->getPathname(), 'r');
    $csv->setHeaderOffset(0);

    $records = collect($csv->getRecords());
    $created = 0;
    $skipped = [];
    $roleCounts = [];

    foreach ($records as $index => $row) {
        $name       = trim($row['name']       ?? $row['Name']       ?? '');
        $email      = trim($row['email']      ?? $row['Email']      ?? '');
        $student_id = trim($row['student_id'] ?? $row['Student ID'] ?? $row['student id'] ?? '');
        $password   = trim($row['password']   ?? $row['Password']   ?? '');
        $section    = trim($row['section']    ?? $row['Section']    ?? $row['course'] ?? $row['Course'] ?? '');

        if (!$name || !$email) {
            $skipped[] = "Row " . ($index + 2) . ": Missing name or email.";
            continue;
        }

        // Default password if not provided
        if (!$password) {
            $password = 'ThesisGuard2025!';
        }

        if (strlen($password) < 12) {
            $skipped[] = "Row " . ($index + 2) . " ({$email}): Password must be at least 12 characters.";
            continue;
        }

        // Check duplicates
        if (User::where('email', $email)->exists()) {
            $skipped[] = "Row " . ($index + 2) . " ({$email}): Email already exists.";
            continue;
        }
        if ($student_id && User::where('student_id', $student_id)->exists()) {
            $skipped[] = "Row " . ($index + 2) . " ({$email}): Student ID already exists.";
            continue;
        }

        // Admins may give several roles separated by "|" or ";", e.g.
        // "instructor|adviser|panelist". Unknown values are ignored; an
        // empty result falls back to student.
        $roles = ['student'];
        if ($admin->role === 'admin') {
            $rawRoles = strtolower($row['role'] ?? $row['Role'] ?? $row['roles'] ?? $row['Roles'] ?? '');
            $parsed = array_values(array_unique(array_intersect(
                array_map('trim', preg_split('/[|;]/', $rawRoles)),
                User::ROLES
            )));
            if ($parsed) {
                if ($error = User::validateRoleSet($parsed)) {
                    $skipped[] = "Row " . ($index + 2) . " ({$email}): {$error}";
                    continue;
                }
                $roles = $parsed;
            }
        }
        $role = $roles[0];

        if ($scope = $admin->sectionScope()) {
            if (!$section && count($scope) === 1) {
                $section = $scope[0];
            }
            if (!$admin->handlesSection($section)) {
                $skipped[] = "Row " . ($index + 2) . " ({$email}): Section must be one of yours (" . implode(', ', $scope) . ").";
                continue;
            }
        }

        $newUser = User::create([
            'name'       => $name,
            'email'      => $email,
            'student_id' => $student_id ?: null,
            'section'    => $section ?: null,
            'role'       => $role,
            'school_id'  => $admin->school_id,
            'password'   => \Illuminate\Support\Facades\Hash::make($password . $this->pepper()),
        ]);
        $newUser->syncRoles($roles);

        foreach ($roles as $r) {
            $roleCounts[$r] = ($roleCounts[$r] ?? 0) + 1;
        }
        $created++;
    }

    // Build a message that reflects what was actually imported instead of
    // always saying "student(s)", since admins can import a mix of roles.
    if ($created === 0) {
        $message = 'No users were imported.';
    } else {
        $breakdown = collect($roleCounts)
            ->map(fn ($count, $role) => "{$count} " . \Illuminate\Support\Str::plural($role, $count))
            ->implode(', ');
        $message = "{$created} user(s) imported successfully ({$breakdown}).";
    }

    if ($created > 0) {
        app(\App\Services\LiveUpdateService::class)->directory($admin->school_id, 'users_imported');
    }

    return response()->json([
        'created' => $created,
        'skipped' => $skipped,
        'message' => $message,
    ]);
    }
}