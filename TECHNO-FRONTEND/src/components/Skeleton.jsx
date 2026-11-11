// Grey placeholder shapes shown while a page's data is loading, laid out like
// the content that is coming (cards, table rows, a document page). Purely
// visual: the real content replaces them as soon as the data arrives.
// Styles (.tg-skel shimmer) live in index.css.

const card = { background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2' }

// Screen readers hear "Loading" once instead of a pile of empty boxes.
function Busy({ label = 'Loading', children, style, className }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label={label} style={style} className={className}>
      <span className="tg-sr-only">{label}…</span>
      {children}
    </div>
  )
}

export function Skeleton({ w = '100%', h = 12, r = 6, style }) {
  return <div className="tg-skel" aria-hidden="true" style={{ width: w, height: h, borderRadius: r, ...style }} />
}

// A few lines of text. Widths vary so it reads as text, not a block.
export function SkeletonLines({ lines = 3, h = 10, gap = 8, last = '60%' }) {
  const widths = ['92%', '84%', '96%', '78%', '88%']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} h={h} w={i === lines - 1 ? last : widths[i % widths.length]} />
      ))}
    </div>
  )
}

// Cards like Documents Review / groups / schedules: icon, title, a few lines.
export function SkeletonCards({ count = 4, columns = 1, icon = true, lines = 2, label }) {
  return (
    // Same grid classes as the real pages, so nothing shifts when the content arrives.
    <Busy label={label} className={columns === 2 ? 'dg-grid-2' : columns === 3 ? 'dg-grid-3' : undefined}
      style={{ display: 'grid', gap: '10px', ...(columns > 1 ? {} : { gridTemplateColumns: 'minmax(0, 1fr)' }) }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ ...card, padding: '16px 18px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          {icon && <Skeleton w={36} h={36} r={8} style={{ flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Skeleton w="35%" h={10} />
            <Skeleton w="60%" h={14} />
            <SkeletonLines lines={lines} h={9} gap={7} />
          </div>
          <Skeleton w={64} h={20} r={20} style={{ flexShrink: 0 }} />
        </div>
      ))}
    </Busy>
  )
}

// Table rows like User Accounts / All Projects. `bare` skips the white card
// when the page already draws one around the table.
export function SkeletonTable({ rows = 6, cols = 5, bare = false, label }) {
  const colWidths = ['70%', '55%', '80%', '45%', '60%', '50%']
  const grid = { display: 'grid', gridTemplateColumns: `2fr repeat(${Math.max(cols - 1, 0)}, minmax(0, 1fr))`, gap: '16px', alignItems: 'center' }
  return (
    <Busy label={label} style={bare ? undefined : { ...card, overflow: 'hidden' }}>
      <div style={{ ...grid, padding: '12px 18px', borderBottom: '1px solid #f1f5f9', background: '#fafbfd' }}>
        {Array.from({ length: cols }, (_, c) => <Skeleton key={c} w="50%" h={8} />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ ...grid, padding: '14px 18px', borderBottom: r === rows - 1 ? 'none' : '1px solid #f8fafc' }}>
          {Array.from({ length: cols }, (_, c) => (
            c === 0
              ? <div key={c} style={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0 }}><Skeleton w={28} h={28} r={14} style={{ flexShrink: 0 }} /><Skeleton w={colWidths[r % colWidths.length]} h={11} /></div>
              : <Skeleton key={c} w={colWidths[(r + c) % colWidths.length]} h={10} />
          ))}
        </div>
      ))}
    </Busy>
  )
}

// A whole page that opens with a header block, e.g. My Group / My Progress.
export function SkeletonPage({ cards = 3, label }) {
  return (
    <Busy label={label} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ ...card, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Skeleton w="20%" h={9} />
        <Skeleton w="45%" h={18} />
        <Skeleton w="65%" h={10} />
      </div>
      <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))' }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} style={{ ...card, padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Skeleton w="50%" h={9} /><Skeleton w="70%" h={20} />
          </div>
        ))}
      </div>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} style={{ ...card, padding: '18px 20px' }}><SkeletonLines lines={3} /></div>
      ))}
    </Busy>
  )
}

// A document page (the PDF viewer while the file downloads).
export function SkeletonDocument({ label = 'Loading document' }) {
  return (
    <Busy label={label} style={{ display: 'flex', justifyContent: 'center', padding: '24px 12px' }}>
      <div style={{ background: '#fff', width: 'min(100%, 640px)', aspectRatio: '1 / 1.3', borderRadius: '4px', boxShadow: '0 2px 10px rgba(10,31,68,0.08)', padding: '8% 10%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <Skeleton w="55%" h={16} style={{ alignSelf: 'center', marginBottom: '10px' }} />
        <SkeletonLines lines={5} />
        <SkeletonLines lines={4} />
        <Skeleton w="35%" h={12} style={{ marginTop: '6px' }} />
        <SkeletonLines lines={5} />
      </div>
    </Busy>
  )
}
