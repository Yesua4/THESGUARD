# Switches the defense Word editor off: tells ThesisGuard, closes the
# internet tunnel and stops the editor so the laptop is back to normal.
$Here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = 'https://thesguard-production.up.railway.app'
$Secret  = (Get-Content (Join-Path $Here 'secret.txt') -Raw).Trim()

function B64Url([byte[]]$b) { [Convert]::ToBase64String($b).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
$header  = B64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
$payload = B64Url ([Text.Encoding]::UTF8.GetBytes((@{ purpose = 'register'; url = $null; exp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + 300 } | ConvertTo-Json -Compress)))
$hmac    = New-Object Security.Cryptography.HMACSHA256 (, [Text.Encoding]::UTF8.GetBytes($Secret))
$sig     = B64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$header.$payload")))
try { Invoke-RestMethod -Method Post -Uri "$Backend/api/onlyoffice/register" -Body (@{ token = "$header.$payload.$sig" } | ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 30 | Out-Null } catch {}

Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
docker stop tg-onlyoffice *> $null
Write-Host "`n  The Word editor is OFF. The laptop is back to normal.`n" -ForegroundColor Green
Start-Sleep 3
