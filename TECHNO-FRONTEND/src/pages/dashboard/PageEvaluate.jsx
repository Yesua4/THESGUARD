import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import api from '../../api/axios'
import { useSchoolActivity } from '../../hooks/useSchoolActivity'
import { useProjectChannel } from '../../hooks/useProjectChannel'
import { DEFENSE_TYPE_LABEL, PANEL_ROLE_LABEL } from '../../constants/defense'
import { INDIVIDUAL_CRITERIA, GROUP_CRITERIA, VERDICTS, VERDICT_LABEL, verdictStyle } from '../../constants/evaluation'
import PrintEvaluationSheet from '../../components/dashboard/PrintEvaluationSheet'
import Icon from '../../components/Icon'
import { SkeletonCards } from '../../components/Skeleton'

// Panelist evaluation, following the school's defense evaluation sheet:
// individual grade per presenter (Disposition 30 + Delivery 70), group grade
// (Documentation 50 + Software 50), and a verdict. One per defense.
const blankForm = members => ({
  individual: Object.fromEntries((members || []).map(m => [m.user_id, { disposition: '', delivery: '' }])),
  documentation: '', software: '', verdict: '', comply_by: '', remarks: '',
})

function PageEvaluate() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [projects, setProjects] = useState([])
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [scheduleId, setScheduleId] = useState('')
  const [evaluations, setEvaluations] = useState([])
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState(blankForm([]))
  const [printing, setPrinting] = useState(null) // an evaluation to print
  const [showGuide, setShowGuide] = useState(false)

  const loadProjects = () => api.get('/projects').then(res => {
    setProjects(res.data.filter(p => p.status === 'for_defense' || p.status === 'approved'))
  }).finally(() => setLoading(false))
  const loadSchedules = () => api.get('/schedules').then(res => setSchedules(res.data)).catch(() => {})
  const loadEvaluations = id => api.get(`/evaluations/project/${id}`).then(res => setEvaluations(res.data))

  useEffect(() => { loadProjects(); loadSchedules() }, [])
  useSchoolActivity(['projects', 'evaluations', 'schedules'], () => {
    loadProjects(); loadSchedules()
    if (selected?.id) loadEvaluations(selected.id)
  })
  useProjectChannel(selected?.id, type => { if (type === 'evaluation_submitted') loadEvaluations(selected.id) })

  // Defenses of the open project's group, newest first; mine first.
  const defenses = useMemo(() => !selected ? [] : schedules
    .filter(s => (selected.group_id && s.group_id === selected.group_id) || s.project_id === selected.id)
    .sort((a, b) => String(b.defense_date).localeCompare(String(a.defense_date))), [selected, schedules])
  const onPanel = s => (s.panel || []).some(p => p.user_id === user.id) || (s.panelists || '').toLowerCase().split(',').map(x => x.trim()).includes((user.name || '').toLowerCase())
  const schedule = defenses.find(s => String(s.id) === String(scheduleId))
  const myRole = schedule?.panel?.find(p => p.user_id === user.id)?.role
  const forThisDefense = evaluations.filter(e => String(e.defense_schedule_id) === String(scheduleId))
  const mine = forThisDefense.find(e => e.panelist_id === user.id)

  const fillFrom = (evaluation, members) => {
    const f = blankForm(members)
    if (evaluation) {
      (evaluation.individual_scores || []).forEach(r => { f.individual[r.user_id] = { disposition: String(r.disposition), delivery: String(r.delivery) } })
      Object.assign(f, {
        documentation: String(evaluation.group_documentation ?? ''), software: String(evaluation.group_software ?? ''),
        verdict: evaluation.verdict || '', comply_by: evaluation.comply_by || '', remarks: evaluation.remarks || '',
      })
    }
    setForm(f)
  }

  const openProject = async p => {
    setSelected(p); setSuccess('')
    const res = await api.get(`/evaluations/project/${p.id}`)
    setEvaluations(res.data)
    const mineFirst = schedules.filter(s => (p.group_id && s.group_id === p.group_id) || s.project_id === p.id)
      .sort((a, b) => Number(onPanel(b)) - Number(onPanel(a)) || String(b.defense_date).localeCompare(String(a.defense_date)))
    const sid = mineFirst[0]?.id ? String(mineFirst[0].id) : ''
    setScheduleId(sid)
    fillFrom(res.data.find(e => String(e.defense_schedule_id) === sid && e.panelist_id === user.id), p.members)
  }

  const chooseDefense = sid => {
    setScheduleId(sid); setSuccess('')
    fillFrom(evaluations.find(e => String(e.defense_schedule_id) === sid && e.panelist_id === user.id), selected.members)
  }

  const num = v => (v === '' || v === null || v === undefined ? NaN : parseFloat(v))
  const indivTotal = id => { const r = form.individual[id] || {}; const t = num(r.disposition) + num(r.delivery); return Number.isNaN(t) ? '—' : t.toFixed(2).replace(/\.00$/, '') }
  const groupTotal = () => { const t = num(form.documentation) + num(form.software); return Number.isNaN(t) ? '—' : t.toFixed(2).replace(/\.00$/, '') }

  const submit = async e => {
    e.preventDefault()
    if (!form.verdict) { showToast('Choose a verdict.'); return }
    setSaving(true)
    try {
      await api.post('/evaluations', {
        project_id: selected.id, defense_schedule_id: Number(scheduleId),
        individual: (selected.members || []).map(m => ({ user_id: m.user_id, disposition: num(form.individual[m.user_id]?.disposition), delivery: num(form.individual[m.user_id]?.delivery) })),
        documentation: num(form.documentation), software: num(form.software),
        verdict: form.verdict, comply_by: form.verdict === 'conditional' ? form.comply_by : null, remarks: form.remarks,
      })
      setSuccess('Evaluation saved.')
      loadEvaluations(selected.id)
    } catch (err) {
      const errs = err.response?.data?.errors
      showToast(errs ? Object.values(errs)[0][0] : (err.response?.data?.message || 'Error submitting evaluation.'))
    } finally { setSaving(false) }
  }

  const input = { border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '7px 8px', fontSize: '13px', outline: 'none', background: '#f8fafc', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', textAlign: 'center' }
  const head = { fontSize: '10px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }
  const th = { fontSize: '11px', fontWeight: 700, color: '#64748b', padding: '6px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }
  const td = { padding: '6px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#334155' }
  const scoreInput = (value, max, onChange, label) => (
    <input type="number" min="0" max={max} step="0.5" value={value} onChange={e => onChange(e.target.value)} required aria-label={label} style={input} />
  )

  return (
    <div>
      {printing && selected && (
        <PrintEvaluationSheet project={selected} schedule={defenses.find(s => s.id === printing.defense_schedule_id)} evaluation={printing}
          panelistName={printing.panelist?.name} onClose={() => setPrinting(null)} />
      )}

      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,31,68,0.35)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
          <div style={{ width: 'min(640px, 96vw)', height: '100vh', background: '#fff', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.12)' }}>
            <div style={{ background: 'linear-gradient(135deg,#0a1f44,#1040a0)', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>Defense Evaluation</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', lineHeight: '1.4' }}>{selected.title}</div>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', flexShrink: 0 }}>✕</button>
            </div>

            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f8fafc' }}>
              <label style={head} htmlFor="ev-defense">Which defense</label>
              {defenses.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#d97706' }}>This group has no defense scheduled yet.</div>
              ) : (
                <select id="ev-defense" value={scheduleId} onChange={e => chooseDefense(e.target.value)} style={{ ...input, textAlign: 'left' }}>
                  {defenses.map(s => (
                    <option key={s.id} value={s.id}>
                      {DEFENSE_TYPE_LABEL[s.defense_type] || 'Defense'} — {new Date(s.defense_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}{onPanel(s) ? '' : ' (not on your panel)'}
                    </option>
                  ))}
                </select>
              )}
              {schedule?.verdict && (
                <div style={{ marginTop: '8px' }}>
                  <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: 700, ...verdictStyle(schedule.verdict) }}>Panel verdict: {VERDICT_LABEL[schedule.verdict]}</span>
                </div>
              )}
            </div>

            {schedule && (onPanel(schedule) || user.role === 'admin' || user.base_role === 'admin') ? (
              <form onSubmit={submit} style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px', borderBottom: '1px solid #f8fafc' }}>
                {myRole && <div style={{ fontSize: '12px', color: '#5b21b6', fontWeight: 600 }}>You are the {PANEL_ROLE_LABEL[myRole]} for this defense.</div>}
                {success && <div role="status" style={{ background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#065f46', fontWeight: '600' }}>✓ {success}</div>}

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={head}>Individual grade (100%) — per presenter</div>
                    <button type="button" onClick={() => setShowGuide(v => !v)} aria-expanded={showGuide} style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      {showGuide ? 'Hide criteria' : 'ⓘ Show criteria'}
                    </button>
                  </div>
                  {showGuide && (
                    <div style={{ fontSize: '11px', color: '#475569', background: '#f8fafc', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px', lineHeight: 1.6 }}>
                      {INDIVIDUAL_CRITERIA.map(c => (
                        <div key={c.key} style={{ marginBottom: '4px' }}>
                          <strong>{c.label} ({c.max}%)</strong>
                          {c.points && <div>{c.points.join(' · ')}</div>}
                          {c.groups && c.groups.map(([g, pts]) => <div key={g}><em>{g}:</em> {pts.join(' · ')}</div>)}
                        </div>
                      ))}
                    </div>
                  )}
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, textAlign: 'left' }}>Presenter</th>
                        {INDIVIDUAL_CRITERIA.map(c => <th key={c.key} style={th}>{c.label}<br /><span style={{ fontWeight: 400 }}>max {c.max}</span></th>)}
                        <th style={th}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selected.members || []).map(m => (
                        <tr key={m.user_id}>
                          <td style={td}>{m.user?.name}</td>
                          {INDIVIDUAL_CRITERIA.map(c => (
                            <td key={c.key} style={{ ...td, width: '22%' }}>
                              {scoreInput(form.individual[m.user_id]?.[c.key] ?? '', c.max,
                                v => setForm(f => ({ ...f, individual: { ...f.individual, [m.user_id]: { ...f.individual[m.user_id], [c.key]: v } } })),
                                `${c.label} for ${m.user?.name}`)}
                            </td>
                          ))}
                          <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: '#0a1f44' }}>{indivTotal(m.user_id)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <div style={head}>Group grade (100%)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: '10px', alignItems: 'end' }}>
                    {GROUP_CRITERIA.map(c => (
                      <label key={c.key} style={{ fontSize: '12px', color: '#334155', fontWeight: 600 }} title={c.points.join(' · ')}>
                        {c.label} <span style={{ fontWeight: 400, color: '#94a3b8' }}>(max {c.max})</span>
                        {scoreInput(form[c.key], c.max, v => setForm(f => ({ ...f, [c.key]: v })), c.label)}
                      </label>
                    ))}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Total</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: '#0a1f44' }}>{groupTotal()}</div>
                    </div>
                  </div>
                </div>

                <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                  <legend style={head}>Verdict</legend>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '6px' }}>
                    {VERDICTS.map(([v, l]) => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', border: `1.5px solid ${form.verdict === v ? '#1d4ed8' : '#e2e8f0'}`, background: form.verdict === v ? '#eff6ff' : '#fff' }}>
                        <input type="radio" name="verdict" value={v} checked={form.verdict === v} onChange={() => setForm(f => ({ ...f, verdict: v }))} /> {l}
                      </label>
                    ))}
                  </div>
                  {form.verdict === 'conditional' && (
                    <label style={{ display: 'block', marginTop: '8px', fontSize: '12px', color: '#334155', fontWeight: 600 }}>
                      To comply the necessary requirements to get a passing grade on
                      <input type="date" value={form.comply_by} onChange={e => setForm(f => ({ ...f, comply_by: e.target.value }))} required style={{ ...input, textAlign: 'left', marginTop: '4px' }} />
                    </label>
                  )}
                </fieldset>

                <label style={{ fontSize: '12px', color: '#334155', fontWeight: 600 }}>
                  Remarks <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span>
                  <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} style={{ ...input, textAlign: 'left', minHeight: '70px', resize: 'vertical', marginTop: '4px' }} />
                </label>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" disabled={saving} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: 'none', background: saving ? '#cbd5e1' : 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer' }}>
                    {saving ? 'Saving…' : mine ? 'Update evaluation' : 'Submit evaluation'}
                  </button>
                  {mine && (
                    <button type="button" onClick={() => setPrinting({ ...mine, panelist: { name: user.name } })} style={{ padding: '11px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#0a1f44', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                      <Icon name="printer" /> Print / PDF
                    </button>
                  )}
                </div>
              </form>
            ) : schedule ? (
              <div style={{ padding: '16px 20px', fontSize: '12px', color: '#64748b' }}>You are not on this defense's panel, so you can't evaluate it.</div>
            ) : null}

            {forThisDefense.length > 0 && (
              <div style={{ padding: '14px 20px' }}>
                <div style={head}>Panel evaluations for this defense ({forThisDefense.length}{schedule?.panel?.length ? ` of ${schedule.panel.length}` : ''})</div>
                {forThisDefense.map(e => (
                  <div key={e.id} style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px 14px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#0a1f44' }}>
                        {e.panelist?.name}
                        {schedule?.panel?.find(p => p.user_id === e.panelist_id) && <span style={{ fontSize: '11px', fontWeight: 500, color: '#94a3b8' }}> · {PANEL_ROLE_LABEL[schedule.panel.find(p => p.user_id === e.panelist_id).role]}</span>}
                      </div>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: '700', ...verdictStyle(e.verdict) }}>{VERDICT_LABEL[e.verdict] || e.recommendation}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Group: <strong>{e.group_total ?? e.overall_score}</strong>/100
                      {(e.individual_scores || []).length > 0 && <> · Individual: {e.individual_scores.map(r => `${r.name?.split(' ')[0]} ${r.total}`).join(', ')}</>}
                    </div>
                    {e.remarks && <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', marginTop: '4px' }}>"{e.remarks}"</div>}
                    {e.individual_scores && (
                      <button type="button" onClick={() => setPrinting(e)} style={{ marginTop: '6px', fontSize: '11px', fontWeight: 700, color: '#1d4ed8', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}><Icon name="printer" /> Print / Save as PDF</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ fontSize: '18px', fontWeight: '700', color: '#0a1f44', marginBottom: '16px' }}>Evaluate Projects</div>

      {loading ? (
        <SkeletonCards count={3} icon={false} label="Loading projects" />
      ) : projects.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}><Icon name="clipboard" /></div>
          <div style={{ fontSize: '13px', color: '#94a3b8' }}>No projects ready for evaluation yet. Projects must be set to "For Defense" or "Approved" first.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {projects.map(p => (
            <button key={p.id} type="button" onClick={() => openProject(p)} style={{ textAlign: 'left', background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '16px 18px', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseOver={e => { e.currentTarget.style.borderColor = '#1d4ed8' }} onMouseOut={e => { e.currentTarget.style.borderColor = '#e8ecf2' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#0a1f44', marginBottom: '4px' }}>{p.title}</div>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {p.members?.map(m => (
                  <span key={m.id} style={{ fontSize: '11px', background: '#f8fafc', color: '#64748b', padding: '2px 8px', borderRadius: '20px', fontWeight: '500' }}>{m.user?.name} {m.is_leader ? '★' : ''}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default PageEvaluate
