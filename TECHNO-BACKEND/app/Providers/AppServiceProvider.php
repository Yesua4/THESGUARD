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
        // One instance per request: it collects every model change and
        // flushes a single combined live update when the request ends.
        $this->app->singleton(\App\Services\LiveUpdateService::class);
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

        // A student's section changed (e.g. a new class list) -> their
        // group follows, so section-based instructor access stays right.
        \App\Models\User::updated(function ($user) {
            if ($user->wasChanged('section')) \App\Services\CapstoneStageService::syncSectionsForUser($user);
        });

        // Realtime by default: any save/delete of a school's data tells the
        // pages showing it to refetch (see LiveUpdateService::MODEL_TYPES).
        foreach (array_keys(\App\Services\LiveUpdateService::MODEL_TYPES) as $model) {
            $model::saved(fn ($m) => app(\App\Services\LiveUpdateService::class)->modelChanged($m));
            $model::deleted(fn ($m) => app(\App\Services\LiveUpdateService::class)->modelChanged($m));
        }
    }
}
