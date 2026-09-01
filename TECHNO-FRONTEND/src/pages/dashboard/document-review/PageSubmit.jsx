import { useState, useEffect } from 'react'
import { useAuth } from '../../../context/AuthContext'
import api from '../../../api/axios'
import { typeLabel, statusStyle, fileIcon, fileStyle } from '../../../utils/documentDisplay'
import DocumentReviewViewer from './DocumentReviewViewer'
import RichTextEditor from './RichTextEditor'
import { useProjectChannel } from '../../../hooks/useProjectChannel'

function PageSubmit({ initialDocumentId, onConsumeInitialDocument }) {
  const { user } = useAuth()
  const [projects, setProjects]         = useState([])
  const [documents, setDocuments]       = useState([])
  const [form, setForm] = useState({ project_id:'', type:'proposal', version_note:'' })
  const [file, setFile]                 = useState(null)
  const [mode, setMode]                 = useState('upload') // 'upload' | 'write'
  const [content, setContent]           = useState('')
  const [saving, setSaving]             = useState(false)
  const [success, setSuccess]           = useState('')
  const [error, setError]               = useState('')
  const [dragOver, setDragOver]         = useState(false)
  const [fullScreen, setFullScreen]     = useState(false)
  const [converting, setConverting]     = useState(false)
  const [selectedDoc, setSelectedDoc]   = useState(null)
  const [approvedProject, setApprovedProject] = useState(null)
  const [needsChoice, setNeedsChoice]   = useState(false)

  useEffect(() => {
    api.get('/projects').then(res => {
      const mine = res.data.filter(p => p.members?.some(m => m.user_id === user.id))
      setProjects(mine)
      // A group can have more than one approved title at once — the one actually
      // used for uploads is whichever one was explicitly chosen as final (or the
      // sole approved title, which the backend auto-finalizes). Picking "the first
      // approved one found" here would silently attach uploads to the wrong title
      // whenever more than one was approved.
      const approved = mine.find(p => p.is_final_title)
      const approvedCount = mine.filter(p => p.title_status === 'approved').length
      setNeedsChoice(!approved && approvedCount > 1)
      setApprovedProject(approved || null)
      if (approved) {
        setForm(f => ({ ...f, project_id: approved.id }))
        api.get('/documents').then(dRes => {
          setDocuments(dRes.data.filter(d => d.project_id === approved.id))
        })
      }
    })
  }, [])

  // Arrived here via a notification click — open the specific document it pointed to.
  useEffect(() => {
    if (!initialDocumentId || documents.length === 0) return
    const doc = documents.find(d => d.id === initialDocumentId)
    if (doc) setSelectedDoc(doc)
    onConsumeInitialDocument?.()
  }, [initialDocumentId, documents])

  // Keep an already-open viewer's status badge in sync with a live refresh.
  useEffect(() => {
    if (!selectedDoc) return
    const fresh = documents.find(d => d.id === selectedDoc.id)
    if (fresh && fresh.status !== selectedDoc.status) setSelectedDoc(fresh)
  }, [documents])

  const loadDocs = () => api.get('/documents').then(res => {
    const myDocs = res.data.filter(d => d.project_id === approvedProject?.id)
    setDocuments(myDocs)
  })

  // Live updates: see the status badge flip the instant an adviser/instructor
  // approves/revises a submission, without needing to reload the page.
  useProjectChannel(approvedProject?.id, (type) => {
    if (type === 'document_status_changed' || type === 'document_uploaded') loadDocs()
  })
  const handle = e => setForm({ ...form, [e.target.name]: e.target.value })

  const handleFile = f => {
    const ok = ['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword']
    if (f && ok.includes(f.type)) { setFile(f); setError('') }
    else { setError('Please select a PDF or DOCX file only.'); setFile(null) }
  }

  const submit = async e => {
    e.preventDefault()
    if (mode === 'upload' && !file) { setError('Please select a file.'); return false }
    if (mode === 'write' && !content.trim()) { setError('Please write some content first.'); return false }
    if (!form.project_id) { setError('No approved project found.'); return false }
    setSaving(true); setSuccess(''); setError('')
    try {
      if (mode === 'upload') {
        const fd = new FormData()
        fd.append('project_id', form.project_id)
        fd.append('type', form.type)
        fd.append('version_note', form.version_note)
        fd.append('file', file)
        await api.post('/documents', fd, { headers:{ 'Content-Type':'multipart/form-data' } })
        setFile(null)
      } else {
        await api.post('/documents/save-draft', {
          project_id: form.project_id, type: form.type,
          version_note: form.version_note, content,
        })
        setContent('')
      }
      setSuccess('Document submitted successfully!')
      setForm(f => ({ ...f, version_note:'' }))
      loadDocs()
      return true
    } catch (err) {
      setError(err.response?.data?.message || 'Error saving document.')
      return false
    } finally { setSaving(false) }
  }

  // Opens an already-uploaded Word document (.docx/.doc) for in-app editing:
  // the backend converts it to HTML via LibreOffice (same conversion path
  // already used for the PDF preview), and once edited, saving goes through
  // the normal saveDraft flow — from that point on it's an in-app version
  // like any other, no DOCX regeneration needed.
  const startEditUpload = async doc => {
    setConverting(true); setError('')
    try {
      const res = await api.get(`/documents/${doc.id}/edit-content`)
      setContent(res.data.html)
      setForm(f => ({ ...f, type: res.data.type, version_note: `Edited from uploaded file (was v${doc.version})` }))
      setMode('write')
      setFullScreen(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not open this document for editing.')
    } finally {
      setConverting(false)
    }
  }

  const inputStyle = { border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'9px 12px', fontSize:'13px', outline:'none', background:'#f8fafc', fontFamily:'inherit', width:'100%', boxSizing:'border-box' }

  return (
    <div>
      {selectedDoc && (
        <DocumentReviewViewer
          document={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          canResolve={['adviser', 'instructor', 'admin'].includes(user.role)}
        />
      )}

      {converting && (
        <div style={{
          position:'fixed', inset:0, zIndex:210, background:'rgba(10,31,68,0.55)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <div style={{ background:'#fff', borderRadius:'14px', padding:'28px 36px', textAlign:'center', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:'28px', marginBottom:'10px' }}>📄</div>
            <div style={{ fontSize:'14px', fontWeight:'700', color:'#0a1f44', marginBottom:'4px' }}>Converting document for editing...</div>
            <div style={{ fontSize:'12px', color:'#94a3b8' }}>This can take a few seconds for larger files.</div>
          </div>
        </div>
      )}

      {fullScreen && (
        <div style={{
          position:'fixed', inset:0, zIndex:200, background:'#f0f2f7',
          display:'flex', flexDirection:'column',
        }}>
          {/* Header */}
          <div style={{
            background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'12px 24px',
            display:'flex', alignItems:'center', gap:'14px', flexShrink:0,
            boxShadow:'0 2px 12px rgba(0,0,0,0.15)',
          }}>
            <button type="button" onClick={() => setFullScreen(false)} style={{
              background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', color:'#fff',
              borderRadius:'8px', padding:'7px 12px', fontSize:'12px', fontWeight:'700', cursor:'pointer',
              display:'flex', alignItems:'center', gap:'6px', flexShrink:0,
            }}>
              ← Exit Full Screen
            </button>
            <div style={{ color:'#fff', fontSize:'13px', fontWeight:'700', flexShrink:0 }}>
              {typeLabel[form.type] || form.type}
            </div>
            <input
              value={form.version_note}
              onChange={e => setForm(f => ({ ...f, version_note: e.target.value }))}
              placeholder="Version note (e.g. Revised abstract)"
              style={{
                flex:1, maxWidth:'420px', border:'1px solid rgba(255,255,255,0.25)', borderRadius:'8px',
                padding:'8px 12px', fontSize:'12.5px', background:'rgba(255,255,255,0.1)', color:'#fff', outline:'none',
              }}
            />
            <div style={{ flex:1 }} />
            {error && <div style={{ fontSize:'12px', color:'#fecaca', fontWeight:'600' }}>{error}</div>}
            <button
              type="button"
              disabled={saving || !content.trim()}
              onClick={async () => { const ok = await submit({ preventDefault(){} }); if (ok) setFullScreen(false) }}
              style={{
                padding:'9px 20px', borderRadius:'8px', border:'none', fontSize:'13px', fontWeight:'700',
                background: saving || !content.trim() ? 'rgba(255,255,255,0.3)' : '#fff',
                color: saving || !content.trim() ? 'rgba(255,255,255,0.6)' : '#0a1f44',
                cursor: saving || !content.trim() ? 'not-allowed' : 'pointer', flexShrink:0,
              }}
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
          </div>

          {/* Page-like writing canvas */}
          <div style={{ flex:1, overflowY:'auto', padding:'28px 24px', display:'flex', justifyContent:'center' }}>
            <div style={{ width:'100%', height:'100%' }}>
              <RichTextEditor value={content} onChange={setContent} paginated autoFocus />
            </div>
          </div>
        </div>
      )}

      <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44', marginBottom:'16px' }}>Submit Document</div>

      {!approvedProject && needsChoice && (
        <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'12px', padding:'14px 16px', marginBottom:'16px' }}>
          <div style={{ fontSize:'13px', fontWeight:'700', color:'#1e3a8a', marginBottom:'4px' }}>Choose Your Final Title First</div>
          <div style={{ fontSize:'12px', color:'#3b82f6' }}>More than one of your group's titles has been approved. Go to <strong>My Project</strong> and choose which one to commit to before you can upload documents.</div>
        </div>
      )}
      {!approvedProject && !needsChoice && (
        <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'12px', padding:'14px 16px', marginBottom:'16px' }}>
          <div style={{ fontSize:'13px', fontWeight:'700', color:'#92400e', marginBottom:'4px' }}>Title Approval Required</div>
          <div style={{ fontSize:'12px', color:'#b45309' }}>You cannot upload documents until your instructor approves your project title. Go to <strong>My Project</strong> to check the status.</div>
        </div>
      )}

      <div className="dg-grid-2" style={{ display:'grid', gap:'14px' }}>
        {/* Upload form */}
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
          <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'14px 18px' }}>
            <div style={{ fontSize:'13px', fontWeight:'700', color:'#fff' }}>Upload Document</div>
          </div>
          <div style={{ padding:'18px' }}>
            {success && <div style={{ background:'#d1fae5', border:'1px solid #a7f3d0', borderRadius:'8px', padding:'10px 14px', marginBottom:'12px', fontSize:'13px', color:'#065f46', fontWeight:'600' }}>✅ {success}</div>}
            {error   && <div style={{ background:'#fee2e2', border:'1px solid #fecaca', borderRadius:'8px', padding:'10px 14px', marginBottom:'12px', fontSize:'13px', color:'#9f1239', fontWeight:'600' }}>❌ {error}</div>}

            {approvedProject ? (
              <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                <div>
                  <label style={{ fontSize:'11px', fontWeight:'700', color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:'5px' }}>Document Type</label>
                  <select name="type" value={form.type} onChange={handle} style={inputStyle}>
                    {Object.entries(typeLabel).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:'11px', fontWeight:'700', color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:'5px' }}>Version Note</label>
                  <input name="version_note" value={form.version_note} onChange={handle} style={inputStyle} placeholder="e.g. Revised abstract" />
                </div>
                <div style={{ display:'flex', gap:'6px' }}>
                  {[['upload','📎 Upload File'],['write','✍️ Write In-App']].map(([m,label]) => (
                    <button key={m} type="button" onClick={() => setMode(m)} style={{
                      flex:1, padding:'8px', borderRadius:'8px', fontSize:'12px', fontWeight:'700', cursor:'pointer',
                      border: mode===m ? '1.5px solid #1040a0' : '1.5px solid #e2e8f0',
                      background: mode===m ? '#eff6ff' : '#fff', color: mode===m ? '#1040a0' : '#64748b',
                    }}>{label}</button>
                  ))}
                </div>

                {mode === 'upload' ? (
                  <div>
                    <label style={{ fontSize:'11px', fontWeight:'700', color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:'5px' }}>File (PDF or DOCX)</label>
                    <div
                      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
                      style={{ border:`2px dashed ${dragOver?'#1d4ed8':'#e2e8f0'}`, borderRadius:'10px', padding:'24px', textAlign:'center', background: dragOver?'#eff6ff':'#f8fafc', transition:'all 0.15s' }}>
                      {file ? (
                        <div>
                          <div style={{ fontSize:'13px', fontWeight:'600', color:'#059669', marginBottom:'4px' }}>{file.name}</div>
                          <div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'8px' }}>{(file.size/1024/1024).toFixed(2)} MB</div>
                          <button type="button" onClick={() => setFile(null)} style={{ fontSize:'11px', color:'#dc2626', background:'none', border:'none', cursor:'pointer' }}>Remove</button>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize:'24px', marginBottom:'8px' }}>📎</div>
                          <div style={{ fontSize:'13px', color:'#64748b', marginBottom:'4px' }}>Drag and drop your file here</div>
                          <div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'10px' }}>or</div>
                          <label style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', fontSize:'12px', padding:'7px 16px', borderRadius:'8px', cursor:'pointer', fontWeight:'600' }}>
                            Browse Files
                            <input type="file" accept=".pdf,.docx,.doc" style={{ display:'none' }} onChange={e => handleFile(e.target.files[0])} />
                          </label>
                          <div style={{ fontSize:'11px', color:'#94a3b8', marginTop:'8px' }}>PDF or DOCX · max 20MB</div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'5px' }}>
                      <label style={{ fontSize:'11px', fontWeight:'700', color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase' }}>Chapter Content</label>
                      <button type="button" onClick={() => setFullScreen(true)} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', fontWeight:'700', color:'#1040a0', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'6px', padding:'4px 10px', cursor:'pointer' }}>
                        ⛶ Full Screen
                      </button>
                    </div>
                    <RichTextEditor value={content} onChange={setContent} minHeight="220px" />
                  </div>
                )}

                <button type="submit" disabled={saving || (mode==='upload' ? !file : !content.trim())} style={{ padding:'11px', borderRadius:'8px', border:'none', background: saving||(mode==='upload'?!file:!content.trim())?'#cbd5e1':'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', fontSize:'13px', fontWeight:'700', cursor:saving?'not-allowed':'pointer' }}>
                  {saving ? 'Saving...' : mode==='upload' ? 'Submit Document' : 'Save Draft'}
                </button>
              </form>
            ) : (
              <div style={{ textAlign:'center', padding:'32px 0', color:'#94a3b8', fontSize:'13px' }}>
                <div style={{ fontSize:'28px', marginBottom:'8px' }}>🔒</div>
                Upload is locked until your title is approved.
              </div>
            )}
          </div>
        </div>

        {/* History */}
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
          <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'14px 18px' }}>
            <div style={{ fontSize:'13px', fontWeight:'700', color:'#fff' }}>Submission History</div>
          </div>
          <div style={{ padding:'14px' }}>
            {documents.length === 0 ? (
              <div style={{ textAlign:'center', padding:'32px 0', color:'#94a3b8', fontSize:'13px' }}>
                <div style={{ fontSize:'28px', marginBottom:'8px' }}>📄</div>
                No documents submitted yet.
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {documents.map(d => (
                  <div key={d.id} onClick={() => setSelectedDoc(d)} style={{ display:'flex', alignItems:'flex-start', gap:'10px', padding:'12px', background:'#f8fafc', borderRadius:'10px', cursor:'pointer', border:'1px solid transparent', transition:'border-color 0.15s' }}
                    onMouseOver={e => e.currentTarget.style.borderColor='#1d4ed8'}
                    onMouseOut={e => e.currentTarget.style.borderColor='transparent'}>
                    <div style={{ width:'34px', height:'34px', borderRadius:'8px', fontSize:'10px', fontWeight:'700', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, ...fileStyle(d.file_path) }}>
                      {fileIcon(d.file_path)}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'13px', fontWeight:'600', color:'#0a1f44' }}>{typeLabel[d.type]||d.type} <span style={{ fontWeight:'400', color:'#94a3b8', fontSize:'11px' }}>v{d.version}</span></div>
                      <div style={{ fontSize:'11px', color:'#94a3b8', marginTop:'2px' }}>{d.version_note || 'No note'}</div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'4px' }}>
                      <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', fontWeight:'700', ...statusStyle(d.status) }}>{d.status}</span>
                      <div style={{ display:'flex', gap:'8px' }}>
                        {d.file_path && !d.file_path.endsWith('.pdf') && (
                          <span
                            onClick={e => { e.stopPropagation(); startEditUpload(d) }}
                            style={{ fontSize:'11px', color:'#7c3aed', fontWeight:'600' }}
                          >
                            ✏️ Edit
                          </span>
                        )}
                        <span style={{ fontSize:'11px', color:'#1d4ed8', fontWeight:'600' }}>View →</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PageSubmit
