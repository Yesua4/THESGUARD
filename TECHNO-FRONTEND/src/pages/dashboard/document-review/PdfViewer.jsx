import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url'
import 'pdfjs-dist/web/pdf_viewer.css'
import api from '../../../api/axios'
import CommentComposer from './CommentComposer'
import Icon from '../../../components/Icon'
import { anchorRects, anchorPoint, buildQuote, locateQuote, textOffsetOf, rangeFromOffsets } from '../../../utils/commentAnchor'
import { SkeletonDocument, SkeletonLines } from '../../../components/Skeleton'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

// Released in empty space (past a line's end, in the margin, between
// paragraphs)? End the selection at the text next to the pointer -- the end
// of that line, or of the line just above a gap -- like Google Docs, instead
// of wherever the browser guessed.
function snapSelectionEnd(layer, sel, x, y) {
  if (!layer || !sel?.rangeCount) return
  const spans = [...layer.querySelectorAll('span')].filter(el => el.firstChild?.nodeType === 3 && el.textContent.trim())
  if (!spans.length) return
  const boxes = spans.map(el => ({ el, r: el.getBoundingClientRect() }))
  if (boxes.some(b => x >= b.r.left && x <= b.r.right && y >= b.r.top && y <= b.r.bottom)) return // on text: fine as is
  let line = boxes.filter(b => y >= b.r.top - 2 && y <= b.r.bottom + 2)
  if (!line.length) {
    // In a gap between lines: use the closest line above.
    const above = boxes.filter(b => b.r.bottom <= y)
    if (!above.length) return
    const bottom = Math.max(...above.map(b => b.r.bottom))
    line = above.filter(b => b.r.bottom >= bottom - 3)
  }
  const left = line.filter(b => b.r.right <= x + 1).sort((a, b) => b.r.right - a.r.right)[0]
  const target = left ? { node: left.el.firstChild, offset: left.el.firstChild.length }
    : { node: line.sort((a, b) => a.r.left - b.r.left)[0].el.firstChild, offset: 0 }
  try { sel.extend(target.node, target.offset) } catch { /* selection outside the layer */ }
}

// A selection's getClientRects() returns one box per text span (often per
// word). Merge boxes that sit on the same line and touch into one box per
// line, so a highlight reads as a clean band instead of a row of tiles.
function mergeLineRects(rects) {
  const sorted = [...rects].sort((a, b) => (a.y - b.y) || (a.x - b.x))
  const lines = []
  sorted.forEach(r => {
    const line = lines.find(l => Math.abs((l.y + l.height / 2) - (r.y + r.height / 2)) < Math.max(l.height, r.height) * 0.5
      && r.x <= l.x + l.width + 0.02 && r.x + r.width >= l.x - 0.02)
    if (line) {
      const x1 = Math.min(line.x, r.x), y1 = Math.min(line.y, r.y)
      const x2 = Math.max(line.x + line.width, r.x + r.width), y2 = Math.max(line.y + line.height, r.y + r.height)
      Object.assign(line, { x: x1, y: y1, width: x2 - x1, height: y2 - y1 })
    } else lines.push({ ...r })
  })
  return lines
}

// How far past the visible area (in px) a page starts rendering, so it's
// already drawn by the time the user scrolls to it instead of popping in.
const PRELOAD_MARGIN = '1000px 0px'

// One page of the continuous-scroll document: a canvas + selectable text
// layer, rendered only once it's within PRELOAD_MARGIN of the viewport
// (reported by the parent's single IntersectionObserver via `visible`).
// Everything here is unchanged from the old single-page PdfViewer, just
// scoped to one page's own pageNumber/refs instead of a shared one.
function Page({ pdfDoc, pageNumber, visible, width, fallbackHeight, onMeasured, annotations, textHighlights = [], onAnnotationClick, activeAnnotationId, hoverAnnotationId, focusSeq, commentEnabled = true, pendingDraft, onSelection, onPageClick, onSubmitDraft, onCancelDraft }) {
  const [rendered, setRendered] = useState(false)
  // Bumped each time this page's text layer finishes drawing, so highlights
  // located by text (comments carried over from an earlier version) can be
  // measured against the real text spans.
  const [textReady, setTextReady] = useState(0)
  const [located, setLocated] = useState({})
  const [height, setHeight] = useState(null)
  const canvasRef = useRef(null)
  const textLayerRef = useRef(null)
  const pageContainerRef = useRef(null)
  const renderTaskRef = useRef(null)
  const justSelectedRef = useRef(false)
  // Google Docs style: selecting text (or clicking a spot) only offers a
  // small "Comment" button; the comment box opens when that's clicked.
  const [offer, setOffer] = useState(null)
  const dismissedRef = useRef(false)

  useEffect(() => {
    if (!visible || rendered || !width) return

    pdfDoc.getPage(pageNumber).then(async page => {
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
      // A real render failure here used to be swallowed silently, which left
      // the page marked "rendered" with a blank canvas and no visible error
      // anywhere -- logging it is what actually surfaces the real cause the
      // next time this happens. RenderingCancelledException is expected
      // (fired by the unload effect's own task.cancel()) and not a bug.
      try {
        await task.promise
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`PDF page ${pageNumber} failed to render:`, err)
        }
        return
      }
      setRendered(true) // canvas painted -- show it even if the text layer below fails

      try {
        const textLayerDiv = textLayerRef.current
        if (!textLayerDiv) return
        textLayerDiv.innerHTML = ''
        textLayerDiv.style.width = `${viewport.width}px`
        textLayerDiv.style.height = `${viewport.height}px`
        // pdf.js positions each text span via calc(var(--scale-factor) * ...);
        // without this set on the container, it never throws loudly on its
        // own (the rejection below only surfaces because we now await it) --
        // it just silently renders every span at the wrong position.
        textLayerDiv.style.setProperty('--scale-factor', viewport.scale)

        const textContent = await page.getTextContent()
        const textLayerTask = pdfjsLib.renderTextLayer({ textContentSource: textContent, container: textLayerDiv, viewport, textDivs: [] })
        await textLayerTask.promise
        // Same trick as pdf.js's own viewer: an invisible block behind the
        // text that, while dragging, covers the page from the press point
        // down -- so when the mouse crosses a gap (between lines, past a
        // line's end, the margin) the selection stops there instead of
        // jumping to grab words you never dragged over.
        const end = document.createElement('div')
        end.className = 'endOfContent'
        textLayerDiv.append(end)
        setTextReady(n => n + 1)
      } catch (err) {
        console.error(`PDF page ${pageNumber} text layer failed:`, err)
      }
    })
  }, [visible, rendered, width, pdfDoc, pageNumber])

  // Release this page's canvas once it scrolls back out of the render
  // window. Without this, every page that was ever scrolled past stays
  // rendered forever -- on an 89-page document that's dozens of full-
  // resolution canvases alive at once, which eventually exceeds the
  // browser's total canvas memory budget. Chrome doesn't throw when that
  // happens; it silently blanks canvases (including ones far from where the
  // budget was exceeded), which is exactly the "pages just go blank" bug
  // this fixes. `height` is kept so the placeholder holds the same scroll
  // space instead of the page jumping when it unloads.
  useEffect(() => {
    if (visible || !rendered) return
    if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null }
    const canvas = canvasRef.current
    if (canvas) { canvas.width = 0; canvas.height = 0 }
    if (textLayerRef.current) textLayerRef.current.innerHTML = ''
    setRendered(false)
  }, [visible, rendered])

  // Turns text offsets (from locating a carried comment's quote) into
  // highlight boxes, measured from the text layer actually on screen.
  // Measured after layout (in a frame callback), once the text layer exists.
  const highlightsRef = useRef(textHighlights)
  useEffect(() => { highlightsRef.current = textHighlights })
  const highlightKey = textHighlights.map(h => `${h.id}:${h.start}-${h.end}`).join('|')
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const layer = textLayerRef.current, container = pageContainerRef.current
      if (!textReady || !layer || !container) return
      const box = container.getBoundingClientRect()
      const next = {}
      highlightsRef.current.forEach(h => {
        const range = rangeFromOffsets(layer, h.start, h.end)
        if (!range) return
        const rects = mergeLineRects(Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0).map(r => ({
          x: (r.left - box.left) / box.width, y: (r.top - box.top) / box.height,
          width: r.width / box.width, height: r.height / box.height,
        })))
        if (rects.length) next[h.id] = rects
      })
      setLocated(next)
    })
    return () => cancelAnimationFrame(frame)
  }, [textReady, highlightKey])

  const pageAnnotations = useMemo(() => [
    ...annotations.filter(a => a.pageNumber === pageNumber),
    // Located text highlights only while the page (and its text layer) is drawn.
    ...(rendered ? textHighlights.filter(h => located[h.id]).map(h => ({ ...h, anchor: located[h.id], carried: true })) : []),
  ], [annotations, textHighlights, located, rendered, pageNumber])
  const pendingRects = pendingDraft && anchorRects(pendingDraft.anchor) ? mergeLineRects(anchorRects(pendingDraft.anchor)) : null

  // pdf.js's selection fix (see the endOfContent element above).
  const handleMouseDown = useCallback(e => {
    if (!e.target.closest?.('[data-comment-offer]')) {
      dismissedRef.current = !!offer // this click just closes the open button
      setOffer(null)
    }
    justSelectedRef.current = false // a new press: any earlier drag is over
    const layer = textLayerRef.current
    const end = layer?.querySelector('.endOfContent')
    if (!layer || !end) return
    if (e.target !== layer) {
      const b = layer.getBoundingClientRect()
      end.style.top = `${(Math.max(0, (e.clientY - b.top) / b.height) * 100).toFixed(2)}%`
    }
    end.classList.add('active')
    const release = () => {
      end.style.top = ''
      end.classList.remove('active')
      window.removeEventListener('mouseup', release)
    }
    window.addEventListener('mouseup', release)
  }, [offer])

  const handleMouseUp = useCallback(e => {
    // Releasing the mouse on the "Add comment" button is not the end of a new
    // selection -- treating it as one stretched the selection out to the
    // button and pulled in words that were never chosen.
    if (e.target.closest?.('[data-comment-offer]')) return
    const sel = window.getSelection()
    if (sel?.rangeCount && !sel.isCollapsed) snapSelectionEnd(textLayerRef.current, sel, e.clientX, e.clientY)
    const text = sel?.toString()?.trim()
    if (!text || sel.rangeCount === 0) return

    const containerRect = pageContainerRef.current.getBoundingClientRect()
    const rects = mergeLineRects(Array.from(sel.getRangeAt(0).getClientRects())
      .filter(r => r.width > 0 && r.height > 0)
      .map(r => ({
        x: (r.left - containerRect.left) / containerRect.width,
        y: (r.top - containerRect.top) / containerRect.height,
        width: r.width / containerRect.width,
        height: r.height / containerRect.height,
      })))

    if (rects.length === 0) return
    justSelectedRef.current = true

    // Also remember WHAT was selected (the text + a little context and its
    // position in this page's text), so the comment can be found again in a
    // later version where the boxes no longer line up.
    let anchor = { v: 2, kind: 'pdf', rects }
    const layer = textLayerRef.current
    const range = sel.getRangeAt(0)
    if (layer && layer.contains(range.startContainer) && layer.contains(range.endContainer)) {
      const start = textOffsetOf(layer, range.startContainer, range.startOffset)
      const end = textOffsetOf(layer, range.endContainer, range.endOffset)
      if (end > start) anchor = { ...anchor, quote: buildQuote(layer.textContent, start, end), start, end }
    }
    if (!commentEnabled) return
    const last = rects[rects.length - 1]
    setOffer({ kind: 'text', selection: { pageNumber, selectedText: text, anchor }, x: last.x + last.width, y: last.y + last.height })
  }, [pageNumber, commentEnabled])

  const takeOffer = useCallback(() => {
    if (!offer) return
    if (offer.kind === 'text') { onSelection?.(offer.selection); window.getSelection()?.removeAllRanges() }
    else onPageClick?.({ pageNumber, anchor: offer.anchor })
    setOffer(null)
  }, [offer, onSelection, onPageClick, pageNumber])

  // A press anywhere outside this page (the grey area, the comment list...)
  // closes the button too.
  useEffect(() => {
    if (!offer) return
    const onDown = e => { if (!pageContainerRef.current?.contains(e.target)) setOffer(null) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [offer])

  // Ctrl+Alt+M (Google Docs' shortcut) opens the comment box for the offer.
  useEffect(() => {
    if (!offer) return
    const onKey = e => { if (e.ctrlKey && e.altKey && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); takeOffer() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [offer, takeOffer])

  const handleContainerClick = useCallback(e => {
    if (justSelectedRef.current) { justSelectedRef.current = false; return }
    const containerRect = pageContainerRef.current.getBoundingClientRect()
    const x = (e.clientX - containerRect.left) / containerRect.width
    const y = (e.clientY - containerRect.top) / containerRect.height

    const hit = pageAnnotations.find(a => (!a.resolved || a.id === activeAnnotationId) && anchorRects(a.anchor)?.some(r =>
      x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
    ))
    if (hit) { setOffer(null); onAnnotationClick?.(hit); return }
    if (e.target.closest?.('[data-comment-offer]')) return
    // A plain click: like Google Docs, nothing pops up. Commenters get a
    // small "Comment here" button for pinning a comment to that spot
    // (e.g. a figure without selectable text).
    if (dismissedRef.current) { dismissedRef.current = false; return }
    // On text, a click just places the cursor (as in Google Docs). On a
    // blank spot -- e.g. a figure -- offer to pin a comment there.
    if (e.target.closest?.('.textLayer span')) return
    if (commentEnabled && onPageClick) setOffer({ kind: 'point', anchor: { x, y }, x, y })
  }, [onPageClick, onAnnotationClick, pageAnnotations, commentEnabled, activeAnnotationId])

  // Selecting a comment in the list scrolls its highlighted words to the
  // middle of the screen (after the page itself has scrolled into view).
  const lastFocus = useRef(null)
  useEffect(() => {
    if (!focusSeq || lastFocus.current === focusSeq || !rendered) return
    if (!pageAnnotations.some(a => a.id === activeAnnotationId)) return
    lastFocus.current = focusSeq
    const t = setTimeout(() => {
      pageContainerRef.current?.querySelector(`[data-annot="${activeAnnotationId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 450)
    return () => clearTimeout(t)
  }, [focusSeq, rendered, pageAnnotations, activeAnnotationId])

  return (
    <div
      ref={pageContainerRef}
      data-page-number={pageNumber}
      onMouseDown={rendered ? handleMouseDown : undefined}
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
          {visible ? <div style={{ width: '70%' }}><SkeletonLines lines={6} /></div> : null}
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: rendered ? 'block' : 'none', width: '100%' }} />
      <div ref={textLayerRef} className="textLayer" style={{ position: 'absolute', top: 0, left: 0 }} />

      {pageAnnotations.map(a => {
        const isActive = a.id === activeAnnotationId
        const isHover = a.id === hoverAnnotationId
        // Like Google Docs: resolved comments leave no mark on the text
        // (they're still in the list, and show again when selected there).
        if (a.resolved && !isActive) return null
        const raw = anchorRects(a.anchor)
        const rects = raw ? mergeLineRects(raw) : null

        if (rects) {
          const color = a.resolved ? '5,150,105' : '245,195,0'
          const title = a.carried ? `From version ${a.originVersion}: ${a.title}` : a.title
          return (
            <div key={a.id}>
              {rects.map((r, i) => (
                <div
                  key={`${i}-${isActive}`}
                  data-annot={i === 0 ? a.id : undefined}
                  title={title}
                  className={isActive ? 'annotation-pulse' : undefined}
                  style={{
                    position: 'absolute', left: `${r.x * 100}%`, top: `${r.y * 100}%`,
                    width: `${r.width * 100}%`, height: `${r.height * 100}%`,
                    background: `rgba(${color},${isActive ? 0.55 : isHover ? 0.45 : 0.3})`,
                    // Carried over from an earlier version: dashed outline.
                    outline: isActive ? `2px solid rgba(${color},0.9)` : (a.carried ? `1px dashed rgba(${color},0.95)` : 'none'),
                    pointerEvents: 'none', zIndex: 5, borderRadius: '2px',
                  }}
                />
              ))}
            </div>
          )
        }

        const point = anchorPoint(a.anchor) || { x: 0.5, y: 0.05 }
        return (
          <button
            key={`${a.id}-${isActive}`}
            data-annot={a.id}
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
            background: 'rgba(29,78,216,0.28)', boxShadow: 'inset 0 -2px 0 rgba(29,78,216,0.8)',
            zIndex: 6, borderRadius: '2px', pointerEvents: 'none',
          }}
        />
      ))}

      {offer && !pendingDraft && (
        <button
          type="button" data-comment-offer
          onMouseDown={e => e.preventDefault()} onClick={e => { e.stopPropagation(); takeOffer() }}
          title="Add a comment (Ctrl+Alt+M)"
          style={{
            position: 'absolute', zIndex: 12,
            left: `min(calc(${offer.x * 100}% + 8px), calc(100% - 128px))`, top: `calc(${offer.y * 100}% + 6px)`,
            display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '20px',
            border: 'none', background: '#0a1f44', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(10,31,68,0.35)', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>
          <Icon name="comment" /> {offer.kind === 'text' ? 'Comment' : 'Comment here'}
        </button>
      )}

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
export default function PdfViewer({ documentId, pageNumber, onPageCountChange, onPageNumberChange, onSelection, onPageClick, annotations = [], carried = [], onRelocated, onAnnotationClick, activeAnnotationId, hoverAnnotationId, focusSeq, commentEnabled = true, pendingDraft, onSubmitDraft, onCancelDraft, scrollContainerRef }) {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [containerWidth, setContainerWidth] = useState(700)
  const [naturalWidth, setNaturalWidth] = useState(null)
  const [visiblePages, setVisiblePages] = useState(() => new Set([1]))
  const [pageHeights, setPageHeights] = useState({})

  // Must be the SAME element that actually scrolls -- a second, nested
  // overflow:auto div here (independent of the parent's own scrollable
  // wrapper) made the IntersectionObserver's root never line up with real
  // scroll position, so nothing past whatever happened to be visible on
  // first paint ever registered as in view. Falls back to an internal ref
  // if no parent container is supplied (there's currently only one caller,
  // which always supplies one).
  const fallbackRef = useRef(null)
  const scrollRef = scrollContainerRef ?? fallbackRef
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
  // is in visiblePages and rendered; anything that scrolls back out of that
  // margin is removed so Page releases its canvas (see the unload effect in
  // Page) -- without this a long document keeps every page it ever scrolled
  // past rendered forever, eventually exceeding the browser's total canvas
  // memory budget and causing pages to silently go blank. The entry closest
  // to the top of the actual viewport becomes the reported "current page".
  useEffect(() => {
    // Also gated on `loading`: pdfDoc/numPages are set (via setPdfDoc/
    // setNumPages) a render or two BEFORE loading flips to false, and the
    // page wrapper divs below are only rendered once `!loading` -- so
    // without this, this effect fires while those divs don't exist yet,
    // pageRefs.current is still empty, observer.observe() is never called
    // on anything, and since pdfDoc/numPages don't change again, it never
    // re-runs once the real elements do mount. The observer ends up
    // permanently attached to nothing, and only page 1 ever shows (it's
    // the only page in visiblePages' hardcoded initial state).
    if (!pdfDoc || !numPages || !scrollRef.current || loading) return

    const observer = new IntersectionObserver(entries => {
      setVisiblePages(prev => {
        const next = new Set(prev)
        entries.forEach(entry => {
          const n = Number(entry.target.dataset.pageNumber)
          if (entry.isIntersecting) next.add(n)
          else next.delete(n)
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
  }, [pdfDoc, numPages, loading])

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

  // Comments carried over from an earlier version: find their quoted text in
  // THIS version's pages (text only -- no rendering needed). Found ones are
  // highlighted where the text now is; the rest are reported as not found
  // so the sidebar can say "anchor needs review" instead of guessing.
  const [pageTexts, setPageTexts] = useState(null)
  const hasCarried = carried.length > 0
  useEffect(() => {
    if (!pdfDoc || !hasCarried) return
    let cancelled = false
    Promise.all(Array.from({ length: pdfDoc.numPages }, (_, i) =>
      pdfDoc.getPage(i + 1).then(pg => pg.getTextContent()).then(tc => tc.items.map(it => it.str).join(''))))
      .then(texts => { if (!cancelled) setPageTexts(texts) })
      .catch(() => { if (!cancelled) setPageTexts([]) })
    return () => { cancelled = true }
  }, [pdfDoc, hasCarried])

  const carriedKey = carried.map(c => c.id).join(',')
  const relocations = useMemo(() => {
    if (!pageTexts) return null
    const out = {}
    carried.forEach(c => {
      const quote = c.anchor?.quote
      let hit = null
      if (quote && pageTexts.length) {
        // Same page first (most edits don't move text across pages), then the rest.
        const order = [c.pageNumber - 1, ...pageTexts.map((_, i) => i).filter(i => i !== c.pageNumber - 1)]
        for (const i of order) {
          if (i < 0 || i >= pageTexts.length) continue
          const found = locateQuote(pageTexts[i], quote, i === c.pageNumber - 1 ? c.anchor.start : null)
          if (found) { hit = { pageNumber: i + 1, ...found }; break }
        }
      }
      out[c.id] = hit
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTexts, carriedKey])

  const onRelocatedRef = useRef(onRelocated)
  useEffect(() => { onRelocatedRef.current = onRelocated })
  useEffect(() => { if (relocations) onRelocatedRef.current?.(relocations) }, [relocations])

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
        /* pdf.js draws the selection at 25% in the system accent colour,
           which is often a faint grey. Google Docs' clear light blue: */
        .textLayer { opacity: 1 !important; }
        .textLayer ::selection { background: rgba(26,115,232,0.35); }
        .textLayer ::-moz-selection { background: rgba(26,115,232,0.35); }
        .textLayer br::selection { background: transparent; }
        .textLayer br::-moz-selection { background: transparent; }
        .pin-pulse { animation: pinPulse 0.6s ease-out; }
      `}</style>
      {loading && <SkeletonDocument />}
      {error && <div style={{ padding: '40px', color: '#dc2626', fontSize: '13px' }}>{error}</div>}
      {!loading && !error && (
        <div style={{ width: '100%' }}>
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
                textHighlights={carried.filter(c => relocations?.[c.id]?.pageNumber === n).map(c => ({ ...c, start: relocations[c.id].start, end: relocations[c.id].end }))}
                onAnnotationClick={onAnnotationClick}
                activeAnnotationId={activeAnnotationId}
                hoverAnnotationId={hoverAnnotationId}
                focusSeq={focusSeq}
                commentEnabled={commentEnabled}
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
