<?php

namespace App\Http\Controllers;

use App\Models\School;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class SchoolController extends Controller
{
    /**
     * Register a new school + its first admin account.
     * POST /api/schools/register
     */
    public function register(Request $request)
    {
        $data = $request->validate([
            // School details
            'school_name'    => 'required|string|max:255',
            'school_email'   => 'required|email|unique:schools,email',
            'school_address' => 'nullable|string|max:500',

            // First admin account
            'admin_name'     => 'required|string|max:255',
            'admin_email'    => 'required|email|unique:users,email',
            'admin_password' => 'required|min:12|confirmed',
        ]);

        // Create slug from school name
        $slug = Str::slug($data['school_name']);
        $originalSlug = $slug;
        $count = 1;
        while (School::where('slug', $slug)->exists()) {
            $slug = $originalSlug . '-' . $count++;
        }

        $school = School::create([
            'name'    => $data['school_name'],
            'slug'    => $slug,
            'email'   => $data['school_email'],
            'address' => $data['school_address'] ?? null,
        ]);

        // Create the admin user for this school
        $pepper = env('PASSWORD_PEPPER', '');
        $admin = User::create([
            'name'      => $data['admin_name'],
            'email'     => $data['admin_email'],
            'password'  => Hash::make($data['admin_password'] . $pepper),
            'role'      => 'admin',
            'school_id' => $school->id,
        ]);

        $token = $admin->createToken('auth_token')->plainTextToken;

        return response()->json([
            'message' => 'School registered successfully.',
            'school'  => $school,
            'user'    => $admin,
            'token'   => $token,
        ], 201);
    }

    /**
     * Get the current school's info.
     * GET /api/school/plan
     */
    public function plan(Request $request)
    {
        $user = $request->user();

        if (!$user->school_id) {
            return response()->json(['message' => 'No school associated with this account.'], 404);
        }

        return response()->json([
            'school' => $user->school->name,
        ]);
    }

    /**
     * Get all schools — admin only.
     * GET /api/schools
     *
     * Previously this also accepted a shared secret via an X-ThesisGuard-Key
     * header/query param as an alternative to real auth. That key was read
     * from a VITE_-prefixed env var, which Vite always inlines into the
     * public JS bundle at build time -- so the "secret" shipped in plain
     * text to every visitor and bypassed login entirely. Removed; this now
     * requires a real authenticated admin, same as every other admin-only
     * endpoint in the app.
     */
    public function index(Request $request)
    {
        abort_unless($request->user()?->role === 'admin', 403, 'Only administrators can view the school directory.');

        return response()->json(School::withCount('users')->get());
    }
}
