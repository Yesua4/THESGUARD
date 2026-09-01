import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import api from '../../api/axios'
import GroupAwareProposalForm from './GroupAwareProposalForm'
import ProjectTasks from './ProjectTasks'
import { similarityScoreColor, similarityBadgeStyle } from '../../utils/similarityColors'

function PageProjects() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [projects, setProjects]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [showForm, setShowForm]         = useState(false)
  const [users, setUsers]               = useState([])
  const [selectedProject, setSelected] = useState(null)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [saving, setSaving]             = useState(false)
  const [lastResult, setLast]           = useState(null)
  const [editingProject, setEditingProject] = useState(null)
  const [editForm, setEditForm] = useState({ title:'', abstract:'', objectives:'', keywords:'', batch:'', github_url:'' })

  const load = () => {
    setLoading(true)
    api.get('/projects').then(res => setProjects(res.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load(); api.get('/users').then(res => setUsers(res.data)) }, [])

  const submit = async (e, childForm) => {
    e.preventDefault(); setSaving(true); setLast(null)
    try {
      const payload = childForm ? { ...childForm, members: [user.id] } : { members: [user.id] }
      const res = await api.post('/projects', payload)
      setLast(res.data); setShowForm(false); load()
    } catch { showToast('Error saving project.') }
    finally { setSaving(false) }
  }

  const updateStatus = async (id, status) => {
    try { await api.put(`/projects/${id}`, { status }); load(); if (selectedProject?.id === id) setSelected(p => ({ ...p, status })) }
    catch { showToast('Error updating status.') }
  }

  const chooseFinal = async (id) => {
    if (!confirm('Choose this as your final title? Any other approved titles from your group will be archived.')) return
    try { await api.post(`/projects/${id}/choose-final`); load(); setSelected(null) }
    catch (err) { showToast(err.response?.data?.message || 'Error choosing final title.') }
  }

  const isProjectLeader = p => p.members?.some(m => m.user_id === user.id && m.is_leader)

  const deleteProjectAdmin = async (id) => {
    if (!confirm('Permanently delete this project?')) return
    try { await api.delete(`/projects/${id}`); setSelected(null); load() }
    catch { showToast('Error deleting project.') }
  }

  const openProject = async id => {
    try { const res = await api.get(`/projects/${id}`); setSelected(res.data) }
    catch { showToast('Error loading project.') }
  }

  const startEditProject = (p) => {
    setEditingProject(p)
    setEditForm({ title: p.title||'', abstract: p.abstract||'', objectives: p.objectives||'', keywords: p.keywords||'', batch: p.batch||'', github_url: p.github_url||'' })
  }

  const deleteProject = async (id) => {
    if (!confirm('Withdraw this proposal?')) return
    try { await api.delete(`/projects/${id}`); load() }
    catch { showToast('Error deleting proposal.') }
  }

  const saveEditProject = async (e) => {
    e.preventDefault()
    try { await api.put(`/projects/${editingProject.id}`, editForm); setEditingProject(null); load() }
    catch { showToast('Error updating proposal.') }
  }

  const scoreBadge = similarityBadgeStyle

  const statusBadge = s => ({
    flagged:     { background: '#fee2e2', color: '#9f1239' },
    approved:    { background: '#d1fae5', color: '#065f46' },
    for_defense: { background: '#ede9fe', color: '#4c1d95' },
    archived:    { background: '#f1f5f9', color: '#475569' },
  }[s] || { background: '#dbeafe', color: '#1e40af' })

  const titleBadge = s =>
    s === 'approved' ? { background: '#d1fae5', color: '#065f46' } :
    s === 'rejected' ? { background: '#fee2e2', color: '#9f1239' } :
    { background: '#fef3c7', color: '#92400e' }

  const pageTitle = { admin:'All Projects', instructor:'All Projects', adviser:'Assigned Projects', student:'My Project', panelist:'For Review' }
  const filteredProjects = projects.filter(p => {
    const q = search.toLowerCase()
    return (!q || p.title?.toLowerCase().includes(q) || p.keywords?.toLowerCase().includes(q)) &&
           (!statusFilter || p.status === statusFilter)
  })

  const inputStyle = { border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', outline: 'none', background: '#f8fafc', fontFamily: 'inherit' }
  const panelLabelStyle = { fontSize: '10px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }

  return (
    <div>
      {/* Edit modal */}
      {editingProject && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,31,68,0.4)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:'min(540px, 92vw)', maxHeight:'90vh', overflowY:'auto', background:'#fff', borderRadius:'16px', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'18px 20px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'14px', fontWeight:'700', color:'#0a1f44' }}>Edit Proposal</div>
                <div style={{ fontSize:'11px', color:'#94a3b8', marginTop:'2px' }}>Editable while title is pending approval.</div>
              </div>
              <button onClick={() => setEditingProject(null)} style={{ background:'none', border:'none', fontSize:'18px', color:'#94a3b8', cursor:'pointer' }}>✕</button>
            </div>
            <form onSubmit={saveEditProject} style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'12px' }}>
              <div>
                <label style={{ ...panelLabelStyle }}>Project Title</label>
                <input value={editForm.title} onChange={e => setEditForm({...editForm, title:e.target.value})} required style={{ ...inputStyle, width:'100%', boxSizing:'border-box' }} />
              </div>
              <div className="dg-grid-2" style={{ display:'grid', gap:'12px' }}>
                <div>
                  <label style={panelLabelStyle}>Batch</label>
                  <input value={editForm.batch} onChange={e => setEditForm({...editForm, batch:e.target.value})} style={{ ...inputStyle, width:'100%', boxSizing:'border-box' }} />
                </div>
                <div>
                  <label style={panelLabelStyle}>Keywords</label>
                  <input value={editForm.keywords} onChange={e => setEditForm({...editForm, keywords:e.target.value})} style={{ ...inputStyle, width:'100%', boxSizing:'border-box' }} />
                </div>
              </div>
              <div>
                <label style={panelLabelStyle}>GitHub Repository</label>
                <input value={editForm.github_url} onChange={e => setEditForm({...editForm, github_url:e.target.value})} placeholder="e.g. https://github.com/your-team/project-repo" style={{ ...inputStyle, width:'100%', boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={panelLabelStyle}>Abstract</label>
                <textarea value={editForm.abstract} onChange={e => setEditForm({...editForm, abstract:e.target.value})} style={{ ...inputStyle, width:'100%', boxSizing:'border-box', height:'80px', resize:'none' }} />
              </div>
              <div>
                <label style={panelLabelStyle}>Objectives</label>
                <textarea value={editForm.objectives} onChange={e => setEditForm({...editForm, objectives:e.target.value})} style={{ ...inputStyle, width:'100%', boxSizing:'border-box', height:'80px', resize:'none' }} />
              </div>
              <div style={{ display:'flex', gap:'10px', paddingTop:'4px' }}>
                <button type="submit" style={{ flex:1, padding:'10px', background:'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>Save Changes</button>
                <button type="button" onClick={() => setEditingProject(null)} style={{ flex:1, padding:'10px', background:'#f8fafc', color:'#475569', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'13px', cursor:'pointer' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selectedProject && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,31,68,0.35)', zIndex:50, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}>
          <div style={{ width:'min(480px, 96vw)', height:'100vh', background:'#fff', overflowY:'auto', boxShadow:'-8px 0 32px rgba(0,0,0,0.12)' }}>
            <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'20px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.5)', fontWeight:'600', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'4px' }}>Project Details</div>
                <div style={{ fontSize:'14px', fontWeight:'700', color:'#fff', lineHeight:'1.4', marginBottom:'8px' }}>{selectedProject.title}</div>
                <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                  <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'600', ...statusBadge(selectedProject.status) }}>{selectedProject.status}</span>
                  <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'600', ...scoreBadge(selectedProject.similarity_score) }}>Similarity: {selectedProject.similarity_score}%</span>
                  <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'600', ...titleBadge(selectedProject.title_status) }}>Title: {selectedProject.title_status}</span>
                  {selectedProject.is_final_title && (
                    <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'700', background:'#ede9fe', color:'#4c1d95' }}>🏆 Final Title</span>
                  )}
                  {selectedProject.defense_verdict && selectedProject.defense_verdict !== 'pending' && (
                    <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'700',
                      background: selectedProject.defense_verdict==='passed'?'#d1fae5':selectedProject.defense_verdict==='failed'?'#fee2e2':'#fef3c7',
                      color: selectedProject.defense_verdict==='passed'?'#065f46':selectedProject.defense_verdict==='failed'?'#9f1239':'#92400e' }}>
                      🎓 Defense: {selectedProject.defense_verdict === 'revision' ? 'Needs Revision' : selectedProject.defense_verdict}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:'28px', height:'28px', borderRadius:'6px', cursor:'pointer', fontSize:'14px', flexShrink:0 }}>✕</button>
            </div>

            {user?.role === 'student' && selectedProject.title_status === 'approved' && !selectedProject.is_final_title && isProjectLeader(selectedProject) && (
              <div style={{ margin:'16px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'10px', padding:'14px' }}>
                <div style={{ fontSize:'13px', fontWeight:'700', color:'#1e3a8a', marginBottom:'4px' }}>This title is approved but not yet chosen as final</div>
                <div style={{ fontSize:'12px', color:'#3b82f6', marginBottom:'10px' }}>Your group has more than one approved title. Choose this one to commit to it — your other approved titles will be archived, and your adviser/instructor will be notified.</div>
                <button onClick={() => chooseFinal(selectedProject.id)} style={{ padding:'8px 16px', borderRadius:'8px', border:'none', background:'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>
                  🏆 Choose as Final Title
                </button>
              </div>
            )}

            {selectedProject.title_feedback && (
              <div style={{ margin:'16px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'10px', padding:'12px' }}>
                <div style={panelLabelStyle}>Instructor Feedback</div>
                <div style={{ fontSize:'13px', color:'#92400e' }}>{selectedProject.title_feedback}</div>
              </div>
            )}

            {[
              ['Program',     selectedProject.program || '—'],
              ['Adviser',     selectedProject.adviser?.name || 'Not yet assigned'],
              ['Instructor',  selectedProject.instructor?.name || '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ padding:'14px 20px', borderBottom:'1px solid #f8fafc' }}>
                <div style={panelLabelStyle}>{label}</div>
                <div style={{ fontSize:'13px', color:'#0a1f44', fontWeight:'500' }}>{val}</div>
              </div>
            ))}

            <div style={{ padding:'14px 20px', borderBottom:'1px solid #f8fafc' }}>
              <div style={panelLabelStyle}>Group Members</div>
              {selectedProject.members?.length > 0
                ? selectedProject.members.map(m => (
                    <div key={m.id} style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
                      <div style={{ width:'30px', height:'30px', borderRadius:'50%', background:'#dbeafe', color:'#1d4ed8', fontSize:'11px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700', flexShrink:0 }}>
                        {m.user?.name?.split(' ').map(x=>x[0]).join('').slice(0,2)||'U'}
                      </div>
                      <div>
                        <div style={{ fontSize:'13px', fontWeight:'500', color:'#0a1f44' }}>{m.user?.name||'Unknown'}</div>
                        <div style={{ fontSize:'11px', color:'#94a3b8' }}>{m.is_leader?'Leader':'Member'}</div>
                      </div>
                    </div>
                  ))
                : <div style={{ fontSize:'13px', color:'#94a3b8' }}>No members.</div>}
            </div>

            <ProjectTasks project={selectedProject} user={user} canAssign={['adviser','instructor','admin'].includes(user?.role) || isProjectLeader(selectedProject)} />

            {['abstract','objectives'].map(field => (
              <div key={field} style={{ padding:'14px 20px', borderBottom:'1px solid #f8fafc' }}>
                <div style={panelLabelStyle}>{field.charAt(0).toUpperCase() + field.slice(1)}</div>
                <div style={{ fontSize:'13px', color:'#334155', lineHeight:'1.65', whiteSpace:'pre-line' }}>{selectedProject[field]||'—'}</div>
              </div>
            ))}

            {(user?.role === 'adviser' || user?.role === 'admin' || user?.role === 'instructor') && (
              <div style={{ padding:'16px 20px' }}>
                <div style={panelLabelStyle}>Actions</div>
                {user?.role === 'adviser' && (
                  <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                    {[['approved','Approve','#059669'],['for_defense','For Defense','#7c3aed'],['ongoing','Set Ongoing','#2563eb'],['flagged','Flag','#dc2626']].map(([val,label,bg]) => (
                      <button key={val} onClick={() => updateStatus(selectedProject.id, val)} style={{ fontSize:'12px', padding:'7px 14px', borderRadius:'8px', border:'none', background:bg, color:'#fff', cursor:'pointer', fontWeight:'600' }}>{label}</button>
                    ))}
                  </div>
                )}
                {(user?.role === 'admin' || user?.role === 'instructor') && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                    <div>
                      <label style={panelLabelStyle}>Change Status</label>
                      <select value={selectedProject.status} onChange={e => updateStatus(selectedProject.id, e.target.value)} style={{ ...inputStyle, width:'100%', boxSizing:'border-box' }}>
                        {['ongoing','for_defense','approved','archived','flagged'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    {user?.role === 'admin' && (
                      <button onClick={() => deleteProjectAdmin(selectedProject.id)} style={{ padding:'9px', borderRadius:'8px', border:'1.5px solid #fecaca', color:'#dc2626', background:'#fff', fontSize:'13px', cursor:'pointer', fontWeight:'600' }}>
                        Delete Project Permanently
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44' }}>{pageTitle[user?.role]||'Projects'}</div>
        {user?.role === 'student' && (
          <button onClick={() => { setShowForm(!showForm); setLast(null) }} style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', border:'none', borderRadius:'8px', padding:'9px 16px', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>
            {showForm ? 'Cancel' : '+ Submit Proposal'}
          </button>
        )}
      </div>

      {lastResult && (
        <div style={{ borderRadius:'12px', padding:'14px 16px', marginBottom:'14px', background: lastResult.status==='flagged'?'#fee2e2':'#d1fae5', border:`1px solid ${lastResult.status==='flagged'?'#fecaca':'#a7f3d0'}` }}>
          <div style={{ fontSize:'13px', fontWeight:'600', color: lastResult.status==='flagged'?'#9f1239':'#065f46', marginBottom:'4px' }}>
            {lastResult.status==='flagged' ? '🚩 Proposal flagged — high similarity detected' : '✅ Proposal submitted! Awaiting instructor title approval.'}
          </div>
          <div style={{ fontSize:'12px', color:'#64748b' }}>
            Similarity score: <span style={{ fontWeight:'700', color: similarityScoreColor(lastResult.similarity_score) }}>{lastResult.similarity_score}%</span>
          </div>
        </div>
      )}

      {user?.role === 'student' && showForm && (
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'20px', marginBottom:'16px' }}>
          <div style={{ fontSize:'14px', fontWeight:'700', color:'#0a1f44', marginBottom:'4px' }}>Submit Proposal</div>
          <div style={{ fontSize:'12px', color:'#94a3b8', marginBottom:'14px' }}>Your title will be reviewed before you can upload chapter documents.</div>
          <GroupAwareProposalForm user={user} users={users} onSubmit={submit} saving={saving} />
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'13px' }}>Loading projects...</div>
      ) : projects.length === 0 ? (
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'48px', textAlign:'center', color:'#94a3b8', fontSize:'13px' }}>
          {user?.role==='student' ? 'No proposals yet. Click "+ Submit Proposal" to start.'
           : user?.role==='adviser' ? 'No projects assigned to you yet.'
           : 'No projects yet.'}
        </div>
      ) : (
        <div>
          <div style={{ display:'flex', gap:'10px', marginBottom:'12px' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, flex:1 }} placeholder="Search by title or keywords..." />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle }}>
              <option value="">All statuses</option>
              {['ongoing','for_defense','approved','archived','flagged'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  {['Title','Batch','Title Status','Status','Similarity'].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'10px 14px', fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.08em', textTransform:'uppercase', borderBottom:'1px solid #f1f5f9' }}>{h}</th>
                  ))}
                  {user?.role === 'student' && <th style={{ padding:'10px 14px', borderBottom:'1px solid #f1f5f9' }} />}
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map(p => (
                  <tr key={p.id} style={{ borderBottom:'1px solid #f8fafc', cursor:'pointer' }} onClick={() => openProject(p.id)}
                    onMouseOver={e => e.currentTarget.style.background='#f8fafc'}
                    onMouseOut={e => e.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'12px 14px', fontWeight:'600', color:'#0a1f44' }}>
                      {p.title}
                      {p.is_final_title && <span title="Chosen as final title" style={{ marginLeft:'6px' }}>🏆</span>}
                    </td>
                    <td style={{ padding:'12px 14px', color:'#94a3b8' }}>{p.batch||'—'}</td>
                    <td style={{ padding:'12px 14px' }}><span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'600', ...titleBadge(p.title_status) }}>{p.title_status}</span></td>
                    <td style={{ padding:'12px 14px' }}><span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'600', ...statusBadge(p.status) }}>{p.status}</span></td>
                    <td style={{ padding:'12px 14px' }}><span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'600', ...scoreBadge(p.similarity_score) }}>{p.similarity_score}%</span></td>
                    {user?.role === 'student' && (
                      <td style={{ padding:'12px 14px' }} onClick={e => e.stopPropagation()}>
                        {p.title_status === 'pending' ? (
                          <div style={{ display:'flex', gap:'6px' }}>
                            <button onClick={() => startEditProject(p)} style={{ fontSize:'11px', padding:'4px 10px', borderRadius:'6px', border:'none', background:'#eff6ff', color:'#1d4ed8', cursor:'pointer', fontWeight:'600' }}>Edit</button>
                            <button onClick={() => deleteProject(p.id)} style={{ fontSize:'11px', padding:'4px 10px', borderRadius:'6px', border:'none', background:'#fee2e2', color:'#dc2626', cursor:'pointer', fontWeight:'600' }}>Delete</button>
                          </div>
                        ) : <span style={{ fontSize:'11px', color:'#cbd5e1' }}>Locked</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding:'10px 14px', fontSize:'11px', color:'#94a3b8', textAlign:'center', borderTop:'1px solid #f1f5f9' }}>Click any row to view full details</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PageProjects
