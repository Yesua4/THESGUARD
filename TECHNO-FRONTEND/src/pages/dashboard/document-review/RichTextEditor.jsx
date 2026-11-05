import { useRef, useEffect, useState } from 'react'
import { IN, DEFAULT_MARGINS, MARGIN_PRESETS, markStructuralPageBreaks, paginate } from './pagination'

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'TABLE'])

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

  // Pagination itself (the actual break-position math and the spacer DOM
  // it builds) lives in ./pagination.js, shared with DocumentReviewViewer --
  // see that file for why. This just re-runs it against the live editor DOM
  // and reports how many pages it found.
  const repaginate = () => {
    const breaks = paginate(ref.current, margins)
    setPageCount(breaks + 1)
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
        <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', flexShrink: 0 }} title="Counts the page breaks shown below, measured from this editor's own rendered layout -- the same measurement View uses for this same content, so the two always agree">
          ~{pageCount} page{pageCount !== 1 ? 's' : ''}
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
        }
      `}</style>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="dg-edit-wrapper" style={{ maxWidth: '820px', margin: '0 auto 40px' }}>
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
      </div>
    </div>
  )
}

export default RichTextEditor
