import { diffWords } from 'diff'
import { extractPdfText } from './extractPdfText'
import { sanitizeHtml } from './sanitizeHtml'
import { locateQuote } from './commentAnchor'

// Text of one document version, for comparisons. In-app drafts are read
// from their HTML (paragraph by paragraph, keeping data-block-id); uploaded
// files from their PDF preview (split into sentences -- a PDF has no
// reliable paragraph structure).
export async function getDocumentText(doc) {
  if (doc.content && !doc.file_path) {
    // DOMParser documents are inert: nothing loads or runs while parsing.
    const body = new DOMParser().parseFromString(sanitizeHtml(doc.content), 'text/html').body
    const blocks = Array.from(body.children)
      .filter(el => !el.hasAttribute('data-page-spacer'))
      .map(el => ({ id: el.getAttribute('data-block-id'), text: el.textContent.replace(/\s+/g, ' ').trim() }))
      .filter(b => b.text)
    return { kind: 'html', blocks, text: blocks.map(b => b.text).join('\n\n') }
  }
  const text = (await extractPdfText(doc.id)).replace(/[ \t]+/g, ' ')
  return { kind: 'pdf', blocks: sentences(text).map(t => ({ id: null, text: t })), text }
}

const sentences = text => text.split(/(?<=[.!?])\s+|\n{2,}/).map(s => s.trim()).filter(Boolean)
const norm = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
const wordSet = s => new Set(norm(s).split(' ').filter(w => w.length > 2))

export function similarity(a, b) {
  const A = wordSet(a), B = wordSet(b)
  if (!A.size || !B.size) return 0
  let common = 0
  A.forEach(w => { if (B.has(w)) common++ })
  return common / (A.size + B.size - common)
}

// Grows [start, end) out to whole sentences.
function toSentences(text, start, end) {
  let s = start, e = end
  while (s > 0 && !/[.!?\n]/.test(text[s - 1])) s--
  while (e < text.length && !/[.!?\n]/.test(text[e])) e++
  return text.slice(s, Math.min(text.length, e + 1)).trim()
}

// The passage the comment was about, in the version it was made on: the
// whole paragraph for drafts, the surrounding sentence(s) for PDFs.
export function originalExcerpt(docText, comment) {
  const anchor = comment.anchor || {}
  const quote = anchor.quote?.exact ? anchor.quote : (comment.selected_text ? { exact: comment.selected_text.trim() } : null)

  if (docText.kind === 'html') {
    let block = anchor.block_id ? docText.blocks.find(b => b.id === anchor.block_id) : null
    if (!block && quote) block = docText.blocks.find(b => locateQuote(b.text, quote))
    if (block) return { text: block.text, blockId: block.id }
    return quote ? { text: quote.exact, blockId: null } : null
  }
  if (!quote) return null
  const hit = locateQuote(docText.text, quote)
  if (!hit) return { text: quote.exact, blockId: null }
  const text = toSentences(docText.text, hit.start, hit.end)
  const start = docText.text.indexOf(text, Math.max(0, hit.start - text.length))
  return { text, blockId: null, start: start >= 0 ? start : hit.start, end: (start >= 0 ? start : hit.start) + text.length }
}

// Word diff of two whole texts, with false "changes" removed: when a word
// only moved a little (PDF text from tables and wrapped lines comes out in a
// slightly different order between versions), its "removed" and "added"
// copies cancel out and it counts as unchanged.
export function cleanDiff(a, b) {
  const parts = diffWords(a, b)
  const key = v => v.toLowerCase().replace(/\s+/g, ' ').trim()
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (!(p.added || p.removed) || !key(p.value)) continue
    for (let j = Math.max(0, i - 6); j <= Math.min(parts.length - 1, i + 6); j++) {
      const q = parts[j]
      if (j === i || !q || !(q.added || q.removed) || q.added === p.added || key(q.value) !== key(p.value)) continue
      // Keep the copy in the new text as unchanged; drop the old copy.
      const keep = p.added ? p : q, drop = p.added ? q : p
      keep.added = false; keep.removed = false; keep.moved = true
      drop.value = ''; drop.removed = false; drop.added = false; drop.dropped = true
      break
    }
  }
  return parts.filter(x => !x.dropped)
}

// What is now in the place of original[start, end): walks a word diff of the
// two whole texts, so a passage that was rewritten or replaced shows what the
// student put there -- not some other paragraph that merely uses similar
// words. how: 'unchanged' | 'replaced' | 'removed'.
export function alignedRevision(origText, revText, start, end) {
  if (start == null || end == null || end <= start) return null
  const parts = diffWords(origText, revText)
  let o = 0
  const out = []
  let touchedChange = false
  parts.forEach((p, i) => {
    const len = p.value.length
    if (p.added) {
      const prevRemovedInside = parts[i - 1]?.removed && o > start
      const nextRemovedInside = parts[i + 1]?.removed && o < end
      if ((o > start && o < end) || prevRemovedInside || nextRemovedInside) { out.push(p.value); touchedChange = true }
      return
    }
    const s0 = o, e0 = o + len
    if (!p.removed) {
      const a = Math.max(s0, start), b = Math.min(e0, end)
      if (b > a) out.push(p.value.slice(a - s0, b - s0))
    } else if (e0 > start && s0 < end) touchedChange = true
    o = e0
  })
  const text = out.join('').replace(/\s+/g, ' ').trim()
  if (!touchedChange) return { text, how: 'unchanged' }
  return text ? { text, how: 'replaced' } : { text: '', how: 'removed' }
}

// Where that passage ended up in the revision: the same paragraph (drafts,
// by id), else the closest-matching passage -- labelled as such so faculty
// know to double-check. Null when nothing is similar enough.
export function revisedExcerpt(revText, original, origText = null) {
  if (!original) return null
  if (revText.kind === 'html' && original.blockId) {
    const same = revText.blocks.find(b => b.id === original.blockId)
    if (same) return { text: same.text, how: 'same' }
  }
  // Best: by position in the document (what replaced this exact passage).
  if (origText && original.start != null) {
    try {
      const aligned = alignedRevision(origText.text, revText.text, original.start, original.end)
      if (aligned) return aligned
    } catch { /* fall back to matching by similar words */ }
  }
  const units = revText.blocks.map(b => b.text)
  const span = Math.max(1, Math.min(5, revText.kind === 'pdf' ? sentences(original.text).length : 1))
  let best = null
  for (let i = 0; i < units.length; i++) {
    for (let k = 1; k <= span + 1 && i + k <= units.length; k++) {
      const text = units.slice(i, i + k).join(' ')
      const score = similarity(original.text, text)
      if (!best || score > best.score) best = { text, score }
    }
  }
  if (!best || best.score < 0.15) return null
  return { text: best.text, how: best.score > 0.95 ? 'unchanged' : 'closest', score: best.score }
}
