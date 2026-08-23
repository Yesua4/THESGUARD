import { useState } from 'react'
import api from '../../api/axios'

function PageReports() {
  const [reportType, setReportType] = useState('projects')
  const [batch, setBatch]           = useState('')
  const [threshold, setThreshold]   = useState('30')
  const [data, setData]             = useState([])
  const [loading, setLoading]       = useState(false)
  const [generated, setGenerated]   = useState(false)

  const generate = async () => {
    setLoading(true); setGenerated(false)
    try {
      const url = reportType==='projects' ? `/reports/projects${batch?`?batch=${batch}`:''}`
        : reportType==='similarity' ? `/reports/similarity?threshold=${threshold}`
        : reportType==='schedules' ? '/reports/schedules'
        : reportType==='contributions' ? `/reports/contributions${batch?`?batch=${batch}`:''}`
        : `/reports/document-revisions${batch?`?batch=${batch}`:''}`
      const res = await api.get(url)
      setData(res.data); setGenerated(true)
    } catch { alert('Error generating report.') }
    finally { setLoading(false) }
  }

  const exportCSV = () => {
    if (!data.length) return
    const headers = Object.keys(data[0]).join(',')
    const rows    = data.map(row => Object.values(row).map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob    = new Blob([`${headers}\n${rows}`], { type:'text/csv' })
    const a       = Object.assign(document.createElement('a'), { href:URL.createObjectURL(blob), download:`${reportType}_report_${new Date().toISOString().slice(0,10)}.csv` })
    a.click(); URL.revokeObjectURL(a.href)
  }

const exportPDF = () => {
  const el = document.getElementById('report-print-area')
  if (!el) return
  const win = window.open('', '_blank')
  const reportTitle = reportType === 'projects'
    ? 'Project Status Overview'
    : reportType === 'similarity'
    ? 'Similarity Detection Summary'
    : reportType === 'schedules'
    ? 'Defense Schedule Report'
    : reportType === 'contributions'
    ? 'Member Contributions Report'
    : 'Document Revision History Report'
  const meta = new Date().toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
  const tableHTML = el.querySelector('table')?.outerHTML ?? '<p>No data.</p>'
  const batchInfo = batch ? ' · Academic Year: ' + batch : ''

  win.document.write(
    '<html><head><title>ThesisGuard Report</title>' +
    '<style>body{font-family:Arial,sans-serif;padding:40px;color:#111}' +
    'h1{font-size:20px;font-weight:bold;margin-bottom:4px}' +
    '.meta{font-size:12px;color:#888;margin-bottom:24px}' +
    'table{width:100%;border-collapse:collapse;font-size:12px}' +
    'th{background:#f3f4f6;text-align:left;padding:8px 10px;font-size:11px;color:#555;border-bottom:2px solid #ddd}' +
    'td{padding:8px 10px;border-bottom:1px solid #eee;vertical-align:top}' +
    '</style></head><body>' +
    '<h1>ThesisGuard — ' + reportTitle + '</h1>' +
    '<div class="meta">Generated: ' + meta + batchInfo + ' · ' + data.length + ' record(s)</div>' +
    tableHTML +
    '</body></html>'
  )
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 500)
}

  const scoreBadge  = s => ({ background: s>=60?'#fee2e2':s>=30?'#fef3c7':'#d1fae5', color: s>=60?'#9f1239':s>=30?'#92400e':'#065f46' })
  const statusBadge = s => ({ approved:'#d1fae5,#065f46', flagged:'#fee2e2,#9f1239', for_defense:'#ede9fe,#6d28d9', archived:'#f1f5f9,#475569', ongoing:'#dbeafe,#1e40af' }[s]?.split(',') || ['#f1f5f9','#475569'])

  const inputStyle = { border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'9px 12px', fontSize:'13px', outline:'none', background:'#f8fafc', fontFamily:'inherit', width:'100%', boxSizing:'border-box' }
  const labelStyle = { fontSize:'11px', fontWeight:'700', color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:'5px' }

  const tableHead = {
    projects:      ['Title','Batch','Members','Adviser','Title Status','Status','Similarity'],
    similarity:    ['Title','Batch','Adviser','Status','Similarity'],
    schedules:     ['Project','Date','Time','Venue','Panelists','Members','Status'],
    contributions: ['Name','Project','Batch','Activity Count','% of Project Activity','Last Active'],
    revisions:     ['Project','Type','Version','Status','Version Note','Uploaded By','Date'],
  }

  const tableRow = (item, type) => {
    if (type === 'projects') return [
      <td style={{ padding:'10px 14px', fontWeight:'600', color:'#0a1f44', fontSize:'12px' }}>{item.title}</td>,
      <td style={{ padding:'10px 14px', color:'#94a3b8', fontSize:'12px' }}>{item.batch}</td>,
      <td style={{ padding:'10px 14px', color:'#64748b', fontSize:'12px' }}>{item.members}</td>,
      <td style={{ padding:'10px 14px', fontSize:'12px' }}>{item.adviser}</td>,
      <td style={{ padding:'10px 14px' }}><span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', fontWeight:'700', background:statusBadge(item.title_status)[0], color:statusBadge(item.title_status)[1], textTransform:'capitalize' }}>{item.title_status}</span></td>,
      <td style={{ padding:'10px 14px' }}><span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', fontWeight:'700', background:statusBadge(item.status)[0], color:statusBadge(item.status)[1], textTransform:'capitalize' }}>{item.status}</span></td>,
      <td style={{ padding:'10px 14px' }}><span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', fontWeight:'700', ...scoreBadge(item.similarity_score) }}>{item.similarity_score}%</span></td>,
    ]
    if (type === 'similarity') return [
      <td style={{ padding:'10px 14px', fontWeight:'600', color:'#0a1f44', fontSize:'12px' }}>{item.title}</td>,
      <td style={{ padding:'10px 14px', color:'#94a3b8', fontSize:'12px' }}>{item.batch}</td>,
      <td style={{ padding:'10px 14px', fontSize:'12px' }}>{item.adviser}</td>,
      <td style={{ padding:'10px 14px' }}><span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', fontWeight:'700', background:statusBadge(item.status)[0], color:statusBadge(item.status)[1], textTransform:'capitalize' }}>{item.status}</span></td>,
      <td style={{ padding:'10px 14px' }}><span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', fontWeight:'700', ...scoreBadge(item.similarity_score) }}>{item.similarity_score}%</span></td>,
    ]
    if (type === 'schedules') return [
      <td style={{ padding:'10px 14px', fontWeight:'600', color:'#0a1f44', fontSize:'12px' }}>{item.project}</td>,
      <td style={{ padding:'10px 14px', fontSize:'12px' }}>{item.date}</td>,
      <td style={{ padding:'10px 14px', fontSize:'12px' }}>{item.time}</td>,
      <td style={{ padding:'10px 14px', fontSize:'12px' }}>{item.venue}</td>,
      <td style={{ padding:'10px 14px', fontSize:'12px' }}>{item.panelists}</td>,
      <td style={{ padding:'10px 14px', color:'#94a3b8', fontSize:'12px' }}>{item.members}</td>,
      <td style={{ padding:'10px 14px' }}><span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', fontWeight:'700', background:statusBadge(item.status)[0], color:statusBadge(item.status)[1], textTransform:'capitalize' }}>{item.status}</span></td>,
    ]
    if (type === 'contributions') return [
      <td style={{ padding:'10px 14px', fontWeight:'600', color:'#0a1f44', fontSize:'12px' }}>{item.name}</td>,
      <td style={{ padding:'10px 14px', color:'#64748b', fontSize:'12px' }}>{item.project}</td>,
      <td style={{ padding:'10px 14px', color:'#94a3b8', fontSize:'12px' }}>{item.batch}</td>,
      <td style={{ padding:'10px 14px', fontSize:'12px' }}>{item.count}</td>,
      <td style={{ padding:'10px 14px', fontSize:'12px' }}>{item.percentage}%</td>,
      <td style={{ padding:'10px 14px', color:'#94a3b8', fontSize:'12px' }}>{item.last_active}</td>,
    ]
    return [
      <td style={{ padding:'10px 14px', fontWeight:'600', color:'#0a1f44', fontSize:'12px' }}>{item.project}</td>,
      <td style={{ padding:'10px 14px', fontSize:'12px', textTransform:'capitalize' }}>{item.type?.replace('_',' ')}</td>,
      <td style={{ padding:'10px 14px', fontSize:'12px' }}>v{item.version}</td>,
      <td style={{ padding:'10px 14px' }}><span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', fontWeight:'700', background:statusBadge(item.status)[0], color:statusBadge(item.status)[1], textTransform:'capitalize' }}>{item.status}</span></td>,
      <td style={{ padding:'10px 14px', color:'#64748b', fontSize:'12px' }}>{item.version_note}</td>,
      <td style={{ padding:'10px 14px', fontSize:'12px' }}>{item.uploaded_by}</td>,
      <td style={{ padding:'10px 14px', color:'#94a3b8', fontSize:'12px' }}>{item.date}</td>,
    ]
  }

  return (
    <div>
      <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44', marginBottom:'16px' }}>Reports</div>

      {/* Controls */}
      <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden', marginBottom:'14px' }}>
        <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'14px 18px' }}>
          <div style={{ fontSize:'13px', fontWeight:'700', color:'#fff' }}>Generate Report</div>
        </div>
        <div className="dg-grid-3" style={{ padding:'18px', display:'grid', gap:'12px', alignItems:'end' }}>
          <div>
            <label style={labelStyle}>Report Type</label>
            <select value={reportType} onChange={e => { setReportType(e.target.value); setGenerated(false); setData([]) }} style={inputStyle}>
              <option value="projects">Project Status Overview</option>
              <option value="similarity">Similarity Summary</option>
              <option value="schedules">Defense Schedule</option>
              <option value="contributions">Member Contributions</option>
              <option value="revisions">Document Revision History</option>
            </select>
          </div>
          {(reportType === 'projects' || reportType === 'contributions' || reportType === 'revisions') && (
            <div>
              <label style={labelStyle}>Academic Year <span style={{ color:'#cbd5e1', textTransform:'none', fontWeight:'400' }}>(optional)</span></label>
              <input value={batch} onChange={e => setBatch(e.target.value)} style={inputStyle} placeholder="e.g. 2025–2026" />
            </div>
          )}
          {reportType === 'similarity' && (
            <div>
              <label style={labelStyle}>Minimum Similarity %</label>
              <select value={threshold} onChange={e => setThreshold(e.target.value)} style={inputStyle}>
                <option value="30">30% and above</option>
                <option value="50">50% and above</option>
                <option value="60">60% and above (flagged)</option>
              </select>
            </div>
          )}
          <div>
            <button onClick={generate} disabled={loading} style={{ width:'100%', padding:'11px', borderRadius:'8px', border:'none', background:loading?'#cbd5e1':'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', fontSize:'13px', fontWeight:'700', cursor:loading?'not-allowed':'pointer' }}>
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {generated && data.length === 0 && (
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'48px', textAlign:'center', color:'#94a3b8', fontSize:'13px' }}>No data found for this report.</div>
      )}

      {generated && data.length > 0 && (
        <div id="report-print-area">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
            <div style={{ fontSize:'13px', color:'#64748b', fontWeight:'500' }}>{data.length} record(s) found</div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button onClick={exportCSV} style={{ fontSize:'12px', padding:'8px 16px', borderRadius:'8px', border:'none', background:'linear-gradient(135deg,#059669,#047857)', color:'#fff', cursor:'pointer', fontWeight:'700' }}>↓ Export CSV</button>
              <button onClick={exportPDF} style={{ fontSize:'12px', padding:'8px 16px', borderRadius:'8px', border:'none', background:'linear-gradient(135deg,#dc2626,#b91c1c)', color:'#fff', cursor:'pointer', fontWeight:'700' }}>🖨 Print / PDF</button>
            </div>
          </div>

          <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  {tableHead[reportType].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'10px 14px', fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.08em', textTransform:'uppercase', borderBottom:'1px solid #f1f5f9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((item, i) => (
                  <tr key={i} style={{ borderBottom:'1px solid #f8fafc' }}
                    onMouseOver={e => e.currentTarget.style.background='#f8fafc'}
                    onMouseOut={e => e.currentTarget.style.background='transparent'}>
                    {tableRow(item, reportType)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default PageReports
