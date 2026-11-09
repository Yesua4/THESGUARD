import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/axios'
import { useSchoolActivity } from '../../hooks/useSchoolActivity'
import SimilarityBreakdown from './SimilarityBreakdown'
import { similarityBadgeStyle } from '../../utils/similarityColors'
import { useToast } from '../../context/ToastContext'
import { useProjectsChannel } from '../../hooks/useProjectChannel'

function PageTitleApproval() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving]     = useState(false)
  const [filter, setFilter]     = useState('pending')
  const [search, setSearch]     = useState('')

  const load = () => {
    setLoading(true)
    api.get('/projects').then(res => setProjects(res.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Live updates: a title edit or another reviewer's decision on any listed
  // project refreshes it without a manual reload.
  useProjectsChannel(projects.map(p => p.id), () => load())
  // Live: newly submitted proposals appear for approval right away.
  useSchoolActivity(['projects'], () => load())

  const approve = async (id) => {
    setSaving(true)
    try {
      const payload = { title_status: 'approved', title_feedback: feedback || 'Approved for title defense.' }
      if (user.role === 'instructor') payload.instructor_id = user.id
      if (user.role === 'adviser') payload.adviser_id = user.id
      await api.put(`/projects/${id}`, payload)
      setSelected(null); setFeedback(''); load()
    } catch { showToast('Error approving title.') }
    finally { setSaving(false) }
  }

  // Final title: set by faculty after the title defense (never automatic).
  const setFinal = async (p) => {
    if (!confirm(`Set "${p.title}" as this group's FINAL title?\n\nDo this after the title defense. The group's other approved titles will be archived.`)) return
    setSaving(true)
    try { await api.post(`/projects/${p.id}/choose-final`); setSelected(null); load(); showToast('Final title set.', 'success') }
    catch (err) { showToast(err.response?.data?.message || 'Could not set the final title.') }
    finally { setSaving(false) }
  }

  const reject = async (id) => {
    if (!feedback) { showToast('Please provide feedback explaining why the title is rejected.'); return }
    setSaving(true)
    try {
      const payload = { title_status: 'rejected', title_feedback: feedback }
      if (user.role === 'instructor') payload.instructor_id = user.id
      if (user.role === 'adviser') payload.adviser_id = user.id
      await api.put(`/projects/${id}`, payload)
      setSelected(null); setFeedback(''); load()
    } catch { showToast('Error rejecting title.') }
    finally { setSaving(false) }
  }

  const scoreBadge = similarityBadgeStyle
  // Search by title, group, member names, adviser, section or batch.
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const haystack = p => [
    p.title, p.group?.group_name, p.group?.section, p.batch, p.adviser?.name, p.group?.adviser?.name,
    ...(p.members || []).map(m => m.user?.name || m.name),
    ...(p.group?.members || []).map(m => m.user?.name),
  ].filter(Boolean).join(' ').toLowerCase()
  const matches = p => words.every(w => haystack(p).includes(w))
  const countFor = f => projects.filter(p => p.title_status === f && matches(p)).length
  const filtered = projects.filter(p => p.title_status === filter && matches(p))

  const panelLabelStyle = { fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'6px', display:'block' }
  const inputStyle = { border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', outline:'none', background:'#f8fafc', fontFamily:'inherit', width:'100%', boxSizing:'border-box' }

  return (
    <div>
      {selected && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,31,68,0.35)', zIndex:50, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}>
          <div style={{ width:'min(500px, 96vw)', height:'100vh', background:'#fff', overflowY:'auto', boxShadow:'-8px 0 32px rgba(0,0,0,0.12)' }}>

            {/* Panel header */}
            <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'20px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.5)', fontWeight:'700', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'4px' }}>Review Proposal</div>
                  <div style={{ fontSize:'14px', fontWeight:'700', color:'#fff', lineHeight:'1.4', marginBottom:'4px' }}>{selected.title}</div>
                  <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.55)' }}>{selected.batch || 'No batch'}</div>
                </div>
                <button onClick={() => { setSelected(null); setFeedback('') }} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:'28px', height:'28px', borderRadius:'6px', cursor:'pointer', fontSize:'14px', flexShrink:0 }}>✕</button>
              </div>
            </div>

            {/* Similarity */}
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #f8fafc' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                <span style={panelLabelStyle}>Similarity Score</span>
                <button
                  onClick={async () => {
                    try { await api.post(`/projects/${selected.id}/recheck-similarity`); load() }
                    catch { showToast('Error rechecking similarity.') }
                  }}
                  style={{ fontSize:'11px', color:'#1d4ed8', border:'1.5px solid #bfdbfe', background:'#eff6ff', padding:'4px 10px', borderRadius:'6px', cursor:'pointer', fontWeight:'600' }}>
                  ↻ Recheck
                </button>
              </div>
              <SimilarityBreakdown projectId={selected.id} overallScore={selected.similarity_score} />
            </div>

            {/* Members */}
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #f8fafc' }}>
              <div style={panelLabelStyle}>Group Members</div>
              {selected.members?.map(m => (
                <div key={m.id} style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
                  <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:'#dbeafe', color:'#1d4ed8', fontSize:'10px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700', flexShrink:0 }}>
                    {m.user?.name?.split(' ').map(x=>x[0]).join('').slice(0,2)}
                  </div>
                  <span style={{ fontSize:'13px', color:'#0a1f44', fontWeight:'500' }}>{m.user?.name}</span>
                  {m.is_leader && <span style={{ fontSize:'10px', background:'#ede9fe', color:'#6d28d9', padding:'2px 8px', borderRadius:'20px', fontWeight:'700' }}>Leader</span>}
                </div>
              ))}
            </div>

            {/* Project description (a proposal has no abstract yet) */}
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #f8fafc' }}>
              <div style={panelLabelStyle}>{selected.abstract_is_final ? 'Final Abstract' : 'Project Description'}</div>
              <div style={{ fontSize:'13px', color:'#334155', lineHeight:'1.7', whiteSpace:'pre-line' }}>{selected.abstract || '—'}</div>
            </div>

            {/* Objectives */}
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #f8fafc' }}>
              <div style={panelLabelStyle}>Objectives</div>
              <div style={{ fontSize:'13px', color:'#334155', lineHeight:'1.7', whiteSpace:'pre-line' }}>{selected.objectives || '—'}</div>
            </div>

            {/* Actions */}
            {selected.title_status === 'pending' && (
              <>
                <div style={{ padding:'14px 20px', borderBottom:'1px solid #f8fafc' }}>
                  <div style={panelLabelStyle}>Feedback / Remarks</div>
                  <textarea
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    style={{ ...inputStyle, height:'90px', resize:'none' }}
                    placeholder="Write remarks to the student. Required if rejecting."
                  />
                </div>
                <div style={{ padding:'16px 20px', display:'flex', gap:'10px' }}>
                  <button onClick={() => approve(selected.id)} disabled={saving} style={{ flex:1, padding:'11px', borderRadius:'8px', border:'none', background:'linear-gradient(135deg,#059669,#047857)', color:'#fff', fontSize:'13px', fontWeight:'700', cursor:saving?'not-allowed':'pointer' }}>
                    {saving ? 'Saving...' : '✓ Approve for Title Defense'}
                  </button>
                  <button onClick={() => reject(selected.id)} disabled={saving} style={{ flex:1, padding:'11px', borderRadius:'8px', border:'none', background:'linear-gradient(135deg,#dc2626,#b91c1c)', color:'#fff', fontSize:'13px', fontWeight:'700', cursor:saving?'not-allowed':'pointer' }}>
                    ✕ Reject Title
                  </button>
                </div>
              </>
            )}
            {selected.title_status !== 'pending' && (
              <div style={{ padding:'14px 20px' }}>
                <div style={panelLabelStyle}>Instructor/Adviser Feedback</div>
                <div style={{ fontSize:'13px', color:'#334155' }}>{selected.title_feedback || '—'}</div>
              </div>
            )}
            {/* After the title defense, faculty record the group's final title. */}
            {selected.title_status === 'approved' && !selected.is_final_title && (
              <div style={{ margin:'0 20px 16px', background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:'10px', padding:'14px' }}>
                <div style={{ fontSize:'13px', fontWeight:'700', color:'#4c1d95', marginBottom:'4px' }}>After the title defense</div>
                <div style={{ fontSize:'12px', color:'#5b21b6', marginBottom:'10px' }}>
                  When the panel has decided, set the group's final title. Their other approved titles will be archived and the group will be notified.
                </div>
                <button onClick={() => setFinal(selected)} disabled={saving} style={{ padding:'8px 16px', borderRadius:'8px', border:'none', background:'linear-gradient(135deg,#4c1d95,#6d28d9)', color:'#fff', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>
                  🏆 Set as final title
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px', gap:'10px', flexWrap:'wrap' }}>
        <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44' }}>Title Approval</div>
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
          {['pending','approved','rejected'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              fontSize:'12px', padding:'7px 14px', borderRadius:'8px', border:'none',
              background: filter===f ? 'linear-gradient(135deg,#0a1f44,#1040a0)' : '#fff',
              color: filter===f ? '#fff' : '#64748b',
              cursor:'pointer', fontWeight:'600',
              boxShadow: filter===f ? 'none' : 'inset 0 0 0 1.5px #e2e8f0',
              textTransform:'capitalize',
            }}>{f} ({countFor(f)})</button>
          ))}
        </div>
      </div>

      <div style={{ position:'relative', marginBottom:'14px' }}>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search proposals"
          placeholder="Search by title, group, member, adviser, section, or batch..."
          style={{ ...inputStyle, background:'#fff', padding:'10px 14px 10px 36px', fontSize:'13px' }} />
        <span aria-hidden="true" style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8', fontSize:'14px' }}>🔍</span>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'13px' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'48px', textAlign:'center', color:'#94a3b8', fontSize:'13px' }}>
          {words.length ? <>No {filter} proposals match "<strong>{search.trim()}</strong>".{' '}
            <button type="button" onClick={() => setSearch('')} style={{ background:'none', border:'none', color:'#1d4ed8', cursor:'pointer', fontWeight:600, fontSize:'13px' }}>Clear search</button></>
            : <>No {filter} proposals found.</>}
        </div>
      ) : (
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['Title','Batch','Members','Similarity','Adviser'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'10px 14px', fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.08em', textTransform:'uppercase', borderBottom:'1px solid #f1f5f9' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} onClick={() => setSelected(p)} style={{ borderBottom:'1px solid #f8fafc', cursor:'pointer' }}
                  onMouseOver={e => e.currentTarget.style.background='#f8fafc'}
                  onMouseOut={e => e.currentTarget.style.background='transparent'}>
                  <td style={{ padding:'12px 14px', fontWeight:'600', color:'#0a1f44' }}>
                    {p.title}
                    {p.is_final_title && <span title="Final title (set by faculty after the title defense)" style={{ marginLeft:'6px' }}>🏆</span>}
                    {p.group?.group_name && <div style={{ fontSize:'11px', color:'#94a3b8', fontWeight:500, marginTop:'2px' }}>{p.group.group_name}{p.group.section ? ` · ${p.group.section}` : ''}</div>}
                  </td>
                  <td style={{ padding:'12px 14px', color:'#94a3b8' }}>{p.batch || '—'}</td>
                  <td style={{ padding:'12px 14px', color:'#64748b' }}>{p.members?.length || 0} member(s)</td>
                  <td style={{ padding:'12px 14px' }}>
                    <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'700', ...scoreBadge(p.similarity_score) }}>{p.similarity_score}%</span>
                  </td>
                  <td style={{ padding:'12px 14px', color:'#64748b' }}>{p.adviser?.name || <span style={{ color:'#cbd5e1' }}>Not assigned</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding:'10px 14px', fontSize:'11px', color:'#94a3b8', textAlign:'center', borderTop:'1px solid #f1f5f9' }}>Click any row to review</div>
        </div>
      )}
    </div>
  )
}

export default PageTitleApproval
