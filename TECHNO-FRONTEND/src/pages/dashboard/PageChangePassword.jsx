import { useState } from 'react'
import api from '../../api/axios'

function PageChangePassword() {
  const [form, setForm] = useState({ current_password:'', new_password:'', new_password_confirmation:'' })
  const [show, setShow] = useState({ current:false, new:false, confirm:false })
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError]     = useState('')

  const handle     = e => setForm({ ...form, [e.target.name]: e.target.value })
  const toggleShow = field => setShow(s => ({ ...s, [field]: !s[field] }))

  const submit = async e => {
    e.preventDefault(); setSuccess(''); setError('')
    if (form.new_password !== form.new_password_confirmation) { setError('New passwords do not match.'); return }
    if (form.new_password.length < 12) { setError('New password must be at least 12 characters.'); return }
    setSaving(true)
    try {
      await api.put('/profile/change-password', form)
      setSuccess('Password changed successfully!')
      setForm({ current_password:'', new_password:'', new_password_confirmation:'' })
    } catch (err) {
      setError(err.response?.data?.message || 'Error changing password.')
    } finally { setSaving(false) }
  }

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

  const inputStyle = { border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'9px 12px', fontSize:'13px', outline:'none', background:'#f8fafc', fontFamily:'inherit', width:'100%', boxSizing:'border-box', paddingRight:'42px' }
  const labelStyle = { fontSize:'11px', fontWeight:'700', color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:'6px' }

  return (
    <div>
      <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44', marginBottom:'16px' }}>Change Password</div>
      <div style={{ maxWidth:'440px' }}>
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
          <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'14px 18px' }}>
            <div style={{ fontSize:'13px', fontWeight:'700', color:'#fff' }}>Update Your Password</div>
            <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.55)', marginTop:'2px' }}>Choose a strong password with at least 12 characters</div>
          </div>
          <div style={{ padding:'20px' }}>
            {success && (
              <div style={{ background:'#d1fae5', border:'1px solid #a7f3d0', borderRadius:'8px', padding:'10px 14px', marginBottom:'14px', fontSize:'13px', color:'#065f46', fontWeight:'600' }}>✅ {success}</div>
            )}
            {error && (
              <div style={{ background:'#fee2e2', border:'1px solid #fecaca', borderRadius:'8px', padding:'10px 14px', marginBottom:'14px', fontSize:'13px', color:'#9f1239', fontWeight:'600' }}>❌ {error}</div>
            )}

            <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              {[
                ['current_password', 'Current Password', 'Enter your current password', 'current'],
                ['new_password', 'New Password', 'At least 12 characters', 'new'],
                ['new_password_confirmation', 'Confirm New Password', 'Re-enter new password', 'confirm'],
              ].map(([name, label, placeholder, showKey]) => (
                <div key={name}>
                  <label style={labelStyle}>{label}</label>
                  <div style={{ position:'relative' }}>
                    <input
                      type={show[showKey] ? 'text' : 'password'}
                      name={name}
                      value={form[name]}
                      onChange={handle}
                      required
                      placeholder={placeholder}
                      style={inputStyle}
                    />
                    <button type="button" onClick={() => toggleShow(showKey)} style={{ position:'absolute', right:'12px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#94a3b8', display:'flex', alignItems:'center', padding:'0' }}>
                      <EyeIcon visible={show[showKey]} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Requirements */}
              <div style={{ background:'#f8fafc', borderRadius:'10px', padding:'12px 14px' }}>
                <div style={{ fontSize:'11px', fontWeight:'700', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>Password Requirements</div>
                {[
                  [form.new_password.length >= 12, 'At least 12 characters'],
                  [form.new_password && form.new_password === form.new_password_confirmation, 'Passwords match'],
                ].map(([met, label]) => (
                  <div key={label} style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
                    <div style={{ width:'16px', height:'16px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'9px', fontWeight:'700', flexShrink:0, background: met?'#d1fae5':'#f1f5f9', color: met?'#059669':'#94a3b8' }}>
                      {met ? '✓' : '○'}
                    </div>
                    <span style={{ fontSize:'12px', color: met?'#059669':'#94a3b8', fontWeight: met?'600':'400' }}>{label}</span>
                  </div>
                ))}
              </div>

              <button type="submit" disabled={saving} style={{ padding:'11px', borderRadius:'8px', border:'none', background:saving?'#cbd5e1':'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', fontSize:'13px', fontWeight:'700', cursor:saving?'not-allowed':'pointer' }}>
                {saving ? 'Changing Password...' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PageChangePassword
