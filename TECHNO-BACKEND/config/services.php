<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'similarity_url' => env('SIMILARITY_SERVICE_URL', 'http://localhost:8001'),

    'google' => [
        'client_id'     => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect'      => env('GOOGLE_REDIRECT_URI', env('APP_URL') . '/api/auth/google/callback'),
    ],

    // Path to the LibreOffice/soffice binary used to convert uploaded Word
    // documents to PDF for in-app preview. Falls back to common install
    // locations if not set explicitly; leave both unresolved to disable
    // conversion (uploads still work, previews just aren't generated).
    'libreoffice_path' => env('LIBREOFFICE_PATH') ?: collect([
        'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
        '/usr/bin/soffice',
        '/usr/bin/libreoffice',
        '/opt/homebrew/bin/soffice',
    ])->first(fn ($path) => file_exists($path)),

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];