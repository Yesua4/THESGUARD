import { useEffect, useState } from 'react'
import { diffWords } from 'diff'
import { getDocumentText, originalExcerpt, revisedExcerpt } from '../../../utils/revisionExcerpt'

// What faculty look at before approving a correction (spec §8-9): the
// original passage next to the revised one, changes marked with
// strikethrough/underline AND −/+ markers (not colour alone), plus the
// comment and the student's explanation. Only the relevant paragraph is
// compared; the whole-document comparison is one click away.
export default function CommentCompare({ comment, attempt, originDoc, revisionDoc, canDecide, actions, onClose, onOpenFull }) {
  const [state, setState] = useState({ loading: true })
  const [note, setNote] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!originDoc || !revisionDoc) return
    Promise.all([getDocumentText(originDoc), getDocumentText(revisionDoc)])
      .then(([o, r]) => {
        if (cancelled) return
        const original = originalExcerpt(o, comment)
        const revised = revisedExcerpt(r, original)
        setState({ loading: false, original, revised, parts: original && revised ? diffWords(original.text, revised.text) : null })
      })
      .catch(() => { if (!cancelled) setState({ loading: false, failed: true }) })
    return () => { cancelled = true }
  }, [comment, originDoc, revisionDoc])

  const decide = async (decision) => {
    setBusy(true); setError('')
    try { await actions.verify(comment.id, decision, decision === 'reject' ? note.trim() : null); onClose() }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const missingDoc = !originDoc || !revisionDoc
  const col = { flex: 1, minWidth: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px' }
  const heading = { fontSize: '10px', fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }
  const how = state.revised?.how

  return (
    <div role="dialog" aria-modal="true" aria-label="Original versus revised text" onClick={e => e.stopPropagation()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,31,68,0.4)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: 'min(980px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: '#f8fafc', borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ background: 'linear-gradient(135deg,#0a1f44,#1040a0)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0 }}>
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Correction #{attempt.attempt_no} · {attempt.submitter?.name}</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Original (v{originDoc?.version ?? '?'}) vs revised (v{revisionDoc?.version ?? '?'})</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>✕</button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
            <div style={col}>
              <div style={heading}>Original comment · {comment.user?.name}</div>
              <div style={{ fontSize: '13px', color: '#334155', whiteSpace: 'pre-wrap' }}>{comment.comment}</div>
            </div>
            <div style={col}>
              <div style={heading}>Student response</div>
              <div style={{ fontSize: '13px', color: '#334155', whiteSpace: 'pre-wrap' }}>{attempt.explanation}</div>
            </div>
          </div>

          {missingDoc && <div style={{ fontSize: '12px', color: '#9a3412', background: '#fff7ed', borderRadius: '8px', padding: '10px 12px' }}>One of these versions is no longer available, so the text can't be compared here.</div>}
          {!missingDoc && state.loading && <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '30px' }}>Comparing the passage…</div>}
          {state.failed && <div style={{ fontSize: '12px', color: '#9a3412', background: '#fff7ed', borderRadius: '8px', padding: '10px 12px' }}>The text of one version couldn't be read (for example, a scanned PDF has no text). Open the full comparison or the documents themselves to check.</div>}

          {!state.loading && !state.failed && !missingDoc && (
            <>
              <div role="note" style={{ fontSize: '11px', color: '#475569', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                <span><del style={{ color: '#9f1239' }}>− removed</del></span>
                <span><ins style={{ color: '#065f46', textDecorationThickness: '2px' }}>+ added</ins></span>
                <span>
                  {how === 'same' ? 'Matched by paragraph (same paragraph in both versions).'
                    : how === 'unchanged' ? '⚠ This passage looks unchanged in the revision.'
                    : how === 'closest' ? '⚠ The original paragraph was moved or rewritten; showing the closest matching passage. Please double-check.'
                    : ''}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
                <div style={col}>
                  <div style={heading}>Original text (v{originDoc.version})</div>
                  <div style={{ fontSize: '13px', lineHeight: 1.8, color: '#334155', whiteSpace: 'pre-wrap' }}>
                    {state.parts ? state.parts.filter(p => !p.added).map((p, i) => p.removed
                      ? <del key={i} style={{ background: 'rgba(220,38,38,0.12)', color: '#9f1239', borderRadius: '3px' }}><span className="sr-only">[removed: </span>{p.value}<span className="sr-only">]</span></del>
                      : <span key={i}>{p.value}</span>)
                      : (state.original?.text || <em style={{ color: '#94a3b8' }}>The commented text couldn't be found in v{originDoc.version}.</em>)}
                  </div>
                </div>
                <div style={col}>
                  <div style={heading}>Revised text (v{revisionDoc.version})</div>
                  <div style={{ fontSize: '13px', lineHeight: 1.8, color: '#334155', whiteSpace: 'pre-wrap' }}>
                    {state.parts ? state.parts.filter(p => !p.removed).map((p, i) => p.added
                      ? <ins key={i} style={{ background: 'rgba(5,150,105,0.15)', color: '#065f46', textDecorationThickness: '2px', borderRadius: '3px' }}><span className="sr-only">[added: </span>{p.value}<span className="sr-only">]</span></ins>
                      : <span key={i}>{p.value}</span>)
                      : <em style={{ color: '#9a3412' }}>No matching passage was found in v{revisionDoc.version} — the paragraph may have been deleted or completely rewritten. Open the full comparison to check.</em>}
                  </div>
                </div>
              </div>
            </>
          )}

          {error && <div role="alert" style={{ fontSize: '12px', color: '#dc2626', background: '#fee2e2', borderRadius: '8px', padding: '8px 10px' }}>{error}</div>}
          {rejecting && (
            <textarea autoFocus value={note} onChange={e => setNote(e.target.value)} aria-label="What still needs to change"
              placeholder="What still needs to change?" style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit', minHeight: '70px' }} />
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <button type="button" onClick={onOpenFull} disabled={missingDoc} style={{ fontSize: '12px', fontWeight: 600, padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#1d4ed8', cursor: 'pointer' }}>
              Open full document comparison
            </button>
            {canDecide && (
              <div style={{ display: 'flex', gap: '8px' }}>
                {!rejecting ? (
                  <>
                    <button type="button" onClick={() => setRejecting(true)} disabled={busy} style={{ fontSize: '12px', fontWeight: 700, padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #fcd34d', background: '#fff', color: '#b45309', cursor: 'pointer' }}>↺ Request further revision</button>
                    <button type="button" onClick={() => decide('approve')} disabled={busy} style={{ fontSize: '12px', fontWeight: 700, padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#059669', color: '#fff', cursor: 'pointer' }}>{busy ? 'Saving…' : '✓ Approve & resolve'}</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setRejecting(false)} style={{ fontSize: '12px', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                    <button type="button" onClick={() => decide('reject')} disabled={busy || !note.trim()} style={{ fontSize: '12px', fontWeight: 700, padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#b45309', color: '#fff', cursor: busy || !note.trim() ? 'not-allowed' : 'pointer' }}>{busy ? 'Saving…' : 'Send back for revision'}</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
