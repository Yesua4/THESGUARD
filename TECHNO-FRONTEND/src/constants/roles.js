const ROLE_META = {
  admin:      { label: 'Administrator', color: '#7c3aed', bg: '#ede9fe' },
  instructor: { label: 'Instructor',    color: '#0369a1', bg: '#e0f2fe' },
  adviser:    { label: 'Adviser',       color: '#065f46', bg: '#d1fae5' },
  student:    { label: 'Student',       color: '#92400e', bg: '#fef3c7' },
  panelist:   { label: 'Panelist',      color: '#9f1239', bg: '#ffe4e6' },
}
export { ROLE_META }

// Display order for a user's assigned roles.
const ROLE_ORDER = ['admin', 'instructor', 'adviser', 'student', 'panelist']

// Every role an account was assigned. `user.role` is the ACTIVE role;
// `user.roles` (from the API) is the full set. Falls back to the active role
// for user objects that don't carry `roles` (e.g. nested in other payloads).
const userRoles = u => (Array.isArray(u?.roles) && u.roles.length ? u.roles : (u?.role ? [u.role] : []))

export { ROLE_ORDER, userRoles }
