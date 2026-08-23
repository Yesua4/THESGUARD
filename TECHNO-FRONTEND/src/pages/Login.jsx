import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import logo from '../assets/capstoneguard.png'

// ─── ICONS ────────────────────────────────────────────────────────────────────
const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

const MicrosoftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 23 23">
    <rect width="11" height="11" fill="#F35325"/>
    <rect x="12" width="11" height="11" fill="#81BC06"/>
    <rect y="12" width="11" height="11" fill="#05A6F0"/>
    <rect x="12" y="12" width="11" height="11" fill="#FFBA08"/>
  </svg>
)

const EyeIcon = ({ visible }) => visible ? (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
) : (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

// ─── NAV ICONS (same as Dashboard sidebar icons) ─────────────────────────────
const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
)

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
)

const FileIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
)

const CalendarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)

const ChartIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
)

// ─── FEATURES matching the platform capabilities ──────────────────────────────
const FEATURES = [
  { icon: <ShieldIcon />, label: 'Secure Role-Based Access Control' },
  { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>, label: 'AI Proposal Similarity Detection' },
  { icon: <FileIcon />, label: 'Document Review & Version Control' },
  { icon: <CalendarIcon />, label: 'Defense Scheduling System' },
  { icon: <ChartIcon />, label: 'Contribution Analytics' },
]

// ─── RESPONSIVE CSS ───────────────────────────────────────────────────────────
const RESPONSIVE_CSS = `
  @media (max-width: 768px) {
    .lg-panel { display: none !important; }
    .login-card { flex-direction: column !important; max-width: 420px !important; min-height: unset !important; }
    .login-right { padding: 28px 20px 32px !important; }
    .login-page { padding: 16px !important; align-items: flex-start !important; }
  }
  @media (max-width: 400px) {
    .login-right { padding: 22px 14px 28px !important; }
  }

  /* Sidebar-style nav item hover (used for feature items) */
  .feature-item {
    display: flex; align-items: center; gap: 9px;
    padding: 9px 10px; border-radius: 8px;
    border: none; background: transparent;
    color: rgba(148,163,184,0.7);
    font-size: 12px; font-weight: 400;
    margin-bottom: 1px; transition: background 0.15s, color 0.15s;
    border-left: 2px solid transparent;
    font-family: "Segoe UI", sans-serif;
  }
  .feature-item:hover {
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.85);
  }

  /* SSO button hover */
  .sso-btn {
    width: 100%; display: flex; align-items: center; gap: 12px;
    padding: 10px 14px; border: 1.5px solid #e2e8f0;
    border-radius: 8px; background: #fff; cursor: pointer;
    font-size: 13px; font-weight: 500; color: #1e293b;
    margin-bottom: 8px; transition: border-color 0.15s, box-shadow 0.15s;
    text-align: left; font-family: "Segoe UI", sans-serif;
  }
  .sso-btn:hover {
    border-color: #1040a0;
    box-shadow: 0 2px 10px rgba(16,64,160,0.12);
  }

  /* Input focus */
  .tg-input { transition: border-color 0.2s, box-shadow 0.2s; }
  .tg-input:focus {
    border-color: #1040a0 !important;
    box-shadow: 0 0 0 3px rgba(16,64,160,0.1) !important;
    outline: none !important;
  }

  /* Submit button hover */
  .submit-btn:not(:disabled):hover {
    opacity: 0.9;
  }

  /* Sidebar backdrop */
  .sidebar-backdrop {
    display: none;
  }
  @media (max-width: 768px) {
    .sidebar-backdrop {
      display: block;
      position: fixed; inset: 0;
      background: rgba(10,31,68,0.5);
    }
  }
`

// ─── LOGIN ────────────────────────────────────────────────────────────────────
export default function Login() {
  const { login }  = useAuth()
  const navigate   = useNavigate()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [mode, setMode]         = useState('login') // 'login' | 'sso-msg'
  const [ssoProvider, setSso]   = useState('')

  const handleLogin = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch {
      setError('Invalid email or password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSSO = provider => { setSso(provider); setMode('sso-msg') }

  return (
    <>
      <style>{RESPONSIVE_CSS}</style>

      {/* Same page background as Dashboard */}
      <div
        className="login-page"
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(170deg, #0a1628 0%, #0f2045 50%, #0a1628 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px', fontFamily: "'Segoe UI', sans-serif",
          position: 'relative', overflow: 'hidden',
        }}
      >
        {/* Background decoration — matches Dashboard sidebar glow */}
        <div style={{ position: 'absolute', top: '-120px', right: '-120px', width: '480px', height: '480px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,179,237,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-100px', left: '-80px', width: '360px', height: '360px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.015) 1px,transparent 1px)', backgroundSize: '48px 48px' }} />

        {/* Card — same shadow/border style as Dashboard panels */}
        <div
          className="login-card"
          style={{
            width: '100%', maxWidth: '860px',
            borderRadius: '16px', overflow: 'hidden', display: 'flex',
            position: 'relative', zIndex: 1,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
            minHeight: '560px',
          }}
        >

          {/* ── LEFT PANEL — same gradient as Dashboard sidebar ── */}
          <div
            className="lg-panel"
            style={{
              width: '280px', flexShrink: 0,
              background: 'linear-gradient(170deg, #0a1628 0%, #0f2045 50%, #0a1628 100%)',
              padding: '32px 24px', display: 'flex', flexDirection: 'column',
              justifyContent: 'space-between', position: 'relative', overflow: 'hidden',
              borderRight: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {/* Glow accents matching sidebar */}
            <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '240px', height: '240px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,179,237,0.06) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
            <div style={{ position: 'absolute', bottom: '40px', left: '-60px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />

            {/* Brand — identical to Dashboard sidebar brand area */}
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <img
                  src={logo}
                  alt="ThesisGuard"
                  style={{ width: '32px', height: '32px', borderRadius: '9px', objectFit: 'contain', flexShrink: 0, boxShadow: '0 0 0 1px rgba(59,130,246,0.3)' }}
                />
                <div>
                  <div style={{ color: '#fff', fontWeight: '700', fontSize: '13px', letterSpacing: '0.03em' }}>ThesisGuard</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>by Acadvance</div>
                </div>
              </div>

              {/* Role badge style — same as sidebar role pill */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '20px', padding: '4px 10px', marginBottom: '20px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f5c300' }} />
                <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Platform Access</span>
              </div>

              {/* Gold bar — same as original */}
              <div style={{ width: '36px', height: '3px', background: 'linear-gradient(90deg,#f5c300,#e8a800)', borderRadius: '2px', marginBottom: '14px' }} />

              <div style={{ color: '#fff', fontSize: '18px', fontWeight: '800', lineHeight: '1.3', marginBottom: '8px' }}>
                Thesis Management
              </div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11.5px', lineHeight: '1.75', marginBottom: '24px' }}>
                A secure, AI-powered platform for managing capstone and thesis research across Philippine HEIs.
              </div>

              {/* Nav-style feature list — uses same sidebar nav item pattern */}
              <div style={{ marginBottom: '0' }}>
                <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: '9px', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0 2px 6px', marginBottom: '2px' }}>
                  Features
                </div>
                {FEATURES.map(f => (
                  <div key={f.label} className="feature-item">
                    <span style={{ flexShrink: 0, opacity: 0.7, display: 'flex', color: 'rgba(148,163,184,0.7)' }}>{f.icon}</span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom */}
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                © {new Date().getFullYear()} AcadVance · ThesisGuard
              </div>
            </div>
          </div>

          {/* ── RIGHT PANEL — same #f0f2f7 page background as Dashboard ── */}
          <div
            className="login-right"
            style={{
              flex: 1,
              background: '#f0f2f7',
              padding: '36px 36px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >

            {/* ── LOGIN FORM ── */}
            {mode === 'login' && (
              <div style={{ maxWidth: '380px', width: '100%', margin: '0 auto' }}>

                {/* Page header — same pattern as Dashboard page headers */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ width: '3px', height: '18px', borderRadius: '2px', background: 'linear-gradient(180deg,#3b82f6,#8b5cf6)', flexShrink: 0 }} />
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#0a1f44' }}>Welcome Back</div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', paddingLeft: '11px' }}>Sign in to your ThesisGuard account</div>
                </div>

                {/* SSO Buttons — white card style matching Dashboard modal buttons */}
                <div style={{ marginBottom: '14px' }}>
                  <button className="sso-btn" onClick={() => { window.location.href = '/api/auth/google/redirect' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: '#fff4f4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #f1f5f9' }}>
                      <GoogleIcon />
                    </div>
                    <span style={{ flex: 1 }}>Continue with Google</span>
                  </button>

                  <button className="sso-btn" onClick={() => handleSSO('Microsoft')}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #f1f5f9' }}>
                      <MicrosoftIcon />
                    </div>
                    <span style={{ flex: 1 }}>Continue with Microsoft</span>
                    <span style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', background: '#f1f5f9', padding: '2px 7px', borderRadius: '20px' }}>SSO</span>
                  </button>
                </div>

                {/* Divider — same style as Dashboard */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '14px 0' }}>
                  <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                  <span style={{ fontSize: '10px', color: '#c0cad8', fontWeight: '600', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>OR SIGN IN WITH EMAIL</span>
                  <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                </div>

                {/* Error box — same as Dashboard's error/warning boxes */}
                {error && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '9px 12px', fontSize: '12.5px', color: '#dc2626', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {error}
                  </div>
                )}

                {/* Form — white card matching Dashboard's form cards */}
                <form onSubmit={handleLogin}>
                  <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e8ecf2', padding: '16px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
                        Email Address
                      </label>
                      <input
                        className="tg-input"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="Enter your email address"
                        required
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          border: '1.5px solid #e2e8f0', borderRadius: '8px',
                          padding: '9px 12px', fontSize: '13px', color: '#0f172a',
                          background: '#f8fafc', fontFamily: "'Segoe UI', sans-serif",
                        }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <label style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            Password
                          </label>
                          <span
                            style={{ fontSize: '10px', color: '#1040a0', fontWeight: '600', cursor: 'pointer' }}
                            onClick={() => {/* TODO: forgot password */}}
                          >
                            Forgot password?
                          </span>
                        </div>
                      <div style={{ position: 'relative' }}>
                        <input
                          className="tg-input"
                          type={showPass ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          required
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            border: '1.5px solid #e2e8f0', borderRadius: '8px',
                            padding: '9px 42px 9px 12px', fontSize: '13px', color: '#0f172a',
                            background: '#f8fafc', fontFamily: "'Segoe UI', sans-serif",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass(s => !s)}
                          style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, color: '#94a3b8' }}
                        >
                          <EyeIcon visible={showPass} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Submit — same gradient button as Dashboard */}
                  <button
                    className="submit-btn"
                    type="submit"
                    disabled={loading}
                    style={{
                      width: '100%',
                      background: loading ? '#93c5fd' : 'linear-gradient(135deg, #0a1f44, #1040a0)',
                      color: '#fff', border: 'none', borderRadius: '8px',
                      padding: '11px', fontSize: '13px', fontWeight: '700',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      letterSpacing: '0.02em',
                      transition: 'opacity 0.15s',
                    }}
                  >
                    {loading ? 'Signing in...' : 'Sign In →'}
                  </button>
                </form>

                {/* Register link */}
                {/* <div style={{ textAlign: 'center', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #e8ecf2' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>Don't have an account? </span>
                  <span
                    style={{ fontSize: '12px', color: '#1040a0', fontWeight: '600', cursor: 'pointer' }}
                    onClick={() => navigate('/register-school')}
                  >
                    Register your school →
                  </span>
                </div> */}
              </div>
            )}

            {/* ── SSO MESSAGE ── */}
            {mode === 'sso-msg' && (
              <div style={{ maxWidth: '380px', width: '100%', margin: '0 auto' }}>
                {/* Back button — same style as Dashboard panel back buttons */}
                <button
                  onClick={() => setMode('login')}
                  style={{ background: 'none', border: 'none', fontSize: '12px', color: '#94a3b8', cursor: 'pointer', marginBottom: '16px', padding: 0, display: 'flex', alignItems: 'center', gap: '4px', fontFamily: "'Segoe UI', sans-serif" }}
                >
                  ← Back
                </button>

                {/* SSO card — same white card pattern */}
                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e8ecf2', overflow: 'hidden' }}>
                  <div style={{ background: 'linear-gradient(135deg,#0a1f44,#1040a0)', padding: '20px', textAlign: 'center' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: '22px' }}>
                      🔐
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: '#fff', marginBottom: '4px' }}>SSO Not Yet Configured</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{ssoProvider} Single Sign-On</div>
                  </div>

                  <div style={{ padding: '18px' }}>
                    <div style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.7', marginBottom: '12px' }}>
                      <strong style={{ color: '#0a1f44' }}>{ssoProvider}</strong> SSO requires your institution's IT office to configure OAuth credentials for ThesisGuard.
                    </div>

                    <button
                      onClick={() => setMode('login')}
                      style={{ width: '100%', padding: '10px', background: 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
                    >
                      ← Back to Login
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
} 