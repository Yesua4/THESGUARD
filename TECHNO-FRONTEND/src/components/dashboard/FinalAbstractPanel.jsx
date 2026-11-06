import { useState } from 'react'
import api from '../../api/axios'

// Project Description (written at proposal time) and, once the project has
// passed its final defense, the real Final Abstract. Future proposals are
// compared against the final abstract.
export default function FinalAbstractPanel({ project, canEdit, onSaved, labelStyle }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const finished = ['approved', 'archived'].includes(project.status) || project.defense_verdict === 'passed'
  const eligible = finished && (project.is_final_title || !project.group_id)
  const description = project.description ?? (project.abstract_is_final ? null : project.abstract)

  const save = async () => {
    setSaving(true); setError('')
    try {
      await api.put(`/projects/${project.id}/final-abstract`, { abstract: text.trim() })
      setOpen(false); setText(''); onSaved?.()
    } catch (err) {
      const errs = err.response?.data?.errors
      setError(errs ? Object.values(errs)[0][0] : (err.response?.data?.message || 'Could not save the abstract.'))
    } finally { setSaving(false) }
  }

  const box = { padding: '14px 20px', borderBottom: '1px solid #f8fafc' }
  const body = { fontSize: '13px', color: '#334155', lineHeight: '1.65', whiteSpace: 'pre-line' }

  return (
    <>
      <div style={box}>
        <div style={labelStyle}>Project Description</div>
        <div style={body}>{description || '—'}</div>
      </div>
      <div style={box}>
        <div style={labelStyle}>Final Abstract</div>
        {project.abstract_is_final ? (
          <div style={body}>{project.abstract}</div>
        ) : !eligible ? (
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Added after the group passes its final defense.</div>
        ) : !canEdit ? (
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Not added yet.</div>
        ) : !open ? (
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
              This project passed its final defense. Paste its final abstract so future proposals are compared against it.
            </div>
            <button type="button" onClick={() => setOpen(true)} style={{ fontSize: '12px', fontWeight: 700, padding: '7px 14px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', cursor: 'pointer' }}>
              Add final abstract
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <textarea autoFocus value={text} onChange={e => setText(e.target.value)} aria-label="Final abstract"
              placeholder="Paste the final abstract from your manuscript…"
              style={{ width: '100%', boxSizing: 'border-box', minHeight: '140px', border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', fontFamily: 'inherit', background: '#f8fafc' }} />
            {error && <div role="alert" style={{ fontSize: '12px', color: '#dc2626', background: '#fee2e2', borderRadius: '6px', padding: '6px 8px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={save} disabled={saving || text.trim().length < 50} style={{ fontSize: '12px', fontWeight: 700, padding: '7px 14px', borderRadius: '8px', border: 'none', background: saving || text.trim().length < 50 ? '#cbd5e1' : '#059669', color: '#fff', cursor: 'pointer' }}>
                {saving ? 'Saving…' : 'Save final abstract'}
              </button>
              <button type="button" onClick={() => setOpen(false)} style={{ fontSize: '12px', padding: '7px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
