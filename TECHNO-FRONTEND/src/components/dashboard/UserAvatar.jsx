// Shows the user's real photo (currently only populated via Google Sign-In
// linking — see AuthController::handleGoogleCallback) when available,
// falling back to an initials circle otherwise.
function UserAvatar({ user, size = 30, fontSize = 11, bg, color }) {
  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U'

  const style = {
    width: `${size}px`, height: `${size}px`, borderRadius: '50%',
    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user?.name || 'Profile photo'}
        style={{ ...style, objectFit: 'cover', border: '1px solid rgba(0,0,0,0.06)' }}
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <div style={{ ...style, background: bg || '#f1f5f9', color: color || '#475569', fontSize: `${fontSize}px`, fontWeight: '700' }}>
      {initials}
    </div>
  )
}

export default UserAvatar
