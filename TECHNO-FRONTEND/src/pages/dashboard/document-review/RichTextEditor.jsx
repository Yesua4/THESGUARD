import { useRef, useEffect, useState } from 'react'
import PagedPreview from './PagedPreview'

// ─── Paper metrics (A4 @ 96dpi) ────────────────────────────────────────────
// Matches the PDF viewer and the actual page size LibreOffice preserves from
// the uploaded Word doc -- this used to be hardcoded to US Letter (8.5x11in),
// which doesn't match the A4 page size most local thesis templates use.
const PAGE_W = 794   // 210mm
const PAGE_H = 1123  // 297mm
const IN     = 96    // 1 inch, in px, for converting the custom-margin inputs

// Default: standard Philippine thesis/binding format — wider left margin for
// binding, 1in on the other three sides. Adjustable in the toolbar, same idea
// as Word's Layout > Margins.
const DEFAULT_MARGINS = { top: 96, right: 96, bottom: 96, left: 144 }
const MARGIN_PRESETS = {
  thesis:   { label: 'Thesis (1.5" left)', top: 96, right: 96, bottom: 96, left: 144 },
  normal:   { label: 'Normal (1")',        top: 96, right: 96, bottom: 96, left: 96 },
  moderate: { label: 'Moderate',           top: 96, right: 72, bottom: 96, left: 72 },
  narrow:   { label: 'Narrow (0.5")',      top: 48, right: 48, bottom: 48, left: 48 },
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'TABLE'])

// Thesis manuscripts follow a standard structure where these section
// headings always start a fresh page -- true regardless of the specific
// document, unlike LibreOffice's page-break-before CSS (which mixes real
// manual breaks with layout artifacts and can't be trusted; see
// hasForcedBreakBefore). Matched as a full line (not "CHAPTER 1 ... 5",
// which would be a Table of Contents entry, not the actual heading) so a
// TOC page doesn't get misread as a run of chapter starts.
const STRUCTURAL_HEADING_RE = /^(CHAPTER\s+\d+\.?|REFERENCES\.?|BIBLIOGRAPHY\.?|APPENDI(X|CES)\.?|APPROVAL\s+SHEET|ACKNOWLEDGE?MENTS?|ABSTRACT|DEDICATION|TABLE\s+OF\s+CONTENTS|LIST\s+OF\s+(FIGURES|TABLES)|CURRICULUM\s+VITAE)$/i

// Runs once, right after freshly-loaded content is set into the editor
// (see the mount effect): marks every top-level block whose own text is
// exactly one of the standard thesis section headings, the same way
// insertPageBreak marks a manual break, so repaginate() starts a fresh
// page there without the user having to click through every chapter by
// hand. Only ever applied to freshly-loaded content, never while the user
// is actively editing, so it can't fight their own edits or undo history.
function markStructuralPageBreaks(root) {
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

function outerHeight(el) {
  const cs = getComputedStyle(el)
  return el.offsetHeight + parseFloat(cs.marginTop || 0) + parseFloat(cs.marginBottom || 0)
}

// Google Docs (and some other editors) wrap the entire copied selection in a
// single generic container — typically <b id="docs-internal-guid-...">  — with
// every real paragraph nested inside it, instead of pasting paragraphs as
// separate top-level blocks. That single wrapper defeats pagination (which
// only measures direct children) and can carry unintended styling. Unwrap it
// so the actual block elements land as top-level children, same as if the
// user had typed them directly.
function unwrapPasteWrapper(container) {
  let changed = true
  while (changed) {
    changed = false
    if (container.children.length === 1) {
      const only = container.children[0]
      const looksGeneric = only.tagName === 'B' || only.tagName === 'SPAN' ||
        (only.id && only.id.startsWith('docs-internal-guid'))
      const hasBlockChildren = Array.from(only.children).some(c => BLOCK_TAGS.has(c.tagName))
      if (looksGeneric && hasBlockChildren) {
        while (only.firstChild) container.appendChild(only.firstChild)
        container.removeChild(only)
        changed = true
      }
    }
  }
}

// Lightweight in-app rich-text editor (contentEditable + execCommand — no
// external editor library). Two modes:
//   - Compact (default): small toolbar, flexible height. Used for quick
//     inline edits without leaving the submission form.
//   - `paginated`: full toolbar + a real Word/Docs-style paginated page
//     layout. Content stays in ONE contentEditable (splitting into separate
//     per-page editable regions is what causes the classic cursor-jumping
//     bugs in naive pagination implementations) — instead, non-editable
//     "spacer" divs are measured and inserted between block children to push
//     overflow onto the next visual page sheet. Spacers are presentational
//     only and are always stripped out before the HTML reaches `onChange`,
//     so what gets saved is plain content, independent of page layout.
function RichTextEditor({ value, onChange, minHeight = '260px', autoFocus = false, paginated = false }) {
  const ref = useRef(null)
  const debounceRef = useRef(null)
  const [pageCount, setPageCount] = useState(1)
  const [margins, setMargins] = useState(DEFAULT_MARGINS)
  const [marginPreset, setMarginPreset] = useState('thesis')
  const [customOpen, setCustomOpen] = useState(false)
  const [customVals, setCustomVals] = useState({ top: 1, right: 1, bottom: 1, left: 1.5 })
  // 'edit': the plain continuous surface typing actually happens in --
  // typing directly into Paged.js's own output isn't safe, since it
  // reflows/re-splits content across page boundaries on every change,
  // which would fight a live cursor. 'pages': a real paginated preview
  // (see PagedPreview) of the current content, read-only.
  const [viewMode, setViewMode] = useState('edit')
  // True only while Paged.js is actively mid-render. Confirmed under
  // rapid-toggle stress testing: unmounting PagedPreview (switching back to
  // Edit) while Paged.js's own async renderAsync() is still running crashes
  // it internally, reading DOM nodes React just detached out from under it.
  // Paged.js exposes no way to cancel that in-flight work, so the only safe
  // fix is to not allow the unmount that triggers it in the first place --
  // this disables the Edit button for the (typically well under a couple of
  // seconds, even for an 80+ page document) time a render is genuinely busy.
  const [pagesRendering, setPagesRendering] = useState(false)

  const closestBlock = node => {
    let el = node.nodeType === 3 ? node.parentElement : node
    while (el && el !== ref.current && !BLOCK_TAGS.has(el.tagName)) el = el.parentElement
    return (el === ref.current || !el) ? null : el
  }

  // True for a paragraph that should start a fresh page regardless of how
  // much room is left, from a manual break explicitly inserted here (see
  // insertPageBreak). Earlier this also trusted page-break-before/
  // break-before CSS carried over from LibreOffice's HTML export, on the
  // theory that it reflects Word's real manual page breaks -- in practice
  // LibreOffice emits that style on paragraphs with no corresponding break
  // in the actual document (confirmed: a paragraph that flows continuously
  // in the real manuscript got forced onto its own page, leaving roughly
  // half of the previous page blank), so that signal isn't trustworthy and
  // this only honors breaks this editor itself created.
  const hasForcedBreakBefore = el => el.hasAttribute('data-page-break')

  // WYSIWYG means what you see while editing has to actually be true of the
  // saved document. The earlier version of this only broke pages at a point
  // this editor explicitly knew was real -- a manual break, or a thesis
  // section heading -- because an earlier attempt at *estimating* where a
  // page should break (from character counts / assumed font metrics, before
  // anything was actually laid out) guessed wrong against the real renderer
  // and showed a blank gap that didn't correspond to anything, in the wrong
  // place, that never made it into the saved content either.
  //
  // That fix was incomplete: between two section headings, a chapter's worth
  // of body text got zero page breaks at all, no matter how long it ran --
  // visually one giant unbroken sheet instead of several pages, nothing like
  // Word or Docs. The difference here is MEASURING, not estimating: every
  // top-level block is already sitting in the live DOM in its real,
  // currently-rendered size (the exact font, the exact line-breaking, the
  // same box the user is looking at) by the time this runs, so walking their
  // actual offsetHeight and breaking where the running total would exceed
  // one page's usable height can't disagree with what's on screen -- it IS
  // what's on screen. It still won't land on the exact same line Word or
  // LibreOffice would (different layout engine, same as before), but it
  // can't show a gap that contradicts its own content, and now every chapter
  // gets as many breaks as its real rendered length needs, not just the ones
  // at a heading.
  const repaginate = () => {
    const root = ref.current
    if (!root) return
    root.querySelectorAll('[data-page-spacer]').forEach(el => el.remove())

    const usableH = PAGE_H - margins.top - margins.bottom
    const children = Array.from(root.children)
    // Read every child's real rendered height up front, before any spacer
    // is inserted -- one measurement pass, then one DOM-mutation pass below,
    // so inserting earlier spacers can't shift what a later measurement
    // reads (layout thrashing) and doesn't change any height being compared.
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
        // A forced break (a chapter heading, say) can land well before the
        // current page is actually full -- a short title page followed
        // immediately by "CHAPTER 1" is the normal case, not an edge case.
        // Confirmed against the real Google Doc: its title page stays a
        // full blank sheet all the way down and Chapter 1 starts on a
        // genuinely new page, where this editor was shrink-wrapping the
        // break to right after the last line of text -- a page that sizes
        // itself to its content isn't a page, it's just a text block with a
        // divider after it. A natural-overflow break needs no filler: the
        // page is already full by definition (that's the only reason it
        // broke).
        const fillerHeight = forced ? Math.max(0, usableH - used) : 0
        breakBefore.push({ child, fillerHeight })
        used = h
      } else {
        used += h
      }
    })

    breakBefore.forEach(({ child, fillerHeight }) => {
      // The single contentEditable region's own padding (margins.top/bottom)
      // only ever applies once, at the very start and very end of the whole
      // document -- every page boundary IN BETWEEN had no margin of its own,
      // so text ran flush up to the old flat gray bar and resumed flush
      // after it (confirmed: a side-by-side with the real Google Doc showed
      // text touching the gap on both sides, where Docs shows a generous
      // quiet white margin before AND after the gray gutter). A page is its
      // margins, not just its text, so each break now reproduces that: an
      // optional blank run padding the outgoing page out to its full height
      // (see fillerHeight above), then a blank run the height of its own
      // bottom margin (plain, inherits the white background -- it's blank
      // space, not a marker), then a thin gray gutter standing in for the
      // gap between two physical sheets, then a blank run the height of the
      // incoming page's top margin before its text starts.
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

    // The very last page has no following break to hang a filler off of,
    // but it's just as real a page as any other -- pad it out to full
    // height too so the document doesn't end with a sheet that's been
    // shrink-wrapped to its last paragraph.
    const trailingFiller = Math.max(0, usableH - used)
    if (trailingFiller > 0 && children.length > 0) {
      const filler = document.createElement('div')
      filler.setAttribute('data-page-spacer', 'true')
      filler.contentEditable = 'false'
      filler.style.pointerEvents = 'none'
      filler.style.height = `${trailingFiller}px`
      root.appendChild(filler)
    }

    // breakBefore.length spacers means that many page boundaries, so this is
    // now an exact count of what's actually shown -- not a separate estimate
    // layered on top of it.
    setPageCount(breakBefore.length + 1)
  }

  const emitCleanValue = () => {
    if (!ref.current) return
    const clone = ref.current.cloneNode(true)
    clone.querySelectorAll('[data-page-spacer]').forEach(el => el.remove())
    onChange(clone.innerHTML)
  }

  const afterChange = () => {
    emitCleanValue()
    if (paginated) {
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(repaginate, 180)
    }
  }

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || ''
    }
    if (paginated) {
      document.execCommand('styleWithCSS', false, true)
      document.execCommand('defaultParagraphSeparator', false, 'p')
      markStructuralPageBreaks(ref.current)
      repaginate()
      // markStructuralPageBreaks mutates the live DOM directly (adding
      // data-page-break to chapter/section headings) but that's invisible
      // to the parent's controlled `value` until something propagates it
      // back up -- without this, the parent's value (what Page View reads,
      // and what actually gets saved) never includes the auto-detected
      // breaks at all, only the DOM the user is looking at does.
      emitCleanValue()
    }
    if (autoFocus) ref.current?.focus()
    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Margins changed (preset or custom) — page breaks need recalculating
  // since the usable height per page just changed.
  useEffect(() => {
    if (paginated) repaginate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [margins])

  const applyMarginPreset = key => {
    setMarginPreset(key)
    if (key === 'custom') { setCustomOpen(true); return }
    setCustomOpen(false)
    setMargins(MARGIN_PRESETS[key])
  }

  const applyCustomMargins = () => {
    setMargins({
      top: Math.max(0, customVals.top) * IN,
      right: Math.max(0, customVals.right) * IN,
      bottom: Math.max(0, customVals.bottom) * IN,
      left: Math.max(0, customVals.left) * IN,
    })
  }

  const exec = (cmd, arg = null) => {
    ref.current?.focus()
    document.execCommand(cmd, false, arg)
    afterChange()
  }

  const handlePaste = e => {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')

    ref.current?.focus()

    if (!html) {
      document.execCommand('insertText', false, text)
      afterChange()
      return
    }

    const doc = new DOMParser().parseFromString(html, 'text/html')
    const container = doc.body
    unwrapPasteWrapper(container)
    container.querySelectorAll('script,style,meta,link').forEach(el => el.remove())
    container.querySelectorAll('[id^="docs-internal-guid"]').forEach(el => el.removeAttribute('id'))

    document.execCommand('insertHTML', false, container.innerHTML)
    afterChange()
  }

  // A page-spacer div is contentEditable="false" (it's presentational only,
  // see repaginate) -- browsers treat that as an atomic, non-mergeable
  // island, so native Backspace at the very start of the paragraph right
  // after one silently does nothing instead of merging into the paragraph
  // before it, the same as it would if there were no page break there at
  // all. Detect exactly that case and do the merge ourselves. This also
  // naturally lets a manual page break (see insertPageBreak) be undone by
  // backspacing at its start, since it's marked the same way.
  const handleKeyDown = e => {
    // Plain contentEditable has no concept of "indent" -- Tab's browser
    // default is to move focus to the next focusable element on the page
    // (here, out of the editor entirely, silently, since nothing visibly
    // changes), not insert anything. Word/Docs-style behavior: inside a
    // list item, Tab/Shift+Tab nests/un-nests it; anywhere else, Tab
    // inserts a fixed-width tab stop.
    if (e.key === 'Tab') {
      e.preventDefault()
      const sel = window.getSelection()
      const block = sel && sel.rangeCount ? closestBlock(sel.getRangeAt(0).startContainer) : null
      if (block && block.tagName === 'LI') {
        exec(e.shiftKey ? 'outdent' : 'indent')
      } else if (!e.shiftKey) {
        // Plain non-breaking spaces rather than an inline-block tab-stop
        // span: a span would need contenteditable="false" to stop the
        // browser from splitting it on edits, which reintroduces the exact
        // "Backspace does nothing" problem just fixed for page breaks.
        exec('insertText', '    ')
      }
      return
    }

    if (e.key !== 'Backspace' || !paginated) return
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    const block = closestBlock(range.startContainer)
    if (!block) return

    const beforeCaret = document.createRange()
    beforeCaret.setStart(block, 0)
    beforeCaret.setEnd(range.startContainer, range.startOffset)
    if (beforeCaret.toString().length > 0) return // caret isn't at the very start of the block

    const spacer = block.previousElementSibling
    if (!spacer || !spacer.hasAttribute('data-page-spacer')) return
    const target = spacer.previousElementSibling
    if (!target) return

    e.preventDefault()
    const caretOffset = target.childNodes.length
    while (block.firstChild) target.appendChild(block.firstChild)
    block.remove()
    spacer.remove()

    const newRange = document.createRange()
    newRange.setStart(target, caretOffset)
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)
    afterChange()
  }

  const applyFontSize = pt => {
    ref.current?.focus()
    // fontSize only ever produces a <font size="7"> tag to replace with the
    // real point size below when styleWithCSS is off -- with it on (set in
    // the mount effect, so Bold/Italic/etc. use inline styles instead of
    // legacy tags), the browser instead wraps the selection in
    // <span style="font-size: xxx-large"> directly, one of only 7 fixed
    // keyword sizes, so every size this picker offered collapsed onto
    // whichever keyword size="7" maps to -- the querySelector below then
    // matched nothing and the real requested size was silently dropped.
    document.execCommand('styleWithCSS', false, false)
    document.execCommand('fontSize', false, '7')
    document.execCommand('styleWithCSS', false, true)
    ref.current?.querySelectorAll('font[size="7"]').forEach(el => {
      el.removeAttribute('size')
      el.style.fontSize = pt
    })
    afterChange()
  }

  const applyLineHeight = value => {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const startBlock = closestBlock(range.startContainer)
    const endBlock = closestBlock(range.endContainer)
    if (!startBlock) return
    if (!endBlock || startBlock === endBlock) {
      startBlock.style.lineHeight = value
    } else {
      let node = startBlock, guard = 0
      while (node && guard < 500) {
        node.style.lineHeight = value
        if (node === endBlock) break
        node = node.nextElementSibling
        guard++
      }
    }
    afterChange()
  }

  const insertTable = () => {
    const rows = parseInt(window.prompt('Number of rows?', '3'), 10)
    const cols = parseInt(window.prompt('Number of columns?', '3'), 10)
    if (!rows || !cols || rows < 1 || cols < 1) return
    let html = '<table style="border-collapse:collapse;width:100%;margin:10px 0;">'
    for (let r = 0; r < rows; r++) {
      html += '<tr>'
      for (let c = 0; c < cols; c++) html += '<td style="border:1px solid #94a3b8;padding:6px 10px;min-width:60px;">&nbsp;</td>'
      html += '</tr>'
    }
    html += '</table><p><br></p>'
    exec('insertHTML', html)
  }

  // Marks the paragraph the cursor lands in (a fresh one right after the
  // break) so repaginate() always starts a new page there, the same way a
  // break carried over from the original Word doc is honored.
  const insertPageBreak = () => {
    exec('insertHTML', '<p data-page-break="true" style="page-break-before:always;"><br></p>')
  }

  const insertLink = () => {
    const url = window.prompt('Enter URL (including https://):')
    if (!url) return
    exec('createLink', url)
  }

  const insertImageByUrl = () => {
    const url = window.prompt('Enter image URL:')
    if (!url) return
    exec('insertImage', url)
  }

  const btnStyle = { border: '1px solid #e2e8f0', background: '#fff', borderRadius: '6px', padding: '5px 9px', fontSize: '12px', cursor: 'pointer', color: '#334155' }
  const selectStyle = { ...btnStyle, padding: '5px 6px' }
  const divider = <div style={{ width: '1px', background: '#e2e8f0', margin: '2px 4px' }} />

  if (!paginated) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px', flexShrink: 0 }}>
          <button type="button" style={{ ...btnStyle, fontWeight: '700' }} onClick={() => exec('bold')}>B</button>
          <button type="button" style={{ ...btnStyle, fontStyle: 'italic' }} onClick={() => exec('italic')}>I</button>
          <button type="button" style={{ ...btnStyle, textDecoration: 'underline' }} onClick={() => exec('underline')}>U</button>
          <button type="button" style={btnStyle} onClick={() => exec('formatBlock', 'H2')}>H2</button>
          <button type="button" style={btnStyle} onClick={() => exec('formatBlock', 'P')}>¶</button>
          <button type="button" style={btnStyle} onClick={() => exec('insertUnorderedList')}>• List</button>
          <button type="button" style={btnStyle} onClick={() => exec('insertOrderedList')}>1. List</button>
        </div>
        <div
          ref={ref}
          contentEditable
          onInput={afterChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          suppressContentEditableWarning
          style={{
            border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '20px 24px',
            minHeight, flex: 1, fontSize: '14px', lineHeight: '1.8', color: '#0f172a',
            background: '#fff', outline: 'none', overflowY: 'auto',
          }}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Full toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap',
        padding: '8px 10px', background: '#fff', border: '1px solid #e2e8f0',
        borderRadius: '10px', marginBottom: '14px', flexShrink: 0,
      }}>
        <button type="button" style={btnStyle} title="Undo" onClick={() => exec('undo')}>↶</button>
        <button type="button" style={btnStyle} title="Redo" onClick={() => exec('redo')}>↷</button>
        {divider}

        <select style={selectStyle} defaultValue="" title="Font" onChange={e => e.target.value && exec('fontName', e.target.value)}>
          <option value="" disabled>Font</option>
          <option value="Arial">Arial</option>
          <option value="Calibri">Calibri</option>
          <option value="'Times New Roman',serif">Times New Roman</option>
          <option value="Georgia,serif">Georgia</option>
          <option value="'Courier New',monospace">Courier New</option>
        </select>
        <select style={selectStyle} defaultValue="" title="Font size" onChange={e => e.target.value && applyFontSize(e.target.value)}>
          <option value="" disabled>Size</option>
          {[10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36].map(s => <option key={s} value={`${s}pt`}>{s}</option>)}
        </select>
        <select style={selectStyle} defaultValue="" title="Paragraph style" onChange={e => e.target.value && exec('formatBlock', e.target.value)}>
          <option value="" disabled>Style</option>
          <option value="P">Normal text</option>
          <option value="H1">Heading 1</option>
          <option value="H2">Heading 2</option>
          <option value="H3">Heading 3</option>
        </select>
        {divider}

        <button type="button" style={{ ...btnStyle, fontWeight: '700' }} title="Bold" onClick={() => exec('bold')}>B</button>
        <button type="button" style={{ ...btnStyle, fontStyle: 'italic' }} title="Italic" onClick={() => exec('italic')}>I</button>
        <button type="button" style={{ ...btnStyle, textDecoration: 'underline' }} title="Underline" onClick={() => exec('underline')}>U</button>
        <button type="button" style={{ ...btnStyle, textDecoration: 'line-through' }} title="Strikethrough" onClick={() => exec('strikeThrough')}>S</button>
        <input type="color" title="Text color" defaultValue="#0f172a" onChange={e => exec('foreColor', e.target.value)} style={{ width: '28px', height: '28px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px', cursor: 'pointer' }} />
        <input type="color" title="Highlight color" defaultValue="#fff59d" onChange={e => exec('hiliteColor', e.target.value)} style={{ width: '28px', height: '28px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px', cursor: 'pointer' }} />
        {divider}

        <button type="button" style={btnStyle} title="Align left" onClick={() => exec('justifyLeft')}>⟸</button>
        <button type="button" style={btnStyle} title="Align center" onClick={() => exec('justifyCenter')}>≡</button>
        <button type="button" style={btnStyle} title="Align right" onClick={() => exec('justifyRight')}>⟹</button>
        <button type="button" style={btnStyle} title="Justify" onClick={() => exec('justifyFull')}>☰</button>
        {divider}

        <button type="button" style={btnStyle} title="Bulleted list" onClick={() => exec('insertUnorderedList')}>• List</button>
        <button type="button" style={btnStyle} title="Numbered list" onClick={() => exec('insertOrderedList')}>1. List</button>
        <button type="button" style={btnStyle} title="Decrease indent" onClick={() => exec('outdent')}>⇤ Indent</button>
        <button type="button" style={btnStyle} title="Increase indent" onClick={() => exec('indent')}>⇥ Indent</button>
        <select style={selectStyle} defaultValue="" title="Line spacing" onChange={e => e.target.value && applyLineHeight(e.target.value)}>
          <option value="" disabled>Spacing</option>
          <option value="1">Single</option>
          <option value="1.5">1.5</option>
          <option value="2">Double</option>
        </select>
        {divider}

        <button type="button" style={btnStyle} title="Insert link" onClick={insertLink}>🔗 Link</button>
        <button type="button" style={btnStyle} title="Insert table" onClick={insertTable}>▦ Table</button>
        <button type="button" style={btnStyle} title="Insert image by URL" onClick={insertImageByUrl}>🖼 Image</button>
        <button type="button" style={btnStyle} title="Insert page break" onClick={insertPageBreak}>⤓ Page Break</button>
        <button type="button" style={btnStyle} title="Clear formatting" onClick={() => exec('removeFormat')}>Clear</button>
        <button type="button" style={btnStyle} title="Opens your browser's print dialog, with real A4 pagination -- an accurate preview of what printing or saving as PDF actually produces" onClick={() => window.print()}>🖨 Print</button>
        {divider}

        {/* Disabled while Page View is actively rendering, same reason as
            the Edit button above: changing margins mid-render changes
            PagedPreview's props, which clears its container to start a
            fresh layout pass while Paged.js's PREVIOUS pass may still be
            actively reading that same container -- the identical crash
            class as the unmount race, just triggered by a prop change
            instead of a toggle click. */}
        <select style={selectStyle} value={marginPreset} title={pagesRendering ? 'Finishing page layout…' : 'Page margins'} disabled={pagesRendering} onChange={e => applyMarginPreset(e.target.value)}>
          {Object.entries(MARGIN_PRESETS).map(([key, p]) => <option key={key} value={key}>Margins: {p.label}</option>)}
          <option value="custom">Margins: Custom...</option>
        </select>
        {customOpen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px' }}>
            {['top', 'right', 'bottom', 'left'].map(side => (
              <label key={side} title={`${side} margin (inches)`} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#64748b' }}>
                {side[0].toUpperCase()}
                <input
                  type="number" min="0" max="3" step="0.1" value={customVals[side]} disabled={pagesRendering}
                  onChange={e => setCustomVals(v => ({ ...v, [side]: parseFloat(e.target.value) || 0 }))}
                  style={{ width: '42px', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '2px 4px', fontSize: '11px' }}
                />
              </label>
            ))}
            <button type="button" disabled={pagesRendering} onClick={applyCustomMargins} style={{ ...btnStyle, padding: '4px 8px', opacity: pagesRendering ? 0.5 : 1, cursor: pagesRendering ? 'wait' : 'pointer' }}>Apply</button>
          </div>
        )}

        <div style={{ flex: 1 }} />
        {viewMode === 'edit' && (
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', flexShrink: 0 }} title="Counts the page breaks shown below, measured from this editor's own rendered layout -- may still differ slightly from the exact page count LibreOffice or Word would produce">
            ~{pageCount} page{pageCount !== 1 ? 's' : ''}
          </div>
        )}
        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
          <button type="button" title={pagesRendering ? 'Finishing page layout…' : 'Type here'} disabled={pagesRendering} onClick={() => setViewMode('edit')}
            style={{ border: 'none', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: pagesRendering ? 'wait' : 'pointer', opacity: pagesRendering && viewMode !== 'edit' ? 0.5 : 1, background: viewMode === 'edit' ? '#0a1f44' : '#fff', color: viewMode === 'edit' ? '#fff' : '#334155' }}>
            ✏️ Edit
          </button>
          <button type="button" title="Real paginated preview -- the same layout technology print/PDF uses, not an estimate" onClick={() => setViewMode('pages')}
            style={{ border: 'none', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', background: viewMode === 'pages' ? '#0a1f44' : '#fff', color: viewMode === 'pages' ? '#fff' : '#334155' }}>
            📄 Page View{pagesRendering ? '…' : ''}
          </button>
        </div>
      </div>

      {/* Same container look, typography, and page-break divider styling
          (.dg-draft-content, defined in DocumentReviewViewer.jsx right next
          to where this content is shown read-only) as the actual viewer
          uses for this exact content -- not an approximation of it. If this
          drifts from that styling again, editing looks different from
          viewing again, which was the whole problem: no fake paper sheet,
          no page-height boundaries this editor can't actually guarantee,
          just the one continuous document, styled identically in both
          places it's shown. */}
      <style>{`
        /* Real page-gap look lives on the spacer sibling element itself
           (see repaginate()'s data-page-spacer, inserted via JS) -- the
           break element is otherwise a normal paragraph. */

        /* Same print rule as the read-only viewer (DocumentReviewViewer.jsx)
           -- lets Print be checked at any point while actively editing,
           without saving and reopening View first. */
        @media print {
          body * { visibility: hidden; }
          .dg-print-area, .dg-print-area * { visibility: visible; }
          .dg-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          @page { size: A4; margin: 1in 1in 1in 1.5in; }
          .dg-draft-content { max-width: none !important; box-shadow: none !important; padding: 0 !important; }
          .dg-draft-content [data-page-break] { page-break-before: always; }
          /* The visual gap spacer would otherwise print as an extra blank
             gray box on top of the real page break the line above already
             creates -- real print pagination doesn't need (or want) it. */
          .dg-draft-content [data-page-spacer] { display: none !important; }
          /* Printing while Page View is active (viewMode !== 'edit') leaves
             the edit wrapper's inline display:none in place -- confirmed:
             without this, the printed/PDF output is completely blank in
             that state, since visibility:visible on a display:none
             ancestor's children has no effect; display:none removes the
             whole subtree from layout outright. An !important class rule
             (unlike a plain one) beats a non-!important inline style
             regardless of specificity, which is what's needed here since
             the inline style itself can't be conditioned on print media. */
          .dg-edit-wrapper { display: block !important; }
        }
      `}</style>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Kept mounted (just hidden) rather than unmounted when switching to
            Page View -- this is the one DOM node holding the live cursor,
            selection, and undo history; remounting it would mean re-running
            its setup effect from scratch on every toggle back to Edit. */}
        <div className="dg-edit-wrapper" style={{ maxWidth: '820px', margin: '0 auto 40px', display: viewMode === 'edit' ? 'block' : 'none' }}>
          <div
            ref={ref}
            contentEditable
            onInput={afterChange}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            suppressContentEditableWarning
            className="dg-draft-content dg-print-area"
            style={{
              boxSizing: 'border-box', background: '#fff', borderRadius: '10px',
              padding: `${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px`,
              fontSize: '13px', lineHeight: '1.7', color: '#0f172a',
              outline: 'none',
            }}
          />
        </div>
        {/* Real pagination (Paged.js), not another estimate -- see
            PagedPreview.jsx. Read-only: typing directly into its output
            isn't safe, since it reflows/re-splits content across page
            boundaries on every change, which would fight a live cursor. */}
        {viewMode === 'pages' && <PagedPreview html={value} margins={margins} onRenderingChange={setPagesRendering} />}
      </div>
    </div>
  )
}

export default RichTextEditor
