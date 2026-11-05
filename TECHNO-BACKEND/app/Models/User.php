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

    protected $fillable = [
        'name', 'email', 'password', 'role', 'student_id', 'section', 'school_id',
        'google_id', 'avatar',
    ];

    protected $hidden = ['password', 'remember_token', 'roleAssignments'];

    protected $casts = ['email_verified_at' => 'datetime'];

    // ── Relationships ─────────────────────────────────────────
    public function school() {
        return $this->belongsTo(School::class);
    }

    public function roleAssignments() {
        return $this->hasMany(UserRole::class);
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
    // query per user.
    public function getRolesAttribute(): array {
        return $this->assignedRoles();
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
