import { useState, useEffect, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url'
import 'pdfjs-dist/web/pdf_viewer.css'
import api from '../../../api/axios'
import CommentComposer from './CommentComposer'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

// Renders one page of a PDF at a time with a selectable text layer, and lets
// the parent know when the user selects text (to anchor a comment to that
// text) or clicks empty space (to pin a comment to a point, e.g. on a figure).
// Comments anchored to a text selection are shown as a colored highlight over
// the exact span (Google Docs style), not just a marker.
export default function PdfViewer({ documentId, pageNumber, onPageCountChange, onSelection, onPageClick, annotations = [], onAnnotationClick, activeAnnotationId, pendingDraft, onSubmitDraft, onCancelDraft }) {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const canvasRef = useRef(null)
  const textLayerRef = useRef(null)
  const pageContainerRef = useRef(null)
  const renderTaskRef = useRef(null)
  // The browser fires `click` right after `mouseup`, by which point mouseup has
  // already cleared the selection — so the click handler can't tell a drag-select
  // apart from a plain click by re-reading window.getSelection(). This ref is set
  // synchronously when mouseup just handled a real selection, so the following
  // click can skip dropping a point-anchor comment on top of it.
  const justSelectedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    api.get(`/documents/${documentId}/preview`, { responseType: 'arraybuffer' })
      .then(res => pdfjsLib.getDocument({ data: res.data }).promise)
      .then(doc => {
        if (cancelled) return
        setPdfDoc(doc)
        onPageCountChange?.(doc.numPages)
      })
      .catch(() => { if (!cancelled) setError('Could not load this document for preview.') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [documentId])

  useEffect(() => {
    if (!pdfDoc || !pageNumber) return
    let cancelled = false

    pdfDoc.getPage(pageNumber).then(async page => {
      if (cancelled) return
      const containerWidth = pageContainerRef.current?.clientWidth || 700
      const unscaledViewport = page.getViewport({ scale: 1 })
      const scale = containerWidth / unscaledViewport.width
      const viewport = page.getViewport({ scale })

      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      canvas.width = viewport.width
      canvas.height = viewport.height

      if (renderTaskRef.current) renderTaskRef.current.cancel()
      const task = page.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = task
      await task.promise.catch(() => {})

      if (cancelled) return
      const textLayerDiv = textLayerRef.current
      textLayerDiv.innerHTML = ''
      textLayerDiv.style.width = `${viewport.width}px`
      textLayerDiv.style.height = `${viewport.height}px`

      const textContent = await page.getTextContent()
      if (cancelled) return
      pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
        textDivs: [],
      })
    })

    return () => { cancelled = true }
  }, [pdfDoc, pageNumber])

  const pageAnnotations = annotations.filter(a => a.pageNumber === pageNumber)

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection()
    const text = sel?.toString()?.trim()
    if (!text || sel.rangeCount === 0) return

    const containerRect = pageContainerRef.current.getBoundingClientRect()
    const rects = Array.from(sel.getRangeAt(0).getClientRects())
      .filter(r => r.width > 0 && r.height > 0)
      .map(r => ({
        x: (r.left - containerRect.left) / containerRect.width,
        y: (r.top - containerRect.top) / containerRect.height,
        width: r.width / containerRect.width,
        height: r.height / containerRect.height,
      }))

    if (rects.length === 0) return
    justSelectedRef.current = true
    onSelection?.({ pageNumber, selectedText: text, anchor: rects })
    sel.removeAllRanges()
  }, [pageNumber, onSelection])

  const handleContainerClick = useCallback(e => {
    // A click that follows a text drag-selection shouldn't also drop a blank pin.
    if (justSelectedRef.current) {
      justSelectedRef.current = false
      return
    }
    const containerRect = pageContainerRef.current.getBoundingClientRect()
    const x = (e.clientX - containerRect.left) / containerRect.width
    const y = (e.clientY - containerRect.top) / containerRect.height

    // Existing highlight overlays are pointer-events:none (so they don't block
    // drag-selecting new text underneath/across them — see the rects below),
    // so a click on already-annotated text lands here instead of on the
    // overlay's own onClick. Check manually before treating it as a blank pin.
    const hit = pageAnnotations.find(a => Array.isArray(a.anchor) && a.anchor.some(r =>
      x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
    ))
    if (hit) {
      onAnnotationClick?.(hit)
      return
    }

    onPageClick?.({ pageNumber, anchor: { x, y } })
  }, [pageNumber, onPageClick, onAnnotationClick, pageAnnotations])

  const pendingRects = Array.isArray(pendingDraft?.anchor) ? pendingDraft.anchor : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <style>{`
        @keyframes annotationPulse {
          0%   { filter: brightness(1); }
          30%  { filter: brightness(1.4); }
          100% { filter: brightness(1); }
        }
        @keyframes pinPulse {
          0%   { transform: translate(-50%, -50%) scale(1); }
          30%  { transform: translate(-50%, -50%) scale(1.25); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
        .annotation-pulse { animation: annotationPulse 0.6s ease-out; }
        .pin-pulse { animation: pinPulse 0.6s ease-out; }
      `}</style>
      {loading && <div style={{ padding: '40px', color: '#94a3b8', fontSize: '13px' }}>Loading document…</div>}
      {error && <div style={{ padding: '40px', color: '#dc2626', fontSize: '13px' }}>{error}</div>}
      <div
        ref={pageContainerRef}
        onMouseUp={handleMouseUp}
        onClick={handleContainerClick}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '700px',
          display: loading || error ? 'none' : 'block',
          boxShadow: '0 2px 12px rgba(10,31,68,0.12)',
          cursor: 'text',
        }}
      >
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
        <div ref={textLayerRef} className="textLayer" style={{ position: 'absolute', top: 0, left: 0 }} />

        {/* Text-span highlights (Google Docs style) + point pins for existing comments */}
        {pageAnnotations.map(a => {
          const isActive = a.id === activeAnnotationId
          const rects = Array.isArray(a.anchor) ? a.anchor : null

          if (rects) {
            const color = a.resolved ? '5,150,105' /* green */ : '245,195,0' /* amber */
            return (
              <div key={a.id}>
                {rects.map((r, i) => (
                  <div
                    // Remounting on activation restarts the pulse animation each time it's jumped to.
                    key={`${i}-${isActive}`}
                    title={a.title}
                    className={isActive ? 'annotation-pulse' : undefined}
                    style={{
                      position: 'absolute',
                      left: `${r.x * 100}%`,
                      top: `${r.y * 100}%`,
                      width: `${r.width * 100}%`,
                      height: `${r.height * 100}%`,
                      background: `rgba(${color},${isActive ? 0.55 : 0.32})`,
                      outline: isActive ? `2px solid rgba(${color},0.9)` : 'none',
                      // Clickable via handleContainerClick's own hit-testing instead of a
                      // native onClick here — a pointer-events:auto div sitting on top of
                      // the text layer blocks the browser's native drag-selection hit-testing
                      // from reaching the text underneath, which made new selections that
                      // passed over an existing highlight snap to its edge instead of
                      // following the cursor.
                      pointerEvents: 'none',
                      zIndex: 5,
                      borderRadius: '2px',
                    }}
                  />
                ))}
                {/* Numbered badge at the start of the highlighted span */}
                <button
                  key={`badge-${isActive}`}
                  onClick={e => { e.stopPropagation(); onAnnotationClick?.(a) }}
                  title={a.title}
                  className={isActive ? 'pin-pulse' : undefined}
                  style={{
                    position: 'absolute',
                    left: `${rects[0].x * 100}%`,
                    top: `${rects[0].y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: '2px solid #fff',
                    background: a.resolved ? '#059669' : '#dc2626',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                  }}
                >
                  {a.index}
                </button>
              </div>
            )
          }

          // Point-only anchor (clicked blank space, e.g. on a figure)
          const point = a.anchor || { x: 0.5, y: 0.05 }
          return (
            <button
              key={`${a.id}-${isActive}`}
              onClick={e => { e.stopPropagation(); onAnnotationClick?.(a) }}
              title={a.title}
              className={isActive ? 'pin-pulse' : undefined}
              style={{
                position: 'absolute',
                left: `${point.x * 100}%`,
                top: `${point.y * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                border: isActive ? '2px solid #f5c300' : '2px solid #fff',
                background: a.resolved ? '#059669' : '#dc2626',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              }}
            >
              {a.index}
            </button>
          )
        })}

        {/* Live highlight for the comment currently being composed, before it's saved */}
        {pendingRects && pendingRects.map((r, i) => (
          <div
            key={`pending-${i}`}
            style={{
              position: 'absolute',
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.width * 100}%`,
              height: `${r.height * 100}%`,
              background: 'rgba(29,78,216,0.35)',
              outline: '2px solid rgba(29,78,216,0.8)',
              zIndex: 6,
              borderRadius: '2px',
              pointerEvents: 'none',
            }}
          />
        ))}

        {pendingDraft && (
          <CommentComposer draft={pendingDraft} onSubmit={onSubmitDraft} onCancel={onCancelDraft} />
        )}
      </div>
    </div>
  )
}
