import { useAuth } from '../../context/AuthContext'
import UserAvatar from '../../components/dashboard/UserAvatar'

function PageEditProfile() {
  const { user } = useAuth()

  const inputStyle = {
    border: '1.5px solid #e2e8f0', borderRadius: '8px',
    padding: '9px 12px', fontSize: '13px', outline: 'none',
    background: '#f8fafc', fontFamily: 'inherit',
    width: '100%', boxSizing: 'border-box',
  }
  const labelStyle = {
    fontSize: '11px', fontWeight: '700', color: '#64748b',
    letterSpacing: '0.06em', textTransform: 'uppercase',
    display: 'block', marginBottom: '6px',
  }

  return (
    <div>
      <div style={{ fontSize: '18px', fontWeight: '700', color: '#0a1f44', marginBottom: '16px' }}>Edit Profile</div>
      <div style={{ maxWidth: '480px' }}>
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(135deg,#0a1f44,#1040a0)', padding: '14px 18px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>Your Profile</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '2px' }}>Update your name and contact info</div>
          </div>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* Avatar — shows the real Google photo if the account is linked
                via Google Sign-In, otherwise an initials circle. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', paddingBottom: '14px', borderBottom: '1px solid #f1f5f9' }}>
              <UserAvatar
                user={user}
                size={56}
                fontSize={18}
                bg="linear-gradient(135deg,#3b82f6,#8b5cf6)"
                color="#fff"
              />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#0a1f44' }}>{user?.name}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'capitalize' }}>{user?.role}</div>
                <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '4px' }}>
                  {user?.avatar ? 'Synced from your Google account' : 'Sign in with Google to use your photo as your avatar'}
                </div>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Full Name</label>
              <input
                defaultValue={user?.name || ''}
                placeholder="Your full name"
                style={inputStyle}
                disabled
              />
            </div>

            <div>
              <label style={labelStyle}>Email Address</label>
              <input
                defaultValue={user?.email || ''}
                placeholder="Your email"
                style={inputStyle}
                disabled
              />
            </div>

            {user?.student_id && (
              <div>
                <label style={labelStyle}>Student ID</label>
                <input
                  defaultValue={user?.student_id || ''}
                  style={inputStyle}
                  disabled
                />
              </div>
            )}

            {user?.section && (
              <div>
                <label style={labelStyle}>Course / Section</label>
                <input
                  defaultValue={user?.section || ''}
                  style={inputStyle}
                  disabled
                />
              </div>
            )}

            {/* Disabled save button — wired up later */}
            <button
              disabled
              style={{
                padding: '11px', borderRadius: '8px', border: 'none',
                background: '#cbd5e1', color: '#fff',
                fontSize: '13px', fontWeight: '700', cursor: 'not-allowed',
              }}
            >
              Save Changes (coming soon)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PageEditProfile
