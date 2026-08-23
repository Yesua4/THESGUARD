<?php

namespace Tests\Feature;

use App\Mail\NotificationMail;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class NotificationEmailTest extends TestCase
{
    use RefreshDatabase;

    public function test_sending_a_notification_also_emails_the_user(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        app(NotificationService::class)->send($user->id, 'comment', 'New Comment', 'Someone left feedback.');

        Mail::assertSent(NotificationMail::class, function ($mail) use ($user) {
            return $mail->hasTo($user->email) && $mail->notificationTitle === 'New Comment';
        });
        $this->assertDatabaseHas('notifications', ['user_id' => $user->id, 'title' => 'New Comment']);
    }

    public function test_email_failure_does_not_prevent_the_in_app_notification(): void
    {
        // A user with no email address at all shouldn't crash the request —
        // the in-app notification must still be recorded.
        $user = User::factory()->create(['email' => '']);

        app(NotificationService::class)->send($user->id, 'comment', 'New Comment', 'Someone left feedback.');

        $this->assertDatabaseHas('notifications', ['user_id' => $user->id, 'title' => 'New Comment']);
    }
}
