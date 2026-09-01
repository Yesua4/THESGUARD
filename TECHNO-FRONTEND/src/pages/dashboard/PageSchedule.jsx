import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import api from '../../api/axios'

function PageSchedule() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [schedules, setSchedules]       = useState([])
  const [groups, setGroups]             = useState([])
  const [loading, setLoading]           = useState(true)
  const [showForm, setShowForm]         = useState(false)
  const [success, setSuccess]           = useState('')
  const [saving, setSaving]             = useState(false)
  const [conflicts, setConflicts]       = useState(null)
  const [panelists, setPanelists]       = useState([])
  const [rooms, setRooms]               = useState([])
  const [manualVenue, setManualVenue]   = useState('')
  const [selectedPanelists, setSelectedPanelists] = useState([])
  const [form, setForm] = useState({ group_id:'', defense_date:'', defense_time:'', venue:'', panelists:'' })

  const load = () => api.get('/schedules').then(res => setSchedules(res.data)).finally(() => setLoading(false))

  useEffect(() => {
    load()
    api.get('/groups').then(res => setGroups(res.data))
    api.get('/users?role=panelist').then(res => setPanelists(res.data))
    api.get('/rooms').then(res => setRooms(res.data))
  }, [])

  const handle = e => setForm({ ...form, [e.target.name]: e.target.value })

  const togglePanelist = name => {
    setSelectedPanelists(prev => {
      const updated = prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
      setForm(f => ({ ...f, panelists: updated.join(', ') }))
      return updated
    })
  }

  const submit = async e => {
    e.preventDefault(); setSaving(true); setConflicts(null)
    try {
      await api.post('/schedules', form)
      setSuccess('Defense scheduled successfully!')
      setShowForm(false)
      setForm({ group_id:'', defense_date:'', defense_time:'', venue:'', panelists:'' })
      setSelectedPanelists([])
      load()
    } catch (err) {
      if (err.response?.status === 409) setConflicts(err.response.data.conflicts)
      else showToast('Error saving schedule.')
    }
    finally { setSaving(false) }
  }

  const deleteSchedule = async id => {
    if (!confirm('Cancel this defense schedule?')) return
    try { await api.delete(`/schedules/${id}`); load() }
    catch { showToast('Error deleting schedule.') }
  }

  const formatTime = t => {
    if (!t) return '—'
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    return `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
  }

  const canSchedule = ['instructor','admin','adviser'].includes(user?.role)

  const inputStyle = { border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'9px 12px', fontSize:'13px', outline:'none', background:'#f8fafc', fontFamily:'inherit', width:'100%', boxSizing:'border-box' }
  const labelStyle = { fontSize:'11px', fontWeight:'700', color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:'5px' }

  const statusStyle = s => ({
    background: s==='completed'?'#d1fae5':s==='cancelled'?'#fee2e2':'#dbeafe',
    color:      s==='completed'?'#065f46':s==='cancelled'?'#9f1239':'#1e40af',
  })

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44' }}>Defense Schedule</div>
        {canSchedule && (
          <button onClick={() => setShowForm(!showForm)} style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', border:'none', borderRadius:'8px', padding:'9px 16px', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>
            {showForm ? 'Cancel' : '+ Schedule Defense'}
          </button>
        )}
      </div>

      {success && (
        <div style={{ background:'#d1fae5', border:'1px solid #a7f3d0', borderRadius:'12px', padding:'12px 16px', marginBottom:'14px', fontSize:'13px', color:'#065f46', fontWeight:'600' }}>
          ✅ {success}
        </div>
      )}

      {showForm && canSchedule && (
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden', marginBottom:'16px' }}>
          <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'14px 18px' }}>
            <div style={{ fontSize:'13px', fontWeight:'700', color:'#fff' }}>Schedule a Defense</div>
          </div>
          <form onSubmit={submit} style={{ padding:'18px', display:'flex', flexDirection:'column', gap:'12px' }}>
            {conflicts && conflicts.length > 0 && (
              <div style={{ background:'#fee2e2', border:'1px solid #fecaca', borderRadius:'10px', padding:'12px 14px' }}>
                <div style={{ fontSize:'13px', fontWeight:'700', color:'#9f1239', marginBottom:'6px' }}>⚠ Scheduling conflict</div>
                {conflicts.map((c, i) => (
                  <div key={i} style={{ fontSize:'12px', color:'#9f1239', marginBottom:'4px' }}>
                    {c.group && <strong>{c.group}: </strong>}
                    {c.reasons.join(' ')}
                  </div>
                ))}
              </div>
            )}
            <div>
              <label style={labelStyle}>Select Group</label>
              <select name="group_id" value={form.group_id} onChange={handle} required style={inputStyle}>
                <option value="">Choose a group...</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.group_name} — {g.batch || 'No batch'} ({g.members?.length || 0} members)</option>
                ))}
              </select>
              {form.group_id && (
                <div style={{ marginTop:'6px', padding:'8px 10px', background:'#f8fafc', borderRadius:'8px', display:'flex', flexWrap:'wrap', gap:'4px' }}>
                  {groups.find(g => String(g.id) === String(form.group_id))?.members?.map(m => (
                    <span key={m.id} style={{ fontSize:'11px', background:'#ede9fe', color:'#6d28d9', padding:'2px 8px', borderRadius:'20px', fontWeight:'600' }}>
                      {m.user?.name} {m.is_leader ? '★' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="dg-grid-2" style={{ display:'grid', gap:'12px' }}>
              <div>
                <label style={labelStyle}>Defense Date</label>
                <input name="defense_date" type="date" value={form.defense_date} onChange={handle} required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Time</label>
                <input name="defense_time" type="time" value={form.defense_time} onChange={handle} required style={inputStyle} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Venue / Room</label>
              <select name="venue" value={form.venue} onChange={handle} style={inputStyle}>
                <option value="">Select room...</option>
                {rooms.map(r => <option key={r.id} value={r.room_name}>{r.room_name}{r.building ? ` — ${r.building}` : ''}{r.capacity ? ` (${r.capacity} seats)` : ''}</option>)}
                <option value="__other__">Other (type manually)</option>
              </select>
              {form.venue === '__other__' && (
                <input
                  value={manualVenue}
                  onChange={e => {
                    setManualVenue(e.target.value)
                    setForm({...form, venue: e.target.value})
                  }}
                  style={{ ...inputStyle, marginTop:'6px' }}
                  placeholder="Type room name manually..."
                />
              )}
              {rooms.length === 0 && <div style={{ fontSize:'11px', color:'#d97706', marginTop:'4px' }}>No rooms added yet. Go to Rooms & Panelists to add rooms.</div>}
            </div>

            <div>
              <label style={labelStyle}>Panelists</label>
              {panelists.length === 0 ? (
                <div style={{ fontSize:'11px', color:'#d97706' }}>No panelists added yet. Go to Rooms & Panelists to add.</div>
              ) : (
                <div style={{ border:'1.5px solid #e2e8f0', borderRadius:'8px', overflow:'hidden' }}>
                  {panelists.map(p => (
                    <label key={p.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid #f8fafc', background: selectedPanelists.includes(p.name)?'#eff6ff':'transparent' }}>
                      <input type="checkbox" checked={selectedPanelists.includes(p.name)} onChange={() => togglePanelist(p.name)} />
                      <div>
                        <div style={{ fontSize:'13px', fontWeight:'500', color:'#0a1f44' }}>{p.name}</div>
                        <div style={{ fontSize:'11px', color:'#94a3b8' }}>{p.department || p.email || '—'}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {selectedPanelists.length > 0 && (
                <div style={{ fontSize:'11px', color:'#64748b', marginTop:'4px' }}>Selected: {selectedPanelists.join(', ')}</div>
              )}
            </div>

            <button type="submit" disabled={saving} style={{ padding:'11px', borderRadius:'8px', border:'none', background:saving?'#cbd5e1':'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', fontSize:'13px', fontWeight:'700', cursor:saving?'not-allowed':'pointer' }}>
              {saving ? 'Saving...' : 'Confirm Schedule'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'13px' }}>Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'48px', textAlign:'center', color:'#94a3b8', fontSize:'13px' }}>
          No defense schedules yet. {canSchedule && 'Click "+ Schedule Defense" to add one.'}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {schedules.map(s => (
            <div key={s.id} style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
              <div style={{ display:'flex', alignItems:'stretch' }}>
                {/* Date column */}
                <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', width:'72px', flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'16px 8px' }}>
                  <div style={{ color:'#f5c300', fontSize:'24px', fontWeight:'800', lineHeight:1 }}>
                    {new Date(s.defense_date).getDate()}
                  </div>
                  <div style={{ color:'rgba(255,255,255,0.6)', fontSize:'11px', fontWeight:'600', textTransform:'uppercase', marginTop:'2px' }}>
                    {new Date(s.defense_date).toLocaleDateString('en-PH',{month:'short'})}
                  </div>
                  <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'10px', marginTop:'2px' }}>
                    {new Date(s.defense_date).getFullYear()}
                  </div>
                </div>

                {/* Content */}
                <div style={{ flex:1, padding:'14px 18px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'6px' }}>
                    <div>
                      <div style={{ fontSize:'14px', fontWeight:'700', color:'#0a1f44', marginBottom:'2px' }}>
                        {s.group?.group_name || s.project?.title || '—'}
                      </div>
                      <div style={{ fontSize:'11px', color:'#94a3b8' }}>{s.group?.batch || 'No batch'}</div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'6px' }}>
                      <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'700', ...statusStyle(s.status) }}>{s.status}</span>
                      {canSchedule && (
                        <button onClick={() => deleteSchedule(s.id)} style={{ fontSize:'11px', color:'#dc2626', background:'none', border:'none', cursor:'pointer', padding:'0' }}>Cancel</button>
                      )}
                    </div>
                  </div>

                  <div style={{ display:'flex', gap:'16px', marginBottom:'8px' }}>
                    {[
                      ['🕐', formatTime(s.defense_time)],
                      ['📍', s.venue || 'No venue'],
                      ['👤', s.panelists || 'No panelists assigned'],
                    ].map(([icon, val]) => (
                      <div key={icon} style={{ fontSize:'11px', color:'#64748b', display:'flex', alignItems:'center', gap:'4px' }}>
                        <span>{icon}</span><span>{val}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                    {(s.group?.members || s.project?.members)?.map(m => (
                      <span key={m.id} style={{ fontSize:'11px', background:'#ede9fe', color:'#6d28d9', padding:'2px 8px', borderRadius:'20px', fontWeight:'600' }}>
                        {m.user?.name || 'Member'} {m.is_leader ? '★' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default PageSchedule
