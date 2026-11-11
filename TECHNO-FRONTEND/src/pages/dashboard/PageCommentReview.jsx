import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../api/axios'
import { COMMENT_STATUS } from '../../constants/commentStatus'
import { useSchoolActivity } from '../../hooks/useSchoolActivity'
import { SkeletonCards } from '../../components/Skeleton'

// Comment progress across every project the user can see (spec §12-13).
// Students: their project's comments by status, with a progress bar.
// Faculty: the same, plus "Awaiting my verification" first -- corrections
// students say are done that still need THEIR approval. All from the
// database (GET /comment-review), live via school activity.
const ORDER = ['open', 'reopened', 'in_progress', 'awaiting_verification', 'resolved']
const STAGES = { ongoing: 'Ongoing', for_defense: 'For defense', approved: 'Approved', archived: 'Archived', flagged: 'Flagged' }

const fmt = d => (d ? new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')

function Pill({ status }) {
  const s = COMMENT_STATUS[status] || COMMENT_STATUS.open
  return <span style={{ display: 'inline-flex', gap: '4px', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: s.bg, color: s.color, whiteSpace: 'nowrap' }}><span aria-hidden="true">{s.icon}</span>{s.label}</span>
}

function Row({ r, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen(r)} style={{
      width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px 14px',
      border: 'none', borderBottom: '1px solid #f1f5f9', background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
    }}
      onMouseOver={e => { e.currentTarget.style.background = '#f8fafc' }} onMouseOut={e => { e.currentTarget.style.background = '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#0a1f44' }}>
          {r.project.title} · {r.chapter_label} v{r.version} · p.{r.page_number}
        </span>
        <Pill status={r.review_status} />
      </div>
      {r.selected_text && <span style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>"{r.selected_text}"</span>}
      <span style={{ fontSize: '13px', color: '#334155' }}>{r.comment}</span>
      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
        {r.author?.name} ({r.author?.role}){r.group ? ` · ${r.group}` : ''}{r.students?.length ? ` · ${r.students.join(', ')}` : ''} · updated {fmt(r.updated_at)}
      </span>
    </button>
  )
}

export default function PageCommentReview({ user, onOpen }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [f, setF] = useState({ status: '', chapter: '', document: '', commenter: '', group: '', student: '', stage: '', mine: false })
  const isStudent = user?.role === 'student'

  const load = useCallback(() => api.get('/comment-review')
    .then(res => { setData(res.data); setError('') })
    .catch(() => setError('Could not load comments.')), [])
  useEffect(() => { load() }, [load])
  useSchoolActivity(['comments', 'documents', 'projects', 'groups'], load)

  const open = r => onOpen?.({ page: isStudent ? 'submit' : 'docreview', documentId: r.document_id, commentId: r.id })

  const rows = useMemo(() => data?.comments || [], [data])
  const options = useMemo(() => {
    const uniq = (fn) => [...new Set(rows.map(fn).filter(Boolean))].sort()
    return {
      chapter: uniq(r => r.chapter_label),
      document: uniq(r => `${r.project.title} · ${r.chapter_label} v${r.version}`),
      commenter: uniq(r => r.author?.name),
      group: uniq(r => r.group),
      student: [...new Set(rows.flatMap(r => r.students || []))].sort(),
      stage: uniq(r => r.project.stage),
    }
  }, [rows])

  const shown = rows.filter(r =>
    (!f.status || (f.status === 'unresolved' ? r.review_status !== 'resolved' : r.review_status === f.status)) &&
    (!f.chapter || r.chapter_label === f.chapter) &&
    (!f.document || `${r.project.title} · ${r.chapter_label} v${r.version}` === f.document) &&
    (!f.commenter || r.author?.name === f.commenter) &&
    (!f.group || r.group === f.group) &&
    (!f.student || (r.students || []).includes(f.student)) &&
    (!f.stage || r.project.stage === f.stage) &&
    (!f.mine || r.mine))

  const counts = data?.counts || {}
  const total = counts.total || 0
  const resolvedPct = total ? Math.round(((counts.resolved || 0) / total) * 100) : 0
  const select = { border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', background: '#fff', fontFamily: 'inherit' }
  const filter = (key, label, list, render = v => v) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {label}
      <select value={f[key]} onChange={e => setF({ ...f, [key]: e.target.value })} style={select}>
        <option value="">All</option>
        {list.map(v => <option key={v} value={v}>{render(v)}</option>)}
      </select>
    </label>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ background: 'linear-gradient(135deg,#0a1f44,#1040a0)', borderRadius: '14px', padding: '20px 24px' }}>
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Document Review</div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>{isStudent ? 'My Comments' : user?.role === 'admin' ? 'Comment Monitoring' : 'Review Comments'}</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>
          {isStudent ? 'Every comment on your documents and where it stands. Click one to open it.' : 'Comments on the projects you handle, and corrections waiting for your verification.'}
        </div>
      </div>

      {error && <div role="alert" style={{ background: '#fee2e2', color: '#9f1239', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' }}>{error}</div>}
      {!data && !error && <SkeletonCards count={4} label="Loading comments" />}

      {data && (
        <>
          {/* Totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            <button type="button" onClick={() => setF({ ...f, status: '' })} style={{ textAlign: 'left', background: '#fff', border: `1.5px solid ${!f.status ? '#1d4ed8' : '#e8ecf2'}`, borderRadius: '12px', padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#0a1f44' }}>{total}</div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Total comments</div>
            </button>
            {ORDER.map(s => (
              <button key={s} type="button" onClick={() => setF({ ...f, status: f.status === s ? '' : s })} aria-pressed={f.status === s}
                style={{ textAlign: 'left', background: '#fff', border: `1.5px solid ${f.status === s ? COMMENT_STATUS[s].color : '#e8ecf2'}`, borderRadius: '12px', padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                <div style={{ fontSize: '22px', fontWeight: 800, color: COMMENT_STATUS[s].color }}>{counts[s] || 0}</div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}><span aria-hidden="true">{COMMENT_STATUS[s].icon} </span>{COMMENT_STATUS[s].label}</div>
              </button>
            ))}
          </div>

          {/* Progress = verified (resolved) comments only */}
          <div style={{ background: '#fff', border: '1px solid #e8ecf2', borderRadius: '12px', padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#334155', marginBottom: '6px' }}>
              <span style={{ fontWeight: 700 }}>Resolution progress</span>
              <span>{counts.resolved || 0} of {total} verified as resolved ({resolvedPct}%)</span>
            </div>
            <div role="progressbar" aria-valuenow={resolvedPct} aria-valuemin={0} aria-valuemax={100} aria-label="Comments verified as resolved"
              style={{ height: '10px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ width: `${resolvedPct}%`, height: '100%', background: '#059669', transition: 'width 0.3s' }} />
            </div>
          </div>

          {/* Faculty: what needs MY decision */}
          {!isStudent && user?.role !== 'admin' && (
            <div style={{ background: '#fff', border: '1.5px solid #c4b5fd', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: '#f5f3ff', fontSize: '13px', fontWeight: 700, color: '#5b21b6' }}>
                ⧗ Awaiting my verification ({data.awaiting_my_verification.length})
              </div>
              {data.awaiting_my_verification.length === 0
                ? <div style={{ padding: '14px', fontSize: '12px', color: '#94a3b8' }}>Nothing waiting for you right now.</div>
                : data.awaiting_my_verification.map(r => <Row key={r.id} r={r} onOpen={open} />)}
            </div>
          )}

          {/* Filters */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', background: '#fff', border: '1px solid #e8ecf2', borderRadius: '12px', padding: '12px 14px' }}>
            {filter('status', 'Status', ['unresolved', ...ORDER], v => v === 'unresolved' ? 'Unresolved' : COMMENT_STATUS[v].label)}
            {filter('chapter', 'Chapter', options.chapter)}
            {filter('document', 'Document', options.document)}
            {filter('commenter', 'Commenter', options.commenter)}
            {!isStudent && filter('group', 'Research group', options.group)}
            {!isStudent && filter('student', 'Student', options.student)}
            {!isStudent && filter('stage', 'Defense stage', options.stage, v => STAGES[v] || v)}
            {!isStudent && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#334155', paddingBottom: '6px' }}>
                <input type="checkbox" checked={f.mine} onChange={e => setF({ ...f, mine: e.target.checked })} /> Only my comments
              </label>
            )}
          </div>

          <div style={{ background: '#fff', border: '1px solid #e8ecf2', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>
              Showing {shown.length} of {total}{data.truncated ? ' (most recent 1,000)' : ''}
            </div>
            {shown.length === 0
              ? <div style={{ padding: '30px', textAlign: 'center', fontSize: '13px', color: '#94a3b8' }}>{total === 0 ? 'No comments yet.' : 'No comments match these filters.'}</div>
              : shown.map(r => <Row key={r.id} r={r} onOpen={open} />)}
          </div>
        </>
      )}
    </div>
  )
}
