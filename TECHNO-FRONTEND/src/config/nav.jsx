// ─── NAV DEFINITIONS ─────────────────────────────────────────────────────────
const NAV = {
  admin: [
    { id: 'dashboard',     label: 'Dashboard' },
    { id: 'projects',      label: 'All Projects' },
    { id: 'users',         label: 'User Accounts' },
    { id: 'archive',       label: 'Archive' },
    { id: 'similarity',    label: 'Similarity Detection' },
    { id: 'contributions', label: 'Contribution Analytics' },
    { id: 'reports',       label: 'Reports' },
    { id: 'settings',      label: 'Rooms & Panelists' },
  ],
  instructor: [
    { id: 'dashboard',     label: 'Dashboard' },
    { id: 'groups',        label: 'Manage Groups' },
    { id: 'users',         label: 'Student Accounts' },
    { id: 'projects',      label: 'All Projects' },
    { id: 'titleapproval', label: 'Title Approval' },
    { id: 'docreview',     label: 'Documents Review' },
    { id: 'schedule',      label: 'Defense Schedule' },
    { id: 'settings',      label: 'Rooms & Panelists' },
    { id: 'contributions', label: 'Contribution Analytics' },
    { id: 'reports',       label: 'Reports' },
  ],
  adviser: [
    { id: 'dashboard',     label: 'Dashboard' },
    { id: 'groups',        label: 'My Groups' },
    { id: 'titleapproval', label: 'Title Approval' },
    { id: 'docreview',     label: 'Documents Review' },
    { id: 'similarity',    label: 'Similarity Detection' },
    { id: 'contributions', label: 'Contribution Analytics' },
  ],
  student: [
    { id: 'dashboard',     label: 'Dashboard' },
    { id: 'progress',      label: 'My Progress' },
    { id: 'mygroup',       label: 'My Group' },
    { id: 'projects',      label: 'My Project' },
    { id: 'submit',        label: 'Submit Document' },
    { id: 'myschedule',    label: 'My Defense Schedule' },
    { id: 'mycontrib',     label: 'My Contributions' },
  ],
  panelist: [
    { id: 'dashboard',     label: 'Dashboard' },
    { id: 'projects',      label: 'For Review' },
    { id: 'docreview',     label: 'Documents Review' },
    { id: 'evaluate',      label: 'Evaluate Projects' },
    { id: 'similarity',    label: 'Similarity Detection' },
  ],
}

const NAV_GROUPS = {
  admin: [
    { heading: 'Overview',   ids: ['dashboard'] },
    { heading: 'Management', ids: ['projects', 'users', 'archive'] },
    { heading: 'Tools',      ids: ['similarity', 'contributions', 'reports', 'settings'] },
  ],
  instructor: [
    { heading: 'Overview',   ids: ['dashboard'] },
    { heading: 'Management', ids: ['groups', 'users', 'projects'] },
    { heading: 'Academic',   ids: ['titleapproval', 'docreview', 'schedule', 'settings'] },
    { heading: 'Analytics',  ids: ['contributions', 'reports'] },
  ],
  adviser: [
    { heading: 'Overview',   ids: ['dashboard'] },
    { heading: 'My Work',    ids: ['groups', 'titleapproval', 'docreview'] },
    { heading: 'Tools',      ids: ['similarity', 'contributions'] },
  ],
  student: [
    { heading: 'Overview',   ids: ['dashboard', 'progress'] },
    { heading: 'My Capstone',ids: ['mygroup', 'projects', 'submit'] },
    { heading: 'Schedule',   ids: ['myschedule'] },
    { heading: 'Analytics',  ids: ['mycontrib'] },
  ],
  panelist: [
    { heading: 'Overview',   ids: ['dashboard'] },
    { heading: 'Projects',   ids: ['projects', 'docreview', 'evaluate', 'similarity'] },
  ],
}

// SVG icons (kept identical to original)
const NAV_ICONS = {
  dashboard:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  groups:        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  projects:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  users:         <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  archive:       <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  similarity:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  contributions: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  reports:       <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  settings:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>,
  titleapproval: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  docreview:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  schedule:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  myschedule:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  submit:        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
  mycontrib:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  mygroup:       <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  progress:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  evaluate:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  changepassword:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  notifications: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
}

export { NAV, NAV_GROUPS, NAV_ICONS }
