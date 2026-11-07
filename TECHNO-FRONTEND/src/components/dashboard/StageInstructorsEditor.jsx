import { useEffect, useState } from 'react'
import api from '../../api/axios'

// The instructor of each capstone stage for a group (Capstone 1 and 2 can
// be different people). The current stage's instructor is the group's
// instructor; unassigned stages fall back to the section's instructor.
export default function StageInstructorsEditor({ group, canEdit, onSaved }) {
  const [stages, setStages] = useState([])
  const [instructors, setInstructors] = useState([])
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const assigned = Object.fromEntries((group.stage_instructors || []).map(a => [a.capstone_stage_id, a]))

  useEffect(() => {
    api.get('/capstone-stages').then(res => setStages(res.data)).catch(() => {})
    if (canEdit) api.get('/users?role=instructor').then(res => setInstructors(res.data)).catch(() => {})
  }, [canEdit])

  const save = async (stageId, userId) => {
    setBusy(stageId); setError('')
    try {
      await api.put(`/groups/${group.id}/stage-instructors`, { assignments: [{ capstone_stage_id: stageId, user_id: userId ? Number(userId) : null }] })
      onSaved?.()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save.')
    } finally { setBusy(null) }
  }

  if (stages.length === 0) return null // no capstone plan yet

  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid #f8fafc' }}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>Instructor per stage</div>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>
        Current instructor: <strong style={{ color: '#0a1f44' }}>{group.current_instructor?.name || '—'}</strong>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {stages.map(st => {
          const isCurrent = group.capstone?.stage_id === st.id
          return (
            <div key={st.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center' }}>
              <label htmlFor={`si-${group.id}-${st.id}`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                {st.name}{isCurrent && <span style={{ marginLeft: '4px', fontSize: '10px', color: '#5b21b6' }}>(current)</span>}
              </label>
              {canEdit ? (
                <select id={`si-${group.id}-${st.id}`} value={assigned[st.id]?.user_id ? String(assigned[st.id].user_id) : ''} disabled={busy === st.id}
                  onChange={e => save(st.id, e.target.value)}
                  style={{ border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', background: '#f8fafc', fontFamily: 'inherit', width: '100%' }}>
                  <option value="">— section's instructor —</option>
                  {assigned[st.id] && !instructors.some(i => i.id === assigned[st.id].user_id) && (
                    <option value={String(assigned[st.id].user_id)}>{assigned[st.id].user?.name}</option>
                  )}
                  {instructors.map(i => <option key={i.id} value={String(i.id)}>{i.name}</option>)}
                </select>
              ) : (
                <span style={{ fontSize: '13px', color: '#0a1f44' }}>{assigned[st.id]?.user?.name || "Section's instructor"}</span>
              )}
            </div>
          )
        })}
      </div>
      {error && <div role="alert" style={{ marginTop: '8px', fontSize: '12px', color: '#9f1239' }}>{error}</div>}
    </div>
  )
}
