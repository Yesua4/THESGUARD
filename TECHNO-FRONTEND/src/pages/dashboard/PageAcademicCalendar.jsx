import { useState } from 'react'
import api from '../../api/axios'
import { useToast } from '../../context/ToastContext'
import { useAcademicTerms } from '../../hooks/useAcademicTerms'

const TERM_NAMES = ['1st Semester', '2nd Semester', 'Summer', '1st Trimester', '2nd Trimester', '3rd Trimester']
const emptyForm = { academic_year: '', name: '', start_date: '', end_date: '' }

const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

// Admin: the school's academic calendar. Each academic year is split into
// dated terms; the system uses the dates to know which term it is today.
export default function PageAcademicCalendar() {
  const { showToast } = useToast()
  const { terms, years, currentTerm, loaded } = useAcademicTerms()
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const suggestedYear = () => {
    const y = new Date().getFullYear()
    return new Date().getMonth() >= 5 ? `${y}-${y + 1}` : `${y - 1}-${y}`
  }

  const startEdit = t => {
    setEditingId(t.id); setError('')
    setForm({ academic_year: t.academic_year, name: t.name, start_date: t.start_date, end_date: t.end_date })
  }
  const reset = () => { setEditingId(null); setForm(emptyForm); setError('') }

  const save = async e => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      if (editingId) await api.put(`/terms/${editingId}`, form)
      else await api.post('/terms', form)
      showToast(editingId ? 'Term updated.' : 'Term added.', 'success')
      reset()
    } catch (err) {
      const errs = err.response?.data?.errors
      setError(errs ? Object.values(errs)[0][0] : (err.response?.data?.message || 'Could not save the term.'))
    } finally { setSaving(false) }
  }

  const remove = async t => {
    if (!confirm(`Delete ${t.name}, A.Y. ${t.academic_year}? Groups keep their academic year.`)) return
    try { await api.delete(`/terms/${t.id}`); if (editingId === t.id) reset() }
    catch (err) { showToast(err.response?.data?.message || 'Could not delete the term.') }
  }

  const input = { border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', outline: 'none', background: '#f8fafc', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
  const label = { fontSize: '11px', fontWeight: '700', color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg,#0a1f44,#1040a0)', borderRadius: '14px', padding: '20px 24px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>School Settings</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>Academic Calendar</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>Set each academic year's terms and dates. The system uses them to know the current semester.</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px 14px', color: '#fff' }}>
          <div style={{ fontSize: '10px', opacity: 0.6, fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Today is in</div>
          <div style={{ fontSize: '14px', fontWeight: '700' }}>
            {currentTerm ? `${currentTerm.name}, A.Y. ${currentTerm.academic_year.replace('-', '–')}` : 'No term (between terms)'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: '16px', alignItems: 'start' }} className="dg-grid-2">
        <form onSubmit={save} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#0a1f44' }}>{editingId ? 'Edit term' : 'Add a term'}</div>
          <div>
            <label style={label}>Academic Year</label>
            <input list="tg-years" value={form.academic_year} onChange={e => setForm({ ...form, academic_year: e.target.value })} placeholder={`e.g. ${suggestedYear()}`} style={input} required />
            <datalist id="tg-years">{[...new Set([suggestedYear(), ...years])].map(y => <option key={y} value={y} />)}</datalist>
          </div>
          <div>
            <label style={label}>Term</label>
            <input list="tg-term-names" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. 1st Semester" style={input} required />
            <datalist id="tg-term-names">{TERM_NAMES.map(n => <option key={n} value={n} />)}</datalist>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={label}>Starts</label>
              <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={input} required />
            </div>
            <div>
              <label style={label}>Ends</label>
              <input type="date" value={form.end_date} min={form.start_date || undefined} onChange={e => setForm({ ...form, end_date: e.target.value })} style={input} required />
            </div>
          </div>
          {error && <div style={{ background: '#fee2e2', color: '#9f1239', fontSize: '12px', padding: '8px 10px', borderRadius: '8px' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" disabled={saving} style={{ flex: 1, padding: '9px', background: 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : (editingId ? 'Save changes' : 'Add term')}
            </button>
            {editingId && <button type="button" onClick={reset} style={{ padding: '9px 14px', background: '#fff', color: '#64748b', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>}
          </div>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {!loaded ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading…</div>
          ) : years.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px dashed #cbd5e1', padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
              No academic calendar yet. Add the first term on the left. Example: <strong>2026-2027</strong>, <strong>1st Semester</strong>, June 1 to Aug 31.
            </div>
          ) : years.map(y => (
            <div key={y} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: '13px', fontWeight: '700', color: '#0a1f44' }}>
                A.Y. {y.replace('-', '–')}
              </div>
              {terms.filter(t => t.academic_year === y).map(t => {
                const isCurrent = currentTerm?.id === t.id
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid #f8fafc', background: isCurrent ? '#f0fdf4' : 'transparent' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#0a1f44', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {t.name}
                        {isCurrent && <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 8px', borderRadius: '20px', background: '#d1fae5', color: '#065f46' }}>Current</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{fmt(t.start_date)} – {fmt(t.end_date)}</div>
                    </div>
                    <button onClick={() => startEdit(t)} style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '6px', border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#1d4ed8', fontWeight: '600' }}>Edit</button>
                    <button onClick={() => remove(t)} style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '6px', border: '1.5px solid #fecaca', background: '#fff', cursor: 'pointer', color: '#dc2626', fontWeight: '600' }}>Delete</button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
