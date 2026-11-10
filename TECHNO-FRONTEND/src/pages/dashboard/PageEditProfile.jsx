import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import api from '../../api/axios'
import UserAvatar from '../../components/dashboard/UserAvatar'

// Your profile. Staff can change their display name. A student's details
// come from the registrar's class list, so they're read-only here and the
// page says who to ask.
function PageEditProfile({ onNavigate }) {
  const { user, refreshUser } = useAuth()
  const { showToast } = useToast()
  const isStudent = (user?.base_role || user?.role) === 'student'
  const [name, setName] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)
  const changed = name.trim() && name.trim() !== user?.name

  const inputStyle = {
    border: '1.5px solid #e2e8f0', borderRadius: '8px',
    padding: '9px 12px', fontSize: '13px', outline: 'none',
    background: '#f8fafc', fontFamily: 'inherit',
    width: '100%', boxSizing: 'border-box',
  }
  const labelStyle = {
    fontSize: '11px', fontWeight: '700', color: '#64748b',
    letterSpacing: '0.06em', textTransform: 'uppercase',
    display: 'block', marginBottom: '6px',
  }

  const save = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put('/profile', { name: name.trim() })
      await refreshUser()
      showToast('Profile saved.', 'success')
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save your profile.')
    } finally { setSaving(false) }
  }

  const readOnly = (label, value) => value ? (
    <div>
      <label style={labelStyle}>{label}</label>
      <input value={value} readOnly style={{ ...inputStyle, color: '#64748b' }} />
    </div>
  ) : null

  return (
    <div>
      <div style={{ fontSize: '18px', fontWeight: '700', color: '#0a1f44', marginBottom: '16px' }}>Edit Profile</div>
      <div style={{ maxWidth: '480px' }}>
        <form onSubmit={save} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(135deg,#0a1f44,#1040a0)', padding: '14px 18px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>Your Profile</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', marginTop: '2px' }}>
              {isStudent ? 'Your details from the class list' : 'Your name as others see it'}
            </div>
          </div>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', paddingBottom: '14px', borderBottom: '1px solid #f1f5f9' }}>
              <UserAvatar user={user} size={56} fontSize={18} bg="linear-gradient(135deg,#3b82f6,#8b5cf6)" color="#fff" />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#0a1f44' }}>{user?.name}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'capitalize' }}>{user?.role}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  {user?.avatar ? 'Photo from your Google account' : 'Sign in with Google to use your Google photo here'}
                </div>
              </div>
            </div>

            {isStudent ? readOnly('Full Name', user?.name) : (
              <div>
                <label style={labelStyle} htmlFor="profile-name">Full Name</label>
                <input id="profile-name" value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={255} style={inputStyle} />
              </div>
            )}
            {readOnly('Email Address', user?.email)}
            {readOnly('Student No.', user?.student_id)}
            {readOnly('Section', user?.section)}

            {isStudent ? (
              <div style={{ fontSize: '12px', color: '#475569', background: '#f1f5f9', borderRadius: '8px', padding: '10px 12px', lineHeight: 1.6 }}>
                These come from your instructor's class list. If something is wrong, ask your <strong>instructor</strong> or the <strong>admin</strong> to correct it.
              </div>
            ) : (
              <>
                <div style={{ fontSize: '12px', color: '#64748b' }}>To change your email, ask the admin.</div>
                <button type="submit" disabled={saving || !changed} style={{
                  padding: '11px', borderRadius: '8px', border: 'none',
                  background: saving || !changed ? '#cbd5e1' : 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff',
                  fontSize: '13px', fontWeight: '700', cursor: saving || !changed ? 'not-allowed' : 'pointer',
                }}>{saving ? 'Saving…' : 'Save Changes'}</button>
              </>
            )}
            {onNavigate && (
              <button type="button" onClick={() => onNavigate('changepassword')} style={{ background: 'none', border: 'none', color: '#1d4ed8', fontWeight: 600, fontSize: '13px', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                Change your password →
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default PageEditProfile
