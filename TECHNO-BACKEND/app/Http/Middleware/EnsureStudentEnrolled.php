<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

// A self-registered student has no school until an instructor imports a
// class list with their Student No. Until then they may only see who they
// are (/me), log out, and change their password -- without a school_id the
// usual school scoping wouldn't apply, so nothing else is reachable.
class EnsureStudentEnrolled {
    public function handle(Request $request, Closure $next) {
        $user = $request->user();
        if ($user && $user->awaiting_enrollment) {
            return response()->json([
                'message' => 'Your account is waiting for your instructor to enroll you.',
                'code'    => 'not_enrolled',
            ], 403);
        }
        return $next($request);
    }
}
