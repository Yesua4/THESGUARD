import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/axios'

function PageGroups() {
  const { user } = useAuth()
  const [groups, setGroups]             = useState([])
  const [students, setStudents]         = useState([])
  const [advisers, setAdvisers]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [showForm, setShowForm]         = useState(false)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [saving, setSaving]             = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [filterAdviser, setFilterAdviser] = useState('')
  const [groupedStudents, setGroupedStudents] = useState([])
  const [form, setForm] = useState({ group_name:'', batch:'', section:'', adviser_id:'', members:[], leader_id:'' })

  const load = () => api.get('/groups').then(res => setGroups(res.data)).finally(() => setLoading(false))

  useEffect(() => {
    load()
    if (user?.role === 'instructor') {
      api.get('/students').then(res => setStudents(res.data))
      api.get('/groups').then(res => {
        const grouped = []
        res.data.forEach(g => g.members?.forEach(m => grouped.push(String(m.user_id))))
        setGroupedStudents(grouped)
      })
    }
    if (user?.role === 'instructor' || user?.role === 'admin') {
      api.get('/advisers').then(res => setAdvisers(res.data))
    }
  }, [])

  const toggleMember = id => {
    const idStr = String(id)
    setForm(f => ({ ...f, members: f.members.includes(idStr) ? f.members.filter(m => m !== idStr) : [...f.members, idStr] }))
  }

  const submit = async e => {
    e.preventDefault()
    if (form.members.length < 1) { alert('Please select at least 1 member.'); return }
    if (!form.leader_id) { alert('Please select a group leader.'); return }
    setSaving(true)
    try {
      await api.post('/groups', form)
      setShowForm(false)
      setForm({ group_name:'', batch:'', section:'', adviser_id:'', members:[], leader_id:'' })
      setMemberSearch('')
      load()
    } catch (err) {
      const errors = err.response?.data?.errors
      const message = err.response?.data?.message
      if (errors?.group_name) alert('❌ Group name already exists.')
      else if (errors?.members || message?.includes('already')) alert('⚠️ ' + (message || 'Some students already belong to a group.'))
      else alert('Error creating group: ' + (message || 'Unknown error.'))
    } finally { setSaving(false) }
  }

  const deleteGroup = async id => {
    if (!confirm('Delete this group?')) return
    try { await api.delete(`/groups/${id}`); load() }
    catch { alert('Error deleting group.') }
  }

  const updateAdviser = async (groupId, adviserId) => {
    try { await api.put(`/groups/${groupId}`, { adviser_id: adviserId }); load() }
    catch { alert('Error updating adviser.') }
  }

  const inputStyle = { border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', outline:'none', background:'#f8fafc', fontFamily:'inherit', width:'100%', boxSizing:'border-box' }
  const labelStyle = { fontSize:'11px', fontWeight:'700', color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:'5px' }

  return (
    <div>
      {/* Group detail panel */}
      {selectedGroup && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,31,68,0.35)', zIndex:50, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}>
          <div style={{ width:'min(460px, 96vw)', height:'100vh', background:'#fff', overflowY:'auto', boxShadow:'-8px 0 32px rgba(0,0,0,0.12)' }}>
            <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'20px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.5)', fontWeight:'600', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'4px' }}>Group Details</div>
                  <div style={{ fontSize:'16px', fontWeight:'700', color:'#fff', marginBottom:'2px' }}>{selectedGroup.group_name}</div>
                  <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.55)' }}>
                    {[selectedGroup.section, selectedGroup.batch].filter(Boolean).join(' · ') || 'No batch/section'}
                  </div>
                </div>
                <button onClick={() => setSelectedGroup(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:'28px', height:'28px', borderRadius:'6px', cursor:'pointer', fontSize:'14px' }}>✕</button>
              </div>
            </div>

            <div style={{ padding:'14px 20px', borderBottom:'1px solid #f8fafc' }}>
              <div style={{ fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'8px' }}>Adviser</div>
              {user?.role === 'instructor' ? (
                <select value={selectedGroup.adviser_id || ''} onChange={e => { updateAdviser(selectedGroup.id, e.target.value); setSelectedGroup({...selectedGroup, adviser_id: e.target.value}) }} style={inputStyle}>
                  <option value="">No adviser assigned</option>
                  {advisers.map(a => <option key={a.id} value={a.id}>{a.name} — {a.groups_count || 0} group{a.groups_count === 1 ? '' : 's'}</option>)}
                </select>
              ) : (
                <div style={{ fontSize:'13px', color:'#0a1f44', fontWeight:'500' }}>{selectedGroup.adviser?.name || 'Not assigned'}</div>
              )}
            </div>

            <div style={{ padding:'14px 20px', borderBottom:'1px solid #f8fafc' }}>
              <div style={{ fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'10px' }}>Members ({selectedGroup.members?.length || 0})</div>
              {selectedGroup.members?.map(m => (
                <div key={m.id} style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                  <div style={{ width:'34px', height:'34px', borderRadius:'50%', background:'#dbeafe', color:'#1d4ed8', fontSize:'11px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700', flexShrink:0 }}>
                    {m.user?.name?.split(' ').map(x=>x[0]).join('').slice(0,2)}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'13px', fontWeight:'600', color:'#0a1f44' }}>{m.user?.name}</div>
                    <div style={{ fontSize:'11px', color:'#94a3b8' }}>{m.user?.student_id || m.user?.email}</div>
                  </div>
                  <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', fontWeight:'600', background: m.is_leader?'#ede9fe':'#f8fafc', color: m.is_leader?'#6d28d9':'#64748b' }}>
                    {m.is_leader ? '★ Leader' : 'Member'}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ padding:'14px 20px', borderBottom:'1px solid #f8fafc' }}>
              <div style={{ fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'8px' }}>Projects</div>
              {selectedGroup.projects?.length > 0 ? selectedGroup.projects.map(p => (
                <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #f8fafc' }}>
                  <div style={{ fontSize:'13px', color:'#0a1f44' }}>{p.title}</div>
                  <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', fontWeight:'600', background: p.title_status==='approved'?'#d1fae5':p.title_status==='rejected'?'#fee2e2':'#fef3c7', color: p.title_status==='approved'?'#065f46':p.title_status==='rejected'?'#9f1239':'#92400e' }}>{p.title_status}</span>
                </div>
              )) : <div style={{ fontSize:'13px', color:'#94a3b8' }}>No projects submitted yet.</div>}
            </div>

            {user?.role === 'instructor' && (
              <div style={{ padding:'16px 20px' }}>
                <button onClick={() => deleteGroup(selectedGroup.id)} style={{ width:'100%', padding:'9px', borderRadius:'8px', border:'1.5px solid #fecaca', color:'#dc2626', background:'#fff', fontSize:'13px', cursor:'pointer', fontWeight:'600' }}>
                  Delete Group
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44' }}>
          {user?.role === 'instructor' ? 'Manage Groups' : 'My Groups'}
        </div>
        {user?.role === 'instructor' && (
          <button onClick={() => setShowForm(!showForm)} style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', border:'none', borderRadius:'8px', padding:'9px 16px', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>
            {showForm ? 'Cancel' : '+ Create Group'}
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && user?.role === 'instructor' && (
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'20px', marginBottom:'16px' }}>
          <div style={{ fontSize:'14px', fontWeight:'700', color:'#0a1f44', marginBottom:'14px' }}>Create New Group</div>
          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            <div className="dg-grid-2" style={{ display:'grid', gap:'12px' }}>
              <div>
                <label style={labelStyle}>Group Name</label>
                <input value={form.group_name} onChange={e => setForm({...form, group_name:e.target.value})} style={inputStyle} placeholder="e.g. Group Alpha" required />
              </div>
              <div>
                <label style={labelStyle}>Batch / Academic Year</label>
                <input value={form.batch} onChange={e => setForm({...form, batch:e.target.value})} style={inputStyle} placeholder="e.g. 2025–2026" />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Course / Section <span style={{ color:'#cbd5e1', textTransform:'none', fontWeight:'400' }}>(optional)</span></label>
              <input value={form.section} onChange={e => setForm({...form, section:e.target.value})} style={inputStyle} placeholder="e.g. BSIT 3A" />
            </div>
            <div>
              <label style={labelStyle}>Assign Adviser</label>
              <select value={form.adviser_id} onChange={e => setForm({...form, adviser_id:e.target.value})} style={inputStyle}>
                <option value="">Select adviser (can be assigned later)...</option>
                {advisers.map(a => <option key={a.id} value={a.id}>{a.name} — {a.groups_count || 0} group{a.groups_count === 1 ? '' : 's'}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Select Members <span style={{ color:'#cbd5e1', textTransform:'none', fontWeight:'400' }}>(check 3–4 students)</span></label>
              <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} style={{ ...inputStyle, marginBottom:'6px' }} placeholder="Search by name, ID, or email..." />
              <div style={{ border:'1.5px solid #e2e8f0', borderRadius:'8px', overflow:'hidden', maxHeight:'180px', overflowY:'auto' }}>
                {students.length === 0 ? (
                  <div style={{ padding:'12px', fontSize:'13px', color:'#94a3b8' }}>No students found.</div>
                ) : students.filter(s => {
                    const q = memberSearch.toLowerCase()
                    return !q || s.name?.toLowerCase().includes(q) || s.student_id?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q)
                  }).map(s => (
                    <label key={s.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid #f8fafc', opacity: groupedStudents.includes(String(s.id)) ? 0.6 : 1, background: form.members.includes(String(s.id)) ? '#eff6ff' : 'transparent' }}>
                      <input type="checkbox" checked={form.members.includes(String(s.id))} onChange={() => toggleMember(s.id)} />
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                          <span style={{ fontSize:'13px', fontWeight:'500', color:'#0a1f44' }}>{s.name}</span>
                          {groupedStudents.includes(String(s.id)) && <span style={{ fontSize:'10px', background:'#fef3c7', color:'#92400e', padding:'1px 7px', borderRadius:'20px', fontWeight:'600' }}>Already has a group</span>}
                        </div>
                        <div style={{ fontSize:'11px', color:'#94a3b8' }}>{s.student_id || s.email}</div>
                      </div>
                    </label>
                  ))}
              </div>
              <div style={{ fontSize:'11px', color:'#94a3b8', marginTop:'4px' }}>{form.members.length} selected</div>
            </div>
            {form.members.length > 0 && (
              <div>
                <label style={labelStyle}>Select Group Leader</label>
                <select value={form.leader_id} onChange={e => setForm({...form, leader_id:e.target.value})} style={inputStyle} required>
                  <option value="">Choose leader from selected members...</option>
                  {students.filter(s => form.members.includes(String(s.id))).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <button type="submit" disabled={saving} style={{ padding:'10px', borderRadius:'8px', border:'none', background: saving?'#cbd5e1':'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', fontSize:'13px', fontWeight:'600', cursor: saving?'not-allowed':'pointer' }}>
              {saving ? 'Creating...' : 'Create Group'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'13px' }}>Loading groups...</div>
      ) : groups.length === 0 ? (
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'48px', textAlign:'center', color:'#94a3b8', fontSize:'13px' }}>
          {user?.role === 'instructor' ? 'No groups yet. Click "+ Create Group" to start.' : 'You are not assigned to any group yet.'}
        </div>
      ) : (
        <div>
          {user?.role === 'instructor' && (
            <div style={{ display:'flex', gap:'8px', marginBottom:'14px' }}>
              <select value={filterAdviser} onChange={e => setFilterAdviser(e.target.value)} style={{ border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', outline:'none', background:'#f8fafc' }}>
                <option value="">All advisers</option>
                {advisers.map(a => <option key={a.id} value={a.id}>{a.name} — {a.groups_count || 0} group{a.groups_count === 1 ? '' : 's'}</option>)}
                <option value="none">No adviser assigned</option>
              </select>
              {filterAdviser && (
                <button onClick={() => setFilterAdviser('')} style={{ fontSize:'12px', padding:'8px 12px', border:'1.5px solid #e2e8f0', borderRadius:'8px', background:'#fff', cursor:'pointer', color:'#64748b' }}>Clear Filter</button>
              )}
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:'10px' }}>
            {groups.filter(g => {
              if (!filterAdviser) return true
              if (filterAdviser === 'none') return !g.adviser_id
              return String(g.adviser_id) === String(filterAdviser)
            }).map(g => (
              <div key={g.id} onClick={() => setSelectedGroup(g)} style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'16px 18px', cursor:'pointer', transition:'border-color 0.15s' }}
                onMouseOver={e => e.currentTarget.style.borderColor='#1d4ed8'}
                onMouseOut={e => e.currentTarget.style.borderColor='#e8ecf2'}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'10px' }}>
                  <div>
                    <div style={{ fontSize:'14px', fontWeight:'700', color:'#0a1f44', marginBottom:'6px' }}>{g.group_name}</div>
                    <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                      {g.instructor && <span style={{ fontSize:'11px', background:'#dbeafe', color:'#1e40af', padding:'2px 8px', borderRadius:'20px', fontWeight:'600' }}>📋 {g.instructor.name}</span>}
                      {g.adviser
                        ? <span style={{ fontSize:'11px', background:'#d1fae5', color:'#065f46', padding:'2px 8px', borderRadius:'20px', fontWeight:'600' }}>👨‍🏫 {g.adviser.name}</span>
                        : <span style={{ fontSize:'11px', background:'#fef3c7', color:'#92400e', padding:'2px 8px', borderRadius:'20px', fontWeight:'600' }}>No adviser yet</span>}
                      {String(g.instructor_id) === String(user.id) && <span style={{ fontSize:'11px', background:'#ede9fe', color:'#6d28d9', padding:'2px 8px', borderRadius:'20px', fontWeight:'600' }}>You created this</span>}
                      {String(g.adviser_id) === String(user.id) && <span style={{ fontSize:'11px', background:'#ccfbf1', color:'#0f766e', padding:'2px 8px', borderRadius:'20px', fontWeight:'600' }}>You are adviser</span>}
                    </div>
                    <div style={{ fontSize:'11px', color:'#94a3b8', marginTop:'4px' }}>
                      {[g.section, g.batch].filter(Boolean).join(' · ') || 'No batch/section'}
                    </div>
                  </div>
                  <span style={{ fontSize:'11px', background:'#f8fafc', color:'#64748b', padding:'4px 10px', borderRadius:'20px', fontWeight:'600', flexShrink:0 }}>{g.members?.length || 0} members</span>
                </div>
                <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                  {g.members?.map(m => (
                    <div key={m.id} style={{ display:'flex', alignItems:'center', gap:'5px', background:'#f8fafc', borderRadius:'20px', padding:'3px 8px 3px 4px' }}>
                      <div style={{ width:'20px', height:'20px', borderRadius:'50%', background:'#dbeafe', color:'#1d4ed8', fontSize:'9px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700' }}>
                        {m.user?.name?.split(' ').map(x=>x[0]).join('').slice(0,2)}
                      </div>
                      <span style={{ fontSize:'11px', color:'#475569' }}>{m.user?.name?.split(' ')[0]}</span>
                      {m.is_leader && <span style={{ fontSize:'10px', color:'#6d28d9' }}>★</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default PageGroups
