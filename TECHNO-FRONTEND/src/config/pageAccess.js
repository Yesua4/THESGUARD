import { NAV } from './nav'

// Pages every signed-in user has (top bar / profile menu), whatever the role.
const ALWAYS_OPEN = ['dashboard', 'notifications', 'changepassword', 'editprofile']

// Can this role open this page? Only pages in the role's own menu.
const canOpen = (role, page) => ALWAYS_OPEN.includes(page) || !!NAV[role]?.some(item => item.id === page)

// Where a shortcut (notification, dashboard card) should take this role:
// the page itself if they have it, otherwise the closest page they do have.
const NEAREST = {
  schedule: ['myschedule'], myschedule: ['schedule'],
  titleapproval: ['projects'], similarity: ['titleapproval', 'projects'],
  evaluate: ['projects', 'panelcomments'], submit: ['docreview'], docreview: ['submit', 'projects'],
  groups: ['mygroup', 'projects'], mygroup: ['groups'], contributions: ['mycontrib'], mycontrib: ['contributions'],
}
const pageFor = (role, page) => (canOpen(role, page) ? page : (NEAREST[page] || []).find(p => canOpen(role, p)) || 'dashboard')

export { canOpen, pageFor }
