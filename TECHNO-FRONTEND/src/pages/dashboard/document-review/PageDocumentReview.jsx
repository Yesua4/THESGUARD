import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import api from '../../../api/axios'
import { typeLabel, statusStyle, statusLabel, fileIcon, fileStyle } from '../../../utils/documentDisplay'
import DocumentReviewViewer from './DocumentReviewViewer'
import { useProjectsChannel } from '../../../hooks/useProjectChannel'

function PageDocumentReview({ initialDocumentId, onConsumeInitialDocument }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [documents, setDocuments]     = useState([])
  const [projects, setProjects]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [docTab, setDocTab]           = useState('all') // 'all' | 'class' | 'advisory'

  const load = useCallback(() => {
    // Panelists are matched to projects server-side (by name, against the
    // defense schedule) rather than by adviser_id/instructor_id, so /documents
    // already comes back correctly scoped — no /projects prefilter needed.
    if (user?.role === 'panelist') {
      api.get('/documents').then(dRes => {
        setDocuments(dRes.data)
        const uniqueProjects = Object.values(
          Object.fromEntries(dRes.data.filter(d => d.project).map(d => [d.project.id, d.project]))
        )
        setProjects(uniqueProjects)
      }).finally(() => setLoading(false))
      return
    }

    api.get('/projects').then(res => {
      const mine = res.data.filter(p =>
        // Direct adviser assignment on project
        String(p.adviser_id) === String(user.id) ||
        // OR via group's adviser
        (p.group && String(p.group.adviser_id) === String(user.id)) ||
        // OR instructor
        String(p.instructor_id) === String(user.id)
      )
      setProjects(mine)
      const projectIds = mine.map(p => p.id)

      if (projectIds.length === 0) {
        setDocuments([])
        setLoading(false)
        return
      }

      api.get('/documents').then(dRes => {
        setDocuments(dRes.data.filter(d => projectIds.includes(d.project_id)))
      }).finally(() => setLoading(false))
    }).catch(() => setLoading(false))
  }, [user.id, user.role])

  useEffect(() => { load() }, [load])

  // Live updates: a new document version or a status change on any project
  // in this list refreshes it, so a fresh submission shows up (and an
  // approve/revise decision reflects) without a manual reload.
  useProjectsChannel(projects.map(p => p.id), () => load())

  // Arrived here via a notification click — open the specific document it pointed to.
  useEffect(() => {
    if (!initialDocumentId || documents.length === 0) return
    const doc = documents.find(d => d.id === initialDocumentId)
    if (doc) setSelectedDoc(doc)
    onConsumeInitialDocument?.()
  }, [initialDocumentId, documents])

  // Keep an already-open viewer's status badge in sync if a live refresh
  // (e.g. someone else changed the status) updated this document's row.
  useEffect(() => {
    if (!selectedDoc) return
    const fresh = documents.find(d => d.id === selectedDoc.id)
    if (fresh && fresh.status !== selectedDoc.status) setSelectedDoc(fresh)
  }, [documents])

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
      {selectedDoc && (
        <DocumentReviewViewer
          document={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          canResolve={user?.role === 'adviser' || user?.role === 'instructor'}
          statusActions={
            (user?.role === 'adviser' || user?.role === 'instructor') ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {[
                  ['approved', '✓ Approve', 'linear-gradient(135deg,#059669,#047857)'],
                  ['needs_revision', '↩ Revise', 'linear-gradient(135deg,#d97706,#b45309)'],
                  ['under_review', '👁 Review', 'linear-gradient(135deg,#2563eb,#1d4ed8)'],
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

      {/* Instructor tabs: All / My Class / My Advisory */}
      {user?.role === 'instructor' && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
          {[['all', 'All Documents'], ['class', 'My Class'], ['advisory', 'My Advisory']].map(([val, label]) => (
            <button key={val} onClick={() => setDocTab(val)} style={{
              fontSize: '12px', padding: '7px 14px', borderRadius: '8px', border: 'none',
              background: docTab === val ? 'linear-gradient(135deg,#0a1f44,#1040a0)' : '#fff',
              color: docTab === val ? '#fff' : '#64748b', cursor: 'pointer', fontWeight: '600',
              boxShadow: docTab === val ? 'none' : 'inset 0 0 0 1.5px #e2e8f0',
            }}>{label}</button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>Loading documents...</div>
      ) : (() => {
        const filteredDocs = documents.filter(d => {
          if (user?.role !== 'instructor' || docTab === 'all') return true
          const proj = projects.find(p => p.id === d.project_id)
          if (!proj) return false
          if (docTab === 'class') return String(proj.instructor_id) === String(user.id)
          if (docTab === 'advisory') return proj.group && String(proj.group.adviser_id) === String(user.id)
          return true
        })
        return filteredDocs.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            No documents submitted by your assigned groups yet.
          </div>
        ) : (
          <div className="dg-grid-2" style={{ display: 'grid', gap: '10px' }}>
            {filteredDocs.map(d => (
              <div key={d.id} onClick={() => setSelectedDoc(d)} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseOver={e => e.currentTarget.style.borderColor = '#1d4ed8'}
                onMouseOut={e => e.currentTarget.style.borderColor = '#e8ecf2'}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...fileStyle(d.file_path) }}>
                    {fileIcon(d.file_path)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#0a1f44' }}>{typeLabel[d.type]} <span style={{ fontWeight: '400', color: '#94a3b8' }}>v{d.version}</span></div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{d.uploader?.name}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{d.version_note || 'No note'}</div>
                  </div>
                  <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '700', flexShrink: 0, ...statusStyle(d.status) }}>
                    {statusLabel(d.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}

export default PageDocumentReview
