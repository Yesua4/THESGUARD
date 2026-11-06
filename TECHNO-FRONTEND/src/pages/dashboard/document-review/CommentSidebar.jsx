// Where a comment's highlight stands in the version being viewed (see
// DocumentReviewViewer's anchorStates). Text labels, not color alone.
const ANCHOR_NOTE = {
  relocated:    { text: 'Located in this version', bg: '#eff6ff', color: '#1e40af', icon: '↳' },
  needs_review: { text: 'Original text changed — anchor needs review', bg: '#fff7ed', color: '#9a3412', icon: '⚠' },
  locating:     { text: 'Looking for the original text…', bg: '#f8fafc', color: '#64748b', icon: '…' },
}

export default function CommentSidebar({ comments, anchorStates = {}, currentUserId, canResolve, onSelect, onDelete, onSetResolved, activeCommentId }) {
  if (comments.length === 0) {
    return <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '32px 0' }}>No comments yet. Select text or click on the page to add one.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {comments.map((c, i) => {
        const resolved = c.status === 'resolved'
        const isActive = c.id === activeCommentId
        return (
          <div
            key={c.id}
            onClick={() => onSelect?.(c)}
            style={{
              background: isActive ? '#eff6ff' : '#f8fafc',
              border: isActive ? '1.5px solid #1d4ed8' : '1.5px solid transparent',
              borderRadius: '10px',
              padding: '12px 14px',
              cursor: 'pointer',
              opacity: resolved ? 0.7 : 1,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#dc2626', color: '#fff', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#0a1f44' }}>{c.user?.name}</span>
                <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'capitalize' }}>{c.user?.role}</span>
              </div>
              <span style={{
                fontSize: '10px', padding: '2px 8px', borderRadius: '20px', fontWeight: 700,
                background: resolved ? '#d1fae5' : '#fef3c7',
                color: resolved ? '#065f46' : '#92400e',
              }}>
                {resolved ? '✓ Resolved' : 'Open'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
              <span>Page {c.page_number}{c.carried ? ` of v${c.origin_version}` : ''}</span>
              {c.carried && (
                <span title="Made on an earlier version of this chapter and not yet resolved" style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '20px', background: '#ede9fe', color: '#5b21b6' }}>
                  From v{c.origin_version}
                </span>
              )}
            </div>
            {ANCHOR_NOTE[anchorStates[c.id]] && (
              <div role="status" style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '11px', fontWeight: 600, padding: '5px 8px', borderRadius: '6px', marginBottom: '8px', background: ANCHOR_NOTE[anchorStates[c.id]].bg, color: ANCHOR_NOTE[anchorStates[c.id]].color }}>
                <span aria-hidden="true">{ANCHOR_NOTE[anchorStates[c.id]].icon}</span>
                <span>{ANCHOR_NOTE[anchorStates[c.id]].text}</span>
              </div>
            )}

            {c.selected_text && (
              <div style={{ background: '#fffbeb', borderLeft: '3px solid #f5c300', padding: '6px 10px', marginBottom: '8px', fontSize: '12px', color: '#64748b', fontStyle: 'italic', borderRadius: '0 6px 6px 0' }}>
                "{c.selected_text}"
              </div>
            )}

            <div style={{ fontSize: '13px', color: '#334155', marginBottom: '8px' }}>{c.comment}</div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {c.created_at ? new Date(c.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
              <div style={{ display: 'flex', gap: '10px' }}>
                {canResolve && (
                  <button
                    onClick={e => { e.stopPropagation(); onSetResolved(c.id, !resolved) }}
                    style={{ fontSize: '11px', color: resolved ? '#92400e' : '#059669', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                  >
                    {resolved ? 'Reopen' : 'Resolve'}
                  </button>
                )}
                {c.user_id === currentUserId && (
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(c.id) }}
                    style={{ fontSize: '11px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
