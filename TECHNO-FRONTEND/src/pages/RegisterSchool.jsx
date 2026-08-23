import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

const STEPS = ['School Info', 'Admin Account', 'Confirm']

export default function RegisterSchool() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    school_name: '',
    school_email: '',
    school_address: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
    admin_password_confirmation: '',
  })

  const set = (field) => (e) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    setError('')
  }

  const validateStep = () => {
    if (step === 0) {
      if (!form.school_name.trim()) return 'School name is required.'
      if (!form.school_email.trim()) return 'School email is required.'
      if (!/\S+@\S+\.\S+/.test(form.school_email)) return 'Enter a valid school email.'
    }
    if (step === 1) {
      if (!form.admin_name.trim()) return 'Admin name is required.'
      if (!form.admin_email.trim()) return 'Admin email is required.'
      if (!/\S+@\S+\.\S+/.test(form.admin_email)) return 'Enter a valid admin email.'
      if (form.admin_password.length < 12) return 'Password must be at least 12 characters.'
      if (form.admin_password !== form.admin_password_confirmation) return 'Passwords do not match.'
    }
    return null
  }

  const next = () => {
    const err = validateStep()
    if (err) { setError(err); return }
    setStep(s => s + 1)
  }

  const submit = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/schools/register', form)
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      setSuccess(true)
      setTimeout(() => navigate('/dashboard'), 2500)
    } catch (err) {
      const msg = err.response?.data?.message
        || Object.values(err.response?.data?.errors || {})[0]?.[0]
        || 'Registration failed. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={S.root}>
        <style>{CSS}</style>
        <div style={S.successBox}>
          <div style={S.successIcon}>✓</div>
          <h2 style={S.successTitle}>School Registered!</h2>
          <p style={S.successSub}>Welcome to CapGuard. Redirecting to your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {/* Left panel */}
      <div style={S.left}>
        <div style={S.leftGrid} />
        <div style={S.leftGlow} />
        <div style={S.leftContent}>
          <div style={S.logoRow} onClick={() => navigate('/')} role="button">
            <div style={S.logoIcon}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
                <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"/>
              </svg>
            </div>
            <span style={S.logoText}>Cap<span style={{color:'#f0b429'}}>Guard</span></span>
          </div>

          <div style={S.leftBody}>
            <h2 style={S.leftTitle}>Start managing capstone projects the smart way.</h2>
            <p style={S.leftSub}>Join schools across the Philippines already using CapGuard to streamline their research programs.</p>

            <div style={S.leftFeatures}>
              {[
                ['🧠', 'AI Similarity Detection', 'SBERT + TF-IDF powered'],
                ['📄', 'Document Review Pipeline', 'Version tracking + inline comments'],
                ['📅', 'Defense Scheduling', 'Rooms, panelists, notifications'],
                ['📊', 'Contribution Analytics', 'Track every member\'s participation'],
              ].map(([icon, title, sub]) => (
                <div key={title} style={S.leftFeature}>
                  <div style={S.leftFeatureIcon}>{icon}</div>
                  <div>
                    <div style={S.leftFeatureTitle}>{title}</div>
                    <div style={S.leftFeatureSub}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={S.planBox}>
              <div style={S.planBoxTitle}>What you get</div>
              <div style={S.planBoxItems}>
                {['Similarity check across all submitted projects','Document submission with in-app review','Defense scheduling','Contribution tracking'].map(f => (
                  <div key={f} style={S.planBoxItem}>
                    <span style={{color:'#2e7dff',marginRight:8}}>✓</span>{f}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div style={S.right}>
        <div style={S.formWrap}>

          {/* Steps indicator */}
          <div style={S.steps}>
            {STEPS.map((label, i) => (
              <div key={label} style={S.stepItem}>
                <div style={{
                  ...S.stepCircle,
                  background: i < step ? '#2e7dff' : i === step ? '#2e7dff' : '#e2e8f0',
                  color: i <= step ? 'white' : '#94a3b8',
                  boxShadow: i === step ? '0 0 0 4px rgba(46,125,255,0.15)' : 'none',
                }}>
                  {i < step ? '✓' : i + 1}
                </div>
                <span style={{
                  ...S.stepLabel,
                  color: i === step ? '#1a2540' : '#94a3b8',
                  fontWeight: i === step ? 600 : 400,
                }}>{label}</span>
                {i < STEPS.length - 1 && (
                  <div style={{...S.stepLine, background: i < step ? '#2e7dff' : '#e2e8f0'}} />
                )}
              </div>
            ))}
          </div>

          {/* Step 0 — School Info */}
          {step === 0 && (
            <div className="fade-in">
              <h2 style={S.formTitle}>Register your school</h2>
              <p style={S.formSub}>Enter your institution's details to get started.</p>

              <div style={S.field}>
                <label style={S.label}>Institution Name *</label>
                <input style={S.input} placeholder="e.g. Davao del Norte State College" value={form.school_name} onChange={set('school_name')} />
              </div>
              <div style={S.field}>
                <label style={S.label}>Official School Email *</label>
                <input style={S.input} type="email" placeholder="e.g. itdept@dnsc.edu.ph" value={form.school_email} onChange={set('school_email')} />
              </div>
              <div style={S.field}>
                <label style={S.label}>School Address <span style={{color:'#94a3b8'}}>(optional)</span></label>
                <input style={S.input} placeholder="e.g. Tagum City, Davao del Norte" value={form.school_address} onChange={set('school_address')} />
              </div>
            </div>
          )}

          {/* Step 1 — Admin Account */}
          {step === 1 && (
            <div className="fade-in">
              <h2 style={S.formTitle}>Create your admin account</h2>
              <p style={S.formSub}>This will be the main administrator account for your school.</p>

              <div style={S.field}>
                <label style={S.label}>Full Name *</label>
                <input style={S.input} placeholder="e.g. Juan dela Cruz" value={form.admin_name} onChange={set('admin_name')} />
              </div>
              <div style={S.field}>
                <label style={S.label}>Admin Email *</label>
                <input style={S.input} type="email" placeholder="e.g. admin@dnsc.edu.ph" value={form.admin_email} onChange={set('admin_email')} />
              </div>
              <div style={S.field}>
                <label style={S.label}>Password * <span style={{color:'#94a3b8',fontSize:11}}>(min. 12 characters)</span></label>
                <input style={S.input} type="password" placeholder="Create a strong password" value={form.admin_password} onChange={set('admin_password')} />
              </div>
              <div style={S.field}>
                <label style={S.label}>Confirm Password *</label>
                <input style={S.input} type="password" placeholder="Repeat your password" value={form.admin_password_confirmation} onChange={set('admin_password_confirmation')} />
              </div>
            </div>
          )}

          {/* Step 2 — Confirm */}
          {step === 2 && (
            <div className="fade-in">
              <h2 style={S.formTitle}>Confirm your details</h2>
              <p style={S.formSub}>Review everything before registering.</p>

              <div style={S.confirmBox}>
                <div style={S.confirmSection}>
                  <div style={S.confirmSectionTitle}>🏫 School Information</div>
                  <div style={S.confirmRow}><span style={S.confirmKey}>Name</span><span style={S.confirmVal}>{form.school_name}</span></div>
                  <div style={S.confirmRow}><span style={S.confirmKey}>Email</span><span style={S.confirmVal}>{form.school_email}</span></div>
                  {form.school_address && <div style={S.confirmRow}><span style={S.confirmKey}>Address</span><span style={S.confirmVal}>{form.school_address}</span></div>}
                </div>
                <div style={S.confirmDivider} />
                <div style={S.confirmSection}>
                  <div style={S.confirmSectionTitle}>👤 Admin Account</div>
                  <div style={S.confirmRow}><span style={S.confirmKey}>Name</span><span style={S.confirmVal}>{form.admin_name}</span></div>
                  <div style={S.confirmRow}><span style={S.confirmKey}>Email</span><span style={S.confirmVal}>{form.admin_email}</span></div>
                  <div style={S.confirmRow}><span style={S.confirmKey}>Password</span><span style={S.confirmVal}>{'•'.repeat(12)}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={S.errorBox}>
              <span style={{marginRight:8}}>⚠</span>{error}
            </div>
          )}

          {/* Buttons */}
          <div style={S.btnRow}>
            {step > 0 && (
              <button style={S.btnBack} onClick={() => setStep(s => s - 1)}>← Back</button>
            )}
            {step < 2 ? (
              <button style={S.btnNext} onClick={next}>
                Continue →
              </button>
            ) : (
              <button style={{...S.btnNext, opacity: loading ? 0.7 : 1}} onClick={submit} disabled={loading}>
                {loading ? 'Registering...' : 'Register School →'}
              </button>
            )}
          </div>

          <div style={S.loginLink}>
            Already have an account?{' '}
            <span style={{color:'#2e7dff',cursor:'pointer',fontWeight:600}} onClick={() => navigate('/login')}>
              Log in
            </span>
          </div>

        </div>
      </div>
    </div>
  )
}

const S = {
  root: { display: 'flex', minHeight: '100vh', fontFamily: "'DM Sans', 'Segoe UI', sans-serif" },

  // LEFT
  left: { width: '45%', background: '#0a1628', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  leftGrid: { position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(46,125,255,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(46,125,255,0.06) 1px,transparent 1px)', backgroundSize: '40px 40px' },
  leftGlow: { position: 'absolute', top: '-100px', right: '-100px', width: '500px', height: '500px', background: 'radial-gradient(circle,rgba(46,125,255,0.15) 0%,transparent 70%)', pointerEvents: 'none' },
  leftContent: { position: 'relative', zIndex: 2, padding: '40px', display: 'flex', flexDirection: 'column', height: '100%' },
  logoRow: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '48px' },
  logoIcon: { width: '36px', height: '36px', background: '#2e7dff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logoText: { fontFamily: "'Playfair Display', serif", fontSize: '1.4rem', color: 'white', fontWeight: 700 },
  leftBody: { flex: 1 },
  leftTitle: { fontSize: '1.7rem', fontWeight: 800, color: 'white', lineHeight: 1.3, marginBottom: '12px' },
  leftSub: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: '32px' },
  leftFeatures: { display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' },
  leftFeature: { display: 'flex', gap: '12px', alignItems: 'flex-start' },
  leftFeatureIcon: { width: '36px', height: '36px', background: 'rgba(46,125,255,0.15)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 },
  leftFeatureTitle: { fontSize: '0.9rem', fontWeight: 600, color: 'white', marginBottom: '2px' },
  leftFeatureSub: { fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)' },
  planBox: { background: 'rgba(46,125,255,0.08)', border: '1px solid rgba(46,125,255,0.2)', borderRadius: '12px', padding: '16px 20px' },
  planBoxTitle: { fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', marginBottom: '12px', fontWeight: 500 },
  planBoxItems: { display: 'flex', flexDirection: 'column', gap: '6px' },
  planBoxItem: { fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center' },

  // RIGHT
  right: { flex: 1, background: '#f8faff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', overflowY: 'auto' },
  formWrap: { width: '100%', maxWidth: '480px' },

  // STEPS
  steps: { display: 'flex', alignItems: 'center', marginBottom: '36px' },
  stepItem: { display: 'flex', alignItems: 'center', flex: 1 },
  stepCircle: { width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, flexShrink: 0, transition: 'all 0.3s' },
  stepLabel: { fontSize: '11px', marginLeft: '8px', whiteSpace: 'nowrap', transition: 'all 0.2s' },
  stepLine: { flex: 1, height: '2px', margin: '0 8px', transition: 'background 0.3s' },

  // FORM
  formTitle: { fontSize: '1.5rem', fontWeight: 800, color: '#0a1628', marginBottom: '6px' },
  formSub: { fontSize: '0.9rem', color: '#6b7a99', marginBottom: '28px', lineHeight: 1.6 },
  field: { marginBottom: '18px' },
  label: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#1a2540', marginBottom: '6px' },
  input: { width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', color: '#1a2540', background: 'white', outline: 'none', transition: 'border 0.2s', fontFamily: 'inherit' },

  // CONFIRM
  confirmBox: { background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', marginBottom: '24px' },
  confirmSection: { marginBottom: '4px' },
  confirmSectionTitle: { fontSize: '13px', fontWeight: 700, color: '#1a2540', marginBottom: '12px' },
  confirmRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  confirmKey: { fontSize: '13px', color: '#6b7a99' },
  confirmVal: { fontSize: '13px', color: '#1a2540', fontWeight: 500, textAlign: 'right', maxWidth: '260px', wordBreak: 'break-all' },
  confirmDivider: { height: '1px', background: '#f1f5f9', margin: '16px 0' },

  // BUTTONS
  btnRow: { display: 'flex', gap: '12px', marginBottom: '20px' },
  btnNext: { flex: 1, padding: '13px', background: '#2e7dff', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', transition: 'background 0.2s', fontFamily: 'inherit' },
  btnBack: { padding: '13px 20px', background: 'white', color: '#6b7a99', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' },
  errorBox: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 16px', color: '#dc2626', fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center' },
  loginLink: { textAlign: 'center', fontSize: '13px', color: '#6b7a99' },

  // SUCCESS
  successBox: { margin: 'auto', textAlign: 'center', padding: '60px 40px', maxWidth: '400px' },
  successIcon: { width: '72px', height: '72px', background: '#2e7dff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', color: 'white', margin: '0 auto 24px' },
  successTitle: { fontSize: '1.8rem', fontWeight: 800, color: '#0a1628', marginBottom: '8px' },
  successSub: { fontSize: '0.95rem', color: '#6b7a99', marginBottom: '24px' },
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600;700;800&display=swap');
.fade-in { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: none; } }
input:focus { border-color: #2e7dff !important; box-shadow: 0 0 0 3px rgba(46,125,255,0.12); }
@media (max-width: 768px) {
  div[style*="display: flex"][style*="min-height: 100vh"] > div:first-child { display: none; }
  div[style*="display: flex"][style*="min-height: 100vh"] > div:last-child { padding: 24px 20px; }
}
`