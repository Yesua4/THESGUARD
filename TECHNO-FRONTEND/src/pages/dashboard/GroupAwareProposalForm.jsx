import { useState, useEffect } from 'react'
import api from '../../api/axios'

function GroupAwareProposalForm({ user, users, onSubmit, saving }) {
  const [myGroup, setMyGroup] = useState(null)
  const [form, setForm] = useState({
  title:'', abstract:'', objectives:'', keywords:'', batch:'', program:'', instructor_id:'', group_id:'', github_url:'', adviser_id: ''
})

useEffect(() => {
  api.get('/groups').then(res => {
    const mine = res.data.find(g => g.members?.some(m => m.user_id === user.id))
    if (mine) {
      setMyGroup(mine)
      setForm(f => ({
        ...f,
        group_id: mine.id,
        batch: mine.batch || '',
        adviser_id: mine.adviser_id || '',  // ← ADD THIS
      }))
    }
  })
}, [])

  const handle = e => setForm({ ...form, [e.target.name]: e.target.value })
  const handleSubmit = e => { e.preventDefault(); onSubmit(e, form) }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    border: '1.5px solid #e2e8f0', borderRadius: '8px',
    padding: '9px 12px', fontSize: '13px', color: '#0f172a',
    outline: 'none', background: '#f8fafc', fontFamily: 'inherit',
  }
  const labelStyle = { fontSize: '11px', fontWeight: '600', color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {myGroup ? (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: '#1d4ed8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>Your Group</div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e3a8a', marginBottom: '6px' }}>{myGroup.group_name}</div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {myGroup.members?.map(m => (
              <span key={m.id} style={{ fontSize: '11px', background: '#fff', color: '#1d4ed8', padding: '2px 8px', borderRadius: '20px', border: '1px solid #bfdbfe' }}>
                {m.user?.name} {m.is_leader ? '★' : ''}
              </span>
            ))}
          </div>
          {myGroup.adviser && (
            <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Adviser: {myGroup.adviser.name}
              <span style={{ fontSize: '10px', background: '#d1fae5', color: '#059669', padding: '1px 6px', borderRadius: '20px', fontWeight: '700' }}>Auto-assigned</span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', color: '#92400e' }}>
          ⚠ You are not assigned to a group yet. Ask your instructor to assign you first.
        </div>
      )}
      <div>
        <label style={labelStyle}>Project Title</label>
        <input name="title" value={form.title} onChange={handle} required style={inputStyle} placeholder="Enter full project title..." />
      </div>
      <div className="dg-grid-2" style={{ display: 'grid', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Batch / Academic Year</label>
          <input name="batch" value={form.batch} onChange={handle} style={inputStyle} placeholder="e.g. 2025–2026" />
        </div>
        <div>
          <label style={labelStyle}>Submit to (Instructor)</label>
          <select name="instructor_id" value={form.instructor_id} onChange={handle} style={inputStyle}>
            <option value="">Select instructor...</option>
            {users.filter(u => ['instructor','adviser','panelist'].includes(u.role)).map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label style={labelStyle}>Program</label>
        <input name="program" value={form.program} onChange={handle} style={inputStyle} placeholder="e.g. BS Information Technology" />
      </div>
      <div>
        <label style={labelStyle}>Abstract</label>
        <textarea name="abstract" value={form.abstract} onChange={handle} style={{ ...inputStyle, height: '80px', resize: 'none' }} placeholder="Enter project abstract..." />
      </div>
      <div>
        <label style={labelStyle}>Objectives (one per line)</label>
        <textarea name="objectives" value={form.objectives} onChange={handle} style={{ ...inputStyle, height: '80px', resize: 'none' }} placeholder="List objectives..." />
      </div>
      <div>
        <label style={labelStyle}>Keywords</label>
        <input name="keywords" value={form.keywords} onChange={handle} style={inputStyle} placeholder="e.g. capstone, web, Laravel" />
      </div>
      <button type="submit" disabled={saving || !myGroup} style={{
        padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: '600',
        background: saving || !myGroup ? '#cbd5e1' : 'linear-gradient(135deg,#0a1f44,#1040a0)',
        color: '#fff', cursor: saving || !myGroup ? 'not-allowed' : 'pointer',
      }}>
        {saving ? 'Submitting & checking similarity...' : 'Submit Proposal'}
      </button>
    </form>
  )
}

export default GroupAwareProposalForm
