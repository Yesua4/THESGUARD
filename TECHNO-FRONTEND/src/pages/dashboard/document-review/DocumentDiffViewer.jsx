import { useState, useEffect } from 'react'
import { diffWords } from 'diff'
import { extractPdfText } from '../../../utils/extractPdfText'

// Compares two versions of the same document type (e.g. Chapter 1 v1 vs v2)
// as a word-level text diff, extracted client-side from each version's
// PDF-renderable bytes — no backend changes needed, both versions already
// go through the same authenticated /preview endpoint as the main viewer.
export default function DocumentDiffViewer({ oldDocument, newDocument, onClose }) {
  const [diff, setDiff] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    Promise.all([
      extractPdfText(oldDocument.id),
      extractPdfText(newDocument.id),
    ])
      .then(([oldText, newText]) => {
        if (cancelled) return
        setDiff(diffWords(oldText, newText))
      })
      .catch(() => { if (!cancelled) setError('Could not compare these versions — one or both documents have no text-based preview available.') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [oldDocument.id, newDocument.id])

  const added = diff?.filter(p => p.added).length ?? 0
  const removed = diff?.filter(p => p.removed).length ?? 0

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,31,68,0.35)', zIndex: 60, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
      <div style={{ width: 'min(900px, 96vw)', height: '100vh', background: '#fff', boxShadow: '-8px 0 32px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: 'linear-gradient(135deg,#0a1f44,#1040a0)', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Version Comparison</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>v{oldDocument.version} → v{newDocument.version}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {loading && <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Comparing versions…</div>}
          {error && <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626', fontSize: '13px' }}>{error}</div>}

          {diff && !error && (
            <>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', fontWeight: 700, background: '#d1fae5', color: '#065f46' }}>+{added} additions</span>
                <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', fontWeight: 700, background: '#fee2e2', color: '#9f1239' }}>-{removed} removals</span>
              </div>
              <div style={{ fontSize: '13px', lineHeight: '1.9', color: '#334155', whiteSpace: 'pre-wrap' }}>
                {diff.map((part, i) => {
                  if (part.added) return <ins key={i} style={{ background: 'rgba(5,150,105,0.15)', color: '#065f46', textDecoration: 'none', borderRadius: '3px', padding: '0 2px' }}>{part.value}</ins>
                  if (part.removed) return <del key={i} style={{ background: 'rgba(220,38,38,0.12)', color: '#9f1239', borderRadius: '3px', padding: '0 2px' }}>{part.value}</del>
                  return <span key={i}>{part.value}</span>
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
