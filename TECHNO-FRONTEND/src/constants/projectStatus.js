// Readable labels for a project's status (projects.status).
export const PROJECT_STATUSES = [
  ['ongoing', 'Ongoing'],
  ['for_defense', 'For Defense'],
  ['approved', 'Approved'],
  ['archived', 'Archived'],
  ['flagged', 'Flagged'],
]
export const PROJECT_STATUS_LABEL = { ...Object.fromEntries(PROJECT_STATUSES), not_chosen: 'Not Chosen' }

// When faculty set a group's final title, the group's other approved titles
// are stored as 'archived' too -- but they were never finished, so they are
// not in the Capstone Archive. On screen they're called "Not chosen" so they
// aren't mistaken for completed capstones. (Same rule as ProjectController::archive:
// a real archived capstone has no group (imported) or is the group's final title.)
// Works for /projects rows (group_id) and report rows (group name).
export const isNotChosenTitle = p =>
  !!p && p.status === 'archived' && !p.is_final_title && !!(p.group_id ?? p.group)

// The status to show: 'not_chosen' for a set-aside title, otherwise the stored one.
export const displayStatus = p => (isNotChosenTitle(p) ? 'not_chosen' : p?.status)

export const projectStatusLabel = p => {
  const s = displayStatus(p)
  return PROJECT_STATUS_LABEL[s] || s || ''
}
