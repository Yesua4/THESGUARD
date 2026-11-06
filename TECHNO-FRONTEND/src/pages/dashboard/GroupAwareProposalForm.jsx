import { useState, useEffect } from 'react'
import api from '../../api/axios'

// Title proposal. The instructor, academic year and semester are filled in
// from the group automatically; a proposal has no abstract yet, so students
// write a short Project Description (compared against past projects'
// abstracts for similarity).
function GroupAwareProposalForm({ user, onSubmit, saving }) {
  const [myGroup, setMyGroup] = useState(null)
  const [form, setForm] = useState({
  title:'', description:'', objectives:'', keywords:'', program:'', group_id:'', adviser_id: ''
})

useEffect(() => {
  api.get('/groups').then(res => {
    const mine = res.data.find(g => g.members?.some(m => m.user_id === user.id))
    if (mine) {
      setMyGroup(mine)
      setForm(f => ({
        ...f,
        group_id: mine.id,
        adviser_id: mine.adviser_id || '',
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
          <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
            <span>Instructor: <strong>{myGroup.current_instructor?.name || 'not assigned yet'}</strong></span>
            <span>A.Y.: <strong>{myGroup.batch ? myGroup.batch.replace('-', '–') : '—'}</strong></span>
            <span>Semester: <strong>{myGroup.term?.name || '—'}</strong></span>
            {myGroup.capstone?.stage && <span>Stage: <strong>{myGroup.capstone.stage}</strong></span>}
            <span style={{ fontSize: '10px', background: '#d1fae5', color: '#059669', padding: '1px 6px', borderRadius: '20px', fontWeight: '700' }}>Filled in automatically</span>
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
      <div>
        <label style={labelStyle}>Program</label>
        <input name="program" value={form.program} onChange={handle} style={inputStyle} placeholder="e.g. BS Information Technology" />
      </div>
      <div>
        <label style={labelStyle} htmlFor="proposal-description">Project Description</label>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '5px' }}>A brief summary of the project and the problem it solves. (The full abstract comes later, after your final defense.)</div>
        <textarea id="proposal-description" name="description" value={form.description} onChange={handle} required style={{ ...inputStyle, height: '100px', resize: 'vertical' }} placeholder="e.g. A web system that helps teachers track attendance using QR codes and alerts parents when a student is absent." />
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
