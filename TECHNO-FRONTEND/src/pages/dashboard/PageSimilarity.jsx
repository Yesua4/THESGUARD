import { useState } from 'react'
import api from '../../api/axios'

function PageSimilarity() {
  const [title, setTitle]           = useState('')
  const [abstract, setAbstract]     = useState('')
  const [objectives, setObjectives] = useState('')
  const [result, setResult]         = useState(null)
  const [loading, setLoading]       = useState(false)

  const check = async () => {
    setLoading(true)
    try {
      const res = await api.post('/similarity/check', { title, abstract, objectives })
      setResult(res.data)
    } catch { alert('Error running similarity check.') }
    finally { setLoading(false) }
  }

  const inputStyle = { border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'9px 12px', fontSize:'13px', outline:'none', background:'#f8fafc', fontFamily:'inherit', width:'100%', boxSizing:'border-box' }
  const labelStyle = { fontSize:'11px', fontWeight:'700', color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:'5px' }

  const barColor = v => v >= 60 ? '#ef4444' : v >= 30 ? '#f59e0b' : '#10b981'
  const scoreColor = v => v >= 60 ? '#dc2626' : v >= 30 ? '#d97706' : '#059669'

  return (
    <div>
      <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44', marginBottom:'16px' }}>Similarity Detection</div>
      <div className="dg-grid-2" style={{ display:'grid', gap:'14px' }}>

        {/* Input panel */}
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
          <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'14px 18px' }}>
            <div style={{ fontSize:'13px', fontWeight:'700', color:'#fff' }}>Check Proposal</div>
            <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.55)', marginTop:'2px' }}>Enter title, abstract, and objectives to check similarity</div>
          </div>
          <div style={{ padding:'18px', display:'flex', flexDirection:'column', gap:'12px' }}>
            <div>
              <label style={labelStyle}>Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder="Enter project title..." />
            </div>
            <div>
              <label style={labelStyle}>Abstract</label>
              <textarea value={abstract} onChange={e => setAbstract(e.target.value)} style={{ ...inputStyle, height:'90px', resize:'none' }} placeholder="Paste abstract..." />
            </div>
            <div>
              <label style={labelStyle}>Objectives</label>
              <textarea value={objectives} onChange={e => setObjectives(e.target.value)} style={{ ...inputStyle, height:'90px', resize:'none' }} placeholder="List objectives..." />
            </div>
            <button onClick={check} disabled={loading} style={{ padding:'11px', borderRadius:'8px', border:'none', background: loading?'#cbd5e1':'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', fontSize:'13px', fontWeight:'700', cursor:loading?'not-allowed':'pointer' }}>
              {loading ? 'Checking...' : 'Run Similarity Check'}
            </button>

            {result && (
              <div style={{ background:'#f8fafc', borderRadius:'10px', padding:'14px', border:'1px solid #e8ecf2' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px' }}>
                  <div style={{ fontSize:'28px', fontWeight:'800', color:scoreColor(result.overall_score) }}>{result.overall_score}%</div>
                  <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'700', background: result.overall_score>=60?'#fee2e2':result.overall_score>=30?'#fef3c7':'#d1fae5', color: result.overall_score>=60?'#9f1239':result.overall_score>=30?'#92400e':'#065f46' }}>
                    {result.overall_score>=60?'High similarity':result.overall_score>=30?'Moderate':'Low similarity'}
                  </span>
                </div>
                {[['Title', result.title_score], ['Abstract', result.abstract_score], ['Objectives', result.objectives_score]].map(([l, v]) => (
                  <div key={l} style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'7px' }}>
                    <span style={{ fontSize:'11px', color:'#94a3b8', width:'70px', flexShrink:0, fontWeight:'600' }}>{l}</span>
                    <div style={{ flex:1, height:'8px', background:'#e2e8f0', borderRadius:'8px', overflow:'hidden' }}>
                      <div style={{ height:'100%', borderRadius:'8px', background:barColor(v), width:`${v}%` }} />
                    </div>
                    <span style={{ fontSize:'12px', width:'32px', textAlign:'right', flexShrink:0, fontWeight:'700', color:scoreColor(v) }}>{v}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Info panel */}
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
          <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #f1f5f9' }}>
              <div style={{ fontSize:'13px', fontWeight:'700', color:'#0a1f44' }}>Similarity Thresholds</div>
            </div>
            <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:'8px' }}>
              {[
                ['0 – 29%', 'Low — acceptable', '#d1fae5', '#065f46', '#059669'],
                ['30 – 59%', 'Moderate — review carefully', '#fef3c7', '#92400e', '#d97706'],
                ['60% +', 'High — flagged for review', '#fee2e2', '#9f1239', '#dc2626'],
              ].map(([range, label, bg, color, dot]) => (
                <div key={range} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 14px', background:bg, borderRadius:'10px' }}>
                  <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:dot, flexShrink:0 }} />
                  <div>
                    <div style={{ fontSize:'13px', fontWeight:'700', color }}>{range}</div>
                    <div style={{ fontSize:'11px', color, opacity:0.8 }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'16px 18px' }}>
            <div style={{ fontSize:'13px', fontWeight:'700', color:'#0a1f44', marginBottom:'8px' }}>How It Works</div>
            {[
              ['📝', 'Title check', 'Compares your title against all archived and active projects.'],
              ['📄', 'Abstract check', 'Analyzes sentence structure and keywords in the abstract.'],
              ['🎯', 'Objectives check', 'Matches the objectives against existing project goals.'],
            ].map(([icon, label, desc]) => (
              <div key={label} style={{ display:'flex', gap:'10px', marginBottom:'10px' }}>
                <div style={{ fontSize:'16px', flexShrink:0 }}>{icon}</div>
                <div>
                  <div style={{ fontSize:'12px', fontWeight:'700', color:'#0a1f44' }}>{label}</div>
                  <div style={{ fontSize:'11px', color:'#94a3b8', lineHeight:'1.5' }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PageSimilarity
