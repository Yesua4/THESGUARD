# ThesisGuard

Capstone/thesis management system for schools: project proposals, similarity
(duplicate-topic) checking against an archive, document versions and comments,
defense scheduling, panel evaluations, and contribution tracking. Multi-tenant:
every school's data is scoped by `school_id`.

The repo holds three separately deployed apps:

| Folder | Stack | Deployed to | Local port |
|---|---|---|---|
| `TECHNO-BACKEND/` | Laravel 12 (PHP 8.2), Sanctum bearer tokens, Reverb websockets | Railway | 8000 |
| `TECHNO-FRONTEND/` | React 19 + Vite + Tailwind v4, React Router 7 | Vercel | 5173 |
| `similarity-service/` | FastAPI + spaCy + NLTK + scikit-learn + SBERT (`all-MiniLM-L6-v2`) | Railway | 8001 |

Request flow: browser → Vercel (`/api/*` rewritten to Railway in `TECHNO-FRONTEND/vercel.json`,
proxied to `127.0.0.1:8000` by `vite.config.js` in dev) → Laravel → similarity service via
`SIMILARITY_SERVICE_URL` (`config/services.php` → `services.similarity_url`).

## Commands

```bash
# Backend (TECHNO-BACKEND/)
composer install
php artisan migrate
php artisan serve                 # :8000
php artisan reverb:start          # websockets (needs ext-pcntl on Linux)
php artisan test                  # PHPUnit, sqlite :memory: (see phpunit.xml)
php artisan test --filter=SimilarityDetailTest
./vendor/bin/pint                 # PHP formatter

# Frontend (TECHNO-FRONTEND/)
npm install
npm run dev                       # :5173
npm run lint
npm run build

# Similarity service (similarity-service/)
pip install -r requirements.txt
python -m spacy download en_core_web_sm
python -m nltk.downloader stopwords
uvicorn main:app --port 8001
```

## Backend conventions

- All authenticated routes live in the `auth:sanctum` group in `routes/api.php`. Public
  auth routes are rate-limited with `throttle:10,1`.
- Roles are a string column on `users`: `admin`, `instructor`, `adviser`, `student`,
  `panelist` (mirrored in `TECHNO-FRONTEND/src/constants/roles.js`). Authorization is done
  inline in controllers with `abort_unless(in_array($user->role, [...]), 403, '...')`.
  There are no Policies.
- "Who can see this project" is defined once in
  `app/Http/Controllers/Concerns/AuthorizesDocumentAccess.php::userCanAccessProject()` and
  reused by `routes/channels.php`. Reuse it; don't write a second version.
- Scope queries by the user's school: `->when($user->school_id, fn($q) => $q->where('school_id', $user->school_id))`.
- Side effects go through services in `app/Services/`: `NotificationService` (DB + email +
  broadcast) and `ActivityBroadcastService` (live project feed). Broadcasts are best-effort
  and wrapped in try/catch: a broadcast failure must never fail the request.
- Migrations must work on MySQL (local XAMPP), PostgreSQL (Railway), and SQLite (tests).
  Avoid engine-specific SQL; see `2026_08_24_000001_fix_users_role_check_on_postgres.php`.
- Tests are feature tests in `tests/Feature/` using `RefreshDatabase`,
  `User::factory()->role('admin')->school($id)`, and `Sanctum::actingAs($user)`.
  Every access-control change needs a test proving both the allowed and the 403 case.

## Frontend conventions

- Call the API only through `src/api/axios.js` (base URL `/api`, bearer token from
  `localStorage.token`). Never hard-code the Railway URL.
- Dashboard pages are `src/pages/dashboard/Page*.jsx`, routed by `PageRouter.jsx`, with
  role-based nav in `src/config/nav.jsx`.
- Auth state: `src/context/AuthContext.jsx`. Toasts: `src/context/ToastContext.jsx`.
- Real-time: `src/echo.js` (Laravel Echo + Pusher protocol for Reverb) and
  `src/hooks/useProjectChannel.js` for `Project.{id}` channels.
- Plain `.jsx`, no TypeScript. Styling is Tailwind utility classes.

## Similarity service

- `POST /check`: per-field score = hybrid of TF-IDF and SBERT cosine (50/50), or TF-IDF only
  when `use_sbert` is false. Overall = title 40% + abstract 35% + objectives 25%.
  Matches with overall ≤ 5 are dropped.
- `POST /explain`: sentence-level SBERT matching; a segment counts as matched at ≥ 55.
- Score bands (green < 30, amber 30-59, red ≥ 60 = mandatory review) are defined once in
  `TECHNO-FRONTEND/src/utils/similarityColors.js`.
- `benchmark/` imports the scoring functions directly from `main.py`. Changing weights or
  thresholds changes the Precision/Recall/F1 numbers reported in the manuscript
  (Tables 17-19), so re-run the benchmark after any scoring change.

## Things to avoid

- Don't commit `.env`, the manuscript `.docx` files, or the reference PDFs/folders listed
  in `.gitignore`. The repo is connected to public hosting.
- Don't rename the product in user-facing text. It's **ThesisGuard** (older "CapGuard" /
  "CapstoneGuard" strings are leftovers being cleaned up).
