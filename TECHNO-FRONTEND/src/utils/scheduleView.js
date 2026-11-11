import { useState } from 'react'

// Status shown for a defense: the saved one, else worked out (older rows
// were saved without a status).
export const scheduleStatus = s => s.status || (s.verdict ? 'completed' : 'scheduled')

const STATUS_STYLE = {
  scheduled: { background: '#ede9fe', color: '#6d28d9' },
  completed: { background: '#d1fae5', color: '#065f46' },
  cancelled: { background: '#fee2e2', color: '#9f1239' },
  rescheduled: { background: '#fef3c7', color: '#92400e' },
}
export const statusPillStyle = s => STATUS_STYLE[scheduleStatus(s)] || { background: '#f1f5f9', color: '#475569' }

// Cards / List choice for the schedule pages, remembered per browser.
export function useScheduleView() {
  const [view, setView] = useState(() => { try { return localStorage.getItem('tg_schedule_view') || 'cards' } catch { return 'cards' } })
  const choose = v => { setView(v); try { localStorage.setItem('tg_schedule_view', v) } catch { /* private mode */ } }
  return [view, choose]
}
