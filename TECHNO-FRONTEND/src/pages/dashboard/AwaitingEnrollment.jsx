import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

// Shown to a self-registered student until an instructor imports a class
// list containing their Student No. The switch to the dashboard is live
// (AuthContext refetches /me on the account.changed broadcast); the 60s
// check is only a fallback in case the websocket connection drops.
export default function AwaitingEnrollment() {
  const { user, refreshUser, logout } = useAuth()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const id = setInterval(refreshUser, 60_000)
    return () => clearInterval(id)
  }, [refreshUser])

  const checkNow = async () => {
    setChecking(true)
    await refreshUser()
    setChecking(false)
  }

  const signOut = async () => {
    await logout()
    navigate('/login')
  }

  const row = (label, value) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ color: '#0a1f44', fontWeight: 600, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0a1f44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI', sans-serif", padding: '20px' }}>
      <div style={{ background: '#fff', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>⏳</div>
        <div style={{ fontSize: '20px', fontWeight: 800, color: '#0a1f44', marginBottom: '8px' }}>Waiting for enrollment</div>
        <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6, marginBottom: '18px' }}>
          Your account is ready. You'll get access the moment your instructor imports your class list. This page updates by itself.
          If it's taking long, make sure your instructor has your correct <strong>Student No.</strong>
        </div>
        <div style={{ marginBottom: '20px' }}>
          {row('Name', user?.name)}
          {row('Student No.', user?.student_id)}
          {row('Email', user?.email)}
        </div>
        <button onClick={checkNow} disabled={checking}
          style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', opacity: checking ? 0.7 : 1 }}>
          {checking ? 'Checking…' : 'Check again'}
        </button>
        <button onClick={signOut}
          style={{ width: '100%', padding: '10px', marginTop: '10px', background: '#fff', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
    </div>
  )
}
