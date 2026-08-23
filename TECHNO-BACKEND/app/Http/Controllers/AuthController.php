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

    public function register(Request $request) {
    $data = $request->validate([
        'name'       => 'required|string|max:255',
        'email'      => 'required|email|unique:users',
        'password'   => 'required|min:12',
        'student_id' => 'nullable|string|unique:users,student_id',
    ]);

    // Role is NEVER accepted from the request — self-registered users are
    // always students. Admins use createUser() to assign other roles.
    $data['role']      = 'student';
    $data['password']  = Hash::make($data['password'] . $this->pepper());

    // school_id cannot be self-assigned either — an admin must assign it later,
    // or use the school registration flow (SchoolController::register)
    $data['school_id'] = null;

    $user  = User::create($data);
    $token = $user->createToken('auth_token')->plainTextToken;
    return response()->json(['user' => $user, 'token' => $token], 201);
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
            'user'   => $user,
            'token'  => $token,
            'school' => $schoolInfo,
        ]);
    }

    public function me(Request $request) {
        $user = $request->user();
        $schoolInfo = null;
        if ($user->school_id) {
            $school = $user->school;
            $schoolInfo = [
                'id'   => $school->id,
                'name' => $school->name,
            ];
        }
        return response()->json([
            'user'   => $user,
            'school' => $schoolInfo,
        ]);
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
        $query = User::query();

        if ($user->school_id) {
            $query->where('school_id', $user->school_id);
        }

        if ($request->filled('role')) {
            $query->where('role', $request->query('role'));
        }

        return response()->json($query->get());
    }

    public function updateUser(Request $request, $id) {
        $caller = $request->user();
        abort_unless(in_array($caller->role, ['admin', 'instructor']), 403, 'Only administrators and instructors can manage user accounts.');

        $data = $request->validate([
            'name'       => 'sometimes|string|max:255',
            'email'      => 'sometimes|email|unique:users,email,' . $id,
            'role'       => 'sometimes|in:admin,instructor,adviser,student,panelist',
            'student_id' => 'nullable|string|unique:users,student_id,' . $id,
            'section'    => 'nullable|string|max:100'
        ]);

        $user = User::findOrFail($id);

        // Instructors may only manage student accounts, and may never change
        // a role (that would let an instructor promote a student to admin,
        // or move a student out from under this restriction entirely).
        if ($caller->role !== 'admin') {
            abort_unless($user->role === 'student', 403, 'Instructors can only manage student accounts.');
            unset($data['role']);
        }

        $user->update($data);
        return response()->json($user);
    }

    public function createUser(Request $request) {
        $caller = $request->user();
        abort_unless(in_array($caller->role, ['admin', 'instructor']), 403, 'Only administrators and instructors can manage user accounts.');

        $data = $request->validate([
            'name'       => 'required|string|max:255',
            'email'      => 'required|email|unique:users,email',
            'password'   => 'required|min:12',
            'role'       => 'required|in:admin,instructor,adviser,student,panelist',
            'student_id' => 'nullable|string|unique:users,student_id',
            'section'    => 'nullable|string|max:100'
        ]);

        // Instructors can only ever create student accounts, regardless of
        // what role value is submitted -- the frontend already hides this
        // field for them, but the server must not trust that.
        if ($caller->role !== 'admin') {
            $data['role'] = 'student';
        }

        $data['school_id'] = $caller->school_id ?? null;
        $data['password']  = Hash::make($data['password'] . $this->pepper());
        $user = User::create($data);
        return response()->json($user, 201);
    }

    public function deleteUser(Request $request, $id) {
        $caller = $request->user();
        abort_unless(in_array($caller->role, ['admin', 'instructor']), 403, 'Only administrators and instructors can manage user accounts.');

        if ($caller->id == $id) {
            return response()->json(['message' => 'Cannot delete your own account.'], 403);
        }

        $user = User::findOrFail($id);
        if ($caller->role !== 'admin') {
            abort_unless($user->role === 'student', 403, 'Instructors can only manage student accounts.');
        }

        $user->delete();
        return response()->json(['message' => 'Deleted']);
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

        User::create([
            'name'       => $name,
            'email'      => $email,
            'student_id' => $student_id ?: null,
            'section'    => $section ?: null,
            'role' => $admin->role === 'admin'
    ? (in_array(strtolower($row['role'] ?? ''), ['student','adviser','instructor','panelist','admin'])
        ? strtolower($row['role'])
        : 'student')
        : 'student',
            'school_id'  => $admin->school_id,
            'password'   => \Illuminate\Support\Facades\Hash::make($password . $this->pepper()),
        ]);

        $created++;
    }

    return response()->json([
        'created' => $created,
        'skipped' => $skipped,
        'message' => "{$created} student(s) imported successfully.",
    ]);
    }
}