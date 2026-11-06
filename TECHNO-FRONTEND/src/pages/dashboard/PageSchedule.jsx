import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import api from '../../api/axios'
import { useSchoolActivity } from '../../hooks/useSchoolActivity'
import { useProjectsChannel } from '../../hooks/useProjectChannel'
import { DEFENSE_TYPES, DEFENSE_TYPE_LABEL, PANEL_ROLES, PANEL_ROLE_LABEL, timeRange, nextDefenseType } from '../../constants/defense'

const EMPTY = { group_id: '', defense_type: 'title', defense_date: '', start_time: '', end_time: '', venue: '', panel: { chair: '', member1: '', member2: '' }, update_group_panel: true }

// Defense scheduling: type, date, start-end time, room, and a panel with
// roles. From the outline defense on, the group's permanent panel fills in
// automatically. Conflicts (room, panelist, adviser, group -- overlapping
// times) are checked live while filling in the form.
function PageSchedule() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [schedules, setSchedules] = useState([])
  const [groups, setGroups]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [success, setSuccess]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [conflicts, setConflicts] = useState(null)   // null = not checked yet
  const [checking, setChecking]   = useState(false)
  const [panelists, setPanelists] = useState([])
  const [rooms, setRooms]         = useState([])
  const [otherRoom, setOtherRoom] = useState(false)
  const [form, setForm]           = useState(EMPTY)

  const load = () => api.get('/schedules').then(res => setSchedules(res.data)).finally(() => setLoading(false))
  const loadGroups = () => api.get('/groups').then(res => setGroups(res.data))
  const loadPanelists = () => api.get('/users?role=panelist').then(res => setPanelists(res.data))
  const loadRooms = () => api.get('/rooms').then(res => setRooms(res.data))

  useEffect(() => { load(); loadGroups(); loadPanelists(); loadRooms() }, [])
  useSchoolActivity(['schedules', 'groups'], () => { load(); loadGroups() })
  useSchoolActivity(['users'], loadPanelists)
  useSchoolActivity(['rooms'], loadRooms)
  useProjectsChannel(groups.flatMap(g => (g.projects || []).map(p => p.id)), () => { load(); loadGroups() })

  const group = groups.find(g => String(g.id) === String(form.group_id))
  const groupPanel = useMemo(() => Object.fromEntries((group?.panel || []).map(p => [p.role, String(p.user_id)])), [group])
  const panelPayload = PANEL_ROLES.filter(([r]) => form.panel[r]).map(([role]) => ({ role, user_id: Number(form.panel[role]) }))

  // Choosing a group suggests its next defense, and (outline onward) its panel.
  const chooseGroup = id => {
    const g = groups.find(x => String(x.id) === String(id))
    const type = g ? nextDefenseType(schedules.filter(s => s.group_id === g.id)) : 'title'
    const gp = Object.fromEntries((g?.panel || []).map(p => [p.role, String(p.user_id)]))
    setForm(f => ({ ...f, group_id: id, defense_type: type, panel: type === 'title' ? EMPTY.panel : { ...EMPTY.panel, ...gp } }))
  }
  const chooseType = type => setForm(f => ({
    ...f, defense_type: type,
    panel: type !== 'title' && !Object.values(f.panel).some(Boolean) ? { ...EMPTY.panel, ...groupPanel } : f.panel,
  }))

  // Live conflict check (debounced), same rules as saving.
  const ready = form.group_id && form.defense_date && form.start_time && form.end_time
  const checkKey = JSON.stringify([form.group_id, form.defense_type, form.defense_date, form.start_time, form.end_time, form.venue, form.panel])
  useEffect(() => {
    if (!ready || form.end_time <= form.start_time) { setConflicts(null); return }
    setChecking(true)
    const t = setTimeout(() => {
      api.post('/schedules/check', { ...form, panel: panelPayload })
        .then(res => setConflicts(res.data.conflicts))
        .catch(() => setConflicts(null))
        .finally(() => setChecking(false))
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey])

  const submit = async e => {
    e.preventDefault()
    if (form.end_time <= form.start_time) { showToast('The end time must be after the start time.'); return }
    setSaving(true)
    try {
      await api.post('/schedules', { ...form, panel: panelPayload })
      setSuccess(`${DEFENSE_TYPE_LABEL[form.defense_type]} scheduled for ${group?.group_name}.`)
      setShowForm(false); setForm(EMPTY); setConflicts(null); setOtherRoom(false)
      load(); loadGroups()
    } catch (err) {
      if (err.response?.status === 409) setConflicts(err.response.data.conflicts)
      else {
        const errs = err.response?.data?.errors
        showToast(errs ? Object.values(errs)[0][0] : (err.response?.data?.message || 'Error saving schedule.'))
      }
    } finally { setSaving(false) }
  }

  const deleteSchedule = async id => {
    if (!confirm('Cancel this defense schedule?')) return
    try { await api.delete(`/schedules/${id}`); load() }
    catch { showToast('Error deleting schedule.') }
  }

  const canSchedule = ['instructor', 'admin', 'adviser'].includes(user?.role)
  const inputStyle = { border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', outline: 'none', background: '#f8fafc', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
  const labelStyle = { fontSize: '11px', fontWeight: '700', color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }
  const statusStyle = s => ({
    background: s === 'completed' ? '#d1fae5' : s === 'cancelled' ? '#fee2e2' : '#dbeafe',
    color: s === 'completed' ? '#065f46' : s === 'cancelled' ? '#9f1239' : '#1e40af',
  })

  // People who can't sit on this group's panel.
  const excluded = new Set([String(group?.adviser_id || ''), ...(group?.members || []).map(m => String(m.user_id))])
  const panelOptions = role => panelists.filter(p => !excluded.has(String(p.id)) && !PANEL_ROLES.some(([r]) => r !== role && form.panel[r] === String(p.id)))
  const differsFromGroup = form.defense_type !== 'title' && PANEL_ROLES.some(([r]) => (form.panel[r] || '') !== (groupPanel[r] || ''))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '18px', fontWeight: '700', color: '#0a1f44' }}>Defense Schedule</div>
        {canSchedule && (
          <button onClick={() => { setShowForm(!showForm); setConflicts(null) }} style={{ background: 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
            {showForm ? 'Cancel' : '+ Schedule Defense'}
          </button>
        )}
      </div>

      {success && (
        <div style={{ background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: '12px', padding: '12px 16px', marginBottom: '14px', fontSize: '13px', color: '#065f46', fontWeight: '600' }}>✅ {success}</div>
      )}

      {showForm && canSchedule && (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ background: 'linear-gradient(135deg,#0a1f44,#1040a0)', padding: '14px 18px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>Schedule a Defense</div>
          </div>
          <form onSubmit={submit} style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="dg-grid-2" style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={labelStyle} htmlFor="sch-group">Group</label>
                <select id="sch-group" value={form.group_id} onChange={e => chooseGroup(e.target.value)} required style={inputStyle}>
                  <option value="">Choose a group...</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.group_name}{g.section ? ` — ${g.section}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor="sch-type">Type of defense</label>
                <select id="sch-type" value={form.defense_type} onChange={e => chooseType(e.target.value)} required style={inputStyle}>
                  {DEFENSE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {group && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>Suggested from the group's previous defenses.</div>}
              </div>
            </div>
            {group && (
              <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {group.members?.map(m => (
                  <span key={m.id} style={{ fontSize: '11px', background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: '20px', fontWeight: '600' }}>{m.user?.name} {m.is_leader ? '★' : ''}</span>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              <div>
                <label style={labelStyle} htmlFor="sch-date">Date</label>
                <input id="sch-date" type="date" value={form.defense_date} onChange={e => setForm({ ...form, defense_date: e.target.value })} required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="sch-start">Starts</label>
                <input id="sch-start" type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="sch-end">Ends</label>
                <input id="sch-end" type="time" value={form.end_time} min={form.start_time || undefined} onChange={e => setForm({ ...form, end_time: e.target.value })} required style={inputStyle} />
              </div>
            </div>
            {form.start_time && form.end_time && form.end_time <= form.start_time && (
              <div role="alert" style={{ fontSize: '12px', color: '#9f1239' }}>The end time must be after the start time.</div>
            )}

            <div>
              <label style={labelStyle} htmlFor="sch-room">Room</label>
              <select id="sch-room" value={otherRoom ? '__other__' : form.venue} onChange={e => {
                if (e.target.value === '__other__') { setOtherRoom(true); setForm({ ...form, venue: '' }) }
                else { setOtherRoom(false); setForm({ ...form, venue: e.target.value }) }
              }} style={inputStyle}>
                <option value="">Select room...</option>
                {rooms.map(r => <option key={r.id} value={r.room_name}>{r.room_name}{r.building ? ` — ${r.building}` : ''}</option>)}
                <option value="__other__">Other (type manually)</option>
              </select>
              {otherRoom && <input value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} style={{ ...inputStyle, marginTop: '6px' }} placeholder="Type room name..." aria-label="Room name" />}
              {rooms.length === 0 && <div style={{ fontSize: '11px', color: '#d97706', marginTop: '4px' }}>No rooms added yet. Go to Rooms & Panelists to add rooms.</div>}
            </div>

            <div>
              <label style={labelStyle}>Panel</label>
              {form.defense_type !== 'title' && Object.keys(groupPanel).length > 0 && (
                <div style={{ fontSize: '11px', color: '#065f46', marginBottom: '6px' }}>✓ Filled in with this group's panel. You can still change it.</div>
              )}
              {panelists.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#d97706' }}>No panelists yet. Give accounts the Panelist role in User Accounts.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {PANEL_ROLES.map(([role, label]) => (
                    <div key={role} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '10px', alignItems: 'center' }}>
                      <label htmlFor={`sch-${role}`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>{label}</label>
                      <select id={`sch-${role}`} value={form.panel[role]} onChange={e => setForm({ ...form, panel: { ...form.panel, [role]: e.target.value } })} style={inputStyle}>
                        <option value="">— none —</option>
                        {panelOptions(role).map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                      </select>
                    </div>
                  ))}
                  {group && <div style={{ fontSize: '11px', color: '#94a3b8' }}>The group's adviser and members aren't listed — they can't be on its panel.</div>}
                </div>
              )}
              {differsFromGroup && panelPayload.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#334155', marginTop: '8px' }}>
                  <input type="checkbox" checked={form.update_group_panel} onChange={e => setForm({ ...form, update_group_panel: e.target.checked })} />
                  Make this the group's panel for its remaining defenses (outline → final)
                </label>
              )}
            </div>

            {/* Live conflict check */}
            {ready && (checking ? (
              <div style={{ fontSize: '12px', color: '#64748b' }}>Checking for conflicts…</div>
            ) : conflicts && conflicts.length > 0 ? (
              <div role="alert" style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#9f1239', marginBottom: '6px' }}>⚠ Schedule conflict — change the time, room, or panel</div>
                {conflicts.map((c, i) => (
                  <ul key={i} style={{ margin: '0 0 4px', paddingLeft: '18px' }}>
                    {c.reasons.map((r, j) => <li key={j} style={{ fontSize: '12px', color: '#9f1239' }}>{r}</li>)}
                  </ul>
                ))}
              </div>
            ) : conflicts ? (
              <div style={{ fontSize: '12px', color: '#065f46', fontWeight: 600 }}>✓ No conflicts with other defenses.</div>
            ) : null)}

            <button type="submit" disabled={saving || (conflicts && conflicts.length > 0)} style={{ padding: '11px', borderRadius: '8px', border: 'none', background: saving || (conflicts && conflicts.length > 0) ? '#cbd5e1' : 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving...' : 'Confirm Schedule'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
          No defense schedules yet. {canSchedule && 'Click "+ Schedule Defense" to add one.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {schedules.map(s => (
            <div key={s.id} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                <div style={{ background: 'linear-gradient(135deg,#0a1f44,#1040a0)', width: '72px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 8px' }}>
                  <div style={{ color: '#f5c300', fontSize: '24px', fontWeight: '800', lineHeight: 1 }}>{new Date(s.defense_date).getDate()}</div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', marginTop: '2px' }}>{new Date(s.defense_date).toLocaleDateString('en-PH', { month: 'short' })}</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', marginTop: '2px' }}>{new Date(s.defense_date).getFullYear()}</div>
                </div>
                <div style={{ flex: 1, padding: '14px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', gap: '10px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#0a1f44', marginBottom: '2px' }}>{s.group?.group_name || s.project?.title || '—'}</div>
                      {s.defense_type && <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: '#ede9fe', color: '#5b21b6' }}>{DEFENSE_TYPE_LABEL[s.defense_type]}</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                      {s.status && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '700', ...statusStyle(s.status) }}>{s.status}</span>}
                      {canSchedule && <button onClick={() => deleteSchedule(s.id)} style={{ fontSize: '11px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '0' }}>Cancel</button>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '8px', fontSize: '12px', color: '#475569' }}>
                    <span>🕐 {timeRange(s)}</span>
                    <span>📍 {s.venue || 'No room'}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569', marginBottom: '8px' }}>
                    {(s.panel || []).length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                        {s.panel.map(p => <span key={p.id}><span style={{ color: '#94a3b8' }}>{PANEL_ROLE_LABEL[p.role]}:</span> <strong>{p.user?.name}</strong></span>)}
                      </div>
                    ) : <span>👤 {s.panelists || 'No panelists assigned'}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {(s.group?.members || s.project?.members)?.map(m => (
                      <span key={m.id} style={{ fontSize: '11px', background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: '20px', fontWeight: '600' }}>{m.user?.name || 'Member'} {m.is_leader ? '★' : ''}</span>
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
