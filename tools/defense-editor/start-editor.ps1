# Starts the Word editor (ONLYOFFICE) on this laptop for a defense and
# connects it to ThesisGuard. Keep this window open during the defense.
# Closing it (or running stop-editor) switches the editor off again; if the
# laptop just goes offline, ThesisGuard switches it off by itself after 15 min.
#
# Needs: Docker Desktop, cloudflared.exe and secret.txt in this folder.
# Docker installed on drive D: make its command available even before a restart.
foreach ($d in @('D:\Docker\DockerDesktop\resources\bin', "$env:ProgramFiles\Docker\Docker\resources\bin")) { if ((Test-Path $d) -and ($env:PATH -notlike "*$d*")) { $env:PATH = "$d;$env:PATH" } }
$ErrorActionPreference = 'Stop'
$Here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = 'https://thesguard-production.up.railway.app'
$Port    = 8085
$Name    = 'tg-onlyoffice'
$Image   = 'onlyoffice/documentserver'

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Fail($text) { Say "`n  PROBLEM: $text" Red; Say "  Take a photo of this window and send it to Claude.`n" Yellow; Read-Host '  Press Enter to close'; exit 1 }

Clear-Host
Say "`n  ThesisGuard Word Editor - starting (about 2-5 minutes)`n" Cyan

$SecretFile = Join-Path $Here 'secret.txt'
if (-not (Test-Path $SecretFile)) { Fail "secret.txt is missing in $Here" }
$Secret = (Get-Content $SecretFile -Raw).Trim()

# Keep the laptop awake while this window is open.
Add-Type -Namespace TG -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
[void][TG.Power]::SetThreadExecutionState([uint32]'0x80000003')

# 1. Docker
Say '  [1/4] Starting Docker...'
$dockerOk = $false
try { docker info *> $null; $dockerOk = ($LASTEXITCODE -eq 0) } catch {}
if (-not $dockerOk) {
    $exe = @('D:\Docker\DockerDesktop\Docker Desktop.exe', "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $exe) { Fail 'Docker Desktop is not installed.' }
    Start-Process $exe
    for ($i = 0; $i -lt 90 -and -not $dockerOk; $i++) {
        Start-Sleep 2
        try { docker info *> $null; $dockerOk = ($LASTEXITCODE -eq 0) } catch {}
    }
    if (-not $dockerOk) { Fail 'Docker did not start. Open Docker Desktop once by hand, then try again.' }
}
Say '        Docker is running.' Green

# 2. The editor itself
Say '  [2/4] Starting the editor...'
$exists = docker ps -a --filter "name=^$Name$" --format '{{.Names}}'
if ($exists) { docker start $Name | Out-Null }
else {
    Say '        First time: downloading the editor (a few GB, only once)...' Yellow
    docker run -d --name $Name --restart no -p "${Port}:80" -e JWT_ENABLED=true -e "JWT_SECRET=$Secret" $Image | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'Could not start the editor container.' }
}
$healthy = $false
for ($i = 0; $i -lt 150 -and -not $healthy; $i++) {
    Start-Sleep 2
    try { $healthy = ((Invoke-WebRequest "http://localhost:$Port/healthcheck" -UseBasicParsing -TimeoutSec 3).Content.Trim() -eq 'true') } catch {}
}
if (-not $healthy) { Fail 'The editor did not become ready in 5 minutes.' }

# The editor restarts its own services once, ~2-3 minutes after starting,
# while it prepares fonts. Anyone editing at that moment gets "Connection
# is lost", so wait until it has been up 3+ minutes with no restart for 60s.
Say '        Warming up (about 3 minutes)...'
$started = [datetime](docker inspect -f '{{.State.StartedAt}}' $Name)
$lastCount = -1; $stableSince = Get-Date
for ($i = 0; $i -lt 120; $i++) {
    $count = [int](docker exec $Name sh -c "grep -c 'spawned: .docservice.' /var/log/supervisor/supervisord.log 2>/dev/null || echo 0")
    if ($count -ne $lastCount) { $lastCount = $count; $stableSince = Get-Date }
    $upFor = ((Get-Date).ToUniversalTime() - $started.ToUniversalTime()).TotalSeconds
    $ok = $false
    try { $ok = ((Invoke-WebRequest "http://localhost:$Port/healthcheck" -UseBasicParsing -TimeoutSec 3).Content.Trim() -eq 'true') } catch {}
    if ($ok -and $upFor -ge 200 -and ((Get-Date) - $stableSince).TotalSeconds -ge 60) { break }
    Start-Sleep 5
}
Say '        Editor is ready.' Green

# 3. Internet address (free Cloudflare tunnel; the address changes every start)
Say '  [3/4] Connecting to the internet...'
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
$log = Join-Path $Here 'tunnel.log'
Remove-Item $log -ErrorAction SilentlyContinue
$tunnel = Start-Process (Join-Path $Here 'cloudflared.exe') -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://localhost:$Port", '--logfile', $log) -WindowStyle Hidden -PassThru
$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
    Start-Sleep 1
    if (Test-Path $log) { $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1; if ($m) { $url = $m.Matches[0].Value } }
}
if (-not $url) { Fail 'Could not get an internet address. Check the Wi-Fi.' }
Say "        Address: $url" Green

# 4. Tell ThesisGuard where the editor is (signed with the shared secret).
function B64Url([byte[]]$b) { [Convert]::ToBase64String($b).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
function Register($address) {
    $header  = B64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
    $exp     = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + 300
    $payload = B64Url ([Text.Encoding]::UTF8.GetBytes((@{ purpose = 'register'; url = $address; exp = $exp } | ConvertTo-Json -Compress)))
    $hmac    = New-Object Security.Cryptography.HMACSHA256 (, [Text.Encoding]::UTF8.GetBytes($Secret))
    $sig     = B64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$header.$payload")))
    $body    = @{ token = "$header.$payload.$sig" } | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Post -Uri "$Backend/api/onlyoffice/register" -Body $body -ContentType 'application/json' -TimeoutSec 30
}
Say '  [4/4] Connecting to ThesisGuard...'
$ok = $false
for ($i = 0; $i -lt 10 -and -not $ok; $i++) {
    try { $r = Register $url; $ok = [bool]$r.enabled } catch { Start-Sleep 5 }
}
if (-not $ok) { Fail 'ThesisGuard did not accept the editor. Check that ONLYOFFICE_JWT_SECRET in Railway matches secret.txt.' }

Say "`n  ==========================================================" Green
Say '   The Word editor is ON. Students can now click Edit on a .docx.' Green
Say '   KEEP THIS WINDOW OPEN during the defense. Keep the charger in.' Green
Say "  ==========================================================`n" Green
Say '  To stop: close this window, or double-click "Stop ThesisGuard Editor".'

try {
    while ($true) {
        Start-Sleep 240
        if ($tunnel.HasExited) { Fail 'The internet connection dropped. Close this window and double-click Start again.' }
        try { [void](Register $url); Say ("  " + (Get-Date -Format 'h:mm tt') + '  still on') DarkGray }
        catch { Say '  Could not reach ThesisGuard (will retry)...' Yellow }
    }
} finally {
    try { [void](Register $null) } catch {}
    if (-not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
    docker stop $Name *> $null
    [void][TG.Power]::SetThreadExecutionState([uint32]'0x80000000')
}
