// Defense types and panel roles (mirror DefenseSchedule::TYPE_LABELS /
// ROLE_LABELS on the backend).
export const DEFENSE_TYPES = [
  ['title', 'Title Defense'],
  ['outline', 'Outline Defense'],
  ['pre_deployment', 'Pre-Deployment Defense'],
  ['final', 'Final Defense'],
]
export const DEFENSE_TYPE_LABEL = Object.fromEntries(DEFENSE_TYPES)

export const PANEL_ROLES = [
  ['chair', 'Panel Chair'],
  ['member1', 'Panel Member 1'],
  ['member2', 'Panel Member 2'],
]
export const PANEL_ROLE_LABEL = Object.fromEntries(PANEL_ROLES)

// "13:00" -> "1:00 PM"
export function formatTime(t) {
  if (!t) return '—'
  const [h, m] = String(t).split(':')
  const hour = parseInt(h, 10)
  if (Number.isNaN(hour)) return t
  return `${hour % 12 || 12}:${(m || '00').slice(0, 2)} ${hour >= 12 ? 'PM' : 'AM'}`
}

// A schedule's time range; old schedules without an end time show the start only.
export function timeRange(s) {
  const start = s.start_time || s.defense_time
  return s.end_time ? `${formatTime(start)} – ${formatTime(s.end_time)}` : formatTime(start)
}

// The defense a group should have next, from the ones already scheduled.
export function nextDefenseType(groupSchedules) {
  const order = DEFENSE_TYPES.map(([v]) => v)
  const done = groupSchedules.map(s => order.indexOf(s.defense_type)).filter(i => i >= 0)
  const next = done.length ? Math.max(...done) + 1 : 0
  return order[Math.min(next, order.length - 1)]
}
