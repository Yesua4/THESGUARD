import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import api from '../../../api/axios'
import { useSchoolActivity } from '../../../hooks/useSchoolActivity'
import { typeLabel, statusStyle, statusLabel, fileIcon, fileStyle } from '../../../utils/documentDisplay'
import DocumentReviewViewer from './DocumentReviewViewer'
import { useProjectsChannel } from '../../../hooks/useProjectChannel'

function PageDocumentReview({ initialDocumentId, initialCommentId = null, onConsumeInitialDocument }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [documents, setDocuments]     = useState([])
  const [projects, setProjects]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [selectedDoc, setSelectedDoc] = useState(null)
  // Opened from a comment notification: which comment to jump to.
  const [focusCommentId, setFocusCommentId] = useState(null)
  const [linkError, setLinkError] = useState('')
  // 'all' | 'class'. (No "My Advisory": an instructor who also advises
  // switches to their Adviser role to see those groups.)
  const [docTab, setDocTab]           = useState('all')
  const [search, setSearch]           = useState('')
  const [groupIds, setGroupIds]       = useState([])   // [] = all groups
  const [section, setSection]         = useState('')
  const [docType, setDocType]         = useState('')
  const [docStatus, setDocStatus]     = useState('')
  const [latestOnly, setLatestOnly]   = useState(true)
  const [groupsOpen, setGroupsOpen]   = useState(false)
  const [groupSearch, setGroupSearch] = useState('')
  const groupsRef = useRef(null)
  useEffect(() => {
    if (!groupsOpen) return
    const close = e => { if (!groupsRef.current?.contains(e.target)) setGroupsOpen(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [groupsOpen])

  // The server already limits both lists to what this user may see (their
  // school; an adviser's groups; an instructor's sections and classes; a
  // panelist's panels). No second filter here: it used to hide documents
  // from section instructors and from an admin acting as instructor.
  const load = useCallback(() => {
    Promise.all([api.get('/documents'), api.get('/projects').catch(() => ({ data: [] }))])
      .then(([dRes, pRes]) => {
        setDocuments(dRes.data)
        const byId = Object.fromEntries((pRes.data || []).map(p => [p.id, p]))
        dRes.data.forEach(d => { if (d.project && !byId[d.project.id]) byId[d.project.id] = d.project })
        setProjects(Object.values(byId))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // Live updates: a new document version or a status change on any project
  // in this list refreshes it, so a fresh submission shows up (and an
  // approve/revise decision reflects) without a manual reload.
  useProjectsChannel(projects.map(p => p.id), () => load())
  // Live: documents on projects that weren't on screen yet.
  useSchoolActivity(['documents', 'projects'], () => load())

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

  // Keep an already-open viewer's status badge in sync if a live refresh
  // (e.g. someone else changed the status) updated this document's row.
  useEffect(() => {
    if (!selectedDoc) return
    const fresh = documents.find(d => d.id === selectedDoc.id)
    if (fresh && fresh.status !== selectedDoc.status) setSelectedDoc(fresh)
  }, [documents])

  // ---- Filters ----
  const projectById = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects])
  const projectOf = d => projectById[d.project_id] || d.project
  const groups = useMemo(() => {
    const map = {}
    projects.forEach(p => { if (p.group_id && !map[p.group_id]) map[p.group_id] = { id: p.group_id, name: p.group?.group_name || `Group ${p.group_id}`, section: p.group?.section || '' } })
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [projects])
  const groupName = id => groups.find(g => g.id === id)?.name || 'Group'
  const sections = useMemo(() => [...new Set(groups.map(g => g.section).filter(Boolean))].sort(), [groups])
  const filtersOn = !!(search.trim() || groupIds.length || section || docType || docStatus || !latestOnly)
  const clearFilters = () => { setSearch(''); setGroupIds([]); setSection(''); setDocType(''); setDocStatus(''); setLatestOnly(true) }
  const filteredDocs = useMemo(() => {
    const latest = {}
    documents.forEach(d => { const k = `${d.project_id}:${d.type}`; if (!latest[k] || d.version > latest[k]) latest[k] = d.version })
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return documents.filter(d => {
      const proj = projectById[d.project_id] || d.project
      if (user?.role === 'instructor' && docTab === 'class' && String(proj?.instructor_id) !== String(user.id)) return false
      if (latestOnly && d.version !== latest[`${d.project_id}:${d.type}`]) return false
      if (groupIds.length && !groupIds.includes(proj?.group_id)) return false
      if (section && (proj?.group?.section || '') !== section) return false
      if (docType && d.type !== docType) return false
      if (docStatus && d.status !== docStatus) return false
      if (words.length) {
        const hay = [proj?.group?.group_name, proj?.group?.section, proj?.title, d.uploader?.name, d.version_note, typeLabel[d.type],
          ...(proj?.group?.members || []).map(m => m.user?.name), ...(proj?.members || []).map(m => m.user?.name)].filter(Boolean).join(' ').toLowerCase()
        if (!words.every(w => hay.includes(w))) return false
      }
      return true
    }).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  }, [documents, projectById, user, docTab, latestOnly, groupIds, section, docType, docStatus, search])
  const fieldStyle = { border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', background: '#fff', fontFamily: 'inherit', outline: 'none', color: '#334155' }
  const linkBtn = { background: 'none', border: 'none', color: '#1d4ed8', cursor: 'pointer', fontWeight: 600, fontSize: '12px', padding: 0 }

  const updateStatus = async status => {
    try {
      await api.put(`/documents/${selectedDoc.id}/status`, { status })
      setSelectedDoc(d => ({ ...d, status }))
      setDocuments(ds => ds.map(d => d.id === selectedDoc.id ? { ...d, status } : d))
    } catch (err) {
      showToast(err.response?.data?.message || 'Error updating document status. Please try again.')
    }
  }

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
          statusActions={
            (user?.role === 'adviser' || user?.role === 'instructor') ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {[
                  ['approved', '✓ Approve', 'linear-gradient(135deg,#059669,#047857)'],
                  ['needs_revision', '↩ Revise', 'linear-gradient(135deg,#d97706,#b45309)'],
                  ['under_review', 'Review', 'linear-gradient(135deg,#2563eb,#1d4ed8)'],
                ].map(([val, label, bg]) => (
                  <button key={val} onClick={() => updateStatus(val)} style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: bg, color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>{label}</button>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: '12px', padding: '4px 12px', borderRadius: '20px', fontWeight: 700, ...statusStyle(selectedDoc.status) }}>
                  Current: {statusLabel(selectedDoc.status)}
                </span>
              </div>
            ) : null
          }
        />
      )}

      <div style={{ fontSize: '18px', fontWeight: '700', color: '#0a1f44', marginBottom: '16px' }}>Documents Review</div>

      {/* Instructor tabs: All / My Class */}
      {user?.role === 'instructor' && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
          {[['all', 'All Documents'], ['class', 'My Class']].map(([val, label]) => (
            <button key={val} onClick={() => setDocTab(val)} style={{
              fontSize: '12px', padding: '7px 14px', borderRadius: '8px', border: 'none',
              background: docTab === val ? 'linear-gradient(135deg,#0a1f44,#1040a0)' : '#fff',
              color: docTab === val ? '#fff' : '#64748b', cursor: 'pointer', fontWeight: '600',
              boxShadow: docTab === val ? 'none' : 'inset 0 0 0 1.5px #e2e8f0',
            }}>{label}</button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search documents"
          placeholder="Search group, title, student, or note..."
          style={{ ...fieldStyle, flex: '1 1 240px', minWidth: '200px' }} />
        <div ref={groupsRef} style={{ position: 'relative' }}>
          <button type="button" onClick={() => setGroupsOpen(o => !o)} aria-expanded={groupsOpen}
            style={{ ...fieldStyle, cursor: 'pointer', fontWeight: 600, color: groupIds.length ? '#1d4ed8' : '#334155', borderColor: groupIds.length ? '#93c5fd' : '#e2e8f0' }}>
            {groupIds.length === 0 ? 'All groups' : groupIds.length === 1 ? groupName(groupIds[0]) : `${groupIds.length} groups`} ▾
          </button>
          {groupsOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30, width: '280px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 12px 32px rgba(10,31,68,0.15)', padding: '10px' }}>
              <input value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="Find a group..." autoFocus
                style={{ ...fieldStyle, width: '100%', boxSizing: 'border-box', marginBottom: '8px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '11px' }}>
                <button type="button" onClick={() => setGroupIds(groups.map(g => g.id))} style={linkBtn}>Select all</button>
                <button type="button" onClick={() => setGroupIds([])} style={linkBtn}>Clear</button>
              </div>
              <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                {groups.filter(g => !groupSearch.trim() || `${g.name} ${g.section || ''}`.toLowerCase().includes(groupSearch.trim().toLowerCase())).map(g => (
                  <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 4px', fontSize: '13px', color: '#0a1f44', cursor: 'pointer', borderRadius: '6px' }}>
                    <input type="checkbox" checked={groupIds.includes(g.id)} onChange={e => setGroupIds(ids => e.target.checked ? [...ids, g.id] : ids.filter(x => x !== g.id))} />
                    <span style={{ flex: 1 }}>{g.name}</span>
                    {g.section && <span style={{ fontSize: '11px', color: '#94a3b8' }}>{g.section}</span>}
                  </label>
                ))}
                {groups.length === 0 && <div style={{ fontSize: '12px', color: '#94a3b8', padding: '6px' }}>No groups yet.</div>}
              </div>
            </div>
          )}
        </div>
        {sections.length > 1 && (
          <select value={section} onChange={e => setSection(e.target.value)} aria-label="Section" style={fieldStyle}>
            <option value="">All sections</option>
            {sections.map(sec => <option key={sec} value={sec}>{sec}</option>)}
          </select>
        )}
        <select value={docType} onChange={e => setDocType(e.target.value)} aria-label="Document type" style={fieldStyle}>
          <option value="">All documents</option>
          {Object.entries(typeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={docStatus} onChange={e => setDocStatus(e.target.value)} aria-label="Status" style={fieldStyle}>
          <option value="">Any status</option>
          {['pending', 'under_review', 'needs_revision', 'approved'].map(st => <option key={st} value={st}>{statusLabel(st)}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#334155', cursor: 'pointer' }}>
          <input type="checkbox" checked={latestOnly} onChange={e => setLatestOnly(e.target.checked)} /> Latest version only
        </label>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>Loading documents...</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', fontSize: '12px', color: '#64748b' }}>
            <span>{filteredDocs.length} document{filteredDocs.length === 1 ? '' : 's'}</span>
            {filtersOn && <button type="button" onClick={clearFilters} style={linkBtn}>Clear filters</button>}
          </div>
          {filteredDocs.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
              {filtersOn ? <>No documents match these filters. <button type="button" onClick={clearFilters} style={linkBtn}>Clear filters</button></> : 'No documents submitted by your groups yet.'}
            </div>
          ) : (
            <div className="dg-grid-2" style={{ display: 'grid', gap: '10px' }}>
              {filteredDocs.map(d => {
                const proj = projectOf(d)
                return (
                  <div key={d.id} onClick={() => setSelectedDoc(d)} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                    onMouseOver={e => e.currentTarget.style.borderColor = '#1d4ed8'}
                    onMouseOut={e => e.currentTarget.style.borderColor = '#e8ecf2'}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...fileStyle(d.file_path) }}>
                        {fileIcon(d.file_path)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', marginBottom: '2px' }}>
                          {proj?.group?.group_name || 'No group'}{proj?.group?.section ? ` · ${proj.group.section}` : ''}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#0a1f44' }}>{typeLabel[d.type]} <span style={{ fontWeight: '400', color: '#94a3b8' }}>v{d.version}</span></div>
                        {proj?.title && <div title={proj.title} style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{proj.title}</div>}
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{d.uploader?.name}{d.created_at ? ` · ${new Date(d.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}` : ''}</div>
                        {d.version_note && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{d.version_note}</div>}
                      </div>
                      <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '700', flexShrink: 0, ...statusStyle(d.status) }}>
                        {statusLabel(d.status)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default PageDocumentReview
