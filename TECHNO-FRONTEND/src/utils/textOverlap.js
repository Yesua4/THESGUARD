// Greedy phrase-overlap highlighter: finds runs of consecutive words that
// appear verbatim in both texts (case/punctuation-insensitive) and returns
// the first text split into segments marked matched/unmatched, so the UI can
// show *where* a similarity score actually came from instead of just a number.
// Not real NLP — a simple, fast, good-enough visual aid.

const MIN_MATCH_WORDS = 4

function tokenize(text) {
  const matches = [...text.matchAll(/[a-z0-9']+|[^\sa-z0-9']+|\s+/gi)]
  return matches.map(m => ({ raw: m[0], norm: m[0].toLowerCase().replace(/[^a-z0-9']/g, '') }))
}

export function highlightOverlap(ownText, otherText) {
  if (!ownText) return []
  if (!otherText) return [{ text: ownText, matched: false }]

  const ownTokens = tokenize(ownText)
  const otherWords = tokenize(otherText).map(t => t.norm).filter(Boolean)
  const haystack = otherWords.join(' ')

  const segments = []
  let buffer = ''
  let i = 0

  while (i < ownTokens.length) {
    let matchLen = 0
    if (ownTokens[i].norm) {
      // Try the longest run starting at i that also appears as a contiguous
      // sequence in the other text; walk it down until it fits or gives up.
      for (let len = Math.min(20, ownTokens.length - i); len >= MIN_MATCH_WORDS; len--) {
        const words = ownTokens.slice(i, i + len).map(t => t.norm).filter(Boolean)
        if (words.length < MIN_MATCH_WORDS) continue
        const needle = words.join(' ')
        if (needle.length > 0 && haystack.includes(needle)) {
          matchLen = len
          break
        }
      }
    }

    if (matchLen > 0) {
      if (buffer) { segments.push({ text: buffer, matched: false }); buffer = '' }
      const matchedText = ownTokens.slice(i, i + matchLen).map(t => t.raw).join('')
      segments.push({ text: matchedText, matched: true })
      i += matchLen
    } else {
      buffer += ownTokens[i].raw
      i++
    }
  }
  if (buffer) segments.push({ text: buffer, matched: false })

  return segments
}
