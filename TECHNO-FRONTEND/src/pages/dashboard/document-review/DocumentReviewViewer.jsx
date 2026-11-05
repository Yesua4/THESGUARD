import { useState, useMemo, useEffect, useRef } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { useDocumentComments } from '../../../hooks/useDocumentComments'
import { useProjectChannel } from '../../../hooks/useProjectChannel'
import api from '../../../api/axios'
import PdfViewer from './PdfViewer'
import CommentSidebar from './CommentSidebar'
import DocumentDiffViewer from './DocumentDiffViewer'
import { DEFAULT_MARGINS, markStructuralPageBreaks, paginate } from './pagination'

// Shown when no PDF-renderable version exists yet: either the file is a
// Word doc whose automatic conversion failed (or hasn't been attempted,
// e.g. LibreOffice isn't configured on the server), so preview falls back
// to a plain authenticated download instead of a broken in-canvas render.
function NonPdfFallback({ documentId, fileName, previewStatus }) {
  const [downloading, setDownloading] = useState(false)

  const download = async () => {
    setDownloading(true)
    try {
      const res = await api.get(`/documents/${documentId}/file`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = window.document.createElement('a')
      a.href = url
      a.download = fileName || 'document'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  const message = previewStatus === 'failed'
    ? "Automatic preview conversion failed for this file. You can still download it below."
    : "In-app preview isn't available for this file yet. Download it to view, or ask the submitter to re-upload."

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '60px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: '36px' }}>📄</div>
      <div style={{ fontSize: '14px', fontWeight: 600, color: '#0a1f44' }}>Preview not available</div>
      <div style={{ fontSize: '12px', color: '#64748b', maxWidth: '340px' }}>{message}</div>
      <button
        onClick={download}
        disabled={downloading}
        style={{ marginTop: '6px', padding: '9px 18px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: downloading ? 'default' : 'pointer', opacity: downloading ? 0.6 : 1 }}
      >
        {downloading ? 'Downloading…' : '⬇ Download to view'}
      </button>
    </div>
  )
}

// Composition root for in-app document review: renders the PDF, lets the
// viewer pin comments to selected text or clicked points, and lists them in
// a sidebar with resolve/delete actions. Shared by PageDocumentReview (adviser
// / instructor review) and PageSubmit (student's own document view).
export default function DocumentReviewViewer({ document, onClose, canResolve = false, statusActions = null, onEdit = null }) {
  const { user } = useAuth()
  const { comments, error: commentsError, addComment, deleteComment, setResolved, reload: reloadComments } = useDocumentComments(document.id)
  // Live updates: another reviewer's comment (or resolve/delete) on THIS
  // document shows up immediately instead of only on next open/refresh.
  useProjectChannel(document.project_id, (type, payload) => {
    if (payload?.document_id !== document.id) return
    if (type === 'comment_created' || type === 'comment_resolved' || type === 'comment_deleted') {
      reloadComments()
    }
  })
  // deleteComment/setResolved already record failures into commentsError
  // for the banner below to show -- these wrappers just stop that same
  // failure from also surfacing as an unhandled promise rejection, since
  // CommentSidebar's buttons call them fire-and-forget (no try/catch of
  // their own).
  const handleDelete = id => deleteComment(id).catch(() => {})
  const handleSetResolved = (id, resolved) => setResolved(id, resolved).catch(() => {})
  const isInAppDraft = !document.file_path && !!document.content
  const canPreviewFile = !!document.file_path && document.file_path.toLowerCase().endsWith('.pdf')
  // 'pending' isn't converted yet -- the backend converts it lazily on this
  // very request (see DocumentController::preview()), so it still needs to
  // go through PdfViewer (which already has its own loading/error states)
  // rather than straight to the download-only fallback.
  const canPreview = canPreviewFile || document.preview_status === 'ready' || document.preview_status === 'pending'

  const [pageNumber, setPageNumber] = useState(1)
  const [numPages, setNumPages] = useState(0)
  // Passed to PdfViewer so it observes scroll position on THIS element
  // (the one actually scrolling) instead of a second one nested inside it.
  const bodyScrollRef = useRef(null)
  const [draft, setDraft] = useState(null)
  const [activeCommentId, setActiveCommentId] = useState(null)
  const [previousVersion, setPreviousVersion] = useState(null)
  const [showDiff, setShowDiff] = useState(false)
  // The in-app draft content (dangerouslySetInnerHTML, static) and the live
  // editor it was written in are two different DOM trees, so React can't
  // just share the editor's page breaks -- this ref lets the exact same
  // pagination function (./pagination.js) run against THIS tree too.
  const draftContentRef = useRef(null)

  // Runs the identical measurement RichTextEditor uses, against this
  // read-only content, so a page break here is the same break shown while
  // editing -- not a different approximation (a flat CSS padding that
  // ignored the real margin preset, and a static rule that only knew about
  // forced breaks, not ones the real content naturally overflows into).
  // Confirmed: those two gaps meant Edit and View could show the same
  // document with different text wrapping and different breaks entirely,
  // not just a styling mismatch. Per-document margins aren't saved, so this
  // assumes the editor's default (Thesis) preset -- the same assumption the
  // editor itself starts from.
  useEffect(() => {
    if (!isInAppDraft || !draftContentRef.current) return
    markStructuralPageBreaks(draftContentRef.current)
    paginate(draftContentRef.current, DEFAULT_MARGINS)
  }, [isInAppDraft, document.content])

  useEffect(() => {
    if (document.version <= 1) { setPreviousVersion(null); return }
    api.get('/documents').then(res => {
      const prev = res.data.find(d =>
        d.project_id === document.project_id && d.type === document.type && d.version === document.version - 1
      )
      setPreviousVersion(prev || null)
    })
  }, [document.id, document.project_id, document.type, document.version])

  const annotations = useMemo(() => comments.map((c, i) => ({
    id: c.id,
    index: i + 1,
    pageNumber: c.page_number,
    resolved: c.status === 'resolved',
    title: c.comment,
    anchor: c.anchor,
  })), [comments])

  const handleSelection = ({ pageNumber: p, selectedText, anchor }) => {
    setDraft({ pageNumber: p, selectedText, anchor })
  }

  const handlePageClick = ({ pageNumber: p, anchor }) => {
    setDraft({ pageNumber: p, selectedText: null, anchor })
  }

  const handleSubmitDraft = async ({ pageNumber: p, selectedText, anchor, comment }) => {
    await addComment({ pageNumber: p, selectedText, anchor, comment })
    setDraft(null)
  }

  const handleAnnotationClick = annotation => {
    setActiveCommentId(annotation.id)
    setPageNumber(annotation.pageNumber)
  }

  const handleSelectComment = c => {
    setActiveCommentId(c.id)
    setPageNumber(c.page_number)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'stretch' }}>
      <div style={{ width: '100vw', height: '100vh', background: '#fff', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#0a1f44,#1040a0)', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Document Review</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Version {document.version} — {document.uploader?.name}</div>
            {document.created_at && (
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '2px' }}>
                Uploaded {new Date(document.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {canPreview && numPages > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '6px', cursor: pageNumber <= 1 ? 'default' : 'pointer', opacity: pageNumber <= 1 ? 0.4 : 1 }}>‹</button>
                <span style={{ fontSize: '12px', color: '#fff' }}>Page {pageNumber} / {numPages}</span>
                <button onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} disabled={pageNumber >= numPages}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '6px', cursor: pageNumber >= numPages ? 'default' : 'pointer', opacity: pageNumber >= numPages ? 0.4 : 1 }}>›</button>
              </div>
            )}
            {previousVersion && (
              <button onClick={() => setShowDiff(true)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                ⇄ Compare with v{previousVersion.version}
              </button>
            )}
            {isInAppDraft && (
              <button onClick={() => window.print()} title="Opens your browser's print dialog, with real A4 pagination -- this is an accurate preview of what printing or saving as PDF actually produces, not an on-screen approximation"
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                🖨 Print
              </button>
            )}
            {onEdit && (
              <button onClick={onEdit}
                style={{ background: '#fff', border: 'none', color: '#0a1f44', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                ✏️ Edit
              </button>
            )}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>✕</button>
          </div>
        </div>

        {statusActions && (
          <div style={{ padding: '12px 22px', borderBottom: '1px solid #f8fafc', flexShrink: 0 }}>
            {statusActions}
          </div>
        )}

        {/* Body */}
        <div className="dg-viewer-body" style={{ flex: 1 }}>
          <div ref={bodyScrollRef} style={{ flex: 1, overflowY: 'auto', padding: canPreview ? '20px' : 0, background: '#f1f5f9' }}>
            {isInAppDraft ? (
              <>
                {/* The actual page-break spacers are inserted into
                    draftContentRef's DOM by the effect above, which calls
                    the exact same pagination.js functions RichTextEditor
                    uses -- not a separate CSS approximation of them. Only
                    the print override is still a plain CSS rule here: real
                    print pagination doesn't need (or want) the on-screen
                    spacer, same as in the editor. */}
                <style>{`
                  @media print {
                    body * { visibility: hidden; }
                    .dg-print-area, .dg-print-area * { visibility: visible; }
                    .dg-print-area { position: absolute; left: 0; top: 0; width: 100%; }
                    @page { size: A4; margin: 1in 1in 1in 1.5in; }
                    .dg-draft-content { max-width: none !important; box-shadow: none !important; padding: 0 !important; }
                    .dg-draft-content [data-page-break] { page-break-before: always; }
                    .dg-draft-content [data-page-spacer] { display: none !important; }
                  }
                `}</style>
                <div
                  ref={draftContentRef}
                  className="dg-draft-content dg-print-area"
                  style={{
                    boxSizing: 'border-box', background: '#fff', borderRadius: '10px',
                    padding: `${DEFAULT_MARGINS.top}px ${DEFAULT_MARGINS.right}px ${DEFAULT_MARGINS.bottom}px ${DEFAULT_MARGINS.left}px`,
                    maxWidth: '820px', margin: '0 auto', fontSize: '13px', lineHeight: '1.7', color: '#0f172a',
                  }}
                  dangerouslySetInnerHTML={{ __html: document.content }}
                />
              </>
            ) : canPreview ? (
              <PdfViewer
                documentId={document.id}
                scrollContainerRef={bodyScrollRef}
                pageNumber={pageNumber}
                onPageCountChange={setNumPages}
                onPageNumberChange={setPageNumber}
                onSelection={handleSelection}
                onPageClick={handlePageClick}
                annotations={annotations}
                onAnnotationClick={handleAnnotationClick}
                activeAnnotationId={activeCommentId}
                pendingDraft={draft}
                onSubmitDraft={handleSubmitDraft}
                onCancelDraft={() => setDraft(null)}
              />
            ) : (
              <NonPdfFallback documentId={document.id} fileName={document.file_path?.split('/').pop()} previewStatus={document.preview_status} />
            )}
          </div>
          <div className="dg-viewer-sidebar" style={{ borderLeft: '1px solid #e8ecf2', overflowY: 'auto', padding: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px' }}>
              Comments ({comments.length})
            </div>
            {commentsError && (
              <div style={{ fontSize: '11px', color: '#dc2626', background: '#fee2e2', borderRadius: '6px', padding: '6px 8px', marginBottom: '10px' }}>{commentsError}</div>
            )}
            <CommentSidebar
              comments={comments}
              currentUserId={user.id}
              canResolve={canResolve}
              onSelect={handleSelectComment}
              onDelete={handleDelete}
              onSetResolved={handleSetResolved}
              activeCommentId={activeCommentId}
            />
          </div>
        </div>
      </div>

      {showDiff && previousVersion && (
        <DocumentDiffViewer oldDocument={previousVersion} newDocument={document} onClose={() => setShowDiff(false)} />
      )}
    </div>
  )
}
