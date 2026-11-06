import { useEffect, useState } from 'react'
import api from '../../api/axios'
import { PANEL_ROLES } from '../../constants/defense'

// A group's permanent defense panel (outline -> final): Panel Chair, Panel
// Member 1, Panel Member 2. Defense schedules from the outline on fill it in
// automatically. Can be changed any time (e.g. a panelist retires).
export default function GroupPanelEditor({ group, canEdit, onSaved }) {
  const current = Object.fromEntries((group.panel || []).map(p => [p.role, String(p.user_id)]))
  const [panel, setPanel] = useState({ chair: '', member1: '', member2: '', ...current })
  const [panelists, setPanelists] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (canEdit) api.get('/users?role=panelist').then(res => setPanelists(res.data)).catch(() => {})
  }, [canEdit])

  const excluded = new Set([String(group.adviser_id || ''), ...(group.members || []).map(m => String(m.user_id))])
  const options = role => panelists.filter(p => !excluded.has(String(p.id)) && !PANEL_ROLES.some(([r]) => r !== role && panel[r] === String(p.id)))
  const changed = PANEL_ROLES.some(([r]) => (panel[r] || '') !== (current[r] || ''))

  const save = async () => {
    setSaving(true); setError(''); setSaved(false)
    try {
      await api.put(`/groups/${group.id}/panel`, {
        panel: PANEL_ROLES.filter(([r]) => panel[r]).map(([role]) => ({ role, user_id: Number(panel[role]) })),
      })
      setSaved(true); onSaved?.()
    } catch (err) {
      const errs = err.response?.data?.errors
      setError(errs ? Object.values(errs)[0][0] : (err.response?.data?.message || 'Could not save the panel.'))
    } finally { setSaving(false) }
  }

  const select = { border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', background: '#f8fafc', fontFamily: 'inherit', width: '100%' }

  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid #f8fafc' }}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>Defense panel (Outline → Final)</div>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>Filled in automatically when scheduling the outline, pre-deployment and final defenses.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {PANEL_ROLES.map(([role, label]) => (
          <div key={role} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'center' }}>
            <label htmlFor={`gp-${group.id}-${role}`} style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>{label}</label>
            {canEdit ? (
              <select id={`gp-${group.id}-${role}`} value={panel[role]} onChange={e => { setPanel({ ...panel, [role]: e.target.value }); setSaved(false) }} style={select}>
                <option value="">— none —</option>
                {/* Keep the current person listed even before the list loads */}
                {current[role] && !panelists.some(p => String(p.id) === current[role]) && (
                  <option value={current[role]}>{group.panel.find(p => p.role === role)?.user?.name}</option>
                )}
                {options(role).map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
              </select>
            ) : (
              <span style={{ fontSize: '13px', color: '#0a1f44' }}>{group.panel?.find(p => p.role === role)?.user?.name || '—'}</span>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button type="button" onClick={save} disabled={saving || !changed} style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: saving || !changed ? '#cbd5e1' : 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: saving || !changed ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save panel'}
          </button>
          {saved && !changed && <span style={{ fontSize: '12px', color: '#065f46', fontWeight: 600 }}>✓ Saved</span>}
        </div>
      )}
      {error && <div role="alert" style={{ marginTop: '8px', fontSize: '12px', color: '#9f1239', background: '#fee2e2', borderRadius: '6px', padding: '6px 8px' }}>{error}</div>}
    </div>
  )
}
