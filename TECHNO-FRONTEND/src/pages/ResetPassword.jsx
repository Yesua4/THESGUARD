import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/axios'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const email = params.get('email') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const missingLink = !token || !email

  const submit = async e => {
    e.preventDefault()
    if (password.length < 12) { setError('Password must be at least 12 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    setError('')
    try {
      await api.post('/password/reset', {
        email, token, password, password_confirmation: confirm,
      })
      setDone(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (err) {
      setError(err.response?.data?.message || 'This reset link is invalid or has expired. Please request a new one.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.title}>Reset Password</div>
        {missingLink ? (
          <>
            <div style={S.error}>This reset link is missing required information. Please request a new one.</div>
            <button onClick={() => navigate('/forgot-password')} style={S.button}>Request New Link</button>
          </>
        ) : done ? (
          <div style={S.sub}>Your password has been reset successfully. Redirecting you to login…</div>
        ) : (
          <>
            <div style={S.sub}>Choose a new password for <strong>{email}</strong>.</div>
            {error && <div style={S.error}>{error}</div>}
            <form onSubmit={submit}>
              <label style={S.label}>New Password</label>
              <input
                type="password" required value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Minimum 12 characters" style={S.input}
              />
              <label style={S.label}>Confirm New Password</label>
              <input
                type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter password" style={S.input}
              />
              <button type="submit" disabled={loading} style={{ ...S.button, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Resetting…' : 'Reset Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

const S = {
  page: { minHeight: '100vh', background: '#0a1f44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI', sans-serif", padding: '20px' },
  card: { background: '#fff', borderRadius: '16px', padding: '36px', width: '100%', maxWidth: '400px', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' },
  title: { fontSize: '20px', fontWeight: 800, color: '#0a1f44', marginBottom: '8px' },
  sub: { fontSize: '13px', color: '#64748b', lineHeight: 1.6, marginBottom: '20px' },
  label: { display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' },
  input: { width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', outline: 'none', marginBottom: '16px', fontFamily: 'inherit' },
  button: { width: '100%', padding: '12px', background: 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' },
  error: { background: '#fee2e2', color: '#9f1239', fontSize: '12px', padding: '10px 12px', borderRadius: '8px', marginBottom: '16px' },
}
