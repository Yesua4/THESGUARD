import { useState, useEffect } from 'react'
import { useAuth } from '../../../context/AuthContext'
import api from '../../../api/axios'
import { useSchoolActivity } from '../../../hooks/useSchoolActivity'
import { typeLabel, statusStyle, fileIcon, fileStyle } from '../../../utils/documentDisplay'
import DocumentReviewViewer from './DocumentReviewViewer'
import RichTextEditor from './RichTextEditor'
import { useProjectChannel } from '../../../hooks/useProjectChannel'

function PageSubmit({ initialDocumentId, initialCommentId = null, onConsumeInitialDocument }) {
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
  // Opened from a comment notification: which comment to jump to.
  const [focusCommentId, setFocusCommentId] = useState(null)
  const [linkError, setLinkError] = useState('')
  const [approvedProject, setApprovedProject] = useState(null)
  const [needsChoice, setNeedsChoice]   = useState(false)
  const [deletingId, setDeletingId]     = useState(null)
  // Local-only autosave: protects against losing in-progress work (closed
  // tab, browser crash, accidental navigation) WITHOUT touching the
  // backend. /documents/save-draft creates a brand new Document row (a
  // new version, status 'pending' -- goes straight into the adviser's
  // review queue) and logs a Contribution Analytics entry every single
  // time it's called, since that's also how a real, intentional submission
  // is recorded for grading/participation tracking. Calling it
  // automatically every few seconds would flood both of those with
  // dozens of junk entries -- real Google-Docs-style autosave would need
  // an actual separate "silent draft" endpoint on the backend that
  // doesn't touch versioning, review, or contribution logging, which is a
  // real design decision, not something to invent unilaterally. This is
  // the safe subset: recoverable locally, never submitted anywhere until
  // the user explicitly clicks Save Draft, same as always.
  const [recoveredDraft, setRecoveredDraft] = useState(null)
  // Live: title approved / chosen as final, or documents changed by a
  // groupmate -- re-runs the project/document load below.
  const [liveTick, setLiveTick] = useState(0)
  useSchoolActivity(['projects', 'documents'], () => setLiveTick(t => t + 1))
  const draftKey = form.project_id && form.type ? `thesisguard_draft_${form.project_id}_${form.type}` : null

  useEffect(() => {
    api.get('/projects').then(res => {
      const mine = res.data.filter(p => p.members?.some(m => m.user_id === user.id))
      setProjects(mine)
      // Uploads go to the group's FINAL title, which faculty set after the
      // title defense. Approved-but-not-final titles are only approved for
      // the title defense, so uploads wait until the final one is set.
      const approved = mine.find(p => p.is_final_title)
      const approvedCount = mine.filter(p => p.title_status === 'approved').length
      setNeedsChoice(!approved && approvedCount >= 1)
      setApprovedProject(approved || null)
      if (approved) {
        setForm(f => ({ ...f, project_id: approved.id }))
        api.get('/documents').then(dRes => {
          setDocuments(dRes.data.filter(d => d.project_id === approved.id))
        })
      }
    })
  }, [liveTick])

  // Arrived here via a notification click — open the specific document it pointed to.
  useEffect(() => {
    if (!initialDocumentId || documents.length === 0) return
    const doc = documents.find(d => d.id === initialDocumentId)
    if (doc) {
      setFocusCommentId(initialCommentId)
      setSelectedDoc(doc)
    } else {
      // Deleted, or no longer visible to this user (e.g. reassigned).
      setLinkError('That document is no longer available to you. It may have been deleted, or you are no longer assigned to this project.')
    }
    onConsumeInitialDocument?.()
  }, [initialDocumentId, documents])

  // Keep an already-open viewer's status badge in sync with a live refresh.
  useEffect(() => {
    if (!selectedDoc) return
    const fresh = documents.find(d => d.id === selectedDoc.id)
    if (!fresh) { setSelectedDoc(null); return } // deleted elsewhere -- close the viewer
    if (fresh.status !== selectedDoc.status) setSelectedDoc(fresh)
  }, [documents])

  const loadDocs = () => api.get('/documents').then(res => {
    const myDocs = res.data.filter(d => d.project_id === approvedProject?.id)
    setDocuments(myDocs)
  })

  // Entering Write mode (or switching project/type while already in it) --
  // check for a local autosave left over from an earlier session that
  // never got explicitly saved, and offer to restore it rather than
  // silently applying or silently discarding it.
  useEffect(() => {
    if (mode !== 'write' || !draftKey) { setRecoveredDraft(null); return }
    let saved
    try { saved = localStorage.getItem(draftKey) } catch { saved = null }
    if (saved && saved !== content) setRecoveredDraft(saved)
    else setRecoveredDraft(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, draftKey])

  // Debounced local-only autosave while writing -- see the draftKey/
  // recoveredDraft comment above for why this stays local instead of
  // calling the backend. 800ms after typing stops, not on every
  // keystroke, so it doesn't fight normal typing performance.
  useEffect(() => {
    if (mode !== 'write' || !draftKey) return
    const t = setTimeout(() => {
      try {
        if (content && content.trim()) localStorage.setItem(draftKey, content)
        else localStorage.removeItem(draftKey)
      } catch { /* localStorage unavailable (private browsing, quota) -- autosave just silently doesn't happen */ }
    }, 800)
    return () => clearTimeout(t)
  }, [content, mode, draftKey])

  // Live updates: see the status badge flip the instant an adviser/instructor
  // approves/revises a submission, a new upload appear, or a deletion (from
  // this same account on another device, an adviser, etc.) disappear --
  // without needing to reload the page.
  useProjectChannel(approvedProject?.id, (type) => {
    if (type === 'document_status_changed' || type === 'document_uploaded' || type === 'document_deleted') loadDocs()
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
        // Now safely persisted as a real version -- the local safety-net
        // copy would otherwise keep offering to "recover" already-submitted
        // content next time this project/type is opened in Write mode.
        try { if (draftKey) localStorage.removeItem(draftKey) } catch { /* ignore */ }
        setRecoveredDraft(null)
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

  // Lets a student remove a document they uploaded by mistake (wrong file,
  // wrong type, etc.) instead of it sitting in their history forever with no
  // way to undo it.
  const deleteDocument = async doc => {
    const ok = window.confirm(`Delete ${typeLabel[doc.type] || doc.type} v${doc.version}? This can't be undone.`)
    if (!ok) return
    setDeletingId(doc.id)
    try {
      await api.delete(`/documents/${doc.id}`)
      if (selectedDoc?.id === doc.id) setSelectedDoc(null)
      loadDocs()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete this document.')
    } finally {
      setDeletingId(null)
    }
  }

  const inputStyle = { border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'9px 12px', fontSize:'13px', outline:'none', background:'#f8fafc', fontFamily:'inherit', width:'100%', boxSizing:'border-box' }

  return (
    <div>
      {linkError && (
        <div role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: '10px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px' }}>
          <span>{linkError}</span>
          <button onClick={() => setLinkError('')} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: '#9a3412', cursor: 'pointer', fontSize: '14px' }}>✕</button>
        </div>
      )}
      {selectedDoc && (
        <DocumentReviewViewer
          document={selectedDoc}
          focusCommentId={focusCommentId}
          onClose={() => { setSelectedDoc(null); setFocusCommentId(null) }}
          onEdit={
            selectedDoc.file_path && !selectedDoc.file_path.endsWith('.pdf')
              ? () => { const doc = selectedDoc; setSelectedDoc(null); startEditUpload(doc) }
              : undefined
          }
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

          {recoveredDraft && (
            <div style={{
              background:'#fef9c3', borderBottom:'1px solid #fde047', padding:'8px 24px',
              display:'flex', alignItems:'center', gap:'12px', flexShrink:0, fontSize:'12.5px', color:'#713f12',
            }}>
              <span>We found unsaved work from earlier on your device for this document — it was never submitted.</span>
              <div style={{ flex:1 }} />
              <button type="button" onClick={() => { setContent(recoveredDraft); setRecoveredDraft(null) }}
                style={{ background:'#713f12', color:'#fff', border:'none', borderRadius:'6px', padding:'4px 10px', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>
                Restore it
              </button>
              <button type="button" onClick={() => { try { if (draftKey) localStorage.removeItem(draftKey) } catch { /* ignore */ }; setRecoveredDraft(null) }}
                style={{ background:'transparent', color:'#713f12', border:'1px solid #713f12', borderRadius:'6px', padding:'4px 10px', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>
                Discard
              </button>
            </div>
          )}
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
          <div style={{ fontSize:'13px', fontWeight:'700', color:'#1e3a8a', marginBottom:'4px' }}>Waiting for your final title</div>
          <div style={{ fontSize:'12px', color:'#3b82f6' }}>Your title is approved for the title defense. After the defense, your instructor will set your final title — then you can upload documents here.</div>
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
                    {recoveredDraft && (
                      <div style={{
                        background:'#fef9c3', border:'1px solid #fde047', borderRadius:'8px', padding:'8px 12px',
                        display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap', fontSize:'11.5px', color:'#713f12', marginBottom:'8px',
                      }}>
                        <span>We found unsaved work from earlier on your device for this document.</span>
                        <div style={{ flex:1 }} />
                        <button type="button" onClick={() => { setContent(recoveredDraft); setRecoveredDraft(null) }}
                          style={{ background:'#713f12', color:'#fff', border:'none', borderRadius:'6px', padding:'4px 10px', fontSize:'11px', fontWeight:700, cursor:'pointer' }}>
                          Restore it
                        </button>
                        <button type="button" onClick={() => { try { if (draftKey) localStorage.removeItem(draftKey) } catch { /* ignore */ }; setRecoveredDraft(null) }}
                          style={{ background:'transparent', color:'#713f12', border:'1px solid #713f12', borderRadius:'6px', padding:'4px 10px', fontSize:'11px', fontWeight:700, cursor:'pointer' }}>
                          Discard
                        </button>
                      </div>
                    )}
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
                      {d.created_at && (
                        <div style={{ fontSize:'10px', color:'#b0b9c6', marginTop:'2px' }}>
                          {new Date(d.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      )}
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
                        <span
                          onClick={e => { e.stopPropagation(); deleteDocument(d) }}
                          style={{ fontSize:'11px', color: deletingId === d.id ? '#cbd5e1' : '#dc2626', fontWeight:'600', pointerEvents: deletingId === d.id ? 'none' : 'auto' }}
                        >
                          {deletingId === d.id ? 'Deleting…' : '🗑️ Delete'}
                        </span>
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
