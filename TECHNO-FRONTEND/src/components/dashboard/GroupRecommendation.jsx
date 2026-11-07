import { useState } from 'react'
import api from '../../api/axios'
import { DEFENSE_TYPES, DEFENSE_TYPE_LABEL } from '../../constants/defense'

// "Recommended for: <defense>" -- the step before a group is approved for a
// defense. Shown in the group's details; shown read-only to others.
export function RecommendedBadge({ group }) {
  if (!group?.recommended_for) return null
  return (
    <span title={group.recommender ? `Recommended by ${group.recommender.name}` : undefined}
      style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: '#d1fae5', color: '#065f46', whiteSpace: 'nowrap' }}>
      ✓ Recommended: {DEFENSE_TYPE_LABEL[group.recommended_for]}
    </span>
  )
}

export default function GroupRecommendation({ group, canEdit, onSaved }) {
  const [value, setValue] = useState(group.recommended_for || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async next => {
    setValue(next); setSaving(true); setError('')
    try {
      await api.put(`/groups/${group.id}/recommendation`, { recommended_for: next || null })
      onSaved?.()
    } catch (err) {
      setValue(group.recommended_for || '')
      setError(err.response?.data?.message || 'Could not save the recommendation.')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid #f8fafc' }}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>Recommended for</div>
      {canEdit ? (
        <select value={value} disabled={saving} onChange={e => save(e.target.value)} aria-label="Recommended for"
          style={{ border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', background: '#f8fafc', fontFamily: 'inherit', width: '100%' }}>
          <option value="">Not yet recommended</option>
          {DEFENSE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : (
        <div style={{ fontSize: '13px', color: '#0a1f44' }}>{group.recommended_for ? DEFENSE_TYPE_LABEL[group.recommended_for] : 'Not yet recommended'}</div>
      )}
      {group.recommended_for && group.recommender && (
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
          by {group.recommender.name}{group.recommended_at ? ` · ${new Date(group.recommended_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
        </div>
      )}
      {error && <div role="alert" style={{ marginTop: '6px', fontSize: '12px', color: '#9f1239' }}>{error}</div>}
    </div>
  )
}
