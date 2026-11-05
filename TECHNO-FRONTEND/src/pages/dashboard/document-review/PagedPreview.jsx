import { useEffect, useRef, useState } from 'react'

// Real, accurate pagination -- not another hand-rolled height estimate.
// Paged.js is a mature, purpose-built library (MIT licensed) that lays out
// HTML content into actual CSS Paged Media page boxes using the browser's
// own text measurement, the same technology real print/PDF rendering uses.
//
// Renders directly into containerRef (not an isolated iframe): Paged.js's
// Polisher injects its processed stylesheet into the global `document` by
// default and its Chunker renders into whatever target it's given, so
// splitting those across a parent document and an iframe document meant
// the injected @page sizing never reached the iframe's content -- pages
// rendered at the iframe's raw viewport size instead of A4. Same document
// for both sides avoids that mismatch.
//
// The real first bug (confirmed): hiding the render target with
// display:none while Paged.js is actively measuring layout
// (getBoundingClientRect) during its async render crashed its internal
// Layout class outright. display:none has no real layout box; fixed by
// keeping the target in-flow (visibility:hidden) while loading instead.
export default function PagedPreview({ html, margins }) {
  const containerRef = useRef(null)
  const [rendering, setRendering] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    setRendering(true)
    setError('')
    container.innerHTML = ''

    const css = `
      @page {
        size: 210mm 297mm;
        margin: ${margins.top / 96}in ${margins.right / 96}in ${margins.bottom / 96}in ${margins.left / 96}in;
      }
      body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6; color: #0f172a; }
      [data-page-break] { break-before: page; }
    `
    const cssUrl = 'data:text/css,' + encodeURIComponent(css)

    import('pagedjs').then(({ Previewer }) => {
      if (cancelled) return
      const previewer = new Previewer()
      previewer.preview(html || '<p></p>', [cssUrl], container)
        .then(flow => {
          if (cancelled) return
          setRendering(false)
          void flow
        })
        .catch(err => {
          console.error('Page preview failed:', err)
          if (!cancelled) { setError('Could not render page preview.'); setRendering(false) }
        })
    })

    return () => { cancelled = true }
  }, [html, margins])

  return (
    <div style={{ position: 'relative', minHeight: '400px' }}>
      <style>{`
        .pagedjs-wrap .pagedjs_pages { display: flex; flex-direction: column; align-items: center; gap: 28px; padding: 20px 0 40px; }
        .pagedjs-wrap .pagedjs_page { background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.08); }
      `}</style>
      {rendering && <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Laying out pages…</div>}
      {error && <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626', fontSize: '13px' }}>{error}</div>}
      {/* visibility (not display:none) while loading -- a display:none
          element has no real layout box, and Paged.js measures real
          rendered dimensions while laying content out; hiding it that way
          is what caused its internal crash in the first place. */}
      <div
        ref={containerRef}
        className="pagedjs-wrap"
        style={{ visibility: rendering || error ? 'hidden' : 'visible', position: rendering || error ? 'absolute' : 'static', top: 0, left: 0, width: '100%' }}
      />
    </div>
  )
}
