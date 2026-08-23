<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Nightly DB + document backup, with retention pruning and a health check.
// The Laravel scheduler itself needs to be running for these to fire: add
// `* * * * * php artisan schedule:run` to the server's crontab in production,
// or run `php artisan schedule:work` in a terminal during local development.
Schedule::command('backup:run')->daily()->at('02:00');
Schedule::command('backup:clean')->daily()->at('01:30');
Schedule::command('backup:monitor')->daily()->at('03:00');
