<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable {
    use HasApiTokens, HasFactory, Notifiable;

    public const ROLES = ['admin', 'instructor', 'adviser', 'student', 'panelist'];

    // Roles that must be the account's only role. A student account is never
    // also faculty, and the admin account stays a pure admin account.
    public const EXCLUSIVE_ROLES = ['student', 'admin'];
    // The admin can act as any staff role, but not as a student.
    public const ADMIN_ACTABLE_ROLES = ['admin', 'instructor', 'adviser', 'panelist'];

    protected $fillable = [
        'name', 'last_name', 'first_name', 'middle_name', 'email', 'password', 'role', 'student_id', 'section', 'school_id',
        'google_id', 'avatar',
    ];

    protected $hidden = ['password', 'remember_token', 'roleAssignments', 'sectionAssignments'];

    protected $casts = ['email_verified_at' => 'datetime', 'awaiting_enrollment' => 'boolean'];

    // ── Relationships ─────────────────────────────────────────
    public function school() {
        return $this->belongsTo(School::class);
    }

    public function roleAssignments() {
        return $this->hasMany(UserRole::class);
    }

    public function sectionAssignments() {
        return $this->hasMany(InstructorSection::class);
    }

    // ── Sections an instructor handles ────────────────────────
    // Sections are free text ("BSIT 4A") on students and groups, so they're
    // compared trimmed, upper-cased and with single spaces.
    public static function normalizeSection(?string $section): string {
        return strtoupper(preg_replace('/\s+/', ' ', trim((string) $section)));
    }

    public function handledSectionNames(): array {
        return $this->sectionAssignments->pluck('section')->sort()->values()->all();
    }

    // Exposed as `handled_sections` where explicitly appended, like `roles`.
    public function getHandledSectionsAttribute(): array {
        return $this->handledSectionNames();
    }

    public function syncHandledSections(array $sections): void {
        $sections = array_values(array_unique(array_filter(array_map([self::class, 'normalizeSection'], $sections))));

        $this->sectionAssignments()->whereNotIn('section', $sections)->delete();
        $existing = $this->sectionAssignments()->pluck('section')->all();
        foreach (array_diff($sections, $existing) as $section) {
            $this->sectionAssignments()->create(['section' => $section]);
        }
        $this->unsetRelation('sectionAssignments');
    }

    /**
     * The sections this user's view is limited to, or null for no limit.
     * Only applies while active as instructor, and only once the admin has
     * assigned at least one section -- an instructor with none keeps the
     * school-wide view they had before sections existed.
     */
    public function sectionScope(): ?array {
        if ($this->role !== 'instructor') {
            return null;
        }
        $sections = $this->handledSectionNames();
        return $sections ?: null;
    }

    public function handlesSection(?string $section): bool {
        $scope = $this->sectionScope();
        return $scope === null || in_array(self::normalizeSection($section), $scope, true);
    }

    // Constrains $column (a section column) to the given normalized sections.
    // UPPER/TRIM behave the same on MySQL, Postgres and SQLite.
    public static function whereSectionIn($query, string $column, array $sections) {
        return $query->whereIn(\Illuminate\Support\Facades\DB::raw("UPPER(TRIM($column))"), $sections);
    }

    // ── Roles ─────────────────────────────────────────────────
    // `role` is the ACTIVE role (what all authorization checks read).
    // assignedRoles() is every role the admin gave this account; the active
    // role is always one of them.
    public function assignedRoles(): array {
        $assigned = $this->roleAssignments->pluck('role')->all();
        if ($this->role) {
            $assigned[] = $this->role;
        }
        $assigned = array_values(array_unique($assigned));

        // Stable display order, matching User::ROLES.
        usort($assigned, fn ($a, $b) => array_search($a, self::ROLES) <=> array_search($b, self::ROLES));
        return $assigned;
    }

    public function hasRole(string $role): bool {
        return in_array($role, $this->assignedRoles(), true);
    }

    // Exposed as `roles` in JSON only where explicitly appended (login, /me,
    // user management) so nested user objects elsewhere don't trigger a
    // query per user. The admin can switch into every role.
    public function getRolesAttribute(): array {
        return $this->role === 'admin' ? self::ADMIN_ACTABLE_ROLES : $this->assignedRoles();
    }

    // ── Admin acting as another role ──────────────────────────
    // users.role stays 'admin' (all permission checks keep passing and all
    // school data stays visible); acting_role only picks the screens.
    public function canSwitchTo(string $role): bool {
        return $this->role === 'admin'
            ? in_array($role, self::ADMIN_ACTABLE_ROLES, true)
            : $this->hasRole($role);
    }

    // True if the user has this role, or is the admin currently acting as it.
    public function actsAs(string $role): bool {
        return $this->role === $role || ($this->role === 'admin' && $this->acting_role === $role);
    }

    /**
     * Replace this account's assigned roles. Keeps the active role if it's
     * still assigned, otherwise falls back to the first assigned role.
     */
    public function syncRoles(array $roles): void {
        $roles = array_values(array_unique($roles));

        $this->roleAssignments()->whereNotIn('role', $roles)->delete();
        $existing = $this->roleAssignments()->pluck('role')->all();
        foreach (array_diff($roles, $existing) as $role) {
            $this->roleAssignments()->create(['role' => $role]);
        }

        if (!in_array($this->role, $roles, true)) {
            $this->role = $roles[0];
            $this->acting_role = null; // no longer the admin
            $this->save();
        }

        $this->unsetRelation('roleAssignments');
    }

    /**
     * Users who HAVE a role, whether or not it's the one they're currently
     * using -- e.g. an instructor who is also a panelist must still appear
     * in the panelist picker. Also matches on the active-role column so
     * accounts without user_roles rows (older data, test factories) count.
     */
    public function scopeWithRole($query, string|array $roles) {
        $roles = (array) $roles;
        return $query->where(fn ($q) => $q
            ->whereIn('role', $roles)
            ->orWhereHas('roleAssignments', fn ($r) => $r->whereIn('role', $roles))
        );
    }

    /**
     * Validation for a set of roles. Returns an error message, or null if OK.
     */
    public static function validateRoleSet(array $roles): ?string {
        if (empty($roles)) {
            return 'A user must have at least one role.';
        }
        foreach (self::EXCLUSIVE_ROLES as $exclusive) {
            if (in_array($exclusive, $roles, true) && count(array_unique($roles)) > 1) {
                return ucfirst($exclusive) . ' cannot be combined with other roles.';
            }
        }
        return null;
    }
}
