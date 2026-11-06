import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { sanitizeHtml } from '../../../utils/sanitizeHtml'
import { useAuth } from '../../../context/AuthContext'
import { buildQuote, locateQuote, textOffsetOf, wrapOffsets, unwrapMarks } from '../../../utils/commentAnchor'
import { useDocumentComments } from '../../../hooks/useDocumentComments'
import { useProjectChannel } from '../../../hooks/useProjectChannel'
import api from '../../../api/axios'
import PdfViewer from './PdfViewer'
import CommentComposer from './CommentComposer'
import CommentSidebar from './CommentSidebar'
import DocumentDiffViewer from './DocumentDiffViewer'
import { PAGE_W, DEFAULT_MARGINS, markStructuralPageBreaks, paginate } from './pagination'

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

const toAnnotation = (c, i) => ({
  id: c.id, index: i + 1, pageNumber: c.page_number, resolved: c.status === 'resolved',
  title: c.comment, anchor: c.anchor, originVersion: c.origin_version,
})

// Composition root for in-app document review: renders the PDF, lets the
// viewer pin comments to selected text or clicked points, and lists them in
// a sidebar with resolve/delete actions. Shared by PageDocumentReview (adviser
// / instructor review) and PageSubmit (student's own document view).
export default function DocumentReviewViewer({ document, onClose, statusActions = null, onEdit = null }) {
  const { user } = useAuth()
  // Faculty raise comments; students answer in the thread (the API enforces
  // this too). Selecting text as a student just selects text.
  const canComment = ['adviser', 'instructor', 'panelist', 'admin'].includes(user?.role)
  const commentApi = useDocumentComments(document.id)
  const { comments, error: commentsError, addComment, reload: reloadComments } = commentApi
  // Live updates: another reviewer's comment (or resolve/delete) on THIS
  // document shows up immediately instead of only on next open/refresh.
  useProjectChannel(document.project_id, type => {
    // Not filtered to this document id: unresolved comments carried over
    // from earlier versions of this chapter live on those versions.
    if (typeof type === 'string' && type.startsWith('comment_')) {
      reloadComments()
    }
  })
  const isInAppDraft = !document.file_path && !!document.content
  const safeDraftHtml = useMemo(() => (isInAppDraft ? sanitizeHtml(document.content) : ''), [isInAppDraft, document.content])
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
  // Every saved version of this chapter -- a student's correction must point
  // at one that's newer than where the comment was made.
  const [chapterVersions, setChapterVersions] = useState([])
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

  const loadVersions = useCallback(() => api.get('/documents').then(res => {
    const versions = res.data.filter(d => d.project_id === document.project_id && d.type === document.type)
    setChapterVersions(versions)
    setPreviousVersion(versions.find(d => d.version === document.version - 1) || null)
  }).catch(() => {}), [document.project_id, document.type, document.version])
  useEffect(() => { loadVersions() }, [loadVersions])
  // A new version saved while this is open shows up in "Revised version".
  useProjectChannel(document.project_id, type => { if (type === 'document_uploaded') loadVersions() })

  // Comments made on THIS version keep their exact highlight; unresolved
  // ones carried over from earlier versions are located by their quoted text
  // (PDF: PdfViewer, drafts: the effect below) or flagged for review.
  const annotations = useMemo(() => comments.map(toAnnotation).filter((a, i) => !comments[i].carried), [comments])
  // Any carried comment with stored text can be looked for -- including one
  // made on an in-app draft when this version is an uploaded PDF.
  const carriedPdf = useMemo(() => comments.map(toAnnotation).filter((a, i) => comments[i].carried && a.anchor?.quote?.exact), [comments])
  const [pdfRelocated, setPdfRelocated] = useState({})
  const [htmlLocated, setHtmlLocated] = useState({})

  // Per comment: 'here' (made on this version), 'relocated' (found in this
  // version), 'needs_review' (its text can't be found), 'locating'.
  const anchorStates = useMemo(() => {
    const out = {}
    comments.forEach(c => {
      if (isInAppDraft && c.anchor?.quote?.exact) {
        out[c.id] = htmlLocated[c.id] === undefined ? 'locating'
          : htmlLocated[c.id] ? (c.carried ? 'relocated' : 'here') : 'needs_review'
      } else if (!c.carried) {
        out[c.id] = 'here'
      } else if (isInAppDraft || !c.anchor?.quote) {
        // Older comments stored only a position, not their text -- nothing to search for.
        out[c.id] = 'needs_review'
      } else {
        out[c.id] = !(c.id in pdfRelocated) ? 'locating' : pdfRelocated[c.id] ? 'relocated' : 'needs_review'
      }
    })
    return out
  }, [comments, htmlLocated, pdfRelocated, isInAppDraft])

  // ── In-app drafts: select text to comment, highlights drawn in place ──
  const draftWrapRef = useRef(null)
  const [htmlDraft, setHtmlDraft] = useState(null)

  const handleDraftMouseUp = () => {
    if (!canComment) return
    const root = draftContentRef.current
    const sel = window.getSelection()
    if (!root || !sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return
    const exact = range.toString()
    if (!exact.trim()) return

    // The top-level paragraph the selection starts in, and its stable id.
    let block = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement
    while (block && block.parentElement !== root) block = block.parentElement
    const blockId = block?.getAttribute?.('data-block-id') || null
    const start = block ? textOffsetOf(block, range.startContainer, range.startOffset) : textOffsetOf(root, range.startContainer, range.startOffset)
    const context = block ? block.textContent : root.textContent
    const quote = buildQuote(context, start, start + exact.length)

    // Which visual page: page-spacers before this paragraph + 1.
    let page = 1
    for (let el = block?.previousElementSibling; el; el = el.previousElementSibling) {
      if (el.hasAttribute('data-page-spacer')) page++
    }

    const box = range.getBoundingClientRect(), wrap = draftWrapRef.current.getBoundingClientRect()
    setHtmlDraft({
      pageNumber: page,
      selectedText: exact.trim(),
      anchor: { v: 2, kind: 'html', block_id: blockId, quote, start, end: start + exact.length },
      position: { top: box.bottom - wrap.top + 6, left: Math.max(0, Math.min(box.left - wrap.left, wrap.width - 330)) },
    })
  }

  const submitHtmlDraft = async ({ pageNumber: p, selectedText, anchor, comment }) => {
    await addComment({ pageNumber: p, selectedText, anchor, comment })
    setHtmlDraft(null)
    window.getSelection()?.removeAllRanges()
  }

  // Draw (and re-draw) every draft comment's highlight. Runs in a frame
  // callback, after pagination has laid the content out.
  useEffect(() => {
    if (!isInAppDraft) return
    const frame = requestAnimationFrame(() => {
      const root = draftContentRef.current
      if (!root) return
      unwrapMarks(root)
      const found = {}
      comments.forEach(c => {
        const a = c.anchor
        // Draft comments (by paragraph id + text) and PDF comments carried
        // onto a draft version (by text) alike.
        if (!a?.quote?.exact) return
        const cls = `tg-cmark${c.status === 'resolved' ? ' tg-cmark-resolved' : ''}${c.carried ? ' tg-cmark-carried' : ''}`
        const attrs = { 'data-comment-id': String(c.id), class: cls, title: c.comment }
        // 1) its own paragraph (by id), 2) anywhere -- the paragraph may have moved.
        const block = a.block_id ? root.querySelector(`[data-block-id="${CSS.escape(a.block_id)}"]`) : null
        let hit = block ? locateQuote(block.textContent, a.quote, a.start) : null
        if (hit) {
          wrapOffsets(block, hit.start, hit.end, attrs)
        } else if ((hit = locateQuote(root.textContent, a.quote))) {
          wrapOffsets(root, hit.start, hit.end, attrs)
        }
        found[c.id] = !!hit
      })
      setHtmlLocated(found)
    })
    return () => cancelAnimationFrame(frame)
  }, [isInAppDraft, safeDraftHtml, comments])

  useEffect(() => {
    const root = draftContentRef.current
    if (!isInAppDraft || !root) return
    root.querySelectorAll('mark.tg-cmark').forEach(m => m.classList.toggle('tg-cmark-active', m.dataset.commentId === String(activeCommentId)))
  }, [isInAppDraft, activeCommentId, htmlLocated])

  const handleDraftClick = e => {
    const mark = e.target.closest?.('mark[data-comment-id]')
    if (mark) setActiveCommentId(Number(mark.dataset.commentId))
  }

  const handleSelection = ({ pageNumber: p, selectedText, anchor }) => {
    if (!canComment) return
    setDraft({ pageNumber: p, selectedText, anchor })
  }

  const handlePageClick = ({ pageNumber: p, anchor }) => {
    if (!canComment) return
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
    if (isInAppDraft) {
      draftContentRef.current?.querySelector(`mark[data-comment-id="${c.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      setPageNumber(pdfRelocated[c.id]?.pageNumber || c.page_number)
    }
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
                    .dg-draft-content { max-width: none !important; width: auto !important; background: none !important; box-shadow: none !important; padding: 0 !important; }
                    .dg-draft-content [data-page-break] { page-break-before: always; }
                    .dg-draft-content [data-page-spacer] { display: none !important; }
                  }
                `}</style>
                <style>{`
                  mark.tg-cmark { background: rgba(245,195,0,0.35); color: inherit; border-radius: 2px; cursor: pointer; padding: 0; }
                  mark.tg-cmark-resolved { background: rgba(5,150,105,0.22); }
                  mark.tg-cmark-carried { background: rgba(245,195,0,0.22); border-bottom: 2px dashed rgba(180,130,0,0.9); }
                  mark.tg-cmark-active { background: rgba(245,195,0,0.65); outline: 2px solid rgba(217,119,6,0.9); }
                  @media print { mark.tg-cmark { background: none !important; outline: none !important; border: none !important; } }
                `}</style>
                <div ref={draftWrapRef} style={{ position: 'relative', width: `${PAGE_W}px`, margin: '0 auto' }}>
                <div
                  ref={draftContentRef}
                  onMouseUp={handleDraftMouseUp}
                  onClick={handleDraftClick}
                  className="dg-draft-content dg-print-area"
                  style={{
                    boxSizing: 'border-box',
                    // No `background` key here on purpose -- see the same
                    // note in RichTextEditor.jsx: paginate() sets
                    // root.style.background directly from the real gutter
                    // positions it just measured in THIS tree, and a React
                    // style prop here would stomp that on every re-render.
                    boxShadow: '0 1px 3px rgba(15,23,42,0.12), 0 10px 28px rgba(15,23,42,0.08)',
                    padding: `${DEFAULT_MARGINS.top}px ${DEFAULT_MARGINS.right}px ${DEFAULT_MARGINS.bottom}px ${DEFAULT_MARGINS.left}px`,
                    width: `${PAGE_W}px`, margin: '0 auto', fontSize: '13px', lineHeight: '1.7', color: '#0f172a',
                  }}
                  // Student-written HTML shown to faculty: always cleaned.
                  dangerouslySetInnerHTML={{ __html: safeDraftHtml }}
                />
                {htmlDraft && (
                  <CommentComposer draft={htmlDraft} onSubmit={submitHtmlDraft} onCancel={() => setHtmlDraft(null)} />
                )}
                </div>
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
                carried={carriedPdf}
                onRelocated={setPdfRelocated}
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
              anchorStates={anchorStates}
              chapterVersions={chapterVersions}
              actions={commentApi}
              onSelect={handleSelectComment}
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
