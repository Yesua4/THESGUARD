import { useState } from 'react'

// Popover for writing a new comment. page_number / selected_text / anchor are
// always derived from what the user selected or clicked on the rendered PDF
// page — never typed in by hand.
//
// Rendered as an absolutely-positioned card anchored just below the actual
// selection (a child of the same relatively-positioned page container the
// highlight overlays use), NOT a full-screen modal — a full-screen backdrop
// would hide the very text the user just highlighted, making it impossible
// to see (and fix, if it's slightly off) what's about to be commented on.
export default function CommentComposer({ draft, onSubmit, onCancel }) {
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  if (!draft) return null

  const submit = async e => {
    e.preventDefault()
    if (!comment.trim()) return
    setSaving(true)
    try {
      await onSubmit({ ...draft, comment: comment.trim() })
      setComment('')
    } finally {
      setSaving(false)
    }
  }

  const rects = Array.isArray(draft.anchor) ? draft.anchor : null
  const point = rects ? rects[rects.length - 1] : draft.anchor
  const anchorTop = point ? (point.y + (point.height || 0)) * 100 : 4
  const anchorLeft = point ? Math.min(point.x * 100, 60) : 4

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: `calc(${anchorTop}% + 6px)`,
        left: `${anchorLeft}%`,
        zIndex: 60,
        width: 'min(320px, 88vw)',
        background: '#fff',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
      }}
    >
      <div style={{ background: 'linear-gradient(135deg,#0a1f44,#1040a0)', padding: '10px 14px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>New Comment — Page {draft.pageNumber}</div>
      </div>
      <form onSubmit={submit} style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {draft.selectedText && (
          <div style={{ background: '#fffbeb', borderLeft: '3px solid #f5c300', padding: '6px 8px', fontSize: '11px', color: '#64748b', fontStyle: 'italic', borderRadius: '0 6px 6px 0', maxHeight: '60px', overflowY: 'auto' }}>
            "{draft.selectedText}"
          </div>
        )}
        {!draft.selectedText && (
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Pinned to a spot on the page.</div>
        )}
        <textarea
          autoFocus
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Write your feedback…"
          required
          style={{ border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', outline: 'none', background: '#f8fafc', fontFamily: 'inherit', minHeight: '70px', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{ padding: '6px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving || !comment.trim()} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: saving || !comment.trim() ? '#cbd5e1' : 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: saving || !comment.trim() ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Adding…' : 'Add Comment'}
          </button>
        </div>
      </form>
    </div>
  )
}
