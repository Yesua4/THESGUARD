---
name: add-api-endpoint
description: Add a new ThesisGuard API endpoint end to end: Laravel route, controller method with role and school scoping, feature test covering the allowed and 403 cases, and the frontend call through src/api/axios.js. Use when the user asks for a new backend route, API, or feature that needs one.
---

# Add an API endpoint to ThesisGuard

Follow these steps in order. Read the neighbouring code first and match it.

## 1. Route (`TECHNO-BACKEND/routes/api.php`)

- Authenticated endpoints go inside the existing `Route::middleware('auth:sanctum')->group(...)`.
- Unauthenticated endpoints that accept credentials or send email go inside the
  `throttle:10,1` group.
- Put the route next to the other routes for the same controller.

## 2. Controller method (`TECHNO-BACKEND/app/Http/Controllers/`)

Every method must answer three questions before touching data:

1. **Which roles may call this?** Roles: `admin`, `instructor`, `adviser`, `student`, `panelist`.
   ```php
   $user = $request->user();
   abort_unless(in_array($user->role, ['admin', 'instructor']), 403, 'Only administrators and instructors can ...');
   ```
2. **Which school's data?** Scope every query:
   ```php
   ->when($user->school_id, fn($q) => $q->where('school_id', $user->school_id))
   ```
   Set `school_id` from `$user->school_id` when creating rows. Never take it from the request.
3. **Is it about one project?** Use the shared rule instead of writing a new one:
   `DocumentController::userCanAccessProject($user, $projectId)` (defined in
   `Concerns/AuthorizesDocumentAccess.php`).

Then:
- Validate input with `$request->validate([...])`.
- To notify users, call `NotificationService`. To push a live update to a project page, call
  `ActivityBroadcastService::broadcast($projectId, 'type', [...])`. Don't call `broadcast()`
  directly: the services already catch failures.
- Return JSON (`response()->json(...)`) with 201 for creates.

## 3. Migration (only if the schema changes)

`php artisan make:migration ...`. It must run on MySQL, PostgreSQL, and SQLite, so no raw
engine-specific SQL. Add a `down()` that reverses it.

## 4. Feature test (`TECHNO-BACKEND/tests/Feature/`)

Minimum: one test for an allowed role and one for a forbidden role (403). If the endpoint
reads school data, also test that a user from another school can't see it.

```php
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

$user = User::factory()->role('student')->school($school->id)->create();
Sanctum::actingAs($user);
$this->postJson('/api/...', [...])->assertStatus(403);
```

Run it: `cd TECHNO-BACKEND && php artisan test --filter=YourTestName`.

## 5. Frontend call (`TECHNO-FRONTEND/src/`)

```js
import api from '../../api/axios'
const { data } = await api.get('/your-endpoint')
```

- Always go through `src/api/axios.js`. It adds the bearer token and the `/api` base URL.
- Show errors with the toast from `ToastContext`, using `err.response?.data?.message`.
- If the page is role-specific, check `src/config/nav.jsx` so only those roles see it.

## 6. Check before finishing

- [ ] `php artisan test` passes
- [ ] `npm run lint` passes in `TECHNO-FRONTEND`
- [ ] Forbidden roles get 403, and other schools' data is not returned
