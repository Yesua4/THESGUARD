import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Student self-registration. Instructors enroll students by importing the
// registrar's class list, matched on Student No. -- so the Student No. here
// must be exactly as printed on the class list.
export default function Register() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const [form, setForm] = useState({
    last_name: '', first_name: '', middle_name: '', student_id: '', email: '', password: '', confirm: '',
  })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async e => {
    e.preventDefault()
    setError(''); setErrors({})
    if (form.password !== form.confirm) { setErrors({ confirm: 'Passwords do not match.' }); return }
    setLoading(true)
    try {
      const { confirm: _confirm, ...payload } = form
      await register(payload)
      navigate('/dashboard')
    } catch (err) {
      const fieldErrors = err.response?.data?.errors
      if (fieldErrors) {
        setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v[0]])))
      } else if (err.response?.status === 429) {
        setError('Too many attempts. Please wait a minute and try again.')
      } else {
        setError(err.response?.data?.message || 'Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const field = (key, label, props = {}) => (
    <div style={{ marginBottom: '14px' }}>
      <label style={S.label}>{label}</label>
      <input value={form[key]} onChange={e => set(key, e.target.value)} style={{ ...S.input, ...(errors[key] ? S.inputError : {}) }} {...props} />
      {errors[key] && <div style={S.fieldError}>{errors[key]}</div>}
    </div>
  )

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.title}>Create your student account</div>
        <div style={S.sub}>
          Your instructor enrolls you using the class list from the registrar, matched by your <strong>Student No.</strong> Enter it exactly as it appears there.
        </div>
        {error && <div style={S.error}>{error}</div>}
        <form onSubmit={submit}>
          {field('last_name', 'Last Name', { required: true, placeholder: 'e.g. Dela Cruz', autoComplete: 'family-name' })}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
            {field('first_name', 'First Name', { required: true, placeholder: 'e.g. Juan', autoComplete: 'given-name' })}
            {field('middle_name', 'Middle Name (optional)', { placeholder: 'e.g. Santos', autoComplete: 'additional-name' })}
          </div>
          {field('student_id', 'Student No.', { required: true, placeholder: 'e.g. 2026-00943' })}
          {field('email', 'Email Address', { required: true, type: 'email', placeholder: 'you@school.edu.ph', autoComplete: 'email' })}
          {field('password', 'Password', { required: true, type: 'password', minLength: 12, placeholder: 'At least 12 characters', autoComplete: 'new-password' })}
          {field('confirm', 'Confirm Password', { required: true, type: 'password', autoComplete: 'new-password' })}
          <button type="submit" disabled={loading} style={{ ...S.button, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
        <div style={S.backLink} onClick={() => navigate('/login')}>Already have an account? Sign in</div>
      </div>
    </div>
  )
}

const S = {
  page: { minHeight: '100vh', background: '#0a1f44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI', sans-serif", padding: '20px' },
  card: { background: '#fff', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' },
  title: { fontSize: '20px', fontWeight: 800, color: '#0a1f44', marginBottom: '8px' },
  sub: { fontSize: '13px', color: '#64748b', lineHeight: 1.6, marginBottom: '20px' },
  label: { display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' },
  input: { width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px', fontSize: '14px', outline: 'none', fontFamily: 'inherit' },
  inputError: { borderColor: '#f87171', background: '#fef2f2' },
  fieldError: { fontSize: '11px', color: '#b91c1c', marginTop: '4px' },
  button: { width: '100%', padding: '12px', background: 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', marginTop: '4px' },
  error: { background: '#fee2e2', color: '#9f1239', fontSize: '12px', padding: '10px 12px', borderRadius: '8px', marginBottom: '16px' },
  backLink: { textAlign: 'center', fontSize: '12px', color: '#1040a0', fontWeight: 600, cursor: 'pointer', marginTop: '16px' },
}
