<?php

namespace App\Providers;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // This is an API-only backend with a separate SPA frontend --
        // Laravel's default password-reset email links to a backend web
        // route that doesn't exist here, so every reset link is pointed at
        // the frontend's own reset-password page instead. The frontend then
        // submits {email, token, password} to POST /api/password/reset.
        ResetPassword::createUrlUsing(function ($user, string $token) {
            $frontend = rtrim(env('FRONTEND_URL', 'http://localhost:5173'), '/');
            return "{$frontend}/reset-password?token={$token}&email=" . urlencode($user->email);
        });
    }
}
