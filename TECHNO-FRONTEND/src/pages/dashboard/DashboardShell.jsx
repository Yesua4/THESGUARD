import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import logo from '../../assets/capstoneguard1.png'
import { NAV, NAV_GROUPS, NAV_ICONS } from '../../config/nav'
import { ROLE_META } from '../../constants/roles'
import EnhancedTopBar from '../../components/dashboard/EnhancedTopBar'
import UserAvatar from '../../components/dashboard/UserAvatar'
import PageRouter from './PageRouter'

function DashboardShell() {
  const { user, logout } = useAuth()
  const navigate         = useNavigate()
  const [page, setPage]  = useState('dashboard')
  const [navTarget, setNavTarget] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)

  const handleNotificationNavigate = target => {
    setPage(target.page)
    setNavTarget(target)
  }
  const [loggingOut, setLoggingOut]   = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768)

  // ── FIX: notifications for ALL roles, not just students ──────────────────
  const fetchUnread = useCallback(() => {
    api.get('/notifications')
      .then(res => setUnreadCount(res.data.unread_count ?? 0))
      .catch(() => {})
  }, [])

  useEffect(() => {
  const handleResize = () => {
  if (window.innerWidth <= 768) {
    setSidebarOpen(false)
  } else {
    setSidebarOpen(true)
  }
}
  window.addEventListener('resize', handleResize)
  return () => window.removeEventListener('resize', handleResize)
}, [])  

  useEffect(() => {
    fetchUnread()
    const interval = setInterval(fetchUnread, 30_000)
    return () => clearInterval(interval)
  }, [fetchUnread])

  const handleLogout = async () => {
    setLoggingOut(true)
    await logout()
    navigate('/login')
  }

  const navItems = NAV[user?.role]     || NAV.student
  const groups   = NAV_GROUPS[user?.role] || NAV_GROUPS.student
  const meta     = ROLE_META[user?.role]  || ROLE_META.student

  const currentPageLabel = navItems.find(n => n.id === page)?.label
    || (page === 'notifications' ? 'Notifications' : 'Dashboard')

  return (
  <div style={{ display: 'flex', minHeight: '100vh', background: '#f0f2f7', fontFamily: "'Segoe UI', sans-serif", overflowX: 'hidden' }}>

    {/* ── SIDEBAR ── */}
    <div className={`sidebar ${sidebarOpen ? 'open' : ''}`} style={{
      width: sidebarOpen ? '232px' : '64px',
      flexShrink: 0,
      background: 'linear-gradient(170deg, #0a1628 0%, #0f2045 50%, #0a1628 100%)',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0, left: 0, bottom: 0,
      zIndex: 50,
      overflowX: 'hidden',
      transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      

      {/* Brand */}
<div style={{ padding: '16px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', minHeight: '72px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
<img src={logo} alt="ThesisGuard" style={{
  width: '32px', height: '32px', borderRadius: '9px',
  objectFit: 'contain', flexShrink: 0, boxShadow: '0 0 0 1px rgba(59,130,246,0.3)',
}} />
    {sidebarOpen && (
      <div style={{ overflow: 'hidden' }}>
        <div style={{ color: '#fff', fontWeight: '700', fontSize: '13px', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>ThesisGuard</div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>by Acadvance</div>
      </div>
    )}
  </div>
  <div style={{
    position:'absolute', top:'-80px', left:'-60px',
    width:'240px', height:'240px', borderRadius:'50%',
    background:'radial-gradient(circle, rgba(99,179,237,0.06) 0%, transparent 70%)',
    pointerEvents:'none', zIndex:0,
  }} />
  {/* X close button — mobile only */}
  <button
    onClick={() => setSidebarOpen(false)}
    style={{
      display: 'none',
      background: 'rgba(255,255,255,0.1)',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '8px',
      color: '#fff',
      width: '32px', height: '32px',
      cursor: 'pointer',
      fontSize: '16px',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
    className="sidebar-close-btn"
  >✕</button>
</div>
      {/* Role badge — only when open */}
      {sidebarOpen && (
        <div style={{ padding: '10px 12px 0' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)',
            borderRadius: '20px', padding: '4px 10px',
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f5c300' }} />
            <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
              {meta.label}
            </span>
          </div>
        </div>
      )}

      {/* Nav groups */}
      <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto', overflowX: 'hidden' }}>
        {groups.map(group => {
          const items = navItems.filter(item => group.ids.includes(item.id))
          if (!items.length) return null
          return (
            <div key={group.heading} style={{ marginBottom: '6px' }}>
              {/* Group heading — only when open */}
              {sidebarOpen && (
                <div style={{
                  color: 'rgba(255,255,255,0.28)', fontSize: '9px', fontWeight: '700',
                  letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 8px 4px',
                }}>
                  {group.heading}
                </div>
              )}
              {items.map(item => {
                const active = page === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setPage(item.id)
                      if (window.innerWidth <= 768) setSidebarOpen(false)
                    }}
                    title={item.label}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center',
                      justifyContent: sidebarOpen ? 'flex-start' : 'center',
                      gap: sidebarOpen ? '9px' : '0',
                      padding: '10px 8px', borderRadius: '8px', border: 'none',
                      cursor: 'pointer', marginBottom: '1px',
                      background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                      color: active ? '#93c5fd' : 'rgba(148,163,184,0.7)',
                      fontWeight: active ? '600' : '400', fontSize: '13px',
                      transition: 'background 0.15s, color 0.15s',
                      borderLeft: active ? '2px solid #3b82f6' : '2px solid transparent',
                    }}
                    onMouseOver={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)' } }}
                    onMouseOut={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' } }}
                  >
                    <span style={{ flexShrink: 0, opacity: active ? 1 : 0.7, display: 'flex' }}>
                      {NAV_ICONS[item.id] || NAV_ICONS.projects}
                    </span>
                    {sidebarOpen && (
                      <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div style={{ padding: '12px 8px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {/* User card */}
        <div style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px', padding: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'flex-start' : 'center', gap: '9px', marginBottom: sidebarOpen ? '8px' : '0' }}>
            <UserAvatar
              user={user}
              size={32}
              fontSize={11}
              bg="linear-gradient(135deg, #3b82f6, #8b5cf6)"
              color="#fff"
            />
            {sidebarOpen && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.name}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.email}
                </div>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              style={{
                width: '100%', padding: '5px', borderRadius: '6px',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                color: '#fca5a5', fontSize: '11px', fontWeight: '500', cursor: 'pointer',
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)' }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
            >
              {loggingOut ? 'Signing out...' : 'Sign out'}
            </button>
          )}
        </div>
      </div>
    </div>

    {/* Mobile backdrop — a sibling of .sidebar, not nested inside it: .sidebar
        uses `transform` for its slide animation, and a transformed ancestor
        becomes the containing block for any `position:fixed` descendant,
        which would otherwise clip this backdrop to the sidebar's own width. */}
    {sidebarOpen && (
      <div
        className="sidebar-backdrop"
        onClick={() => setSidebarOpen(false)}
      />
    )}

    {/* ── MAIN CONTENT ── */}
    <div className="main-content" style={{
      marginLeft: sidebarOpen ? '232px' : '64px',
      flex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column',
      transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      {/* Top bar */}
      <EnhancedTopBar
        user={user}
        unreadCount={unreadCount}
        loggingOut={loggingOut}
        handleLogout={handleLogout}
        currentPageLabel={currentPageLabel}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        onNotificationsClick={() => setPage('notifications')}
        onNavigate={setPage}
      />


      {/* Page content */}
      <div className="page-content" style={{ padding: '24px', flex: 1 }}>
        <PageRouter
          page={page} setPage={setPage} setUnreadCount={setUnreadCount} user={user}
          navTarget={navTarget} clearNavTarget={() => setNavTarget(null)}
          onNotificationNavigate={handleNotificationNavigate}
        />
      </div>
    </div>
  </div>
)
}

export default DashboardShell
