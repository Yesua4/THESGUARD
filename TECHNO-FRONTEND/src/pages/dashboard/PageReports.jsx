import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { displayStatus } from '../../constants/projectStatus'
import api from '../../api/axios'
import { useAuth } from '../../context/AuthContext'
import { useSchoolActivity } from '../../hooks/useSchoolActivity'
import { similarityBadgeStyle } from '../../utils/similarityColors'
import { useToast } from '../../context/ToastContext'
import Icon from '../../components/Icon'
import { SkeletonTable } from '../../components/Skeleton'
import { humanStatus } from '../../utils/humanStatus'
import { typeLabel } from '../../utils/documentDisplay'
import { DEFENSE_TYPES, DEFENSE_TYPE_LABEL, PANEL_ROLE_LABEL, formatTime } from '../../constants/defense'
import { VERDICT_LABEL, verdictStyle } from '../../constants/evaluation'

// ── Readable values (screen, CSV and printout all use these) ────────────────
const dash = v => (v === null || v === undefined || v === '' ? '—' : v)
const fmtDate = d => {
  if (!d) return '—'
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00')
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}
const score = v => (v === null || v === undefined ? '—' : `${v}%`)
const verdictText = v => (v ? VERDICT_LABEL[v] || humanStatus(v) : '—')
const PROJECT_VERDICT = { passed: 'Passed', failed: 'Failed', revision: 'Needs revision', pending: 'Pending' }
const panelText = r => r.panel?.length
  ? r.panel.map(p => `${PANEL_ROLE_LABEL[p.role] || humanStatus(p.role)}: ${p.name}`).join('; ')
  : dash(r.panelists)

// Status pill colours (projects, titles, documents, defenses).
const PILL = {
  approved: ['#d1fae5', '#065f46'], completed: ['#d1fae5', '#065f46'], passed: ['#d1fae5', '#065f46'],
  for_defense: ['#ede9fe', '#6d28d9'], scheduled: ['#ede9fe', '#6d28d9'],
  ongoing: ['#dbeafe', '#1e40af'], under_review: ['#dbeafe', '#1e40af'],
  pending: ['#fef3c7', '#92400e'], needs_revision: ['#fef3c7', '#92400e'], revision: ['#fef3c7', '#92400e'],
  rejected: ['#fee2e2', '#9f1239'], flagged: ['#fee2e2', '#9f1239'], failed: ['#fee2e2', '#9f1239'], cancelled: ['#fee2e2', '#9f1239'],
  archived: ['#f1f5f9', '#475569'], not_chosen: ['#f1f5f9', '#64748b'],
}
const pill = (text, style) => <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: 700, whiteSpace: 'nowrap', ...style }}>{text}</span>
const statusPill = (s, text) => { const [bg, fg] = PILL[s] || ['#f1f5f9', '#475569']; return s ? pill(text || humanStatus(s), { background: bg, color: fg }) : '—' }
const strong = t => <span style={{ fontWeight: 600, color: '#0a1f44' }}>{dash(t)}</span>

// ── The reports ─────────────────────────────────────────────────────────────
// cols: { h: header, v: row => plain text (CSV/print), r?: row => what the screen shows }
// filters: which extra filters this report uses. summary: rows => [[label, value], ...]
const countBy = (rows, key, label) => {
  const c = {}
  rows.forEach(r => { const k = r[key] || 'none'; c[k] = (c[k] || 0) + 1 })
  return Object.entries(c).map(([k, n]) => [label(k), n])
}

const REPORTS = {
  projects: {
    name: 'Project Status Overview', path: '/reports/projects', filters: ['scope'],
    cols: [
      { h: 'Title', w: 240, v: r => r.title + (r.is_final_title ? ' (final title)' : ''), r: r => <>{strong(r.title)}{r.is_final_title && <div style={{ fontSize: '10px', color: '#6d28d9', fontWeight: 700 }}>Final title</div>}</> },
      { h: 'Group', v: r => dash(r.group) },
      { h: 'Section', v: r => dash(r.section) },
      { h: 'Academic Year', v: r => dash(r.academic_year) },
      { h: 'Members', v: r => dash(r.members) },
      { h: 'Adviser', v: r => dash(r.adviser) },
      { h: 'Title Status', v: r => r.title_status ? humanStatus(r.title_status) : '—', r: r => statusPill(r.title_status) },
      { h: 'Project Status', v: r => r.status ? humanStatus(displayStatus(r)) : '—', r: r => statusPill(displayStatus(r)) },
      { h: 'Defense Result', v: r => PROJECT_VERDICT[r.defense_verdict] || '—', r: r => r.defense_verdict ? statusPill(r.defense_verdict, PROJECT_VERDICT[r.defense_verdict]) : '—' },
      { h: 'Similarity', v: r => score(r.similarity_score), r: r => r.similarity_score == null ? '—' : pill(score(r.similarity_score), similarityBadgeStyle(r.similarity_score)) },
    ],
    summary: rows => [['Projects', rows.length], ...countBy(rows.map(r => ({ ...r, status: displayStatus(r) })), 'status', k => k === 'none' ? 'No status' : humanStatus(k))],
  },
  similarity: {
    name: 'Similarity Detection Summary', path: '/reports/similarity', filters: ['threshold'],
    cols: [
      { h: 'Title', w: 240, v: r => r.title, r: r => strong(r.title) },
      { h: 'Group', v: r => dash(r.group) },
      { h: 'Section', v: r => dash(r.section) },
      { h: 'Adviser', v: r => dash(r.adviser) },
      { h: 'Title Status', v: r => r.title_status ? humanStatus(r.title_status) : '—', r: r => statusPill(r.title_status) },
      { h: 'Similarity', v: r => score(r.similarity_score), r: r => pill(score(r.similarity_score), similarityBadgeStyle(r.similarity_score)) },
    ],
    summary: rows => [['Proposals', rows.length], ['60% and above (must be reviewed)', rows.filter(r => r.similarity_score >= 60).length], ['30–59%', rows.filter(r => r.similarity_score >= 30 && r.similarity_score < 60).length]],
  },
  schedules: {
    name: 'Defense Schedule Report', path: '/reports/schedules', filters: ['defense_type', 'dates'],
    cols: [
      { h: 'Date', v: r => fmtDate(r.date), r: r => <span style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</span> },
      { h: 'Time', v: r => r.end_time ? `${formatTime(r.start_time)} – ${formatTime(r.end_time)}` : formatTime(r.start_time), r: r => <span style={{ whiteSpace: 'nowrap' }}>{r.end_time ? `${formatTime(r.start_time)} – ${formatTime(r.end_time)}` : formatTime(r.start_time)}</span> },
      { h: 'Defense', v: r => DEFENSE_TYPE_LABEL[r.defense_type] || dash(r.defense_type) },
      { h: 'Group', v: r => dash(r.group), r: r => strong(r.group) },
      { h: 'Section', v: r => dash(r.section) },
      { h: 'Project', w: 220, v: r => r.project || (r.defense_type === 'title' ? 'All proposed titles' : '—') },
      { h: 'Room', v: r => dash(r.venue) },
      { h: 'Panel', v: panelText, r: r => r.panel?.length ? r.panel.map(p => <div key={p.role} style={{ whiteSpace: 'nowrap' }}><span style={{ color: '#94a3b8' }}>{PANEL_ROLE_LABEL[p.role] || humanStatus(p.role)}:</span> {p.name}</div>) : dash(r.panelists) },
      { h: 'Result', v: r => verdictText(r.verdict), r: r => r.verdict ? pill(verdictText(r.verdict), verdictStyle(r.verdict)) : '—' },
      { h: 'Status', v: r => r.status ? humanStatus(r.status) : '—', r: r => statusPill(r.status) },
    ],
    summary: rows => [['Defenses', rows.length], ...countBy(rows, 'defense_type', k => DEFENSE_TYPE_LABEL[k] || 'Other')],
  },
  evaluations: {
    name: 'Defense Results (Panel Evaluations)', path: '/reports/evaluations', filters: ['defense_type'],
    cols: [
      { h: 'Group', v: r => dash(r.group), r: r => strong(r.group) },
      { h: 'Section', v: r => dash(r.section) },
      { h: 'Project', w: 220, v: r => dash(r.project) },
      { h: 'Defense', v: r => DEFENSE_TYPE_LABEL[r.defense_type] || '—' },
      { h: 'Date', v: r => fmtDate(r.date), r: r => <span style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</span> },
      { h: 'Panelist', v: r => `${dash(r.panelist)}${r.panel_role ? ` (${PANEL_ROLE_LABEL[r.panel_role] || humanStatus(r.panel_role)})` : ''}` },
      { h: 'Group Score (of 100)', v: r => dash(r.group_score) },
      { h: 'Avg. Individual (of 100)', v: r => dash(r.individual_avg) },
      { h: "Panelist's Verdict", v: r => verdictText(r.verdict) + (r.comply_by ? ` (comply by ${fmtDate(r.comply_by)})` : ''), r: r => <>{r.verdict ? pill(verdictText(r.verdict), verdictStyle(r.verdict)) : '—'}{r.comply_by && <div style={{ fontSize: '10px', color: '#92400e', marginTop: '2px' }}>Comply by {fmtDate(r.comply_by)}</div>}</> },
      { h: 'Panel Result', v: r => r.panel_verdict ? verdictText(r.panel_verdict) : 'Waiting for all panelists', r: r => r.panel_verdict ? pill(verdictText(r.panel_verdict), verdictStyle(r.panel_verdict)) : <span style={{ fontSize: '11px', color: '#94a3b8' }}>Waiting for all panelists</span> },
    ],
    summary: rows => {
      const defenses = new Map(rows.map(r => [`${r.project}|${r.defense_type}|${r.date}`, r.panel_verdict]))
      const results = [...defenses.values()]
      return [['Evaluations', rows.length], ['Defenses', defenses.size],
        ['Passed', results.filter(v => v?.startsWith('passed')).length], ['Conditional', results.filter(v => v === 'conditional').length],
        ['Failed', results.filter(v => v === 'failed').length], ['Still waiting', results.filter(v => !v).length]]
    },
  },
  contributions: {
    name: 'Member Contributions Report', path: '/reports/contributions', filters: [],
    note: "Each student's share of their own group's student activity (uploads, revisions, replies, tasks). Adviser and instructor actions are not counted.",
    cols: [
      { h: 'Student', v: r => r.name + (r.is_leader ? ' (leader)' : ''), r: r => <>{strong(r.name)}{r.is_leader && <span style={{ fontSize: '10px', color: '#b45309', fontWeight: 700 }}> · Leader</span>}</> },
      { h: 'Group', v: r => dash(r.group) },
      { h: 'Section', v: r => dash(r.section) },
      { h: 'Project', w: 220, v: r => dash(r.project) },
      { h: 'Activities', v: r => r.count },
      { h: 'Share of Group Work', v: r => `${r.percentage}%`, r: r => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}>
          <div style={{ flex: 1, height: '6px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}><div style={{ width: `${r.percentage}%`, height: '100%', background: '#1d4ed8' }} /></div>
          <span style={{ fontWeight: 700, color: '#0a1f44' }}>{r.percentage}%</span>
        </div>) },
      { h: 'Last Active', v: r => fmtDate(r.last_active) },
    ],
    summary: rows => [['Students', rows.length], ['Projects', new Set(rows.map(r => r.project)).size], ['No activity yet', rows.filter(r => r.count === 0).length]],
  },
  revisions: {
    name: 'Document Revision History', path: '/reports/document-revisions', filters: ['doc_type'],
    cols: [
      { h: 'Group', v: r => dash(r.group), r: r => strong(r.group) },
      { h: 'Section', v: r => dash(r.section) },
      { h: 'Project', w: 220, v: r => dash(r.project) },
      { h: 'Document', v: r => typeLabel[r.type] || humanStatus(r.type) },
      { h: 'Version', v: r => `v${r.version}` },
      { h: 'Status', v: r => r.status ? humanStatus(r.status) : '—', r: r => statusPill(r.status) },
      { h: 'Version Note', v: r => dash(r.version_note) },
      { h: 'Uploaded By', v: r => dash(r.uploaded_by) },
      { h: 'Date', v: r => fmtDate(r.date), r: r => <span style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</span> },
    ],
    summary: rows => [['Versions', rows.length], ...countBy(rows, 'status', k => humanStatus(k))],
  },
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function PageReports() {
  const { showToast } = useToast()
  const { user } = useAuth()
  const [reportType, setReportType] = useState('projects')
  const [f, setF] = useState({ academic_year: '', section: '', group_id: '', scope: 'current', threshold: '30', defense_type: '', type: '', from: '', to: '' })
  const [options, setOptions] = useState({ school: null, academic_years: [], sections: [], groups: [] })
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const report = REPORTS[reportType]

  useEffect(() => { api.get('/reports/options').then(res => setOptions(res.data)).catch(() => {}) }, [])

  // Only the filters this report uses are sent (and shown on the printout).
  const params = useMemo(() => {
    const p = { academic_year: f.academic_year, section: f.section, group_id: f.group_id }
    if (report.filters.includes('scope')) p.scope = f.scope
    if (report.filters.includes('threshold')) p.threshold = f.threshold
    if (report.filters.includes('defense_type')) p.defense_type = f.defense_type
    if (report.filters.includes('dates')) { p.from = f.from; p.to = f.to }
    if (report.filters.includes('doc_type')) p.type = f.type
    return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '' && v != null))
  }, [f, report])

  const reqId = useRef(0)
  const generate = useCallback(async (silent = false) => {
    const id = ++reqId.current
    if (!silent) setLoading(true)
    try {
      const res = await api.get(report.path, { params })
      if (id !== reqId.current) return // a newer request replaced this one
      setData(res.data); setGenerated(true)
    } catch (err) {
      if (id === reqId.current) showToast(err.response?.data?.message || 'Could not generate the report. Please try again.')
    } finally { if (id === reqId.current) setLoading(false) }
  }, [report, params, showToast])

  // Once a report is on screen, changing a filter updates it right away, so
  // what you see (and print) always matches the filters shown.
  const generatedRef = useRef(false)
  useEffect(() => { generatedRef.current = generated }, [generated])
  useEffect(() => { if (generatedRef.current) generate() }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live: a report on screen re-runs itself when its data changes.
  useSchoolActivity(['projects', 'schedules', 'contributions', 'tasks', 'documents', 'evaluations', 'groups'], () => {
    if (generatedRef.current) generate(true)
  })

  const set = (k, v) => setF(prev => {
    const next = { ...prev, [k]: v }
    // A group from another section/year no longer fits: clear it.
    if ((k === 'section' || k === 'academic_year') && next.group_id) {
      const g = options.groups.find(x => String(x.id) === String(next.group_id))
      if (g && ((next.section && g.section !== next.section) || (next.academic_year && g.academic_year !== next.academic_year))) next.group_id = ''
    }
    return next
  })
  const changeType = t => { setReportType(t); setGenerated(false); setData([]) }

  const groupChoices = options.groups.filter(g => (!f.section || g.section === f.section) && (!f.academic_year || g.academic_year === f.academic_year))
  const summary = generated ? report.summary(data) : []

  // Human description of the filters in use, for the printout and CSV name.
  const filterText = useMemo(() => {
    const parts = []
    if (params.academic_year) parts.push(`Academic Year ${params.academic_year}`)
    if (params.section) parts.push(`Section ${params.section}`)
    if (params.group_id) parts.push(options.groups.find(g => String(g.id) === String(params.group_id))?.name || 'One group')
    if (params.scope) parts.push({ current: 'Current projects', archived: 'Archived projects', all: 'All projects' }[params.scope])
    if (params.threshold) parts.push(`Similarity ${params.threshold}% and above`)
    if (params.defense_type) parts.push(DEFENSE_TYPE_LABEL[params.defense_type])
    if (params.from || params.to) parts.push(`${params.from ? fmtDate(params.from) : 'Start'} to ${params.to ? fmtDate(params.to) : 'now'}`)
    if (params.type) parts.push(typeLabel[params.type])
    return parts.length ? parts.join(' · ') : 'All records'
  }, [params, options.groups])

  const exportCSV = () => {
    if (!data.length) return
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [report.cols.map(c => cell(c.h)).join(','), ...data.map(row => report.cols.map(c => cell(c.v(row))).join(','))]
    // The BOM makes Excel read names like "Peñaflor" correctly.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${report.name.replace(/\W+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv` })
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const exportPDF = () => {
    const win = window.open('', '_blank')
    if (!win) { showToast('Allow pop-ups for this site to print the report.'); return }
    const generatedAt = new Date().toLocaleString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const roleName = { admin: 'Administrator', instructor: 'Instructor' }[user?.role] || ''
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(report.name)}</title><style>
      body{font-family:Arial,sans-serif;padding:32px;color:#111}
      .school{font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.04em;text-align:center}
      .sys{font-size:11px;color:#666;text-align:center;margin-bottom:16px}
      h1{font-size:18px;margin:0 0 4px;text-align:center}
      .meta{font-size:11px;color:#555;text-align:center;margin-bottom:14px}
      .sum{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:11px;margin-bottom:12px;padding:8px 10px;border:1px solid #ddd;border-radius:6px}
      .note{font-size:10.5px;color:#555;margin-bottom:10px}
      table{width:100%;border-collapse:collapse;font-size:10.5px}
      th{background:#f3f4f6;text-align:left;padding:6px 7px;border:1px solid #ccc}
      td{padding:6px 7px;border:1px solid #ddd;vertical-align:top}
      tr{page-break-inside:avoid}
      .sign{display:flex;justify-content:space-between;gap:40px;margin-top:48px;font-size:11px}
      .sign div{flex:1}.line{border-top:1px solid #111;margin-top:36px;padding-top:4px;font-weight:bold}
      @page{size:landscape;margin:14mm}
    </style></head><body>
      ${options.school ? `<div class="school">${esc(options.school)}</div>` : ''}
      <div class="sys">ThesisGuard · Capstone and Thesis Monitoring</div>
      <h1>${esc(report.name)}</h1>
      <div class="meta">${esc(filterText)} · Generated ${esc(generatedAt)} · ${data.length} record(s)</div>
      ${summary.length ? `<div class="sum">${summary.map(([l, v]) => `<span><b>${esc(v)}</b> ${esc(l)}</span>`).join('')}</div>` : ''}
      ${report.note ? `<div class="note">${esc(report.note)}</div>` : ''}
      <table><thead><tr>${report.cols.map(c => `<th>${esc(c.h)}</th>`).join('')}</tr></thead>
      <tbody>${data.map(row => `<tr>${report.cols.map(c => `<td>${esc(c.v(row))}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <div class="sign">
        <div>Prepared by:<div class="line">${esc(user?.name || '')}</div>${esc(roleName)}</div>
        <div>Noted by:<div class="line">&nbsp;</div>Signature over printed name</div>
      </div>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 400)
  }

  const inputStyle = { border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', outline: 'none', background: '#f8fafc', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
  const labelStyle = { fontSize: '11px', fontWeight: '700', color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }
  const field = (label, control) => <div style={{ minWidth: 0 }}><label style={labelStyle}>{label}</label>{control}</div>

  return (
    <div>
      <div style={{ fontSize: '18px', fontWeight: '700', color: '#0a1f44', marginBottom: '16px' }}>Reports</div>

      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', overflow: 'hidden', marginBottom: '14px' }}>
        <div style={{ background: 'linear-gradient(135deg,#0a1f44,#1040a0)', padding: '14px 18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>Generate Report</div>
        </div>
        <div style={{ padding: '18px', display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 190px), 1fr))', alignItems: 'end' }}>
          {field('Report Type', (
            <select value={reportType} onChange={e => changeType(e.target.value)} style={inputStyle}>
              {Object.entries(REPORTS).map(([k, r]) => <option key={k} value={k}>{r.name}</option>)}
            </select>
          ))}
          {field('Academic Year', (
            <select value={f.academic_year} onChange={e => set('academic_year', e.target.value)} style={inputStyle}>
              <option value="">All years</option>
              {options.academic_years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          ))}
          {field('Section', (
            <select value={f.section} onChange={e => set('section', e.target.value)} style={inputStyle}>
              <option value="">All sections</option>
              {options.sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ))}
          {field('Group', (
            <select value={f.group_id} onChange={e => set('group_id', e.target.value)} style={inputStyle}>
              <option value="">All groups</option>
              {groupChoices.map(g => <option key={g.id} value={g.id}>{g.name}{g.section ? ` · ${g.section}` : ''}</option>)}
            </select>
          ))}
          {report.filters.includes('scope') && field('Projects', (
            <select value={f.scope} onChange={e => set('scope', e.target.value)} style={inputStyle}>
              <option value="current">Current projects</option>
              <option value="archived">Archived projects</option>
              <option value="all">All projects</option>
            </select>
          ))}
          {report.filters.includes('threshold') && field('Minimum Similarity', (
            <select value={f.threshold} onChange={e => set('threshold', e.target.value)} style={inputStyle}>
              <option value="0">All scores</option>
              <option value="30">30% and above</option>
              <option value="50">50% and above</option>
              <option value="60">60% and above (must be reviewed)</option>
            </select>
          ))}
          {report.filters.includes('defense_type') && field('Defense', (
            <select value={f.defense_type} onChange={e => set('defense_type', e.target.value)} style={inputStyle}>
              <option value="">All defenses</option>
              {DEFENSE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
          {report.filters.includes('dates') && <>
            {field('From', <input type="date" value={f.from} onChange={e => set('from', e.target.value)} style={inputStyle} />)}
            {field('To', <input type="date" value={f.to} min={f.from || undefined} onChange={e => set('to', e.target.value)} style={inputStyle} />)}
          </>}
          {report.filters.includes('doc_type') && field('Document', (
            <select value={f.type} onChange={e => set('type', e.target.value)} style={inputStyle}>
              <option value="">All documents</option>
              {Object.entries(typeLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
          <div>
            <button onClick={() => generate()} disabled={loading} style={{ width: '100%', padding: '11px', borderRadius: '8px', border: 'none', background: loading ? '#cbd5e1' : 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Generating...' : generated ? 'Refresh Report' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {loading && !generated && <SkeletonTable rows={6} cols={6} label="Generating report" />}

      {generated && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
              <b style={{ color: '#0a1f44' }}>{report.name}</b> · {filterText}
            </div>
            {data.length > 0 && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={exportCSV} style={{ fontSize: '12px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg,#059669,#047857)', color: '#fff', cursor: 'pointer', fontWeight: '700' }}>↓ Export CSV</button>
                <button onClick={exportPDF} style={{ fontSize: '12px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', cursor: 'pointer', fontWeight: '700' }}><Icon name="printer" /> Print / PDF</button>
              </div>
            )}
          </div>

          {summary.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
              {summary.map(([l, v]) => (
                <div key={l} style={{ background: '#fff', border: '1px solid #e8ecf2', borderRadius: '10px', padding: '8px 14px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#0a1f44', lineHeight: 1.1 }}>{v}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{l}</div>
                </div>
              ))}
            </div>
          )}
          {report.note && <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>{report.note}</div>}

          {data.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No records match these filters.</div>
          ) : (
            // Scrolls sideways on narrow screens instead of cutting columns off.
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: `${report.cols.length * 110}px`, borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {report.cols.map(c => (
                      <th key={c.h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{c.h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {report.cols.map(c => (
                        <td key={c.h} style={{ padding: '10px 14px', color: '#334155', verticalAlign: 'top', minWidth: c.w ? `${c.w}px` : undefined }}>{c.r ? c.r(row) : c.v(row)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PageReports
