import { useState } from 'react'

function MiniCalendar() {
  const today = new Date()
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const dayNames   = ['Su','Mo','Tu','We','Th','Fr','Sa']

  const firstDay   = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells      = Array(firstDay).fill(null).concat(Array.from({length: daysInMonth}, (_, i) => i + 1))
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const isToday = d => d && d === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  const prev = () => setViewDate(new Date(year, month - 1, 1))
  const next = () => setViewDate(new Date(year, month + 1, 1))

  return (
    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#1d4ed8)', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span style={{ color: '#fff', fontSize: '12px', fontWeight: '700' }}>
            {monthNames[month]} {year}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '2px' }}>
          {[['←', prev], ['→', next]].map(([arrow, fn]) => (
            <button key={arrow} onClick={fn} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', width: '24px', height: '24px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
            >{arrow}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '10px 12px 12px' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: '4px' }}>
          {dayNames.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '9px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.05em', padding: '3px 0' }}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '1px' }}>
          {cells.map((d, i) => (
            <div key={i} style={{
              textAlign: 'center', fontSize: '12px', padding: '5px 2px',
              borderRadius: '6px',
              background: isToday(d) ? 'linear-gradient(135deg,#3b82f6,#8b5cf6)' : 'transparent',
              color: isToday(d) ? '#fff' : d ? '#334155' : 'transparent',
              fontWeight: isToday(d) ? '700' : '400',
            }}>
              {d || ''}
            </div>
          ))}
        </div>

        {/* Today label */}
        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f1f5f9', fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1d4ed8', flexShrink: 0 }} />
          Today — {today.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>
    </div>
  )
}

export default MiniCalendar
