import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import PageChangePassword from './PageChangePassword'

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
        <div style={{ background: '#fff', borderRadius: '16px', padding: '24px 24px 8px', marginBottom: '-8px' }}>
          <div style={{ fontSize: '28px', marginBottom: '6px' }}>🔑</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0a1f44', marginBottom: '6px' }}>Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}! Choose your own password</div>
          <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>
            The password you just used was given to you by someone else, so only you should know the new one.
            Type the password you signed in with, then choose a new one. You'll go straight to your dashboard after this.
          </div>
        </div>
        <PageChangePassword required onDone={refreshUser} />
        <div style={{ textAlign: 'center', marginTop: '14px' }}>
          <button type="button" onClick={signOut} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Sign out</button>
        </div>
      </div>
    </div>
  )
}
