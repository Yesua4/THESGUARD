import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url'
import 'pdfjs-dist/web/pdf_viewer.css'
import api from '../../../api/axios'
import CommentComposer from './CommentComposer'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

// How far past the visible area (in px) a page starts rendering, so it's
// already drawn by the time the user scrolls to it instead of popping in.
const PRELOAD_MARGIN = '1000px 0px'

// One page of the continuous-scroll document: a canvas + selectable text
// layer, rendered only once it's within PRELOAD_MARGIN of the viewport
// (reported by the parent's single IntersectionObserver via `visible`).
// Everything here is unchanged from the old single-page PdfViewer, just
// scoped to one page's own pageNumber/refs instead of a shared one.
function Page({ pdfDoc, pageNumber, visible, width, fallbackHeight, onMeasured, annotations, onAnnotationClick, activeAnnotationId, pendingDraft, onSelection, onPageClick, onSubmitDraft, onCancelDraft }) {
  const [rendered, setRendered] = useState(false)
  const [height, setHeight] = useState(null)
  const canvasRef = useRef(null)
  const textLayerRef = useRef(null)
  const pageContainerRef = useRef(null)
  const renderTaskRef = useRef(null)
  const justSelectedRef = useRef(false)

  useEffect(() => {
    if (!visible || rendered || !width) return
    let cancelled = false

    pdfDoc.getPage(pageNumber).then(async page => {
      if (cancelled) return
      const unscaledViewport = page.getViewport({ scale: 1 })
      const scale = width / unscaledViewport.width
      const viewport = page.getViewport({ scale })

      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      canvas.width = viewport.width
      canvas.height = viewport.height
      setHeight(viewport.height)
      onMeasured?.(pageNumber, viewport.height)

      if (renderTaskRef.current) renderTaskRef.current.cancel()
      const task = page.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = task
      await task.promise.catch(() => {})
      if (cancelled) return

      const textLayerDiv = textLayerRef.current
      if (!textLayerDiv) return
      textLayerDiv.innerHTML = ''
      textLayerDiv.style.width = `${viewport.width}px`
      textLayerDiv.style.height = `${viewport.height}px`

      const textContent = await page.getTextContent()
      if (cancelled) return
      pdfjsLib.renderTextLayer({ textContentSource: textContent, container: textLayerDiv, viewport, textDivs: [] })

      if (!cancelled) setRendered(true)
    })

    return () => { cancelled = true }
  }, [visible, rendered, width, pdfDoc, pageNumber])

  const pageAnnotations = annotations.filter(a => a.pageNumber === pageNumber)
  const pendingRects = pendingDraft && Array.isArray(pendingDraft.anchor) ? pendingDraft.anchor : null

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
    if (justSelectedRef.current) { justSelectedRef.current = false; return }
    const containerRect = pageContainerRef.current.getBoundingClientRect()
    const x = (e.clientX - containerRect.left) / containerRect.width
    const y = (e.clientY - containerRect.top) / containerRect.height

    const hit = pageAnnotations.find(a => Array.isArray(a.anchor) && a.anchor.some(r =>
      x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
    ))
    if (hit) { onAnnotationClick?.(hit); return }

    onPageClick?.({ pageNumber, anchor: { x, y } })
  }, [pageNumber, onPageClick, onAnnotationClick, pageAnnotations])

  return (
    <div
      ref={pageContainerRef}
      data-page-number={pageNumber}
      onMouseUp={rendered ? handleMouseUp : undefined}
      onClick={rendered ? handleContainerClick : undefined}
      style={{
        position: 'relative',
        width: `${width}px`,
        maxWidth: '100%',
        // Placeholder height until this page actually renders: another
        // page's real measured height is a better guess than a generic
        // ratio, since every page in one exported document is the same size.
        height: height || fallbackHeight || width * 1.294,
        margin: '0 auto 16px',
        background: '#fff',
        boxShadow: '0 2px 12px rgba(10,31,68,0.12)',
        cursor: rendered ? 'text' : 'default',
      }}
    >
      {!rendered && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: '11px' }}>
          {visible ? 'Loading…' : null}
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: rendered ? 'block' : 'none', width: '100%' }} />
      <div ref={textLayerRef} className="textLayer" style={{ position: 'absolute', top: 0, left: 0 }} />

      {pageAnnotations.map(a => {
        const isActive = a.id === activeAnnotationId
        const rects = Array.isArray(a.anchor) ? a.anchor : null

        if (rects) {
          const color = a.resolved ? '5,150,105' : '245,195,0'
          return (
            <div key={a.id}>
              {rects.map((r, i) => (
                <div
                  key={`${i}-${isActive}`}
                  title={a.title}
                  className={isActive ? 'annotation-pulse' : undefined}
                  style={{
                    position: 'absolute', left: `${r.x * 100}%`, top: `${r.y * 100}%`,
                    width: `${r.width * 100}%`, height: `${r.height * 100}%`,
                    background: `rgba(${color},${isActive ? 0.55 : 0.32})`,
                    outline: isActive ? `2px solid rgba(${color},0.9)` : 'none',
                    pointerEvents: 'none', zIndex: 5, borderRadius: '2px',
                  }}
                />
              ))}
              <button
                key={`badge-${isActive}`}
                onClick={e => { e.stopPropagation(); onAnnotationClick?.(a) }}
                title={a.title}
                className={isActive ? 'pin-pulse' : undefined}
                style={{
                  position: 'absolute', left: `${rects[0].x * 100}%`, top: `${rects[0].y * 100}%`,
                  transform: 'translate(-50%, -50%)', width: '20px', height: '20px', borderRadius: '50%',
                  border: '2px solid #fff', background: a.resolved ? '#059669' : '#dc2626', color: '#fff',
                  fontSize: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', zIndex: 10, boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                }}
              >
                {a.index}
              </button>
            </div>
          )
        }

        const point = a.anchor || { x: 0.5, y: 0.05 }
        return (
          <button
            key={`${a.id}-${isActive}`}
            onClick={e => { e.stopPropagation(); onAnnotationClick?.(a) }}
            title={a.title}
            className={isActive ? 'pin-pulse' : undefined}
            style={{
              position: 'absolute', left: `${point.x * 100}%`, top: `${point.y * 100}%`,
              transform: 'translate(-50%, -50%)', width: '24px', height: '24px', borderRadius: '50%',
              border: isActive ? '2px solid #f5c300' : '2px solid #fff', background: a.resolved ? '#059669' : '#dc2626',
              color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', zIndex: 10, boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            }}
          >
            {a.index}
          </button>
        )
      })}

      {pendingRects && pendingRects.map((r, i) => (
        <div
          key={`pending-${i}`}
          style={{
            position: 'absolute', left: `${r.x * 100}%`, top: `${r.y * 100}%`,
            width: `${r.width * 100}%`, height: `${r.height * 100}%`,
            background: 'rgba(29,78,216,0.35)', outline: '2px solid rgba(29,78,216,0.8)',
            zIndex: 6, borderRadius: '2px', pointerEvents: 'none',
          }}
        />
      ))}

      {pendingDraft && (
        <CommentComposer draft={pendingDraft} onSubmit={onSubmitDraft} onCancel={onCancelDraft} />
      )}
    </div>
  )
}

// Continuous-scroll PDF viewer (Google-Docs style: scroll past page
// boundaries instead of clicking next/prev). Pages render lazily -- only
// ones within PRELOAD_MARGIN of the scroll viewport actually draw their
// canvas/text layer, via one shared IntersectionObserver rooted on this
// component's own scroll container, so a long document (dozens+ of pages)
// doesn't pay the cost of rendering everything up front.
export default function PdfViewer({ documentId, pageNumber, onPageCountChange, onPageNumberChange, onSelection, onPageClick, annotations = [], onAnnotationClick, activeAnnotationId, pendingDraft, onSubmitDraft, onCancelDraft }) {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [containerWidth, setContainerWidth] = useState(700)
  const [naturalWidth, setNaturalWidth] = useState(null)
  const [visiblePages, setVisiblePages] = useState(() => new Set([1]))
  const [pageHeights, setPageHeights] = useState({})

  const scrollRef = useRef(null)
  const pageRefs = useRef({})
  // Distinguishes a `pageNumber` prop change caused by us reporting the
  // user's own scroll position back up, vs. a real external jump (nav
  // buttons, clicking an annotation) that should trigger an actual scroll.
  const lastReportedPage = useRef(1)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    api.get(`/documents/${documentId}/preview`, { responseType: 'arraybuffer' })
      .then(res => pdfjsLib.getDocument({ data: res.data }).promise)
      .then(async doc => {
        if (cancelled) return
        setPdfDoc(doc)
        setNumPages(doc.numPages)
        onPageCountChange?.(doc.numPages)

        const page1 = await doc.getPage(1)
        if (cancelled) return
        // PDF.js viewport units are 1/72in (print points); multiplying by
        // 96/72 gives the page's true CSS-pixel size at normal screen
        // density, so an A4 page renders at A4 size instead of being
        // stretched or squeezed to fit an arbitrary column width.
        const unscaled = page1.getViewport({ scale: 1 })
        setNaturalWidth(unscaled.width * (96 / 72))
      })
      .catch(() => { if (!cancelled) setError('Could not load this document for preview.') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [documentId])

  useEffect(() => {
    if (!scrollRef.current) return
    const available = scrollRef.current.clientWidth - 24
    // Never upscale past the page's true size -- only shrink to fit when
    // the viewer is narrower than that.
    setContainerWidth(naturalWidth ? Math.min(naturalWidth, available) : available)
  }, [pdfDoc, naturalWidth])

  // One observer watches every page wrapper: anything within PRELOAD_MARGIN
  // gets added to visiblePages (and stays rendered once drawn -- Page itself
  // never un-renders), and the entry closest to the top of the actual
  // viewport becomes the reported "current page".
  useEffect(() => {
    if (!pdfDoc || !numPages || !scrollRef.current) return

    const observer = new IntersectionObserver(entries => {
      setVisiblePages(prev => {
        const next = new Set(prev)
        entries.forEach(entry => {
          const n = Number(entry.target.dataset.pageNumber)
          if (entry.isIntersecting) next.add(n)
        })
        return next
      })

      const visible = entries.filter(e => e.isIntersecting)
      if (visible.length === 0) return
      const top = visible.reduce((best, e) => e.boundingClientRect.top < best.boundingClientRect.top ? e : best)
      const n = Number(top.target.dataset.pageNumber)
      if (n !== lastReportedPage.current) {
        lastReportedPage.current = n
        onPageNumberChange?.(n)
      }
    }, { root: scrollRef.current, rootMargin: PRELOAD_MARGIN, threshold: [0, 0.1, 0.5, 1] })

    Object.values(pageRefs.current).forEach(el => el && observer.observe(el))
    return () => observer.disconnect()
  }, [pdfDoc, numPages])

  // External jump request (nav buttons, clicking an annotation elsewhere in
  // the UI) -- scroll that page into view. Skipped when the prop change is
  // just our own scroll-position echo coming back around.
  useEffect(() => {
    if (!pageNumber || pageNumber === lastReportedPage.current) return
    const el = pageRefs.current[pageNumber]
    if (el) {
      lastReportedPage.current = pageNumber
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [pageNumber])

  const handleMeasured = useCallback((n, h) => {
    setPageHeights(prev => (prev[n] === h ? prev : { ...prev, [n]: h }))
  }, [])

  const pageNumbers = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages])
  // Uniform page height assumption for not-yet-measured placeholders --
  // reasonable for a single exported document where every page shares the
  // same size, and only affects scrollbar proportions until each page draws.
  const typicalHeight = Object.values(pageHeights)[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%' }}>
      <style>{`
        @keyframes annotationPulse { 0% { filter: brightness(1); } 30% { filter: brightness(1.4); } 100% { filter: brightness(1); } }
        @keyframes pinPulse { 0% { transform: translate(-50%, -50%) scale(1); } 30% { transform: translate(-50%, -50%) scale(1.25); } 100% { transform: translate(-50%, -50%) scale(1); } }
        .annotation-pulse { animation: annotationPulse 0.6s ease-out; }
        .pin-pulse { animation: pinPulse 0.6s ease-out; }
      `}</style>
      {loading && <div style={{ padding: '40px', color: '#94a3b8', fontSize: '13px' }}>Loading document…</div>}
      {error && <div style={{ padding: '40px', color: '#dc2626', fontSize: '13px' }}>{error}</div>}
      {!loading && !error && (
        <div ref={scrollRef} style={{ width: '100%', height: '100%', overflowY: 'auto' }}>
          {pageNumbers.map(n => (
            <div key={n} ref={el => { pageRefs.current[n] = el }} data-page-number={n}>
              <Page
                pdfDoc={pdfDoc}
                pageNumber={n}
                visible={visiblePages.has(n)}
                width={containerWidth}
                fallbackHeight={typicalHeight}
                onMeasured={handleMeasured}
                annotations={annotations}
                onAnnotationClick={onAnnotationClick}
                activeAnnotationId={activeAnnotationId}
                pendingDraft={pendingDraft && pendingDraft.pageNumber === n ? pendingDraft : null}
                onSelection={onSelection}
                onPageClick={onPageClick}
                onSubmitDraft={onSubmitDraft}
                onCancelDraft={onCancelDraft}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
