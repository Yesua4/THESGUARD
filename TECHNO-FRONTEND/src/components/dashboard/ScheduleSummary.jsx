import { useMemo, useState } from 'react'
import { scheduleStatus, statusPillStyle } from '../../utils/scheduleView'
import { PANEL_ROLE_LABEL, timeRange } from '../../constants/defense'
import { defenseLabel, defenseTypesFor, researchTypeOf } from '../../utils/research'
import { humanStatus } from '../../utils/humanStatus'

// A compact, sortable list of defenses (one row each) next to the big cards:
// for a panelist or instructor with many defenses. Upcoming first, soonest
// at the top; past ones newest first.

const dayOf = s => String(s.defense_date || '').slice(0, 10)
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const plusDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fmtDay = iso => { const d = new Date(iso + 'T00:00:00'); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) }
const startOf = s => String(s.start_time || s.defense_time || '')

// What the viewer is in this defense (panelist / adviser), if anything.
const myRoleIn = (s, user) => {
  const mine = (s.panel || []).find(p => Number(p.user_id) === Number(user?.id))
  if (mine) return PANEL_ROLE_LABEL[mine.role] || humanStatus(mine.role)
  if (Number(s.adviser_id) === Number(user?.id)) return 'Adviser'
  return null
}

export function ViewSwitch({ view, onChange }) {
  const btn = active => ({ fontSize: '12px', padding: '7px 14px', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
    background: active ? 'linear-gradient(135deg,#0a1f44,#1040a0)' : '#fff', color: active ? '#fff' : '#64748b' })
  return (
    <div role="group" aria-label="View" style={{ display: 'inline-flex', borderRadius: '8px', overflow: 'hidden', boxShadow: 'inset 0 0 0 1.5px #e2e8f0' }}>
      <button type="button" aria-pressed={view === 'cards'} onClick={() => onChange('cards')} style={btn(view === 'cards')}>Cards</button>
      <button type="button" aria-pressed={view === 'list'} onClick={() => onChange('list')} style={btn(view === 'list')}>List</button>
    </div>
  )
}

export default function ScheduleSummary({ schedules, user, onCancel }) {
  const [when, setWhen] = useState('upcoming') // upcoming | past | all
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const today = todayStr()
  const weekEnd = plusDays(today, 6)
  const showMyRole = ['panelist', 'adviser'].includes(user?.role) || schedules.some(s => myRoleIn(s, user))

  const counts = useMemo(() => ({
    today: schedules.filter(s => dayOf(s) === today && scheduleStatus(s) !== 'cancelled').length,
    week: schedules.filter(s => dayOf(s) >= today && dayOf(s) <= weekEnd && scheduleStatus(s) !== 'cancelled').length,
    upcoming: schedules.filter(s => dayOf(s) >= today).length,
    past: schedules.filter(s => dayOf(s) < today).length,
  }), [schedules, today, weekEnd])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = schedules.filter(s =>
      (when === 'all' || (when === 'upcoming' ? dayOf(s) >= today : dayOf(s) < today))
      && (!type || s.defense_type === type)
      && (!q || [s.group?.group_name, s.group?.section, s.project?.title, s.venue, ...(s.panel || []).map(p => p.user?.name)].filter(Boolean).join(' ').toLowerCase().includes(q)))
    const key = s => `${dayOf(s)} ${startOf(s)}`
    return list.sort((a, b) => (when === 'past' ? key(b).localeCompare(key(a)) : key(a).localeCompare(key(b))))
  }, [schedules, when, type, search, today])

  const chip = (k, label, n) => (
    <button key={k} type="button" onClick={() => setWhen(k)} aria-pressed={when === k}
      style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '20px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
        border: `1.5px solid ${when === k ? '#1d4ed8' : '#e2e8f0'}`, background: when === k ? '#eff6ff' : '#fff', color: when === k ? '#1d4ed8' : '#475569' }}>
      {label}{n !== undefined ? ` (${n})` : ''}
    </button>
  )
  const th = { textAlign: 'left', padding: '10px 14px', fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }
  const td = { padding: '10px 14px', fontSize: '12px', color: '#334155', verticalAlign: 'top', borderBottom: '1px solid #f8fafc' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {[['Today', counts.today], ['Next 7 days', counts.week], ['Upcoming', counts.upcoming], ['Past', counts.past]].map(([l, n]) => (
          <div key={l} style={{ background: '#fff', border: '1px solid #e8ecf2', borderRadius: '10px', padding: '8px 14px' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0a1f44', lineHeight: 1.1 }}>{n}</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        {chip('upcoming', 'Upcoming', counts.upcoming)}
        {chip('past', 'Past', counts.past)}
        {chip('all', 'All', schedules.length)}
        <select value={type} onChange={e => setType(e.target.value)} aria-label="Defense type"
          style={{ border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', background: '#fff', fontFamily: 'inherit' }}>
          <option value="">All defenses</option>
          {defenseTypesFor('both').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search group, room, panelist..." aria-label="Search defenses"
          style={{ flex: '1 1 200px', minWidth: 0, border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '7px 10px', fontSize: '12px', fontFamily: 'inherit' }} />
      </div>

      {rows.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
          {when === 'upcoming' ? 'No upcoming defenses.' : when === 'past' ? 'No past defenses.' : 'No defenses match.'}
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '820px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Date', 'Time', 'Defense', 'Group', 'Room', showMyRole ? 'My Role' : 'Panel', 'Status', ...(onCancel ? [''] : [])].map((h, i) => <th key={i} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(s => {
                const rt = researchTypeOf(s.group)
                const isToday = dayOf(s) === today
                return (
                  <tr key={s.id} style={{ background: isToday ? '#fffbeb' : undefined, opacity: scheduleStatus(s) === 'cancelled' ? 0.6 : 1 }}>
                    <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 600, color: '#0a1f44' }}>{fmtDay(dayOf(s))}{isToday && <div style={{ fontSize: '10px', color: '#b45309', fontWeight: 700 }}>Today</div>}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{timeRange(s)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{defenseLabel(s.defense_type, rt) || 'Defense'}</td>
                    <td style={{ ...td, minWidth: '160px' }}>
                      <div style={{ fontWeight: 600, color: '#0a1f44' }}>{s.group?.group_name || '—'}{s.group?.section ? <span style={{ fontWeight: 400, color: '#94a3b8' }}> · {s.group.section}</span> : null}</div>
                      {s.project?.title && <div style={{ fontSize: '11px', color: '#64748b' }}>{s.project.title}</div>}
                    </td>
                    <td style={td}>{s.venue || '—'}</td>
                    <td style={{ ...td, minWidth: showMyRole ? undefined : '180px' }}>
                      {showMyRole
                        ? (myRoleIn(s, user) || '—')
                        : (s.panel || []).length
                          ? s.panel.map(p => <div key={p.id || p.role} style={{ whiteSpace: 'nowrap' }}><span style={{ color: '#94a3b8' }}>{PANEL_ROLE_LABEL[p.role] || humanStatus(p.role)}:</span> {p.user?.name}</div>)
                          : (s.panelists || '—')}
                    </td>
                    <td style={td}><span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: 700, whiteSpace: 'nowrap', ...statusPillStyle(s) }}>{humanStatus(scheduleStatus(s))}</span></td>
                    {onCancel && <td style={td}><button type="button" onClick={() => onCancel(s.id)} style={{ fontSize: '11px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>Cancel</button></td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
