import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/axios'

function PageEvaluate() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)
  const [evaluations, setEvaluations] = useState([])
  const [saving, setSaving]     = useState(false)
  const [success, setSuccess]   = useState('')
  const [form, setForm] = useState({
    presentation_score:'', technical_score:'', documentation_score:'', qa_score:'', remarks:'', recommendation:'revision'
  })

  useEffect(() => {
    api.get('/projects').then(res => {
      setProjects(res.data.filter(p => p.status === 'for_defense' || p.status === 'approved'))
    }).finally(() => setLoading(false))
  }, [])

  const openProject = async p => {
    setSelected(p); setSuccess('')
    const res = await api.get(`/evaluations/project/${p.id}`)
    setEvaluations(res.data)
    const mine = res.data.find(e => String(e.panelist_id) === String(user.id))
    setForm(mine ? {
      presentation_score: mine.presentation_score, technical_score: mine.technical_score,
      documentation_score: mine.documentation_score, qa_score: mine.qa_score,
      remarks: mine.remarks || '', recommendation: mine.recommendation
    } : { presentation_score:'', technical_score:'', documentation_score:'', qa_score:'', remarks:'', recommendation:'revision' })
  }

  const submit = async e => {
    e.preventDefault(); setSaving(true)
    try {
      await api.post('/evaluations', { ...form, project_id: selected.id })
      setSuccess('Evaluation submitted successfully!')
      const res = await api.get(`/evaluations/project/${selected.id}`)
      setEvaluations(res.data)
    } catch { alert('Error submitting evaluation.') }
    finally { setSaving(false) }
  }

  const overall = () => {
    const vals = [parseFloat(form.presentation_score), parseFloat(form.technical_score), parseFloat(form.documentation_score), parseFloat(form.qa_score)]
    if (vals.some(isNaN)) return '—'
    return (vals.reduce((a,b) => a+b, 0) / 4).toFixed(2)
  }

  const scoreColor = s => s >= 90 ? '#059669' : s >= 75 ? '#1d4ed8' : s >= 60 ? '#d97706' : '#dc2626'
  const recStyle   = r => r==='passed' ? { background:'#d1fae5',color:'#065f46' } : r==='failed' ? { background:'#fee2e2',color:'#9f1239' } : { background:'#fef3c7',color:'#92400e' }
  const verdictLabel = { passed:'✓ Passed', failed:'✗ Failed', revision:'↩ Needs Revision', pending:'Awaiting all panelists' }
  const verdictStyle = v => v==='passed' ? { background:'#d1fae5',color:'#065f46' } : v==='failed' ? { background:'#fee2e2',color:'#9f1239' } : v==='revision' ? { background:'#fef3c7',color:'#92400e' } : { background:'#f1f5f9',color:'#64748b' }

  return (
    <div>
      {selected && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,31,68,0.35)', zIndex:50, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}>
          <div style={{ width:'min(520px, 96vw)', height:'100vh', background:'#fff', overflowY:'auto', boxShadow:'-8px 0 32px rgba(0,0,0,0.12)' }}>

            <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'20px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.5)', fontWeight:'700', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'4px' }}>Evaluate Project</div>
                  <div style={{ fontSize:'14px', fontWeight:'700', color:'#fff', lineHeight:'1.4' }}>{selected.title}</div>
                  <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.55)', marginTop:'2px' }}>{selected.batch || 'No batch'}</div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:'28px', height:'28px', borderRadius:'6px', cursor:'pointer', fontSize:'14px', flexShrink:0 }}>✕</button>
              </div>
              <div style={{ marginTop:'10px' }}>
                <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'700', ...verdictStyle(selected.defense_verdict) }}>
                  🎓 Defense: {verdictLabel[selected.defense_verdict] || verdictLabel.pending}
                </span>
              </div>
            </div>

            {/* Members */}
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #f8fafc' }}>
              <div style={{ fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'8px' }}>Group Members</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                {selected.members?.map(m => (
                  <div key={m.id} style={{ display:'flex', alignItems:'center', gap:'6px', background:'#f8fafc', borderRadius:'20px', padding:'4px 10px 4px 4px' }}>
                    <div style={{ width:'22px', height:'22px', borderRadius:'50%', background:'#dbeafe', color:'#1d4ed8', fontSize:'9px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700' }}>
                      {m.user?.name?.split(' ').map(x=>x[0]).join('').slice(0,2)}
                    </div>
                    <span style={{ fontSize:'12px', color:'#334155', fontWeight:'500' }}>{m.user?.name}</span>
                    {m.is_leader && <span style={{ fontSize:'10px', color:'#6d28d9' }}>★</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Scoring */}
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #f8fafc' }}>
              <div style={{ fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'12px' }}>Scoring (0–100 per category)</div>
              {success && <div style={{ background:'#d1fae5', border:'1px solid #a7f3d0', borderRadius:'8px', padding:'10px 14px', marginBottom:'12px', fontSize:'13px', color:'#065f46', fontWeight:'600' }}>✅ {success}</div>}

              <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                {[
                  ['presentation_score', '🎤 Presentation & Delivery'],
                  ['technical_score',    '⚙️ Technical Competency'],
                  ['documentation_score','📄 Documentation Quality'],
                  ['qa_score',          '❓ Q&A / Defense'],
                ].map(([field, label]) => (
                  <div key={field}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
                      <label style={{ fontSize:'12px', color:'#334155', fontWeight:'500' }}>{label}</label>
                      <span style={{ fontSize:'14px', fontWeight:'800', color:scoreColor(parseFloat(form[field])) }}>{form[field] || '—'}</span>
                    </div>
                    <input type="range" min="0" max="100" step="1" value={form[field] || 0}
                      onChange={e => setForm({...form, [field]:e.target.value})}
                      style={{ width:'100%', accentColor:'#1d4ed8' }} />
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:'10px', color:'#cbd5e1', marginTop:'2px' }}>
                      <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                    </div>
                  </div>
                ))}

                {/* Overall score */}
                <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', borderRadius:'12px', padding:'16px', textAlign:'center' }}>
                  <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.6)', fontWeight:'600', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:'4px' }}>Overall Score (Average)</div>
                  <div style={{ fontSize:'36px', fontWeight:'800', color: isNaN(parseFloat(overall())) ? 'rgba(255,255,255,0.4)' : '#f5c300' }}>
                    {overall()}
                  </div>
                </div>

                {/* Recommendation */}
                <div>
                  <div style={{ fontSize:'11px', fontWeight:'700', color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:'8px' }}>Recommendation</div>
                  <div style={{ display:'flex', gap:'8px' }}>
                    {[['passed','✓ Passed','#059669'],['revision','↩ For Revision','#d97706'],['failed','✗ Failed','#dc2626']].map(([val, label, color]) => (
                      <button key={val} type="button" onClick={() => setForm({...form, recommendation:val})} style={{ flex:1, padding:'9px', borderRadius:'8px', border:'none', fontSize:'12px', fontWeight:'700', cursor:'pointer', background: form.recommendation===val ? color : '#f8fafc', color: form.recommendation===val ? '#fff' : '#64748b', transition:'all 0.15s' }}>{label}</button>
                    ))}
                  </div>
                </div>

                {/* Remarks */}
                <div>
                  <div style={{ fontSize:'11px', fontWeight:'700', color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:'6px' }}>Remarks / Comments</div>
                  <textarea value={form.remarks} onChange={e => setForm({...form, remarks:e.target.value})}
                    style={{ border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'9px 12px', fontSize:'13px', outline:'none', background:'#f8fafc', fontFamily:'inherit', width:'100%', boxSizing:'border-box', height:'80px', resize:'none' }}
                    placeholder="Write your overall feedback and remarks..." />
                </div>

                <button type="submit" disabled={saving} style={{ padding:'11px', borderRadius:'8px', border:'none', background:saving?'#cbd5e1':'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', fontSize:'13px', fontWeight:'700', cursor:saving?'not-allowed':'pointer' }}>
                  {saving ? 'Submitting...' : 'Submit Evaluation'}
                </button>
              </form>
            </div>

            {/* Other evaluations */}
            {evaluations.length > 0 && (
              <div style={{ padding:'14px 20px' }}>
                <div style={{ fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'10px' }}>All Panelist Evaluations ({evaluations.length})</div>
                {evaluations.map(e => (
                  <div key={e.id} style={{ background:'#f8fafc', borderRadius:'10px', padding:'12px 14px', marginBottom:'8px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'8px' }}>
                      <div style={{ fontSize:'13px', fontWeight:'700', color:'#0a1f44' }}>{e.panelist?.name}</div>
                      <div style={{ display:'flex', gap:'6px' }}>
                        <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', fontWeight:'700', ...recStyle(e.recommendation) }}>{e.recommendation}</span>
                        <span style={{ fontSize:'12px', fontWeight:'800', color:scoreColor(e.overall_score) }}>{e.overall_score}</span>
                      </div>
                    </div>
                    <div className="dg-grid-2" style={{ display:'grid', gap:'4px', fontSize:'12px', color:'#64748b', marginBottom:'6px' }}>
                      <span>Presentation: {e.presentation_score}</span>
                      <span>Technical: {e.technical_score}</span>
                      <span>Documentation: {e.documentation_score}</span>
                      <span>Q&A: {e.qa_score}</span>
                    </div>
                    {e.remarks && <div style={{ fontSize:'12px', color:'#64748b', fontStyle:'italic' }}>"{e.remarks}"</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44', marginBottom:'16px' }}>Evaluate Projects</div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'13px' }}>Loading...</div>
      ) : projects.length === 0 ? (
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:'28px', marginBottom:'8px' }}>📋</div>
          <div style={{ fontSize:'13px', color:'#94a3b8' }}>No projects ready for evaluation yet. Projects must be set to "For Defense" or "Approved" first.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {projects.map(p => (
            <div key={p.id} onClick={() => openProject(p)} style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'16px 18px', cursor:'pointer', transition:'border-color 0.15s' }}
              onMouseOver={e => e.currentTarget.style.borderColor='#1d4ed8'}
              onMouseOut={e => e.currentTarget.style.borderColor='#e8ecf2'}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'8px' }}>
                <div>
                  <div style={{ fontSize:'14px', fontWeight:'700', color:'#0a1f44', marginBottom:'2px' }}>{p.title}</div>
                  <div style={{ fontSize:'11px', color:'#94a3b8' }}>{p.batch || 'No batch'} · {p.adviser?.name || 'No adviser'}</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'4px' }}>
                  <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'700', background: p.status==='for_defense'?'#ede9fe':'#d1fae5', color: p.status==='for_defense'?'#6d28d9':'#065f46' }}>{p.status}</span>
                  {p.defense_verdict && p.defense_verdict !== 'pending' && (
                    <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'700', ...verdictStyle(p.defense_verdict) }}>{verdictLabel[p.defense_verdict]}</span>
                  )}
                </div>
              </div>
              <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                {p.members?.map(m => (
                  <span key={m.id} style={{ fontSize:'11px', background:'#f8fafc', color:'#64748b', padding:'2px 8px', borderRadius:'20px', fontWeight:'500' }}>
                    {m.user?.name?.split(' ')[0]} {m.is_leader ? '★' : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default PageEvaluate
