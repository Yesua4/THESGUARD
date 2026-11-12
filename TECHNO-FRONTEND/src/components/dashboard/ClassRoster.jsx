import { useEffect, useState } from 'react'
import api from '../../api/axios'
import { SectionField } from './SectionPicker'
import { useAuth } from '../../context/AuthContext'
import { useSchoolStaffChannel } from '../../hooks/useSchoolStaffChannel'
import Icon from '../Icon'
import { SkeletonTable } from '../Skeleton'

const overlay = { position:'fixed', inset:0, background:'rgba(10,31,68,0.4)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center' }
const header  = { background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'18px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }
const closeBtn = { background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:'26px', height:'26px', borderRadius:'6px', cursor:'pointer', fontSize:'14px' }
const label   = { fontSize:'11px', fontWeight:'700', color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:'6px' }
const input   = { border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', outline:'none', background:'#f8fafc', fontFamily:'inherit', width:'100%', boxSizing:'border-box' }
const primary = { flex:1, padding:'10px', background:'linear-gradient(135deg,#059669,#047857)', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor:'pointer' }
const ghost   = { flex:1, padding:'10px', background:'#f8fafc', color:'#475569', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'13px', cursor:'pointer' }

function ReportList({ title, color, bg, items, render }) {
  if (!items?.length) return null
  return (
    <div style={{ background:bg, borderRadius:'10px', padding:'10px 12px', fontSize:'12px', color, maxHeight:'150px', overflowY:'auto' }}>
      <div style={{ fontWeight:'700', marginBottom:'4px' }}>{title} ({items.length})</div>
      {items.map((it, i) => <div key={i}>• {render(it)}</div>)}
    </div>
  )
}

/**
 * Upload the registrar's class list (.xls/.xlsx/.csv). Students are matched
 * to their self-registered accounts by Student No.
 */
export function ImportClassListModal({ user, onClose, onDone }) {
  const [file, setFile]       = useState(null)
  const [section, setSection] = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [result, setResult]   = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const scoped = user?.role === 'instructor' && (user?.handled_sections || []).length > 0

  // Same file types as the picker; a wrong file gets a clear message.
  const pickFile = f => {
    if (!f) return
    if (/\.(xls|xlsx|csv)$/i.test(f.name)) { setFile(f); setError('') }
    else setError('Please use the class list as .xls, .xlsx or .csv.')
  }

  const submit = async e => {
    e.preventDefault()
    if (!file) return
    setBusy(true); setError('')
    const fd = new FormData()
    fd.append('file', file)
    if (section) fd.append('section', section)
    try {
      const res = await api.post('/roster/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResult(res.data)
      onDone?.()
    } catch (err) {
      setError(err.response?.data?.message || 'Import failed.')
    } finally { setBusy(false) }
  }

  return (
    // Dropping a file outside the box must not make the browser open it.
    <div style={overlay} onDragOver={e => e.preventDefault()} onDrop={e => e.preventDefault()}>
      <div style={{ width:'min(520px, 94vw)', maxHeight:'90vh', overflowY:'auto', background:'#fff', borderRadius:'16px', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={header}>
          <div style={{ fontSize:'14px', fontWeight:'700', color:'#fff' }}>Import Class List</div>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>
        <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'14px' }}>
          {!result ? (
            <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'10px', padding:'12px 14px', fontSize:'12px', color:'#047857', lineHeight:'1.7' }}>
                <div style={{ fontWeight:'700', color:'#065f46', marginBottom:'4px' }}><Icon name="clipboard" /> Upload the class list from the registrar</div>
                • Accepts the registrar's <strong>.xls</strong> as is, or .xlsx / .csv with <strong>Student No.</strong> and <strong>Name</strong> columns.<br/>
                • Students are matched to their accounts by <strong>Student No.</strong> No emails needed.<br/>
                • Students who haven't signed up yet are enrolled automatically when they do.
              </div>
              <div>
                <label style={label}>Class list file</label>
                <div
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); pickFile(e.dataTransfer.files[0]) }}
                  style={{ border:`2px dashed ${dragOver ? '#059669' : '#e2e8f0'}`, borderRadius:'10px', padding:'22px 18px', textAlign:'center', background: dragOver ? '#ecfdf5' : '#f8fafc', transition:'all 0.15s' }}
                >
                  {file ? (
                    <div>
                      <div style={{ fontSize:'24px', marginBottom:'6px', color:'#059669' }}><Icon name="file" /></div>
                      <div style={{ fontSize:'13px', fontWeight:'600', color:'#059669', marginBottom:'2px', wordBreak:'break-all' }}>{file.name}</div>
                      <div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'10px' }}>{(file.size / 1024).toFixed(1)} KB</div>
                      <button type="button" onClick={() => setFile(null)} style={{ fontSize:'11px', color:'#dc2626', background:'#fff', border:'1px solid #fca5a5', borderRadius:'6px', padding:'4px 10px', cursor:'pointer', fontWeight:'600' }}>Remove</button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize:'28px', marginBottom:'6px', color:'#94a3b8' }}><Icon name="folder" /></div>
                      <div style={{ fontSize:'13px', color:'#475569', fontWeight:'600', marginBottom:'2px' }}>Drag &amp; drop the class list here</div>
                      <div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'10px' }}>or</div>
                      <label style={{ display:'inline-block', background:'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', fontSize:'12px', padding:'8px 18px', borderRadius:'8px', cursor:'pointer', fontWeight:'600' }}>
                        Browse File
                        <input type="file" accept=".xls,.xlsx,.csv" style={{ display:'none' }} onChange={e => { pickFile(e.target.files[0]); e.target.value = '' }} />
                      </label>
                      <div style={{ fontSize:'11px', color:'#94a3b8', marginTop:'10px' }}>.xls, .xlsx or .csv</div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label style={label}>Section {!scoped && <span style={{ color:'#cbd5e1', textTransform:'none', fontWeight:'400' }}>(leave blank to use the one printed on the class list)</span>}</label>
                <SectionField user={user} value={section} onChange={setSection} style={input} placeholder="e.g. BSIT 4A" />
              </div>
              {error && <div style={{ background:'#fee2e2', color:'#9f1239', fontSize:'12px', padding:'10px 12px', borderRadius:'8px' }}>{error}</div>}
              <div style={{ display:'flex', gap:'10px' }}>
                <button type="submit" disabled={busy || !file} style={{ ...primary, opacity: busy || !file ? 0.6 : 1, cursor: busy || !file ? 'not-allowed' : 'pointer' }}>
                  {busy ? 'Importing…' : 'Import & Enroll'}
                </button>
                <button type="button" onClick={onClose} style={ghost}>Cancel</button>
              </div>
            </form>
          ) : (
            <>
              <div style={{ background:'#d1fae5', borderRadius:'10px', padding:'14px', textAlign:'center' }}>
                <div style={{ fontSize:'24px', fontWeight:'800', color:'#065f46' }}>{result.enrolled.length} / {result.total}</div>
                <div style={{ fontSize:'13px', color:'#475569' }}>enrolled{result.section ? ` in ${result.section}` : ''}</div>
                <div style={{ fontSize:'12px', color:'#64748b', marginTop:'4px' }}>{result.message}</div>
              </div>
              <ReportList title="Name on account differs from class list" color="#92400e" bg="#fef3c7" items={result.mismatches}
                render={m => <>{m.student_id}: class list <strong>{m.name}</strong>, account <strong>{m.account_name}</strong></>} />
              <ReportList title="Not signed up yet: will be enrolled when they register" color="#1e40af" bg="#eff6ff" items={result.waiting}
                render={w => `${w.student_id}: ${w.name}`} />
              <ReportList title="Skipped" color="#9f1239" bg="#fee2e2" items={result.skipped} render={s => s} />
              <button onClick={onClose} style={{ ...primary, background:'linear-gradient(135deg,#0a1f44,#1040a0)' }}>Done</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Everyone on the imported class lists, with whether they've signed up. */
export function RosterModal({ onClose }) {
  const [rows, setRows]       = useState(null)
  const [section, setSection] = useState('')
  const [status, setStatus]   = useState('')
  const [error, setError]     = useState('')

  const { user } = useAuth()
  const load = () => api.get('/roster').then(res => setRows(res.data)).catch(err => setError(err.response?.data?.message || 'Could not load the roster.'))
  useEffect(() => { load() }, [])
  // Live: students flip from "Not signed up" to "Enrolled" as they register.
  useSchoolStaffChannel(user?.school_id, true, load)

  const remove = async r => {
    if (!confirm(`Remove ${r.name} (${r.student_id}) from the roster?`)) return
    try { await api.delete(`/roster/${r.id}`); load() }
    catch (err) { setError(err.response?.data?.message || 'Could not remove.') }
  }

  const sections = [...new Set((rows || []).map(r => r.section))].sort()
  const shown = (rows || []).filter(r =>
    (!section || r.section === section) &&
    (!status || (status === 'mismatch' ? r.name_mismatch : r.status === status)))
  const counts = {
    enrolled: (rows || []).filter(r => r.status === 'enrolled').length,
    waiting:  (rows || []).filter(r => r.status === 'waiting').length,
    mismatch: (rows || []).filter(r => r.name_mismatch).length,
  }

  const pill = (text, bg, color) => <span style={{ fontSize:'10px', fontWeight:'700', padding:'2px 8px', borderRadius:'20px', background:bg, color, whiteSpace:'nowrap' }}>{text}</span>

  return (
    <div style={overlay}>
      <div style={{ width:'min(860px, 96vw)', maxHeight:'90vh', display:'flex', flexDirection:'column', background:'#fff', borderRadius:'16px', boxShadow:'0 20px 60px rgba(0,0,0,0.2)', overflow:'hidden' }}>
        <div style={header}>
          <div style={{ fontSize:'14px', fontWeight:'700', color:'#fff' }}>Class Roster</div>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>
        <div style={{ padding:'14px 20px', display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center', borderBottom:'1px solid #f1f5f9' }}>
          <select value={section} onChange={e => setSection(e.target.value)} style={{ ...input, width:'auto' }}>
            <option value="">All sections</option>
            {sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...input, width:'auto' }}>
            <option value="">All ({rows?.length ?? 0})</option>
            <option value="enrolled">Enrolled ({counts.enrolled})</option>
            <option value="waiting">Not signed up ({counts.waiting})</option>
            <option value="mismatch">Name differs ({counts.mismatch})</option>
          </select>
        </div>
        <div style={{ overflowY:'auto', flex:1 }}>
          {error && <div style={{ margin:'12px 20px', background:'#fee2e2', color:'#9f1239', fontSize:'12px', padding:'10px 12px', borderRadius:'8px' }}>{error}</div>}
          {rows === null ? (
            <SkeletonTable rows={5} cols={4} bare label="Loading class roster" />
          ) : shown.length === 0 ? (
            <div style={{ padding:'30px', textAlign:'center', color:'#94a3b8', fontSize:'13px' }}>No students yet. Import a class list to start.</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  {['Student No.', 'Name (class list)', 'Section', 'Status', 'Account', ''].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'8px 14px', fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.08em', textTransform:'uppercase', borderBottom:'1px solid #f1f5f9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.id} style={{ borderBottom:'1px solid #f8fafc' }}>
                    <td style={{ padding:'8px 14px', color:'#475569', whiteSpace:'nowrap' }}>{r.student_id}</td>
                    <td style={{ padding:'8px 14px', color:'#0a1f44', fontWeight:'600' }}>{r.name}</td>
                    <td style={{ padding:'8px 14px', color:'#64748b', whiteSpace:'nowrap' }}>{r.section}</td>
                    <td style={{ padding:'8px 14px' }}>
                      <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                        {r.status === 'enrolled' ? pill('Enrolled', '#d1fae5', '#065f46') : pill('Not signed up', '#eff6ff', '#1e40af')}
                        {r.name_mismatch && pill('Name differs', '#fef3c7', '#92400e')}
                      </div>
                    </td>
                    <td style={{ padding:'8px 14px', color:'#64748b' }}>
                      {r.account ? <><div style={{ color:'#0a1f44' }}>{r.account.name}</div><div style={{ fontSize:'11px' }}>{r.account.email}</div></> : '—'}
                    </td>
                    <td style={{ padding:'8px 14px' }}>
                      <button onClick={() => remove(r)} style={{ fontSize:'11px', padding:'4px 10px', borderRadius:'6px', border:'1.5px solid #fecaca', background:'#fff', cursor:'pointer', color:'#dc2626', fontWeight:'600' }}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
