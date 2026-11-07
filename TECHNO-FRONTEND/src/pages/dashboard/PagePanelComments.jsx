import { useCallback, useEffect, useState } from 'react'
import api from '../../api/axios'
import { useToast } from '../../context/ToastContext'
import { useSchoolActivity } from '../../hooks/useSchoolActivity'
import { DEFENSE_TYPE_LABEL, PANEL_ROLE_LABEL } from '../../constants/defense'

// Panel comments & recommendations from each defense. Panelists write
// theirs; the group's adviser can add what the panel missed; students and
// the adviser read them here. (The adviser's minutes can pull them in.)
const ROLE_ORDER = ['chair', 'member1', 'member2', 'adviser']
const roleLabel = r => (r === 'adviser' ? 'Adviser' : PANEL_ROLE_LABEL[r] || r)

export default function PagePanelComments({ user }) {
  const { showToast } = useToast()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [data, setData] = useState(null)
  const [defenseId, setDefenseId] = useState('')
  const [form, setForm] = useState({ page_no: '', comment: '' })
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/projects').then(res => {
      const list = res.data.filter(p => p.group_id && p.title_status === 'approved' && (user?.role !== 'student' || p.members?.some(m => m.user_id === user.id)))
      setProjects(list)
      setProjectId(id => id || String((list.find(p => p.is_final_title) || list[0])?.id ?? ''))
    }).catch(() => {})
  }, [user?.id, user?.role])

  const load = useCallback(() => {
    if (!projectId) return
    api.get(`/projects/${projectId}/panel-comments`).then(res => {
      setData(res.data)
      setDefenseId(id => (res.data.defenses.some(d => String(d.id) === id) ? id : String(res.data.defenses[0]?.id ?? '')))
    }).catch(() => setData({ defenses: [], comments: [] }))
  }, [projectId])
  useEffect(() => { load() }, [load])
  useSchoolActivity(['panel_comments', 'schedules'], load)

  const defense = data?.defenses.find(d => String(d.id) === defenseId)
  const comments = (data?.comments || []).filter(c => String(c.defense_schedule_id) === defenseId)
  const nameFor = role => role === 'adviser' ? null : defense?.panel?.find(p => p.role === role)?.user?.name

  const save = async e => {
    e.preventDefault()
    if (!form.comment.trim()) return
    setSaving(true)
    try {
      if (editing) await api.put(`/panel-comments/${editing}`, form)
      else await api.post(`/projects/${projectId}/panel-comments`, { ...form, defense_schedule_id: Number(defenseId) })
      setForm({ page_no: '', comment: '' }); setEditing(null); load()
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save the comment.')
    } finally { setSaving(false) }
  }

  const remove = async c => {
    if (!confirm('Delete this comment?')) return
    try { await api.delete(`/panel-comments/${c.id}`); load() } catch { showToast('Could not delete.') }
  }

  const input = { border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', outline: 'none', background: '#f8fafc', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
  const label = { fontSize: '11px', fontWeight: '700', color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ background: 'linear-gradient(135deg,#0a1f44,#1040a0)', borderRadius: '14px', padding: '20px 24px' }}>
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Defense</div>
        <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>Panel Comments & Recommendations</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>What the panel said at each defense, by panelist. The adviser can add anything the panel missed.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
        <div>
          <label style={label} htmlFor="pc-project">Project</label>
          <select id="pc-project" value={projectId} onChange={e => setProjectId(e.target.value)} style={input}>
            {projects.length === 0 && <option value="">No projects yet</option>}
            {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div>
          <label style={label} htmlFor="pc-defense">Defense</label>
          <select id="pc-defense" value={defenseId} onChange={e => setDefenseId(e.target.value)} style={input} disabled={!data?.defenses.length}>
            {!data?.defenses.length && <option value="">No defense scheduled yet</option>}
            {data?.defenses.map(d => (
              <option key={d.id} value={d.id}>{DEFENSE_TYPE_LABEL[d.defense_type] || 'Defense'} — {new Date(d.defense_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</option>
            ))}
          </select>
        </div>
      </div>

      {defense?.my_role && (
        <form onSubmit={save} style={{ background: '#fff', border: '1px solid #e8ecf2', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0a1f44' }}>
            {editing ? 'Edit your comment' : 'Add a comment / recommendation'} <span style={{ fontWeight: 500, color: '#5b21b6' }}>as {roleLabel(defense.my_role)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px' }}>
            <div>
              <label style={label} htmlFor="pc-page">Page No.</label>
              <input id="pc-page" value={form.page_no} onChange={e => setForm({ ...form, page_no: e.target.value })} style={input} placeholder="e.g. 12" />
            </div>
            <div>
              <label style={label} htmlFor="pc-comment">Comment / Suggestion / Recommendation</label>
              <textarea id="pc-comment" value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} required style={{ ...input, minHeight: '70px', resize: 'vertical' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            {editing && <button type="button" onClick={() => { setEditing(null); setForm({ page_no: '', comment: '' }) }} style={{ padding: '8px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>Cancel</button>}
            <button type="submit" disabled={saving || !form.comment.trim()} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: saving || !form.comment.trim() ? '#cbd5e1' : 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {defense && ROLE_ORDER.map(role => {
        const mine = comments.filter(c => c.author_role === role)
        const name = nameFor(role) || mine[0]?.user?.name
        if (!name && mine.length === 0) return null
        return (
          <div key={role} style={{ background: '#fff', border: '1px solid #e8ecf2', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: '13px', fontWeight: 700, color: '#0a1f44' }}>
              {name || '—'} <span style={{ fontWeight: 500, color: '#64748b' }}>· {roleLabel(role)}</span>
            </div>
            {mine.length === 0 ? (
              <div style={{ padding: '12px 16px', fontSize: '12px', color: '#94a3b8' }}>No comments yet.</div>
            ) : mine.map(c => (
              <div key={c.id} style={{ padding: '10px 16px', borderBottom: '1px solid #f8fafc', display: 'flex', gap: '12px' }}>
                <div style={{ width: '64px', flexShrink: 0, fontSize: '12px', color: '#64748b' }}>{c.page_no ? `p. ${c.page_no}` : '—'}</div>
                <div style={{ flex: 1, fontSize: '13px', color: '#334155', whiteSpace: 'pre-wrap' }}>{c.comment}</div>
                {c.mine && (
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button type="button" onClick={() => { setEditing(c.id); setForm({ page_no: c.page_no || '', comment: c.comment }) }} style={{ fontSize: '11px', color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                    <button type="button" onClick={() => remove(c)} style={{ fontSize: '11px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      })}
      {defense && comments.length === 0 && !defense.my_role && (
        <div style={{ textAlign: 'center', fontSize: '13px', color: '#94a3b8', padding: '20px' }}>The panel hasn't added comments for this defense yet.</div>
      )}
    </div>
  )
}
