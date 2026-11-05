import { useRef, useEffect, useState } from 'react'

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
  // saved document -- height-estimating where a page "should" break and
  // showing a blank gap sized to match used to do the opposite: it guessed
  // wrong often (different font metrics, different line-breaking than the
  // real renderer), showed a gap the user couldn't act on, and that gap
  // never even made it into the saved content, so what was shown and what
  // was real were two different documents. This only ever marks a break at
  // a point this editor actually knows is real: a manual break the user
  // inserted, or a standard thesis section heading (see
  // markStructuralPageBreaks) -- both of which really are in the saved
  // content. No more guessing from paragraph height.
  const repaginate = () => {
    const root = ref.current
    if (!root) return
    root.querySelectorAll('[data-page-spacer]').forEach(el => el.remove())

    const usableH = PAGE_H - margins.top - margins.bottom
    const children = Array.from(root.children)
    let breaks = 0
    children.forEach((child, i) => {
      if (i === 0 || !hasForcedBreakBefore(child)) return
      const spacer = document.createElement('div')
      spacer.setAttribute('data-page-spacer', 'true')
      spacer.contentEditable = 'false'
      spacer.style.pointerEvents = 'none'
      spacer.style.margin = '28px 0'
      spacer.style.borderTop = '2px dashed #cbd5e1'
      spacer.style.position = 'relative'
      spacer.innerHTML = '<span style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:#f1f5f9;padding:0 10px;font-size:10px;font-weight:700;letter-spacing:0.05em;color:#94a3b8;">PAGE BREAK</span>'
      root.insertBefore(spacer, child)
      breaks++
    })

    // Still an honest estimate (total content height / usable page height),
    // just no longer used to decide where anything visually breaks -- purely
    // informational, and never claimed to be exact. `children` here is only
    // ever real content blocks: the spacer cleanup above runs before this
    // snapshot is taken, and the new spacers inserted in the loop don't
    // retroactively appear in an already-captured array.
    const totalH = children.reduce((sum, c) => sum + outerHeight(c), 0)
    const heightPages = Math.max(1, Math.ceil(totalH / usableH))
    setPageCount(Math.max(heightPages, breaks + 1))
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
        {divider}

        <select style={selectStyle} value={marginPreset} title="Page margins" onChange={e => applyMarginPreset(e.target.value)}>
          {Object.entries(MARGIN_PRESETS).map(([key, p]) => <option key={key} value={key}>Margins: {p.label}</option>)}
          <option value="custom">Margins: Custom...</option>
        </select>
        {customOpen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px' }}>
            {['top', 'right', 'bottom', 'left'].map(side => (
              <label key={side} title={`${side} margin (inches)`} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#64748b' }}>
                {side[0].toUpperCase()}
                <input
                  type="number" min="0" max="3" step="0.1" value={customVals[side]}
                  onChange={e => setCustomVals(v => ({ ...v, [side]: parseFloat(e.target.value) || 0 }))}
                  style={{ width: '42px', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '2px 4px', fontSize: '11px' }}
                />
              </label>
            ))}
            <button type="button" onClick={applyCustomMargins} style={{ ...btnStyle, padding: '4px 8px' }}>Apply</button>
          </div>
        )}

        <div style={{ flex: 1 }} />
        <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', flexShrink: 0 }} title="Estimated from content height -- the dashed PAGE BREAK lines below are the only breaks guaranteed to be real">
          ~{pageCount} page{pageCount !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Paper canvas -- one continuous sheet, not pre-cut into fixed-height
          page rectangles: content between real breaks can be taller or
          shorter than one physical page, and faking page-height boundaries
          for content that hasn't actually been measured against a real
          layout engine is exactly the "shows something that isn't true"
          problem this replaced. The dashed PAGE BREAK lines (from
          repaginate) are the only breaks this editor claims are real. */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ width: `${PAGE_W}px`, margin: '0 auto 40px' }}>
          <div
            ref={ref}
            contentEditable
            onInput={afterChange}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            suppressContentEditableWarning
            style={{
              width: `${PAGE_W}px`, minHeight: `${PAGE_H}px`, boxSizing: 'border-box',
              background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.08)',
              padding: `${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px`,
              fontFamily: 'Arial, sans-serif', fontSize: '12pt', lineHeight: '1.6', color: '#0f172a',
              outline: 'none',
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default RichTextEditor
