import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

// Defense minutes monitoring plus the pre-deployment and final manuscript
// routing checklists. Reviewers record panel comments; students record the
// action taken; reviewers verify. Checklist items can only be ticked by the
// role responsible for them.

const STAFF = ['admin', 'instructor', 'adviser', 'panelist']
const DEFENSE_TYPES = { outline: 'Outline Defense', pre_deployment: 'Pre-deployment Defense', final: 'Final Defense' }
const ROLE_LABELS = { student: 'Students', adviser: 'Adviser', panelist: 'Panel', instructor: 'Capstone Instructor', admin: 'Dean / Admin' }
const STATUS_STYLE = {
  pending:   { label: 'Pending',   background: '#fef3c7', color: '#92400e' },
  addressed: { label: 'Addressed', background: '#dbeafe', color: '#1e40af' },
  verified:  { label: 'Verified',  background: '#d1fae5', color: '#065f46' },
}
const TABS = [
  ['minutes', 'Defense Minutes'],
  ['pre_deployment', 'Pre-deployment Checklist'],
  ['manuscript_routing', 'Manuscript Routing'],
]

const card = { background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'16px 20px', marginBottom:'14px' }
const inputStyle = { border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', outline:'none', background:'#f8fafc', fontFamily:'inherit' }
const btn = (bg, color = '#fff') => ({ background:bg, color, border:'none', borderRadius:'8px', padding:'7px 14px', fontSize:'12px', fontWeight:'700', cursor:'pointer' })
const formatDate = d => d ? new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : ''

function MinuteItemRow({ item, isStaff, onSaved, onDelete }) {
  const { showToast } = useToast()
  const [action, setAction] = useState(item.action_taken || '')
  const [saving, setSaving] = useState(false)
  const status = STATUS_STYLE[item.status] || STATUS_STYLE.pending

  const save = async patch => {
    setSaving(true)
    try {
      await api.put(`/minute-items/${item.id}`, patch)
      onSaved()
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not update this recommendation.')
    } finally { setSaving(false) }
  }

  const canEditAction = item.status !== 'verified' || isStaff

  return (
    <tr style={{ borderBottom:'1px solid #f1f5f9', verticalAlign:'top' }}>
      <td style={{ padding:'10px 12px', fontSize:'12px' }}>
        <div style={{ fontWeight:'700', color:'#0a1f44' }}>{item.panelist_name}</div>
        {item.panelist_role && <div style={{ color:'#94a3b8', fontSize:'11px' }}>{item.panelist_role}</div>}
      </td>
      <td style={{ padding:'10px 12px', fontSize:'12px', color:'#64748b' }}>{item.page_no || '—'}</td>
      <td style={{ padding:'10px 12px', fontSize:'12px', color:'#334155', lineHeight:'1.6', whiteSpace:'pre-line' }}>{item.comment}</td>
      <td style={{ padding:'10px 12px', fontSize:'12px', minWidth:'240px' }}>
        {canEditAction ? (
          <textarea value={action} onChange={e => setAction(e.target.value)} rows={3}
            placeholder="Describe what the group did to address this..."
            style={{ ...inputStyle, width:'100%', boxSizing:'border-box', resize:'vertical', fontSize:'12px' }} />
        ) : (
          <div style={{ color:'#334155', lineHeight:'1.6', whiteSpace:'pre-line' }}>{item.action_taken}</div>
        )}
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginTop:'6px' }}>
          {canEditAction && (
            <button disabled={saving || !action.trim()} onClick={() => save({ action_taken: action, status: item.status === 'pending' ? 'addressed' : item.status })}
              style={{ ...btn(saving || !action.trim() ? '#cbd5e1' : 'linear-gradient(135deg,#0a1f44,#1040a0)') }}>
              {item.status === 'pending' ? 'Save & mark addressed' : 'Save'}
            </button>
          )}
          {isStaff && item.status === 'addressed' && (
            <>
              <button disabled={saving} onClick={() => save({ status: 'verified' })} style={btn('linear-gradient(135deg,#059669,#047857)')}>Verify</button>
              <button disabled={saving} onClick={() => save({ status: 'pending' })} style={btn('#fff', '#b45309')}>Return</button>
            </>
          )}
          {isStaff && <button onClick={() => onDelete(item.id)} style={btn('#fff', '#dc2626')}>Delete</button>}
        </div>
      </td>
      <td style={{ padding:'10px 12px' }}>
        <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'700', background:status.background, color:status.color }}>{status.label}</span>
        {item.status === 'addressed' && item.addresser && <div style={{ fontSize:'10px', color:'#94a3b8', marginTop:'4px' }}>by {item.addresser.name}</div>}
        {item.status === 'verified' && item.verifier && <div style={{ fontSize:'10px', color:'#94a3b8', marginTop:'4px' }}>by {item.verifier.name}<br />{formatDate(item.verified_at)}</div>}
      </td>
    </tr>
  )
}

function AddCommentForm({ minuteId, defaultName, onAdded }) {
  const { showToast } = useToast()
  const [form, setForm] = useState({ panelist_name: defaultName, panelist_role: 'Panel Member', page_no: '', comment: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async e => {
    e.preventDefault()
    try {
      await api.post(`/minutes/${minuteId}/items`, form)
      setForm(f => ({ ...f, page_no: '', comment: '' }))
      onAdded()
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not add the comment.')
    }
  }

  return (
    <form onSubmit={submit} style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginTop:'10px', paddingTop:'10px', borderTop:'1px dashed #e2e8f0' }}>
      <input value={form.panelist_name} onChange={e => set('panelist_name', e.target.value)} placeholder="Panelist name" style={{ ...inputStyle, width:'180px' }} required />
      <select value={form.panelist_role} onChange={e => set('panelist_role', e.target.value)} style={inputStyle}>
        <option>Panel Chairman</option>
        <option>Panel Member</option>
        <option>Adviser</option>
      </select>
      <input value={form.page_no} onChange={e => set('page_no', e.target.value)} placeholder="Page no." style={{ ...inputStyle, width:'80px' }} />
      <input value={form.comment} onChange={e => set('comment', e.target.value)} placeholder="Comment / suggestion / recommendation" style={{ ...inputStyle, flex:1, minWidth:'220px' }} required />
      <button type="submit" style={btn('linear-gradient(135deg,#0a1f44,#1040a0)')}>+ Add comment</button>
    </form>
  )
}

function MinutesTab({ projectId, user }) {
  const { showToast } = useToast()
  const isStaff = STAFF.includes(user.role)
  const [minutes, setMinutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [newDefense, setNewDefense] = useState({ defense_type: 'outline', defense_date: '' })

  const load = useCallback(() => {
    api.get(`/projects/${projectId}/minutes`)
      .then(res => setMinutes(res.data))
      .catch(err => showToast(err.response?.data?.message || 'Could not load the minutes.'))
      .finally(() => setLoading(false))
  }, [projectId, showToast])

  useEffect(() => { load() }, [load])

  const createDefense = async e => {
    e.preventDefault()
    try {
      await api.post(`/projects/${projectId}/minutes`, { ...newDefense, defense_date: newDefense.defense_date || null })
      load()
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not record the defense.')
    }
  }

  const deleteItem = async id => {
    if (!window.confirm('Delete this comment?')) return
    try { await api.delete(`/minute-items/${id}`); load() }
    catch (err) { showToast(err.response?.data?.message || 'Could not delete the comment.') }
  }

  const deleteMinute = async id => {
    if (!window.confirm('Delete these minutes and all their comments?')) return
    try { await api.delete(`/minutes/${id}`); load() }
    catch (err) { showToast(err.response?.data?.message || 'Could not delete the minutes.') }
  }

  if (loading) return <div style={{ textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'13px' }}>Loading minutes...</div>

  const allItems = minutes.flatMap(m => m.items || [])
  const counts = ['pending', 'addressed', 'verified'].map(s => [s, allItems.filter(i => i.status === s).length])

  return (
    <div>
      <div style={{ display:'flex', gap:'10px', marginBottom:'14px', flexWrap:'wrap' }}>
        {counts.map(([s, n]) => (
          <div key={s} style={{ ...card, marginBottom:0, padding:'12px 16px', flex:1, minWidth:'140px' }}>
            <div style={{ fontSize:'22px', fontWeight:'800', color: STATUS_STYLE[s].color }}>{n}</div>
            <div style={{ fontSize:'11px', color:'#94a3b8', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.06em' }}>{STATUS_STYLE[s].label}</div>
          </div>
        ))}
      </div>

      {isStaff && (
        <form onSubmit={createDefense} style={{ ...card, display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ fontSize:'13px', fontWeight:'700', color:'#0a1f44', marginRight:'6px' }}>Record a defense</div>
          <select value={newDefense.defense_type} onChange={e => setNewDefense(d => ({ ...d, defense_type: e.target.value }))} style={inputStyle}>
            {Object.entries(DEFENSE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="date" value={newDefense.defense_date} onChange={e => setNewDefense(d => ({ ...d, defense_date: e.target.value }))} style={inputStyle} />
          <button type="submit" style={btn('linear-gradient(135deg,#0a1f44,#1040a0)')}>+ Create minutes</button>
        </form>
      )}

      {minutes.length === 0 ? (
        <div style={{ ...card, textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'13px' }}>
          No defense minutes recorded yet.{isStaff ? ' Create minutes above to start adding panel comments.' : ' Your adviser or panel will add them after your defense.'}
        </div>
      ) : minutes.map(m => (
        <div key={m.id} style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
            <div>
              <div style={{ fontSize:'14px', fontWeight:'700', color:'#0a1f44' }}>{DEFENSE_TYPES[m.defense_type] || m.defense_type} Minutes</div>
              <div style={{ fontSize:'11px', color:'#94a3b8' }}>
                {m.defense_date ? `Defense date: ${formatDate(m.defense_date)}` : 'Defense date not set'}
                {m.recorder && ` · recorded by ${m.recorder.name}`}
              </div>
            </div>
            {['admin', 'instructor'].includes(user.role) || m.recorded_by === user.id
              ? <button onClick={() => deleteMinute(m.id)} style={btn('#fff', '#dc2626')}>Delete minutes</button> : null}
          </div>
          {(m.items || []).length === 0 ? (
            <div style={{ fontSize:'12px', color:'#94a3b8', padding:'8px 0' }}>No comments yet.</div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#f8fafc' }}>
                    {['Panelist', 'Page No.', 'Comments / Suggestions / Recommendations', 'Action/s Taken', 'Status'].map(h => (
                      <th key={h} style={{ textAlign:'left', padding:'8px 12px', fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.06em', textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {m.items.map(item => (
                    <MinuteItemRow key={`${item.id}-${item.updated_at}`} item={item} isStaff={isStaff} onSaved={load} onDelete={deleteItem} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {isStaff && <AddCommentForm minuteId={m.id} defaultName={user.name} onAdded={load} />}
        </div>
      ))}
    </div>
  )
}

function ChecklistTab({ projectId, type, user }) {
  const { showToast } = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [custom, setCustom] = useState({ label: '', responsible_role: 'student' })
  const canCustomize = ['admin', 'instructor', 'adviser'].includes(user.role)

  const load = useCallback(() => {
    api.get(`/projects/${projectId}/checklists`)
      .then(res => setItems(res.data[type] || []))
      .catch(err => showToast(err.response?.data?.message || 'Could not load the checklist.'))
      .finally(() => setLoading(false))
  }, [projectId, type, showToast])

  useEffect(() => { load() }, [load])

  const toggle = async item => {
    try { await api.put(`/checklist-items/${item.id}`, { is_done: !item.is_done }); load() }
    catch (err) { showToast(err.response?.data?.message || 'Could not update the checklist.') }
  }

  const addCustom = async e => {
    e.preventDefault()
    try {
      await api.post(`/projects/${projectId}/checklists`, { ...custom, checklist_type: type })
      setCustom(c => ({ ...c, label: '' }))
      load()
    } catch (err) { showToast(err.response?.data?.message || 'Could not add the item.') }
  }

  const remove = async id => {
    if (!window.confirm('Remove this checklist item?')) return
    try { await api.delete(`/checklist-items/${id}`); load() }
    catch (err) { showToast(err.response?.data?.message || 'Could not remove the item.') }
  }

  if (loading) return <div style={{ textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'13px' }}>Loading checklist...</div>

  const done = items.filter(i => i.is_done).length
  const pct = items.length ? Math.round(done / items.length * 100) : 0

  return (
    <div style={card}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
        <div style={{ fontSize:'14px', fontWeight:'700', color:'#0a1f44' }}>
          {type === 'pre_deployment' ? 'Pre-deployment Readiness' : 'Final Manuscript Routing'}
        </div>
        <div style={{ fontSize:'13px', fontWeight:'700', color: pct === 100 ? '#059669' : '#1d4ed8' }}>{done} of {items.length} done</div>
      </div>
      <div style={{ height:'8px', background:'#f1f5f9', borderRadius:'8px', overflow:'hidden', marginBottom:'14px' }}>
        <div style={{ height:'100%', borderRadius:'8px', width:`${pct}%`, background: pct === 100 ? '#10b981' : '#3b82f6', transition:'width 0.4s ease' }} />
      </div>
      {type === 'manuscript_routing' && (
        <div style={{ fontSize:'12px', color:'#64748b', marginBottom:'12px' }}>Each step is signed off by the office responsible for it, in order from top to bottom.</div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
        {items.map((item, i) => {
          const canTick = user.role === 'admin' || user.role === item.responsible_role
          return (
            <div key={item.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 12px', borderRadius:'10px', border:`1.5px solid ${item.is_done ? '#a7f3d0' : '#e8ecf2'}`, background: item.is_done ? '#f0fdf4' : '#fff' }}>
              <input type="checkbox" checked={item.is_done} disabled={!canTick} onChange={() => toggle(item)}
                title={canTick ? '' : `Signed off by: ${ROLE_LABELS[item.responsible_role] || item.responsible_role}`}
                style={{ width:'16px', height:'16px', cursor: canTick ? 'pointer' : 'not-allowed' }} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'13px', fontWeight:'600', color: item.is_done ? '#065f46' : '#0a1f44' }}>
                  {type === 'manuscript_routing' && <span style={{ color:'#94a3b8', marginRight:'6px' }}>{i + 1}.</span>}{item.label}
                </div>
                <div style={{ fontSize:'11px', color:'#94a3b8' }}>
                  {ROLE_LABELS[item.responsible_role] || item.responsible_role}
                  {item.is_done && item.completer && ` · signed off by ${item.completer.name} on ${formatDate(item.done_at)}`}
                </div>
              </div>
              {canCustomize && item.item_key === null && (
                <button onClick={() => remove(item.id)} style={btn('#fff', '#dc2626')}>Remove</button>
              )}
            </div>
          )
        })}
      </div>

      {canCustomize && (
        <form onSubmit={addCustom} style={{ display:'flex', gap:'8px', marginTop:'12px', paddingTop:'12px', borderTop:'1px dashed #e2e8f0', flexWrap:'wrap' }}>
          <input value={custom.label} onChange={e => setCustom(c => ({ ...c, label: e.target.value }))} placeholder="Add a project-specific item" style={{ ...inputStyle, flex:1, minWidth:'220px' }} required />
          <select value={custom.responsible_role} onChange={e => setCustom(c => ({ ...c, responsible_role: e.target.value }))} style={inputStyle}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="submit" style={btn('linear-gradient(135deg,#0a1f44,#1040a0)')}>+ Add item</button>
        </form>
      )}
    </div>
  )
}

function PageMinutes() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState(null)
  const [tab, setTab] = useState('minutes')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/projects').then(res => {
      const list = user.role === 'student'
        ? res.data.filter(p => p.members?.some(m => m.user_id === user.id) && p.title_status === 'approved')
        : res.data.filter(p => p.title_status === 'approved' && p.status !== 'archived')
      setProjects(list)
      setProjectId((list.find(p => p.is_final_title) || list[0])?.id ?? null)
    }).finally(() => setLoading(false))
  }, [user.id, user.role])

  if (loading) return <div style={{ textAlign:'center', padding:'60px', color:'#94a3b8', fontSize:'13px' }}>Loading...</div>

  return (
    <div>
      <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', borderRadius:'14px', padding:'20px 24px', marginBottom:'16px' }}>
        <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.5)', fontWeight:'700', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'4px' }}>Defense Monitoring</div>
        <div style={{ fontSize:'18px', fontWeight:'700', color:'#fff', marginBottom:'2px' }}>Minutes & Checklists</div>
        <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.55)' }}>Panel recommendations, actions taken, pre-deployment readiness, and final manuscript routing</div>
      </div>

      {projects.length === 0 ? (
        <div style={{ ...card, textAlign:'center', padding:'48px', color:'#94a3b8', fontSize:'13px' }}>
          {user.role === 'student' ? 'Minutes and checklists become available once your title is approved.' : 'No projects with an approved title yet.'}
        </div>
      ) : (
        <>
          <div style={{ display:'flex', gap:'10px', alignItems:'center', marginBottom:'14px', flexWrap:'wrap' }}>
            {projects.length > 1 && (
              <select value={projectId ?? ''} onChange={e => setProjectId(Number(e.target.value))} style={{ ...inputStyle, minWidth:'320px' }}>
                {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            )}
            <div style={{ display:'flex', gap:'6px' }}>
              {TABS.map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)}
                  style={{ ...btn(tab === key ? 'linear-gradient(135deg,#0a1f44,#1040a0)' : '#fff', tab === key ? '#fff' : '#475569'), border: tab === key ? 'none' : '1.5px solid #e2e8f0' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {projectId && (tab === 'minutes'
            ? <MinutesTab key={projectId} projectId={projectId} user={user} />
            : <ChecklistTab key={`${projectId}-${tab}`} projectId={projectId} type={tab} user={user} />)}
        </>
      )}
    </div>
  )
}

export default PageMinutes
