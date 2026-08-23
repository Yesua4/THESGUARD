import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Landed on after the Laravel backend completes the Google OAuth redirect
// flow (AuthController::handleGoogleCallback). The backend already did the
// real work — this page just reads the result out of the URL and either
// finishes logging the user in or shows why it failed.
function readParams() {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  const err = params.get('error')
  if (err) return { token: null, error: err }
  if (!token) return { token: null, error: 'No sign-in token was returned. Please try again.' }
  return { token, error: '' }
}

export default function OAuthCallback() {
  const { loginWithToken } = useAuth()
  const navigate = useNavigate()
  // Lazy initializer reads the URL once at mount — no setState-in-effect
  // needed for the error/no-token cases, only the async login path below does.
  const [{ token, error: initialError }] = useState(readParams)
  const [error, setError] = useState(initialError)

  useEffect(() => {
    if (!token) return
    loginWithToken(token)
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => setError('Signed in with Google, but loading your account failed. Please try again.'))
  }, [token])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(170deg, #0a1628 0%, #0f2045 50%, #0a1628 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Segoe UI', sans-serif", padding: '24px',
    }}>
      <div style={{
        background: '#fff', borderRadius: '14px', padding: '28px 32px',
        maxWidth: '380px', width: '100%', textAlign: 'center',
        boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
      }}>
        {!error ? (
          <>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>🔐</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0a1f44', marginBottom: '4px' }}>
              Signing you in...
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>Please wait a moment.</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>⚠️</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0a1f44', marginBottom: '8px' }}>
              Google Sign-In Failed
            </div>
            <div style={{ fontSize: '12.5px', color: '#64748b', lineHeight: '1.6', marginBottom: '16px' }}>
              {error}
            </div>
            <button
              onClick={() => navigate('/login', { replace: true })}
              style={{
                width: '100%', padding: '10px', background: 'linear-gradient(135deg,#0a1f44,#1040a0)',
                color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px',
                fontWeight: '700', cursor: 'pointer',
              }}
            >
              ← Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  )
}
