<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

// Someone signed in with a password another person set for them (a new or
// imported account, the shared default, or a staff reset). Until they pick
// their own they may only see who they are (/me), change their password,
// and log out -- everything else is closed.
class EnsurePasswordChanged {
    public function handle(Request $request, Closure $next) {
        $user = $request->user();
        if ($user && $user->must_change_password) {
            return response()->json([
                'message' => 'Please choose your own password before continuing.',
                'code'    => 'password_change_required',
            ], 403);
        }
        return $next($request);
    }
}
