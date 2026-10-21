import { useState, useEffect, useCallback, Fragment } from 'react'
import api from '../../api/axios'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

function PageArchive() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]         = useState('')
  const [yearFilter, setYear]       = useState('')
  const [programFilter, setProgram] = useState('')
  const [adviserFilter, setAdviser] = useState('')
  const [showImport, setShowImport]     = useState(false)
  const [importFile, setImportFile]     = useState(null)
  const [importing, setImporting]       = useState(false)
  const [importResult, setImportResult] = useState(null)

  const [expandedId, setExpandedId]     = useState(null)

  const load = useCallback(() => {
    api.get('/archive').then(res => {
      setProjects(res.data)
    }).catch(err => {
      showToast(err.response?.data?.message || 'Could not load the archive.')
    }).finally(() => setLoading(false))
  }, [showToast])

  useEffect(() => { load() }, [load])

  const importCSV = async e => {
    e.preventDefault()
    if (!importFile) return
    setImporting(true)
    const fd = new FormData()
    fd.append('file', importFile)
    try {
      const res = await api.post('/projects/import', fd, { headers:{ 'Content-Type':'multipart/form-data' } })
      setImportResult(res.data)
      setImportFile(null)
      load()
    } catch (err) {
      setImportResult({ message: err.response?.data?.message || 'Import failed.', created:0, skipped:[] })
    } finally { setImporting(false) }
  }

  const downloadTemplate = () => {
    const csv = 'title,abstract,objectives,keywords,batch,program,adviser\n'
      + '"Smart Attendance Monitoring System Using QR Code Technology","This study presents...","To design and develop...","QR code, attendance",2023-2024,BSIT,Juan Dela Cruz\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: 'archived_projects_import_template.csv'
    })
    a.click()
    URL.revokeObjectURL(a.href)
  }

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
        <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
          {['admin','instructor'].includes(user?.role) && (
            <button onClick={() => { setShowImport(true); setImportResult(null) }}
              style={{ background:'rgba(255,255,255,0.12)', color:'#fff', border:'1.5px solid rgba(255,255,255,0.3)', borderRadius:'8px', padding:'9px 16px', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>
              ↑ Import CSV
            </button>
          )}
          <div style={{ fontSize:'36px' }}>🗄️</div>
        </div>
      </div>

      {/* CSV Import Modal */}
      {showImport && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,31,68,0.4)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:'min(520px, 92vw)', maxHeight:'90vh', overflowY:'auto', background:'#fff', borderRadius:'16px', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'18px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:'14px', fontWeight:'700', color:'#fff' }}>Import Archived Projects from CSV</div>
              <button onClick={() => { setShowImport(false); setImportResult(null); setImportFile(null) }} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:'26px', height:'26px', borderRadius:'6px', cursor:'pointer', fontSize:'14px' }}>✕</button>
            </div>
            <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'14px' }}>
              {!importResult ? (
                <>
                  <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'10px', padding:'12px 14px' }}>
                    <div style={{ fontSize:'12px', fontWeight:'700', color:'#065f46', marginBottom:'6px' }}>📋 CSV Format Required</div>
                    <div style={{ fontSize:'11px', color:'#047857', lineHeight:'1.7' }}>
                      Columns: <strong>title, abstract, objectives, keywords, batch, program, adviser</strong><br/>
                      • <strong>title</strong> is required per row<br/>
                      • <strong>abstract</strong> and <strong>objectives</strong> — strongly recommended, since these drive the similarity check<br/>
                      • <strong>batch</strong> — academic year, e.g. 2023-2024 (optional)<br/>
                      • <strong>program</strong> — e.g. BSIT (optional)<br/>
                      • <strong>adviser</strong> — must match an existing adviser account's name exactly, or leave blank
                    </div>
                    <div style={{ fontSize:'11px', color:'#047857', marginTop:'8px' }}>
                      Every row is imported with status <strong>archived</strong>, so it's immediately used to check new 2026+ submissions for overlap.
                    </div>
                    <button
                      onClick={downloadTemplate}
                      style={{ marginTop:'10px', fontSize:'11px', fontWeight:'700', color:'#059669', background:'#fff', border:'1px solid #a7f3d0', borderRadius:'6px', padding:'5px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px' }}
                    >
                      ↓ Download Sample Template
                    </button>
                  </div>

                  <div>
                    <label style={{ fontSize:'11px', fontWeight:'700', color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:'6px' }}>Select CSV File</label>
                    <div
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='#1d4ed8'; e.currentTarget.style.background='#eff6ff' }}
                      onDragLeave={e => { e.currentTarget.style.borderColor='#e2e8f0'; e.currentTarget.style.background='#f8fafc' }}
                      onDrop={e => {
                        e.preventDefault()
                        e.currentTarget.style.borderColor='#e2e8f0'
                        e.currentTarget.style.background='#f8fafc'
                        const file = e.dataTransfer.files[0]
                        if (file && (file.name.endsWith('.csv') || file.name.endsWith('.txt'))) setImportFile(file)
                        else showToast('Please drop a .csv file only.')
                      }}
                      style={{ border:'2px dashed #e2e8f0', borderRadius:'10px', padding:'28px 20px', textAlign:'center', background:'#f8fafc', transition:'all 0.15s', cursor:'pointer' }}
                    >
                      {importFile ? (
                        <div>
                          <div style={{ fontSize:'28px', marginBottom:'8px' }}>📄</div>
                          <div style={{ fontSize:'13px', fontWeight:'600', color:'#059669', marginBottom:'4px' }}>{importFile.name}</div>
                          <div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'10px' }}>{(importFile.size / 1024).toFixed(1)} KB</div>
                          <button type="button" onClick={() => setImportFile(null)} style={{ fontSize:'11px', color:'#dc2626', background:'none', border:'1px solid #fca5a5', borderRadius:'6px', padding:'4px 10px', cursor:'pointer', fontWeight:'600' }}>Remove</button>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize:'32px', marginBottom:'8px' }}>📂</div>
                          <div style={{ fontSize:'13px', color:'#64748b', fontWeight:'500', marginBottom:'4px' }}>Drag & drop your CSV file here</div>
                          <div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'12px' }}>or</div>
                          <label style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', fontSize:'12px', padding:'8px 18px', borderRadius:'8px', cursor:'pointer', fontWeight:'600' }}>
                            Browse File
                            <input type="file" accept=".csv,.txt" style={{ display:'none' }} onChange={e => { if (e.target.files[0]) setImportFile(e.target.files[0]) }} />
                          </label>
                          <div style={{ fontSize:'11px', color:'#94a3b8', marginTop:'10px' }}>Only .csv files accepted</div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display:'flex', gap:'10px' }}>
                    <button
                      onClick={importCSV}
                      disabled={importing || !importFile}
                      style={{ flex:1, padding:'10px', background: importing || !importFile ? '#cbd5e1' : 'linear-gradient(135deg,#059669,#047857)', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor: importing || !importFile ? 'not-allowed' : 'pointer' }}
                    >
                      {importing ? 'Importing...' : '📂 Import Archived Projects'}
                    </button>
                    <button type="button" onClick={() => { setShowImport(false); setImportResult(null); setImportFile(null) }} style={{ flex:1, padding:'10px', background:'#f8fafc', color:'#475569', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'13px', cursor:'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ background: importResult.created > 0 ? '#d1fae5' : '#fef3c7', borderRadius:'10px', padding:'14px', textAlign:'center' }}>
                    <div style={{ fontSize:'24px', fontWeight:'800', color: importResult.created > 0 ? '#065f46' : '#92400e' }}>{importResult.created}</div>
                    <div style={{ fontSize:'13px', color:'#475569' }}>{importResult.message}</div>
                  </div>
                  {importResult.skipped?.length > 0 && (
                    <div style={{ background:'#fef3c7', borderRadius:'10px', padding:'12px', fontSize:'12px', color:'#92400e', maxHeight:'140px', overflowY:'auto' }}>
                      <div style={{ fontWeight:'700', marginBottom:'4px' }}>Skipped rows:</div>
                      {importResult.skipped.map((s, i) => <div key={i}>• {s}</div>)}
                    </div>
                  )}
                  <button onClick={() => { setShowImport(false); setImportResult(null); setImportFile(null) }} style={{ width:'100%', padding:'10px', background:'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor:'pointer' }}>
                    Done
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
                <Fragment key={p.id}>
                  <tr style={{ borderBottom:'1px solid #f8fafc', cursor:'pointer', background: expandedId === p.id ? '#f8fafc' : 'transparent' }}
                    onClick={() => setExpandedId(id => id === p.id ? null : p.id)}
                    onMouseOver={e => e.currentTarget.style.background='#f8fafc'}
                    onMouseOut={e => e.currentTarget.style.background= expandedId === p.id ? '#f8fafc' : 'transparent'}>
                    <td style={{ padding:'12px 14px', fontWeight:'600', color:'#0a1f44' }}>
                      <span style={{ color:'#1d4ed8', fontSize:'10px', marginRight:'8px' }}>{expandedId === p.id ? '▼' : '▶'}</span>{p.title}
                    </td>
                    <td style={{ padding:'12px 14px', color:'#64748b' }}>{p.program || '—'}</td>
                    <td style={{ padding:'12px 14px', color:'#64748b' }}>{p.adviser?.name || '—'}</td>
                    <td style={{ padding:'12px 14px' }}>
                      {p.batch ? <span style={{ fontSize:'11px', background:'#dbeafe', color:'#1e40af', padding:'3px 10px', borderRadius:'20px', fontWeight:'700' }}>{p.batch}</span> : <span style={{ color:'#94a3b8' }}>—</span>}
                    </td>
                    <td style={{ padding:'12px 14px', color:'#94a3b8', fontSize:'12px' }}>{p.keywords || '—'}</td>
                  </tr>
                  {expandedId === p.id && (
                    <tr style={{ background:'#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                      <td colSpan={5} style={{ padding:'4px 14px 16px 32px' }}>
                        {[['Abstract', p.abstract], ['Objectives', p.objectives]].map(([label, text]) => (
                          <div key={label} style={{ marginBottom:'10px' }}>
                            <div style={{ fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:'4px' }}>{label}</div>
                            <div style={{ fontSize:'12px', color:'#334155', lineHeight:'1.7', whiteSpace:'pre-line' }}>{text || 'Not provided.'}</div>
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default PageArchive
