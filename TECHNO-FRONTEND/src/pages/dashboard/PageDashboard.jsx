import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import { useSchoolActivity } from '../../hooks/useSchoolActivity'
import MiniCalendar from '../../components/dashboard/MiniCalendar'
import QuickActionsWidget from '../../components/dashboard/QuickActionsWidget'
import { useProjectsChannel } from '../../hooks/useProjectChannel'
import { DEFENSE_TYPE_LABEL, timeRange } from '../../constants/defense'
import Icon from '../../components/Icon'
import { humanStatus } from '../../utils/humanStatus'

// The next defense (today or later), else the most recent one.
function pickDefense(schedules) {
  const today = new Date().toISOString().slice(0, 10)
  const sorted = [...schedules].sort((a, b) => String(a.defense_date).localeCompare(String(b.defense_date)))
  return sorted.find(s => String(s.defense_date).slice(0, 10) >= today) || sorted[sorted.length - 1] || null
}
const shortDate = d => new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

function PageDashboard({ user, onNavigate }) {
  const [stats, setStats]       = useState(null)
  const [activity, setActivity] = useState([])
  const [adviserStats, setAdviserStats] = useState(null)
  const [studentStats, setStudentStats] = useState(null)
  const [panelistStats, setPanelistStats] = useState(null)
  const [projectIds, setProjectIds] = useState([])

  const load = useCallback(() => {
    // Always fetch projects for activity feed
    api.get('/projects').then(res => {
      const projects = res.data
      setProjectIds(projects.map(p => p.id))
      const total    = projects.length
      const archived = projects.filter(p => p.status === 'archived').length
      const flagged  = projects.filter(p => p.similarity_score >= 60).length // 60%+ = mandatory review
      const pending  = projects.filter(p => p.title_status === 'pending').length
      setStats({ total, archived, flagged, pending })
      setActivity(projects.slice(0, 5).map(p => ({
        date:     p.created_at ? new Date(p.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—',
        activity: p.title,
        status:   p.status,
      })))

      // Student-specific stats
      if (user?.role === 'student') {
        const minePool = projects.filter(p => p.members?.some(m => m.user_id === user.id))
        const mine = minePool.find(p => p.is_final_title) || minePool[0]
        setStudentStats(s => ({
          ...s,
          status:     mine?.status        || 'No project',
          titleStatus:mine?.title_status  || '—',
          similarity: mine?.similarity_score != null ? mine.similarity_score + '%' : '—',
        }))
      }
      // Panelist-specific
      if (user?.role === 'panelist') {
        const forDefense = projects.filter(p => p.status === 'for_defense').length
        const approved   = projects.filter(p => p.status === 'approved').length
        setPanelistStats(s => ({ ...s, forDefense, approved, total }))
      }
    }).catch(() => setStats({ total: 0, archived: 0, flagged: 0, pending: 0 }))

    // Student: their next defense (date and time), from the real schedule.
    if (user?.role === 'student') {
      api.get('/schedules').then(res => {
        const d = pickDefense(res.data || [])
        setStudentStats(s => ({ ...s, defense: d ? `${shortDate(d.defense_date)}` : 'TBA',
          defenseNote: d ? `${DEFENSE_TYPE_LABEL[d.defense_type] || 'Defense'} · ${timeRange(d)}${d.venue ? ` · ${d.venue}` : ''}` : null }))
      }).catch(() => setStudentStats(s => ({ ...s, defense: 'TBA' })))
    }

    // Adviser-specific stats
    if (user?.role === 'adviser') {
      Promise.all([api.get('/groups'), api.get('/schedules'), api.get('/documents')])
        .then(([gRes, sRes, dRes]) => {
          setAdviserStats({
            groups: gRes.data.length,
            schedules: sRes.data.length,
            documents: (dRes.data || []).filter(d => d.status === 'pending').length,
          })
        }).catch(() => {})
    }

    // Panelist: how many evaluations they've submitted.
    if (user?.role === 'panelist') {
      api.get('/evaluations').then(res => setPanelistStats(s => ({ ...s, evaluated: (res.data || []).length }))).catch(() => {})
    }
  }, [user])

  useEffect(() => { load() }, [load])

  // Live updates: the overview numbers (pending titles, flagged
  // similarity, defenses scheduled) are the first thing anyone sees on
  // login -- refresh them whenever any project currently counted here
  // changes, instead of only on the next full page load.
  useProjectsChannel(projectIds, load)
  // Live: overview numbers follow new projects, groups and schedules.
  useSchoolActivity(['projects', 'groups', 'schedules', 'documents', 'evaluations'], load)

  // Build display stats per role
  const buildStats = () => {
    if (user?.role === 'student') {
      return [
        ['Project Status',  studentStats?.status        || '…', '#1d4ed8', <Icon name="folder" />],
        ['Title Status',    studentStats?.titleStatus   || '…', '#92400e', <Icon name="clock" />],
        ['Similarity',      studentStats?.similarity    || '…', '#065f46', <Icon name="search" />],
        ['Defense Date',    studentStats?.defense       || '…', '#9f1239', <Icon name="calendar" />, studentStats?.defenseNote],
      ]
    }
    if (user?.role === 'adviser') {
      return [
        ['My Groups',          adviserStats?.groups     ?? '…', '#065f46', <Icon name="users" />],
        ['Pending Docs',       adviserStats?.documents  ?? '…', '#92400e', <Icon name="file" />],
        ['Defenses Scheduled', adviserStats?.schedules  ?? '…', '#1d4ed8', <Icon name="calendar" />],
        ['Completed',          stats?.archived          ?? '…', '#065f46', <Icon name="graduation" />],
      ]
    }
    if (user?.role === 'panelist') {
      return [
        ['For Review',   panelistStats?.forDefense ?? '…', '#1d4ed8', <Icon name="clipboard" />],
        ['Approved',     panelistStats?.approved   ?? '…', '#065f46', <Icon name="check-circle" />],
        ['Total Visible',panelistStats?.total      ?? '…', '#92400e', <Icon name="folder" />],
        ['Evaluated',    panelistStats?.evaluated  ?? '…', '#9f1239', <Icon name="star" />],
      ]
    }
    if (user?.role === 'instructor') {
      return [
        ['Pending Approval', stats?.pending  ?? '…', '#92400e', <Icon name="clock" />],
        ['Total Projects',   stats?.total    ?? '…', '#1d4ed8', <Icon name="folder" />],
        ['Flagged',          stats?.flagged  ?? '…', '#9f1239', <Icon name="flag" />],
        ['Archived',         stats?.archived ?? '…', '#065f46', <Icon name="archive" />],
      ]
    }
    // admin
    return [
      ['Total Projects', stats?.total    ?? '…', '#1d4ed8', <Icon name="folder" />],
      ['Archived',       stats?.archived ?? '…', '#065f46', <Icon name="archive" />],
      ['Pending Titles', stats?.pending  ?? '…', '#92400e', <Icon name="clock" />],
      ['Flagged',        stats?.flagged  ?? '…', '#9f1239', <Icon name="flag" />],
    ]
  }

  const displayStats = buildStats()

  const statusStyle = s => ({
    background: s === 'approved' ? '#d1fae5' : s === 'flagged' ? '#fee2e2' : s === 'for_defense' ? '#ede9fe' : s === 'archived' ? '#f1f5f9' : '#dbeafe',
    color:      s === 'approved' ? '#065f46' : s === 'flagged' ? '#9f1239' : s === 'for_defense' ? '#4c1d95' : s === 'archived' ? '#475569' : '#1e40af',
  })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div>
      {/* Welcome banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 60%, #7c3aed 100%)',
        borderRadius: '16px', padding: '22px 28px', marginBottom: '16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', bottom: '-40px', right: '120px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(245,195,0,0.06)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '4px', fontWeight: '600', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div style={{ color: '#fff', fontSize: '20px', fontWeight: '700', marginBottom: '4px' }}>
            {greeting}, {user?.name?.split(' ')[0]}!
          </div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
            Here's your capstone monitoring overview.
          </div>
        </div>
        <div className="role-badge" style={{ background: 'rgba(245,195,0,0.15)', border: '1px solid rgba(245,195,0,0.3)', borderRadius: '12px', padding: '10px 16px', position: 'relative', zIndex: 1, flexShrink: 0 }}>
          <div style={{ color: '#f5c300', fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '2px' }}>Role</div>
          <div style={{ color: '#fff', fontSize: '13px', fontWeight: '600', textTransform: 'capitalize' }}>{user?.role}</div>
        </div>
      </div>

      {/* Main 2-column layout: left = content, right = widgets */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: '14px', alignItems: 'start' }}>

        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Stat cards */}
          <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
            {displayStats.map(([label, value, color, icon, note]) => (
              <div key={label} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '16px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', 
                background: ({
                  '#1d4ed8': 'linear-gradient(90deg,#3b82f6,#6366f1)',
                  '#92400e': 'linear-gradient(90deg,#f59e0b,#fbbf24)',
                  '#9f1239': 'linear-gradient(90deg,#ef4444,#f43f5e)',
                  '#065f46': 'linear-gradient(90deg,#10b981,#059669)',
                }[color] || color), borderRadius: '14px 14px 0 0', 
                transition: 'transform 0.15s, box-shadow 0.15s',
                  onMouseOver: e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.07)' },
                  onMouseOut:  e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none' }, }} />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>{label}</div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: '#0a1f44', textTransform: 'capitalize' }}>{typeof value === 'string' ? value.replace(/_/g, ' ') : value}</div>
                    {note && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{note}</div>}
                  </div>
                  <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>{icon}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Recent projects */}
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#0a1f44' }}>Recent Projects</div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{activity.length} latest</div>
            </div>
            {activity.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No projects yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Date', 'Project Title', 'Status'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '9px 18px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activity.map((a, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}
                      onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '11px 18px', color: '#94a3b8', fontWeight: '500', whiteSpace: 'nowrap' }}>{a.date}</td>
                      <td style={{ padding: '11px 18px', color: '#0a1f44', fontWeight: '500' }}>{a.activity}</td>
                      <td style={{ padding: '11px 18px' }}>
                        <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '600', textTransform: 'capitalize', ...statusStyle(a.status) }}>{humanStatus(a.status)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — Calendar + To-Do */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <MiniCalendar />
          <QuickActionsWidget user={user} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  )
}

export default PageDashboard
