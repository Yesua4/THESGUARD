#!/bin/sh
# Shared entrypoint for both the "web" (Laravel API) and "reverb" (websocket
# server) processes -- they run from the same Docker image, just with a
# different PROCESS_TYPE env var set per Render/Railway service, mirroring
# the Heroku-style Procfile pattern without needing per-platform start-command
# syntax.
set -e

PORT="${PORT:-10000}"

if [ "$PROCESS_TYPE" = "reverb" ]; then
    exec php artisan reverb:start --host=0.0.0.0 --port="$PORT"
fi

php artisan migrate --force --no-interaction
php artisan config:cache
exec php artisan serve --host=0.0.0.0 --port="$PORT"
