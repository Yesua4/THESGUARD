import { useCallback, useEffect, useState } from 'react'
import api from '../../api/axios'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { SkeletonCards } from '../../components/Skeleton'
import { RESEARCH_TYPES, RESEARCH_LABEL, isSchoolAdmin } from '../../utils/research'
import { useSchoolActivity } from '../../hooks/useSchoolActivity'

// The school's institutes and whether each does capstone or thesis. Only the
// school admin edits them; institute admins see them read-only.
const EMPTY = { name: '', research_type: 'capstone' }
const typeStyle = t => t === 'thesis' ? { background: '#fef3c7', color: '#92400e' } : { background: '#dbeafe', color: '#1e40af' }

function PageInstitutes() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const canEdit = isSchoolAdmin(user)
  const [list, setList] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => api.get('/institutes').then(res => setList(res.data)).catch(() => setList([])), [])
  useEffect(() => { load() }, [load])
  useSchoolActivity(['institutes', 'users', 'groups'], load)

  const save = async e => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingId) await api.put(`/institutes/${editingId}`, form)
      else await api.post('/institutes', form)
      showToast(editingId ? 'Institute updated.' : 'Institute added.', 'success')
      setForm(EMPTY); setEditingId(null); load()
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save the institute.')
    } finally { setSaving(false) }
  }

  const remove = async i => {
    if (!confirm(`Remove "${i.name}"?\n\nIts ${i.users_count} account(s) and ${i.groups_count} group(s) are kept; they just won't belong to an institute (and count as capstone).`)) return
    try { await api.delete(`/institutes/${i.id}`); showToast('Institute removed.', 'success'); load() }
    catch (err) { showToast(err.response?.data?.message || 'Could not remove the institute.') }
  }

  const input = { border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', outline: 'none', background: '#f8fafc', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
  const label = { fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#0a1f44' }}>Institutes</div>
        <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', maxWidth: '720px' }}>
          Each institute does either <b>capstone</b> projects or a <b>thesis</b>. People and groups in an institute follow its process:
          thesis groups have a proposal defense and no pre-deployment defense. Groups with no institute are treated as capstone.
        </div>
      </div>

      {canEdit ? (
        <form onSubmit={save} style={{ background: '#fff', border: '1px solid #e8ecf2', borderRadius: '14px', padding: '16px 18px', display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', alignItems: 'end' }}>
          <div>
            <label style={label}>{editingId ? 'Edit institute' : 'Add an institute'}</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Institute of Computing" style={input} required maxLength={150} />
          </div>
          <div>
            <label style={label}>Research type</label>
            <select value={form.research_type} onChange={e => setForm({ ...form, research_type: e.target.value })} style={input}>
              {RESEARCH_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" disabled={saving} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '8px', background: saving ? '#cbd5e1' : 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add institute'}
            </button>
            {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY) }} style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', background: '#fff', color: '#334155', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>}
          </div>
        </form>
      ) : (
        <div style={{ fontSize: '12px', color: '#64748b' }}>Only the school administrator can add or change institutes.</div>
      )}

      {list === null ? <SkeletonCards count={3} icon={false} lines={1} label="Loading institutes" /> : list.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e8ecf2', borderRadius: '14px', padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
          No institutes yet.{canEdit ? ' Add one above, e.g. "Institute of Computing" as Capstone.' : ''}
        </div>
      ) : (
        <div className="dg-grid-2" style={{ display: 'grid', gap: '10px' }}>
          {list.map(i => (
            <div key={i.id} style={{ background: '#fff', border: '1px solid #e8ecf2', borderRadius: '14px', padding: '16px 18px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0a1f44' }}>{i.name}</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{i.users_count} account(s) · {i.groups_count} group(s)</div>
                {user?.institute_id === i.id && <div style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: 700, marginTop: '4px' }}>Your institute</div>}
              </div>
              <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: 700, ...typeStyle(i.research_type) }}>{RESEARCH_LABEL[i.research_type]}</span>
              {canEdit && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <button type="button" onClick={() => { setEditingId(i.id); setForm({ name: i.name, research_type: i.research_type }) }} style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Edit</button>
                  <button type="button" onClick={() => remove(i)} style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default PageInstitutes
