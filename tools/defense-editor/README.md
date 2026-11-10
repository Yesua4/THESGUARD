# Defense-day Word editor (ONLYOFFICE on a laptop)

For defenses only: runs ONLYOFFICE Document Server on a Windows laptop with
Docker Desktop and exposes it through a free Cloudflare quick tunnel. The
start script registers the tunnel address with ThesisGuard
(`POST /api/onlyoffice/register`, a short-lived HS256 token signed with the
shared secret); the address lapses after 15 minutes without a refresh.

Setup (once):
1. Install Docker Desktop with its data on drive D.
2. Put `cloudflared.exe` and these scripts in `D:\ThesisGuardEditor\`.
3. Create `D:\ThesisGuardEditor\secret.txt` with a random secret. Never commit it.
4. In Railway (backend > Variables) set `ONLYOFFICE_JWT_SECRET` (same secret) and
   `ONLYOFFICE_BACKEND_URL=https://thesguard-production.up.railway.app`.
   Leave `ONLYOFFICE_URL` empty.

Defense day: double-click **Start ThesisGuard Editor** on the desktop and keep the
window open; afterwards double-click **Stop ThesisGuard Editor**.
