import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/password/forgot', { email })
      // Backend always returns the same generic message regardless of
      // whether the email exists, so this can't be used to enumerate
      // registered accounts -- the UI mirrors that by always showing the
      // "sent" state too.
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.title}>Forgot Password</div>
        {sent ? (
          <>
            <div style={S.sub}>
              If an account exists for <strong>{email}</strong>, a password reset link has been sent. Check your inbox.
            </div>
            <button onClick={() => navigate('/login')} style={S.button}>Back to Login</button>
          </>
        ) : (
          <>
            <div style={S.sub}>Enter your account email and we'll send you a link to reset your password.</div>
            {error && <div style={S.error}>{error}</div>}
            <form onSubmit={submit}>
              <label style={S.label}>Email Address</label>
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@school.edu.ph" style={S.input}
              />
              <button type="submit" disabled={loading} style={{ ...S.button, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
            <div style={S.backLink} onClick={() => navigate('/login')}>← Back to Login</div>
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
  backLink: { textAlign: 'center', fontSize: '12px', color: '#1040a0', fontWeight: 600, cursor: 'pointer', marginTop: '16px' },
}
