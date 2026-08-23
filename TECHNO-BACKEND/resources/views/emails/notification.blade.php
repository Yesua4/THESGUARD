<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background:#f1f5f9; font-family: Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9; padding:24px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:14px; overflow:hidden;">
                    <tr>
                        <td style="background:linear-gradient(135deg,#0a1f44,#1040a0); background-color:#0a1f44; padding:20px 24px;">
                            <span style="color:#ffffff; font-size:14px; font-weight:bold; letter-spacing:0.05em;">{{ config('app.name') }}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:28px 24px;">
                            <h2 style="margin:0 0 12px; font-size:18px; color:#0a1f44;">{{ $notificationTitle }}</h2>
                            <p style="margin:0 0 20px; font-size:14px; line-height:1.6; color:#334155;">{{ $notificationMessage }}</p>
                            <p style="margin:0; font-size:12px; color:#94a3b8;">
                                You're receiving this because you have an account on {{ config('app.name') }}.
                                Log in to view details or manage your notification preferences.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
