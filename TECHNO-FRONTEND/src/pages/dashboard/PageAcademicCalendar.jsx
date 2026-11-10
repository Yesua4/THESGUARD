import { useCallback, useEffect, useState } from 'react'
import api from '../../api/axios'
import { useSchoolActivity } from '../../hooks/useSchoolActivity'
import { useToast } from '../../context/ToastContext'
import { useAcademicTerms } from '../../hooks/useAcademicTerms'

const TERM_NAMES = ['1st Semester', '2nd Semester', 'Summer', '1st Trimester', '2nd Trimester', '3rd Trimester']
const emptyForm = { academic_year: '', name: '', start_date: '', end_date: '' }

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th']
const EMPTY_STAGE = { name: '', year_level: '2', term_no: '2' }

// Which capstone stage happens in which year level + term of the school
// year. Groups move from one stage to the next by themselves as the
// calendar above passes.
function CapstonePlan({ terms }) {
  const { showToast } = useToast()
  const [stages, setStages] = useState([])
  const [form, setForm] = useState(EMPTY_STAGE)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => api.get('/capstone-stages').then(res => setStages(res.data)).catch(() => {}), [])
  useEffect(() => { load() }, [load])
  useSchoolActivity(['terms', 'groups'], load)

  // e.g. "2nd term (2nd Semester)", using the latest school year on the calendar.
  const latestYear = [...new Set(terms.map(t => t.academic_year))].sort().pop()
  const termNames = terms.filter(t => t.academic_year === latestYear).sort((a, b) => a.start_date.localeCompare(b.start_date)).map(t => t.name)
  const termLabel = n => `${ORDINAL[n - 1]} term${termNames[n - 1] ? ` (${termNames[n - 1]})` : ''}`

  const save = async e => {
    e.preventDefault()
    setSaving(true); setError('')
    const body = { name: form.name.trim(), year_level: Number(form.year_level), term_no: Number(form.term_no) }
    try {
      if (editingId) await api.put(`/capstone-stages/${editingId}`, body)
      else await api.post('/capstone-stages', body)
      showToast(editingId ? 'Stage updated.' : 'Stage added.', 'success')
      setEditingId(null); setForm(EMPTY_STAGE); load()
    } catch (err) {
      const errs = err.response?.data?.errors
      setError(errs ? Object.values(errs)[0][0] : (err.response?.data?.message || 'Could not save.'))
    } finally { setSaving(false) }
  }

  const remove = async st => {
    if (!confirm(`Delete "${st.name}" from the capstone plan?`)) return
    try { await api.delete(`/capstone-stages/${st.id}`); load() } catch { showToast('Could not delete.') }
  }

  const input = { border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: '#f8fafc', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
  const label = { fontSize: '11px', fontWeight: '700', color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }

  return (
    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '18px', marginTop: '16px' }}>
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0a1f44' }}>Capstone plan</div>
      <div style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 14px' }}>
        When each capstone stage is taken. Example: Capstone 1 in 2nd year, 2nd term; Capstone 2 in 3rd year, 1st term.
        Groups move to the next stage by themselves when the calendar reaches it.
      </div>
      <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', alignItems: 'end' }}>
        <div>
          <label style={label} htmlFor="stage-name">Stage name</label>
          <input id="stage-name" list="tg-stage-names" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Capstone 1" style={input} required />
          <datalist id="tg-stage-names"><option value="Capstone 1" /><option value="Capstone 2" /></datalist>
        </div>
        <div>
          <label style={label} htmlFor="stage-year">Year level</label>
          <select id="stage-year" value={form.year_level} onChange={e => setForm({ ...form, year_level: e.target.value })} style={input}>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{ORDINAL[n - 1]} year</option>)}
          </select>
        </div>
        <div>
          <label style={label} htmlFor="stage-term">Term of the school year</label>
          <select id="stage-term" value={form.term_no} onChange={e => setForm({ ...form, term_no: e.target.value })} style={input}>
            {[1, 2, 3].map(n => <option key={n} value={n}>{termLabel(n)}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button type="submit" disabled={saving} style={{ flex: 1, padding: '9px', background: 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
            {saving ? 'Saving…' : editingId ? 'Save' : 'Add stage'}
          </button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY_STAGE) }} style={{ padding: '9px 12px', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>}
        </div>
      </form>
      {error && <div role="alert" style={{ marginTop: '10px', background: '#fee2e2', color: '#9f1239', fontSize: '12px', padding: '8px 10px', borderRadius: '8px' }}>{error}</div>}

      <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {stages.length === 0 && <div style={{ fontSize: '12px', color: '#94a3b8' }}>No stages yet.</div>}
        {stages.map((st, i) => (
          <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#f8fafc', borderRadius: '10px' }}>
            <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#0a1f44', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0a1f44' }}>{st.name}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{ORDINAL[st.year_level - 1]} year · {termLabel(st.term_no)}</div>
            </div>
            <button onClick={() => { setEditingId(st.id); setForm({ name: st.name, year_level: String(st.year_level), term_no: String(st.term_no) }) }} style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '6px', border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#1d4ed8', fontWeight: 600 }}>Edit</button>
            <button onClick={() => remove(st)} style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '6px', border: '1.5px solid #fecaca', background: '#fff', cursor: 'pointer', color: '#dc2626', fontWeight: 600 }}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}

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
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px' }}>
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
      <CapstonePlan terms={terms} />
    </div>
  )
}
