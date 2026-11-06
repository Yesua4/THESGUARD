import { useMemo, useState } from 'react'
import CommentCompare from './CommentCompare'
import DocumentDiffViewer from './DocumentDiffViewer'
import { COMMENT_STATUS as STATUS } from '../../../constants/commentStatus'

// Where a comment's highlight stands in the version being viewed (see
// DocumentReviewViewer's anchorStates).
const ANCHOR_NOTE = {
  relocated:    { text: 'Located in this version', bg: '#eff6ff', color: '#1e40af', icon: '↳' },
  needs_review: { text: 'Original text changed — anchor needs review', bg: '#fff7ed', color: '#9a3412', icon: '⚠' },
  locating:     { text: 'Looking for the original text…', bg: '#f8fafc', color: '#64748b', icon: '…' },
}

const FILTERS = [
  ['all', 'All'],
  ['unresolved', 'Unresolved'],
  ['in_progress', 'In progress'],
  ['awaiting_verification', 'Awaiting verification'],
  ['resolved', 'Resolved'],
]
const STATUS_ORDER = ['reopened', 'open', 'in_progress', 'awaiting_verification', 'resolved']

const fmt = d => (d ? new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')
const initials = n => (n || '?').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()

const btn = (variant = 'ghost') => ({
  fontSize: '11px', fontWeight: 700, padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit',
  ...(variant === 'primary' ? { background: 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', border: 'none' }
    : variant === 'good' ? { background: '#059669', color: '#fff', border: 'none' }
    : variant === 'warn' ? { background: '#fff', color: '#b45309', border: '1.5px solid #fcd34d' }
    : variant === 'danger' ? { background: '#fff', color: '#dc2626', border: '1.5px solid #fecaca' }
    : { background: '#fff', color: '#334155', border: '1.5px solid #e2e8f0' }),
})
const textarea = { width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '7px 9px', fontSize: '12px', fontFamily: 'inherit', background: '#fff', resize: 'vertical', minHeight: '56px', outline: 'none' }

function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.open
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', padding: '2px 8px', borderRadius: '20px', fontWeight: 700, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      <span aria-hidden="true">{s.icon}</span>{s.label}
    </span>
  )
}

const EVENT_TEXT = {
  created: 'created the comment', viewed: 'viewed the comment', replied: 'replied',
  status_changed: 'changed the status', revision_submitted: 'submitted a correction for verification',
  approved: 'approved the correction and resolved the comment', revision_requested: 'requested further revision',
  reopened: 'reopened the comment', resolved: 'resolved the comment',
}

function Timeline({ events }) {
  if (!events) return <div style={{ fontSize: '11px', color: '#94a3b8' }}>Loading history…</div>
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, borderLeft: '2px solid #e2e8f0' }}>
      {events.map(ev => (
        <li key={ev.id} style={{ position: 'relative', padding: '0 0 8px 12px', fontSize: '11px', color: '#475569' }}>
          <span aria-hidden="true" style={{ position: 'absolute', left: '-5px', top: '3px', width: '8px', height: '8px', borderRadius: '50%', background: '#94a3b8' }} />
          <div style={{ color: '#94a3b8' }}>{fmt(ev.created_at)}</div>
          <div><strong style={{ color: '#0a1f44' }}>{ev.user?.name || 'System'}</strong> {EVENT_TEXT[ev.type] || ev.type}
            {ev.to_status && ev.type === 'status_changed' ? ` → ${STATUS[ev.to_status]?.label || ev.to_status}` : ''}
          </div>
          {ev.note && <div style={{ fontStyle: 'italic', color: '#64748b' }}>"{ev.note}"</div>}
        </li>
      ))}
    </ol>
  )
}

function CommentCard({ c, n, active, anchorState, chapterVersions, actions, onSelect, onCompare }) {
  const [mode, setMode] = useState(null) // reply | submit | reject | reopen
  const [text, setText] = useState('')
  const [revisionId, setRevisionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [events, setEvents] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const can = c.can || {}
  const status = c.review_status || 'open'
  const lastAttempt = c.attempts?.[c.attempts.length - 1]

  // Saved versions newer than the one the comment was made on (and than any
  // earlier attempt) -- the only valid places a correction can live.
  const minVersion = Math.max(c.origin_version || 0, ...(c.attempts || []).map(a => a.revision?.version || 0))
  const newerVersions = (chapterVersions || []).filter(v => v.version > minVersion).sort((a, b) => b.version - a.version)

  const run = async (fn, after) => {
    setBusy(true); setError('')
    try { await fn(); setMode(null); setText(''); after?.() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const stop = e => e.stopPropagation()

  const toggleHistory = async () => {
    const next = !showHistory
    setShowHistory(next)
    if (next) { setEvents(null); try { setEvents((await actions.history(c.id)).events || []) } catch { setEvents([]) } }
  }

  return (
    <div onClick={() => onSelect?.(c)} style={{
      background: active ? '#eff6ff' : '#f8fafc', border: active ? '1.5px solid #1d4ed8' : '1.5px solid transparent',
      borderRadius: '10px', padding: '12px 14px', cursor: 'pointer', opacity: status === 'resolved' && !active ? 0.8 : 1,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <div title={`Comment ${n}`} style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#0a1f44', color: '#fff', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
            {initials(c.user?.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0a1f44' }}>{c.user?.name}</div>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.user?.role} · #{n} · {fmt(c.created_at)}</div>
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
        <span>Page {c.page_number}{c.carried ? ` of v${c.origin_version}` : ''}</span>
        {c.carried && <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '20px', background: '#ede9fe', color: '#5b21b6' }}>From v{c.origin_version}</span>}
      </div>
      {ANCHOR_NOTE[anchorState] && (
        <div role="status" style={{ display: 'flex', gap: '6px', fontSize: '11px', fontWeight: 600, padding: '5px 8px', borderRadius: '6px', marginBottom: '8px', background: ANCHOR_NOTE[anchorState].bg, color: ANCHOR_NOTE[anchorState].color }}>
          <span aria-hidden="true">{ANCHOR_NOTE[anchorState].icon}</span><span>{ANCHOR_NOTE[anchorState].text}</span>
        </div>
      )}

      {c.selected_text && (
        <div style={{ background: '#fffbeb', borderLeft: '3px solid #f5c300', padding: '6px 10px', marginBottom: '8px', fontSize: '12px', color: '#64748b', fontStyle: 'italic', borderRadius: '0 6px 6px 0' }}>
          "{c.selected_text}"
        </div>
      )}
      <div style={{ fontSize: '13px', color: '#334155', marginBottom: '8px', whiteSpace: 'pre-wrap' }}>{c.comment}</div>

      {/* Correction attempts */}
      {(c.attempts || []).map(a => (
        <div key={a.id} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: '8px', padding: '8px 10px', marginBottom: '8px', fontSize: '12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>
            Correction #{a.attempt_no} · {a.submitter?.name} · revised in v{a.revision?.version ?? '?'} · {fmt(a.created_at)}
          </div>
          <div style={{ color: '#334155', whiteSpace: 'pre-wrap' }}>{a.explanation}</div>
          <button type="button" onClick={e => { e.stopPropagation(); onCompare(c, a) }}
            style={{ marginTop: '6px', fontSize: '11px', fontWeight: 600, color: '#1d4ed8', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            ⇄ Compare original vs revised
          </button>
          {a.decision !== 'pending' && (
            <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #e2e8f0', color: a.decision === 'approved' ? '#065f46' : '#991b1b' }}>
              <strong>{a.decision === 'approved' ? '✓ Approved' : '↺ Further revision requested'}</strong> by {a.decider?.name} · {fmt(a.decided_at)}
              {a.decision_note && <div style={{ fontStyle: 'italic', color: '#475569' }}>"{a.decision_note}"</div>}
            </div>
          )}
        </div>
      ))}

      {/* Thread */}
      {(c.replies || []).length > 0 && (
        <div style={{ borderLeft: '2px solid #e2e8f0', paddingLeft: '10px', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {c.replies.map(r => (
            <div key={r.id} style={{ fontSize: '12px' }}>
              <span style={{ fontWeight: 700, color: '#0a1f44' }}>{r.user?.name}</span>
              <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '6px' }}>{r.user?.role} · {fmt(r.created_at)}</span>
              <div style={{ color: '#334155', whiteSpace: 'pre-wrap' }}>{r.body}</div>
            </div>
          ))}
        </div>
      )}

      {status === 'awaiting_verification' && !can.verify && (
        <div style={{ fontSize: '11px', color: '#5b21b6', background: '#f5f3ff', borderRadius: '6px', padding: '6px 8px', marginBottom: '8px' }}>
          Your correction was submitted and is awaiting verification from {c.verifier?.name || 'the commenter'}.
        </div>
      )}
      {status === 'resolved' && (
        <div style={{ fontSize: '11px', color: '#065f46', marginBottom: '8px' }}>
          ✓ Verified by {c.resolver?.name}{c.on_behalf_of ? ` on behalf of ${c.on_behalf_of.name}` : ''} · {fmt(c.resolved_at)}
        </div>
      )}

      {/* Forms */}
      {mode && (
        <div onClick={stop} style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
          {mode === 'submit' && (
            newerVersions.length === 0 ? (
              <div style={{ fontSize: '11px', color: '#9a3412', background: '#fff7ed', borderRadius: '6px', padding: '6px 8px' }}>
                Save your corrected document as a new version first (Edit → Save, or upload a new file). Then come back to submit it here. A reply alone doesn't count as a revision.
              </div>
            ) : (
              <label style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>
                Revised version
                <select value={revisionId} onChange={e => setRevisionId(e.target.value)} style={{ ...textarea, minHeight: 0, marginTop: '3px' }}>
                  <option value="">Choose the version with your fix…</option>
                  {newerVersions.map(v => <option key={v.id} value={v.id}>Version {v.version}{v.version_note ? ` — ${v.version_note}` : ''}</option>)}
                </select>
              </label>
            )
          )}
          {!(mode === 'submit' && newerVersions.length === 0) && (
            <textarea autoFocus value={text} onChange={e => setText(e.target.value)} style={textarea}
              aria-label={mode === 'reply' ? 'Reply' : 'Explanation'}
              placeholder={mode === 'reply' ? 'Write a reply…' : mode === 'submit' ? 'What did you change? e.g. "I revised the paragraph and listed the monitoring features."'
                : mode === 'reject' ? 'What still needs to change?' : 'Why is this being reopened?'} />
          )}
          {error && <div role="alert" style={{ fontSize: '11px', color: '#dc2626', background: '#fee2e2', borderRadius: '6px', padding: '6px 8px' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => { setMode(null); setError('') }} style={btn()}>Cancel</button>
            {mode === 'reply' && <button type="button" disabled={busy || !text.trim()} onClick={() => run(() => actions.reply(c.id, text.trim()))} style={btn('primary')}>{busy ? 'Sending…' : 'Reply'}</button>}
            {mode === 'submit' && newerVersions.length > 0 && (
              <button type="button" disabled={busy || !revisionId || text.trim().length < 10}
                onClick={() => run(() => actions.submitCorrection(c.id, { revisionDocumentId: Number(revisionId), explanation: text.trim() }))}
                style={btn('primary')}>{busy ? 'Submitting…' : 'Submit for verification'}</button>
            )}
            {mode === 'reject' && <button type="button" disabled={busy || !text.trim()} onClick={() => run(() => actions.verify(c.id, 'reject', text.trim()))} style={btn('warn')}>{busy ? 'Saving…' : 'Request further revision'}</button>}
            {mode === 'reopen' && <button type="button" disabled={busy || !text.trim()} onClick={() => run(() => actions.reopen(c.id, text.trim()))} style={btn('warn')}>{busy ? 'Saving…' : 'Reopen'}</button>}
          </div>
        </div>
      )}
      {!mode && error && <div role="alert" style={{ fontSize: '11px', color: '#dc2626', background: '#fee2e2', borderRadius: '6px', padding: '6px 8px', marginBottom: '8px' }}>{error}</div>}

      {/* Actions -- only what the server says this user may do */}
      {!mode && (
        <div onClick={stop} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {can.verify && (
            <>
              {lastAttempt && <button type="button" onClick={() => onCompare(c, lastAttempt)} style={btn('primary')}>Review correction</button>}
              <button type="button" disabled={busy} onClick={() => { if (confirm('Approve this correction and resolve the comment?')) run(() => actions.verify(c.id, 'approve')) }} style={btn('good')}>✓ Approve &amp; resolve</button>
              <button type="button" onClick={() => setMode('reject')} style={btn('warn')}>↺ Request further revision</button>
            </>
          )}
          {can.start && <button type="button" disabled={busy} onClick={() => run(() => actions.start(c.id))} style={btn()}>Start working on this</button>}
          {can.submit && <button type="button" onClick={() => { setMode('submit'); setText(''); setRevisionId(newerVersions[0] ? String(newerVersions[0].id) : '') }} style={btn('primary')}>Addressed — ready for review</button>}
          {can.reply && <button type="button" onClick={() => { setMode('reply'); setText('') }} style={btn()}>Reply</button>}
          {can.reopen && <button type="button" onClick={() => setMode('reopen')} style={btn('warn')}>Reopen</button>}
          {can.resolve && !can.verify && <button type="button" disabled={busy} onClick={() => { if (confirm('Resolve this comment without a submitted correction?')) run(() => actions.resolve(c.id)) }} style={btn()}>Resolve</button>}
          {can.delete && <button type="button" disabled={busy} onClick={() => { if (confirm('Delete this comment?')) run(() => actions.deleteComment(c.id)) }} style={btn('danger')}>Delete</button>}
          <button type="button" onClick={toggleHistory} aria-expanded={showHistory} style={{ ...btn(), border: 'none', background: 'none', color: '#1d4ed8', padding: '5px 2px' }}>
            {showHistory ? 'Hide history' : 'History'}{lastAttempt ? ` · ${c.attempts.length} attempt${c.attempts.length > 1 ? 's' : ''}` : ''}
          </button>
        </div>
      )}
      {showHistory && <div onClick={stop} style={{ marginTop: '10px' }}><Timeline events={events} /></div>}
    </div>
  )
}

export default function CommentSidebar({ comments, anchorStates = {}, chapterVersions = [], actions, onSelect, activeCommentId }) {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('position')
  const [compare, setCompare] = useState(null) // { comment, attempt }
  const [fullDiff, setFullDiff] = useState(null) // { oldDoc, newDoc }
  const docById = id => chapterVersions.find(v => v.id === id)

  const numbered = useMemo(() => comments.map((c, i) => ({ c, n: i + 1 })), [comments])
  const counts = useMemo(() => {
    const out = { all: comments.length, unresolved: 0 }
    comments.forEach(c => {
      const s = c.review_status || 'open'
      out[s] = (out[s] || 0) + 1
      if (s !== 'resolved') out.unresolved++
    })
    return out
  }, [comments])

  const shown = useMemo(() => {
    const list = numbered.filter(({ c }) => {
      const s = c.review_status || 'open'
      return filter === 'all' || (filter === 'unresolved' ? s !== 'resolved' : s === filter)
    })
    if (sort === 'date') list.sort((a, b) => new Date(b.c.created_at) - new Date(a.c.created_at))
    else if (sort === 'status') list.sort((a, b) => STATUS_ORDER.indexOf(a.c.review_status || 'open') - STATUS_ORDER.indexOf(b.c.review_status || 'open'))
    return list
  }, [numbered, filter, sort])

  if (comments.length === 0) {
    return <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '32px 0' }}>No comments yet. Select text in the document to add one.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div role="tablist" aria-label="Filter comments" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {FILTERS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} style={{
            fontSize: '11px', fontWeight: 600, padding: '4px 9px', borderRadius: '20px', cursor: 'pointer', fontFamily: 'inherit',
            border: `1.5px solid ${filter === key ? '#1d4ed8' : '#e2e8f0'}`, background: filter === key ? '#eff6ff' : '#fff', color: filter === key ? '#1d4ed8' : '#64748b',
          }}>{label} ({counts[key] || 0})</button>
        ))}
      </div>
      <label style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
        Sort by
        <select value={sort} onChange={e => setSort(e.target.value)} style={{ fontSize: '11px', padding: '3px 6px', borderRadius: '6px', border: '1.5px solid #e2e8f0', fontFamily: 'inherit' }}>
          <option value="position">Position in document</option>
          <option value="date">Newest first</option>
          <option value="status">Status</option>
        </select>
      </label>
      {shown.length === 0 && <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No comments match this filter.</div>}
      {shown.map(({ c, n }) => (
        <CommentCard key={c.id} c={c} n={n} active={c.id === activeCommentId} anchorState={anchorStates[c.id]}
          chapterVersions={chapterVersions} actions={actions} onSelect={onSelect}
          onCompare={(comment, attempt) => setCompare({ comment, attempt })} />
      ))}
      {compare && (
        <CommentCompare
          comment={compare.comment} attempt={compare.attempt}
          originDoc={docById(compare.comment.document_id)} revisionDoc={docById(compare.attempt.revision_document_id)}
          canDecide={!!compare.comment.can?.verify && compare.attempt.decision === 'pending'}
          actions={actions} onClose={() => setCompare(null)}
          onOpenFull={() => setFullDiff({ oldDoc: docById(compare.comment.document_id), newDoc: docById(compare.attempt.revision_document_id) })} />
      )}
      {fullDiff?.oldDoc && fullDiff?.newDoc && (
        <DocumentDiffViewer oldDocument={fullDiff.oldDoc} newDocument={fullDiff.newDoc} onClose={() => setFullDiff(null)} />
      )}
    </div>
  )
}
