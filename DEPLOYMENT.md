# Deployment

Three services deploy from this repo, plus the frontend on Vercel:

| Service | Folder | Process | Notes |
|---|---|---|---|
| Backend API | `TECHNO-BACKEND/` | web (`php artisan serve`) | Docker build |
| Reverb (websockets) | `TECHNO-BACKEND/` | reverb (`php artisan reverb:start`) | Same image as backend, `PROCESS_TYPE=reverb` |
| Similarity service | `similarity-service/` | `uvicorn main:app` | Python, no Docker needed |
| Frontend | `TECHNO-FRONTEND/` | static build | Vercel |

The database (Supabase Postgres) is hosted independently of both Railway and
Render — switching platforms never touches it.

## Current status (as of this doc)

- **Railway**: the original deployment. Trial expired, all 3 services
  offline. **Project kept intact on purpose** — do not delete it. Env vars
  stay stored on each service even while offline, so it's a one-click
  "Restart" away if we ever swap back, with zero rebuilding needed.
- **Render**: new deployment to avoid Railway's rising usage bill. Set up
  per the steps below.

Both platforms can read this same repo and the same `Dockerfile` —
nothing about Railway was changed or removed when Render support was added.

## Required secrets (same values on every platform)

These must be the **exact same values** everywhere they're used — generating
new ones breaks already-encrypted DB data (`APP_KEY`), breaks the frontend's
already-deployed Reverb client config (`REVERB_APP_*`), or breaks existing
password hashes (`PASSWORD_PEPPER`). Copy them from wherever they're
currently set (e.g. Railway's dashboard) into the new platform — don't
regenerate.

- `APP_KEY`
- `REVERB_APP_ID`, `REVERB_APP_KEY`, `REVERB_APP_SECRET`
- `PASSWORD_PEPPER`
- `DB_*` (Supabase Postgres credentials)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

## Render setup (manual, via dashboard — New → Web Service)

### 1. Backend API (`thesguard-backend`)
- Repo root directory: `TECHNO-BACKEND`
- Runtime: **Docker** (Render auto-detects the `Dockerfile`)
- Plan: Free (or Starter if the free tier's cold-start is unacceptable)
- Env vars:
  ```
  PROCESS_TYPE=web
  APP_NAME=ThesisGuard
  APP_ENV=production
  APP_DEBUG=false
  APP_KEY=<copy from Railway>
  APP_URL=https://thesguard-backend.onrender.com
  DB_CONNECTION=pgsql
  DB_HOST=<Supabase host>
  DB_PORT=<Supabase port>
  DB_DATABASE=postgres
  DB_USERNAME=<Supabase user>
  DB_PASSWORD=<Supabase password>
  SESSION_DRIVER=database
  CACHE_STORE=database
  QUEUE_CONNECTION=database
  BROADCAST_CONNECTION=reverb
  REVERB_APP_ID=<copy from Railway>
  REVERB_APP_KEY=<copy from Railway>
  REVERB_APP_SECRET=<copy from Railway>
  REVERB_HOST=thesguard-reverb.onrender.com
  REVERB_PORT=443
  REVERB_SCHEME=https
  PASSWORD_PEPPER=<copy from Railway>
  SIMILARITY_SERVICE_URL=https://thesguard-similarity.onrender.com
  FRONTEND_URL=<your Vercel URL>
  GOOGLE_CLIENT_ID=<copy from Railway>
  GOOGLE_CLIENT_SECRET=<copy from Railway>
  GOOGLE_REDIRECT_URI=https://thesguard-backend.onrender.com/api/auth/google/callback
  MAIL_MAILER=log
  ```
  (Switch `MAIL_MAILER` to `smtp` + real credentials once you have an SMTP
  provider — `log` just writes emails to the log file, same as local dev.)
- **Important:** after creating this service, update Google Cloud Console's
  OAuth "Authorized redirect URI" to match the new
  `GOOGLE_REDIRECT_URI`, or Google Sign-In will fail.

### 2. Reverb websocket server (`thesguard-reverb`)
- Same repo, same root directory (`TECHNO-BACKEND`), same Dockerfile.
- Env vars: identical to the backend service above, **except**:
  ```
  PROCESS_TYPE=reverb
  ```
- This process does not need `APP_URL`/`FRONTEND_URL` to be exactly right
  (it doesn't serve HTTP routes), but leaving them set is harmless.

### 3. Similarity service (`thesguard-similarity`)
- Repo root directory: `similarity-service`
- Runtime: **Python 3**
- Build command:
  ```
  pip install -r requirements.txt && python -m spacy download en_core_web_sm && python -m nltk.downloader stopwords
  ```
- Start command:
  ```
  uvicorn main:app --host 0.0.0.0 --port $PORT
  ```
- No env vars required.

### 4. After all 3 are live
1. Update `TECHNO-FRONTEND/vercel.json`'s rewrite destination from the
   Railway URL to `https://thesguard-backend.onrender.com` (done below).
2. In Vercel's project settings, update `VITE_REVERB_HOST` (and
   `VITE_REVERB_APP_KEY` if it changed) to point at
   `thesguard-reverb.onrender.com`, then redeploy the frontend.
3. Open the live site and smoke-test: log in, open a project, post a
   comment and confirm it arrives in real time (proves Reverb is reachable).
4. Only once that's confirmed working — leave Railway as-is (do not delete)
   as the fallback.

## Swapping back to Railway later

Nothing needs to be rebuilt. Railway auto-detects the same `Dockerfile` this
repo now has for `TECHNO-BACKEND/`, so:
1. Reactivate billing on the Railway project.
2. Restart its 3 services (they already have all env vars saved).
3. Revert `TECHNO-FRONTEND/vercel.json`'s rewrite destination back to the
   Railway URL, and Vercel's `VITE_REVERB_HOST` back to Railway's Reverb
   domain.
