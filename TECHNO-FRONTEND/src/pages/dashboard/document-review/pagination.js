// Shared, single-source-of-truth pagination logic for RichTextEditor (live
// editing) and DocumentReviewViewer (read-only review). They used to each
// have their own approximation of "what a page break looks like" -- the
// editor measured real DOM heights and inserted live spacer siblings; the
// read-only viewer only knew about forced breaks and faked the gap with a
// static ::before rule, using a fixed 32px/40px padding that didn't match
// the editor's actual margins at all. Confirmed: that meant Edit, Page
// View, and View could all show the same document with different text
// wrapping and different page breaks, not just a styling difference.
// Both now call the exact same functions against their own container, so a
// page break is the same break, computed the same way, everywhere this
// content is shown.

// ─── Paper metrics (A4 @ 96dpi) ────────────────────────────────────────────
// Matches the PDF viewer and the actual page size LibreOffice preserves from
// the uploaded Word doc.
export const PAGE_W = 794   // 210mm
export const PAGE_H = 1123  // 297mm
export const IN     = 96    // 1 inch, in px, for converting the custom-margin inputs

// Default: standard Philippine thesis/binding format — wider left margin for
// binding, 1in on the other three sides. Also what the read-only viewer
// assumes, since per-document margins aren't part of the saved content.
export const DEFAULT_MARGINS = { top: 96, right: 96, bottom: 96, left: 144 }
export const MARGIN_PRESETS = {
  thesis:   { label: 'Thesis (1.5" left)', top: 96, right: 96, bottom: 96, left: 144 },
  normal:   { label: 'Normal (1")',        top: 96, right: 96, bottom: 96, left: 96 },
  moderate: { label: 'Moderate',           top: 96, right: 72, bottom: 96, left: 72 },
  narrow:   { label: 'Narrow (0.5")',      top: 48, right: 48, bottom: 48, left: 48 },
}

// Thesis manuscripts follow a standard structure where these section
// headings always start a fresh page -- true regardless of the specific
// document, unlike LibreOffice's page-break-before CSS (which mixes real
// manual breaks with layout artifacts and can't be trusted). Matched as a
// full line (not "CHAPTER 1 ... 5", which would be a Table of Contents
// entry, not the actual heading) so a TOC page doesn't get misread as a run
// of chapter starts.
export const STRUCTURAL_HEADING_RE = /^(CHAPTER\s+\d+\.?|REFERENCES\.?|BIBLIOGRAPHY\.?|APPENDI(X|CES)\.?|APPROVAL\s+SHEET|ACKNOWLEDGE?MENTS?|ABSTRACT|DEDICATION|TABLE\s+OF\s+CONTENTS|LIST\s+OF\s+(FIGURES|TABLES)|CURRICULUM\s+VITAE)$/i

// Marks every top-level block whose own text is exactly one of the standard
// thesis section headings, the same way a manual page break is marked, so
// paginate() starts a fresh page there without anyone having to click
// through every chapter by hand. Safe to call repeatedly / on static
// content -- already-marked elements are skipped.
export function markStructuralPageBreaks(root) {
  if (!root) return
  Array.from(root.children).forEach((el, i) => {
    if (i === 0) return // first block is already page 1, nothing to push it onto
    if (el.hasAttribute('data-page-spacer') || el.hasAttribute('data-page-break')) return
    const text = (el.textContent || '').trim()
    if (STRUCTURAL_HEADING_RE.test(text)) {
      el.setAttribute('data-page-break', 'true')
      el.style.pageBreakBefore = 'always'
    }
  })
}

export function outerHeight(el) {
  const cs = getComputedStyle(el)
  return el.offsetHeight + parseFloat(cs.marginTop || 0) + parseFloat(cs.marginBottom || 0)
}

const hasForcedBreakBefore = el => el.hasAttribute('data-page-break')

// WYSIWYG means what you see has to actually be true of the saved document.
// This only ever marks a break at a point that's actually real: a manual
// break, a thesis section heading, or a block that measurably doesn't fit
// in what's left of the current page -- measuring the real, already-
// rendered DOM (the exact font, the exact line-breaking, the same box
// being looked at), not estimating from character counts before anything
// is laid out, so it can't show a gap that contradicts its own content.
//
// A forced break (a chapter heading, say) can land well before the current
// page is actually full -- a short title page followed immediately by
// "CHAPTER 1" is the normal case. A page that sizes itself to its content
// isn't a page, so a forced break pads the outgoing page out to its full
// height first; a natural-overflow break needs no filler, since the page
// is already full by definition. The very last page gets the same
// treatment via a trailing filler, so the document doesn't end on a sheet
// shrink-wrapped to its last paragraph either.
//
// Returns the number of page breaks inserted (page count is breaks + 1).
export function paginate(root, margins) {
  if (!root) return 0
  root.querySelectorAll('[data-page-spacer]').forEach(el => el.remove())

  const usableH = PAGE_H - margins.top - margins.bottom
  const children = Array.from(root.children)
  // Read every child's real rendered height up front, before any spacer is
  // inserted -- one measurement pass, then one DOM-mutation pass below, so
  // inserting earlier spacers can't shift what a later measurement reads
  // (layout thrashing) and doesn't change any height being compared.
  const heights = children.map(outerHeight)

  const breakBefore = []
  let used = 0
  children.forEach((child, i) => {
    const h = heights[i]
    if (i === 0) { used = h; return }
    const forced = hasForcedBreakBefore(child)
    // Only break mid-flow once the current page actually has something on
    // it (used > 0) -- a block taller than one full page (a big table or
    // image) still gets to start its own page rather than triggering a
    // second, immediately-empty break right after the one before it.
    const overflows = !forced && used > 0 && used + h > usableH
    if (forced || overflows) {
      const fillerHeight = forced ? Math.max(0, usableH - used) : 0
      breakBefore.push({ child, fillerHeight })
      used = h
    } else {
      used += h
    }
  })

  breakBefore.forEach(({ child, fillerHeight }) => {
    // A real gap between two sheets, matching Word/Docs -- not a debug-
    // looking dashed line with a label. A page is its margins, not just its
    // text: an optional blank run padding the outgoing page out to its full
    // height (see fillerHeight above), then a blank run the height of its
    // own bottom margin, then a thin gray gutter standing in for the gap
    // between two physical sheets, then a blank run the height of the
    // incoming page's top margin before its text starts -- not text
    // running flush against the gutter on both sides.
    const spacer = document.createElement('div')
    spacer.setAttribute('data-page-spacer', 'true')
    spacer.contentEditable = 'false'
    spacer.style.pointerEvents = 'none'

    if (fillerHeight > 0) {
      const filler = document.createElement('div')
      filler.style.height = `${fillerHeight}px`
      spacer.appendChild(filler)
    }

    const bottomMargin = document.createElement('div')
    bottomMargin.style.height = `${margins.bottom}px`
    spacer.appendChild(bottomMargin)

    const gutter = document.createElement('div')
    gutter.style.height = '28px'
    gutter.style.margin = '0 -40px' // modest bleed past the box edge, not an unbounded one that risks horizontal scroll
    gutter.style.background = '#f1f5f9'
    gutter.style.boxShadow = 'inset 0 8px 10px -8px rgba(15,23,42,0.35), inset 0 -8px 10px -8px rgba(15,23,42,0.35)'
    spacer.appendChild(gutter)

    const topMargin = document.createElement('div')
    topMargin.style.height = `${margins.top}px`
    spacer.appendChild(topMargin)

    root.insertBefore(spacer, child)
  })

  // The very last page has no following break to hang a filler off of, but
  // it's just as real a page as any other -- pad it out to full height too.
  const trailingFiller = Math.max(0, usableH - used)
  if (trailingFiller > 0 && children.length > 0) {
    const filler = document.createElement('div')
    filler.setAttribute('data-page-spacer', 'true')
    filler.contentEditable = 'false'
    filler.style.pointerEvents = 'none'
    filler.style.height = `${trailingFiller}px`
    root.appendChild(filler)
  }

  return breakBefore.length
}
