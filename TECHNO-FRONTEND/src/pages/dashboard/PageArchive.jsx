import { useState, useEffect } from 'react'
import api from '../../api/axios'

function PageArchive() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]         = useState('')
  const [yearFilter, setYear]       = useState('')
  const [programFilter, setProgram] = useState('')
  const [adviserFilter, setAdviser] = useState('')

  useEffect(() => {
    api.get('/projects').then(res => {
      setProjects(res.data.filter(p => p.status === 'archived'))
    }).finally(() => setLoading(false))
  }, [])

  const years     = [...new Set(projects.map(p => p.batch).filter(Boolean))]
  const programs  = [...new Set(projects.map(p => p.program).filter(Boolean))]
  const advisers  = [...new Set(projects.map(p => p.adviser?.name).filter(Boolean))]
  const filtered  = projects.filter(p => {
    const q = search.toLowerCase()
    return (!q || p.title?.toLowerCase().includes(q) || p.keywords?.toLowerCase().includes(q)) &&
           (!yearFilter || p.batch === yearFilter) &&
           (!programFilter || p.program === programFilter) &&
           (!adviserFilter || p.adviser?.name === adviserFilter)
  })

  const inputStyle = { border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', outline:'none', background:'#f8fafc', fontFamily:'inherit' }

  return (
    <div>
      {/* Banner */}
      <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', borderRadius:'14px', padding:'20px 24px', marginBottom:'16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.5)', fontWeight:'700', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'4px' }}>Digital Archive</div>
          <div style={{ fontSize:'18px', fontWeight:'700', color:'#fff', marginBottom:'2px' }}>Archived Capstone Projects</div>
          <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.55)' }}>{projects.length} project{projects.length !== 1 ? 's' : ''} archived</div>
        </div>
        <div style={{ fontSize:'36px' }}>🗄️</div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:'10px', marginBottom:'12px' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, flex:1 }} placeholder="Search by title or keywords..." />
        <select value={yearFilter} onChange={e => setYear(e.target.value)} style={inputStyle}>
          <option value="">All academic years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={programFilter} onChange={e => setProgram(e.target.value)} style={inputStyle}>
          <option value="">All programs</option>
          {programs.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={adviserFilter} onChange={e => setAdviser(e.target.value)} style={inputStyle}>
          <option value="">All advisers</option>
          {advisers.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'13px' }}>Loading archive...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:'28px', marginBottom:'8px' }}>🗄️</div>
          <div style={{ fontSize:'13px', color:'#94a3b8' }}>No archived projects found.</div>
        </div>
      ) : (
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['Title','Program','Adviser','Academic Year','Keywords'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'10px 14px', fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.08em', textTransform:'uppercase', borderBottom:'1px solid #f1f5f9' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} style={{ borderBottom:'1px solid #f8fafc' }}
                  onMouseOver={e => e.currentTarget.style.background='#f8fafc'}
                  onMouseOut={e => e.currentTarget.style.background='transparent'}>
                  <td style={{ padding:'12px 14px', fontWeight:'600', color:'#0a1f44' }}>{p.title}</td>
                  <td style={{ padding:'12px 14px', color:'#64748b' }}>{p.program || '—'}</td>
                  <td style={{ padding:'12px 14px', color:'#64748b' }}>{p.adviser?.name || '—'}</td>
                  <td style={{ padding:'12px 14px' }}>
                    {p.batch ? <span style={{ fontSize:'11px', background:'#dbeafe', color:'#1e40af', padding:'3px 10px', borderRadius:'20px', fontWeight:'700' }}>{p.batch}</span> : <span style={{ color:'#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ padding:'12px 14px', color:'#94a3b8', fontSize:'12px' }}>{p.keywords || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default PageArchive
