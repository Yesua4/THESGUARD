import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import PageChangePassword from './PageChangePassword'
import Icon from '../../components/Icon'

// Shown right after signing in with a password someone else set (a new or
// imported account, the shared default, or a reset by the admin/instructor).
// The rest of the app stays closed until the person picks their own.
export default function ChooseOwnPassword() {
  const { user, refreshUser, logout } = useAuth()
  const navigate = useNavigate()

  const signOut = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a1f44', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ width: '100%', maxWidth: '460px' }}>
        <div style={{ background: '#fff', borderRadius: '16px', padding: '28px 24px 24px', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#eef2ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', marginBottom: '14px' }}>
            <Icon name="key" />
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0a1f44', marginBottom: '6px' }}>Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}! Choose your own password</div>
          <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6, marginBottom: '20px' }}>
            Your current password was set by someone else. Pick a new one that only you know.
          </div>
          <PageChangePassword required onDone={refreshUser} />
        </div>
        <div style={{ textAlign: 'center', marginTop: '14px' }}>
          <button type="button" onClick={signOut} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Sign out</button>
        </div>
      </div>
    </div>
  )
}
