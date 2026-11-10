import { useEffect, useId, useRef, useState } from 'react'
import api from '../api/axios'

// Full-screen ONLYOFFICE editor for an uploaded .docx: the real Word file,
// pages, tables and fonts intact. Changes are saved automatically while
// editing; when everyone closes the editor, ONLYOFFICE sends the file back to
// ThesisGuard and it becomes the next version (takes ~10 seconds).
let scriptPromise = null
function loadDocsApi(serverUrl) {
  if (window.DocsAPI) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = `${serverUrl}/web-apps/apps/api/documents/api.js`
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => { scriptPromise = null; reject(new Error('editor script')) }
      document.body.appendChild(s)
    })
  }
  return scriptPromise
}

// documentId: edit that uploaded .docx. newFor {projectId, type}: start a
// blank thesis page that becomes the chapter's next version when saved.
export default function OnlyOfficeEditor({ documentId, newFor, title, onClose }) {
  const editorRef = useRef(null)
  const holderId = `oo-editor-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [state, setState] = useState({ loading: true, error: '', mode: null })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = newFor
          ? await api.get(`/projects/${newFor.projectId}/onlyoffice-new`, { params: { type: newFor.type } })
          : await api.get(`/documents/${documentId}/onlyoffice`)
        await loadDocsApi(res.data.server_url)
        if (cancelled) return
        editorRef.current = new window.DocsAPI.DocEditor(holderId, {
          ...res.data.config,
          width: '100%',
          height: '100%',
          type: window.innerWidth < 768 ? 'mobile' : 'desktop',
        })
        setState({ loading: false, error: '', mode: res.data.mode })
      } catch (err) {
        if (cancelled) return
        setState({
          loading: false, mode: null,
          error: err.response?.data?.message
            || 'The Word editor could not be reached right now. You can still download the file, edit it in Word, and upload it as a new version.',
        })
      }
    })()
    return () => {
      cancelled = true
      try { editorRef.current?.destroyEditor() } catch { /* already gone */ }
    }
  }, [documentId, newFor?.projectId, newFor?.type, holderId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div role="dialog" aria-modal="true" aria-label={`Editing ${title}`}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', flexWrap: 'wrap' }}>
        <button type="button" onClick={onClose}
          style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.35)', background: 'transparent', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          ← Close
        </button>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', flex: 1, minWidth: '200px' }}>
          {state.mode === 'edit'
            ? 'Your changes save automatically. When you close the editor, they become a new version (give it about 10 seconds).'
            : state.mode === 'view' ? 'View only.' : ''}
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        {state.loading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '14px' }}>Opening the document…</div>}
        {state.error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div style={{ maxWidth: '440px', textAlign: 'center', color: '#334155', fontSize: '14px', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, color: '#9f1239', marginBottom: '6px' }}>Could not open the editor</div>
              {state.error}
            </div>
          </div>
        )}
        <div id={holderId} style={{ position: 'absolute', inset: 0 }} />
      </div>
    </div>
  )
}
