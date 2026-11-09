// Tidies a Word file that LibreOffice turned into HTML, before it goes into
// the built-in editor:
//  - tables fit the page: fixed pixel widths become percentages of the page
//    (same column proportions), long words wrap inside cells;
//  - one font: LibreOffice switches fonts cell by cell (e.g. Times New Roman
//    in one column, Arial in the next); everything uses the document's main
//    font instead;
//  - page headers/footers (page numbers etc.) are dropped -- they belong to
//    printed pages, not the continuous editor, and showed up as empty bars.
export default function normalizeImportedHtml(html) {
  if (!html || typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(`<div id="tg-root">${html}</div>`, 'text/html')
  const root = doc.getElementById('tg-root')
  if (!root) return html

  // Headers / footers from the Word page layout.
  root.querySelectorAll('[title="header"], [title="footer"], header, footer').forEach(el => el.remove())

  // Tables: proportional column widths, full page width.
  root.querySelectorAll('table').forEach(table => {
    const cols = [...table.querySelectorAll(':scope > colgroup > col, :scope > col')]
    const widths = cols.map(c => parseFloat(c.getAttribute('width') || c.style.width) || 0)
    const total = widths.reduce((a, b) => a + b, 0)
    if (total > 0) cols.forEach((c, i) => { c.removeAttribute('width'); c.style.width = `${((widths[i] / total) * 100).toFixed(2)}%` })
    table.removeAttribute('width')
    table.style.width = '100%'
    table.style.maxWidth = '100%'
    table.style.tableLayout = 'fixed'
    table.style.borderCollapse = 'collapse'
    table.querySelectorAll('td, th').forEach(cell => {
      cell.removeAttribute('width')
      cell.style.width = ''
      cell.style.overflowWrap = 'anywhere'
      cell.style.wordBreak = 'break-word'
    })
  })

  // One font: the one most of the text uses.
  const counts = {}
  const fontOf = el => (el.getAttribute('face') || el.style.fontFamily || '').split(',')[0].replace(/["']/g, '').trim()
  root.querySelectorAll('[face], [style*="font-family"]').forEach(el => {
    const f = fontOf(el)
    if (f) counts[f] = (counts[f] || 0) + (el.textContent || '').length
  })
  const main = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
  if (main) {
    root.querySelectorAll('[face]').forEach(el => el.setAttribute('face', main))
    root.querySelectorAll('[style*="font-family"]').forEach(el => { el.style.fontFamily = `"${main}", serif` })
    // Text with no font of its own inherits it from the first block.
    const first = root.firstElementChild
    if (first && !first.style.fontFamily) root.querySelectorAll(':scope > p, :scope > table, :scope > ol, :scope > ul, :scope > h1, :scope > h2, :scope > h3').forEach(el => {
      if (!el.style.fontFamily) el.style.fontFamily = `"${main}", serif`
    })
  }

  return root.innerHTML
}
