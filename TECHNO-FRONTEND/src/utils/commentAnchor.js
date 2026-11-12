// Comment anchoring shared by the PDF viewer and the in-app draft viewer.
//
// A comment remembers WHAT it was attached to, not just WHERE on screen:
//   anchor = {
//     v: 2,
//     kind: 'pdf' | 'html',
//     quote: { exact, prefix, suffix },   // the selected text + a little context
//     start, end,                         // offsets in the page text (pdf) or block text (html)
//     rects?: [...]                       // pdf: exact highlight boxes on the origin version
//     block_id?: '...'                    // html: the paragraph's stable id (data-block-id)
//   }
// Older comments stored only an array of rects (or a {x, y} point); those
// still work on the version they were made on.
//
// On a NEWER version of the document the quote is searched for again. If it
// can't be found with confidence the comment is shown as "Original text
// changed -- anchor needs review" instead of being pinned to the wrong text.

const CONTEXT = 32

export function anchorRects(anchor) {
  if (Array.isArray(anchor)) return anchor
  if (anchor && Array.isArray(anchor.rects)) return anchor.rects
  return null
}

export function anchorPoint(anchor) {
  if (anchor && !Array.isArray(anchor) && typeof anchor.x === 'number' && typeof anchor.y === 'number') return anchor
  return null
}

export function anchorQuote(anchor) {
  return anchor && !Array.isArray(anchor) && anchor.quote?.exact ? anchor.quote : null
}

export function buildQuote(fullText, start, end) {
  return {
    exact: fullText.slice(start, end),
    prefix: fullText.slice(Math.max(0, start - CONTEXT), start),
    suffix: fullText.slice(end, end + CONTEXT),
  }
}

const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase()

// Finds `quote` in `text`. Prefers an exact occurrence whose surrounding
// text matches the stored prefix/suffix best (and is closest to `hint`), so
// a phrase that appears twice is matched to the right one. Returns
// { start, end } or null when it can't be found -- never a guess.
export function locateQuote(text, quote, hint = null) {
  if (!text || !quote?.exact) return null
  const exact = quote.exact
  const hits = []
  for (let i = text.indexOf(exact); i !== -1; i = text.indexOf(exact, i + 1)) hits.push(i)

  if (hits.length === 0) {
    // Whitespace/line-break differences between versions (common in PDF
    // text) -- retry on a whitespace-insensitive pattern.
    const pattern = exact.trim().split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
    if (!pattern) return null
    const re = new RegExp(pattern, 'g')
    let m
    while ((m = re.exec(text)) !== null) { hits.push({ i: m.index, len: m[0].length }); if (re.lastIndex === m.index) re.lastIndex++ }
  }

  if (hits.length === 0) {
    // PDF text often runs the last word of a line into the next one
    // ("important role" comes out as "importantrole"), so retry ignoring all
    // whitespace, then map the match back to positions in `text`.
    const at = []
    let squeezed = ''
    for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) { squeezed += text[i]; at.push(i) }
    const q = exact.replace(/\s+/g, '')
    if (q.length >= 8) {
      for (let i = squeezed.indexOf(q); i !== -1; i = squeezed.indexOf(q, i + 1)) {
        hits.push({ i: at[i], len: at[i + q.length - 1] + 1 - at[i] })
      }
    }
    if (hits.length === 0) return null
  }

  const score = h => {
    const i = typeof h === 'number' ? h : h.i
    const len = typeof h === 'number' ? exact.length : h.len
    let s = 0
    const before = norm(text.slice(Math.max(0, i - CONTEXT * 2), i))
    const after = norm(text.slice(i + len, i + len + CONTEXT * 2))
    if (quote.prefix && before.endsWith(norm(quote.prefix).slice(-12))) s += 2
    if (quote.suffix && after.startsWith(norm(quote.suffix).slice(0, 12))) s += 2
    if (hint != null) s -= Math.min(1, Math.abs(i - hint) / 5000)
    return s
  }
  const best = hits.reduce((a, b) => (score(b) > score(a) ? b : a))
  const start = typeof best === 'number' ? best : best.i
  const len = typeof best === 'number' ? exact.length : best.len
  return { start, end: start + len }
}

// ── DOM text offsets ─────────────────────────────────────────

function textNodes(root) {
  const out = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n)
  return out
}

// Offset of (node, offset) within root's textContent.
export function textOffsetOf(root, node, offset) {
  const range = document.createRange()
  range.setStart(root, 0)
  range.setEnd(node, offset)
  return range.toString().length
}

// A DOM Range covering [start, end) of root's textContent, or null.
export function rangeFromOffsets(root, start, end) {
  let pos = 0, startNode = null, startOff = 0, endNode = null, endOff = 0
  for (const n of textNodes(root)) {
    const len = n.nodeValue.length
    if (!startNode && start <= pos + len) { startNode = n; startOff = start - pos }
    if (end <= pos + len) { endNode = n; endOff = end - pos; break }
    pos += len
  }
  if (!startNode || !endNode) return null
  const range = document.createRange()
  range.setStart(startNode, startOff)
  range.setEnd(endNode, endOff)
  return range
}

// Wraps [start, end) of root's text in <mark> elements (one per text node it
// spans, so block structure is never broken).
export function wrapOffsets(root, start, end, attrs = {}) {
  let pos = 0
  const marks = []
  for (const n of textNodes(root)) {
    const len = n.nodeValue.length
    const from = Math.max(start, pos), to = Math.min(end, pos + len)
    if (from < to) {
      let node = n
      if (to - pos < len) node.splitText(to - pos)
      if (from - pos > 0) node = node.splitText(from - pos)
      const mark = document.createElement('mark')
      Object.entries(attrs).forEach(([k, v]) => mark.setAttribute(k, v))
      node.parentNode.insertBefore(mark, node)
      mark.appendChild(node)
      marks.push(mark)
    }
    pos += len
    if (pos >= end) break
  }
  return marks
}

export function unwrapMarks(root, selector = 'mark[data-comment-id]') {
  root.querySelectorAll(selector).forEach(mark => {
    const parent = mark.parentNode
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  })
}

// ── Stable paragraph ids for in-app drafts ───────────────────

const newBlockId = () => 'b' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

// Gives every top-level block of the editor a data-block-id, and renumbers
// duplicates (the browser copies attributes when a paragraph is split with
// Enter -- the first one keeps the id). Comments on drafts anchor to these.
export function ensureBlockIds(root) {
  if (!root) return
  const seen = new Set()
  Array.from(root.children).forEach(el => {
    if (el.hasAttribute('data-page-spacer') || el.hasAttribute('data-page-gutter')) return
    const id = el.getAttribute('data-block-id')
    if (!id || seen.has(id)) el.setAttribute('data-block-id', newBlockId())
    seen.add(el.getAttribute('data-block-id'))
  })
}
