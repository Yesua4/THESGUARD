<?php
namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class NotificationMail extends Mailable {
    use Queueable;

    public function __construct(
        public string $notificationTitle,
        public string $notificationMessage,
    ) {}

    public function envelope(): Envelope {
        return new Envelope(subject: $this->notificationTitle);
    }

    public function content(): Content {
        return new Content(
            view: 'emails.notification',
            with: [
                'notificationTitle'   => $this->notificationTitle,
                'notificationMessage' => $this->notificationMessage,
            ],
        );
    }
}
