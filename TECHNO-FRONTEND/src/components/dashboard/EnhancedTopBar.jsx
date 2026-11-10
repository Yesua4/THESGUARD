import { useState, useEffect, useRef } from 'react'
import { destinationFor } from '../../utils/notificationDestination'
import stripEmoji from '../../utils/stripEmoji'
import api from '../../api/axios'
import { ROLE_META, userRoles } from '../../constants/roles'
import { useAcademicTerms, termLabel } from '../../hooks/useAcademicTerms'
import UserAvatar from './UserAvatar'
import Icon from '../Icon'

function EnhancedTopBar({
  user, unreadCount, loggingOut, handleLogout,
  currentPageLabel, sidebarOpen, setSidebarOpen, onNotificationsClick, onNavigate, onOpenNotification,
  onSwitchRole, switchingRole,
}) {
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifOpen, setNotifOpen]     = useState(false)
  const [recentNotifs, setRecentNotifs] = useState([])
  const profileRef = useRef(null)
  const notifRef   = useRef(null)

  const meta = ROLE_META[user?.role] || { label: 'User', color: '#475569', bg: '#f1f5f9' }
  const assignedRoles = userRoles(user)
  // The admin acting as another role keeps admin access; say so.
  const actingAsAdmin = user?.base_role === 'admin' && user?.role !== 'admin'
  const roleLabel = actingAsAdmin ? `${meta.label} · Admin` : meta.label
  const { currentTerm } = useAcademicTerms()

  // Clicking a notification opens what it's about (same rule as the
  // Notifications page) and marks it read; one with no specific page opens
  // the Notifications page.
  const openNotif = n => {
    setNotifOpen(false)
    if (!n.is_read) api.put(`/notifications/${n.id}/read`).catch(() => {})
    const dest = destinationFor(n, user?.role)
    if (dest && onOpenNotification) onOpenNotification(dest)
    else onNotificationsClick()
  }

  // Load recent notifications for the popover
  useEffect(() => {
    if (!notifOpen) return
    api.get('/notifications').then(res => {
      setRecentNotifs((res.data.notifications || []).slice(0, 5))
    }).catch(() => {})
  }, [notifOpen])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false)
      if (notifRef.current   && !notifRef.current.contains(e.target))   setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const typeIcon = t => ({
    title_approved: <Icon name="check-circle" />, title_rejected: <Icon name="x-circle" />, title_chosen: <Icon name="award" />,
    schedule: <Icon name="calendar" />, document_uploaded: <Icon name="file" />,
    document_status: <Icon name="clipboard" />, defense_verdict: <Icon name="graduation" />,
  }[t] || <Icon name="bell" />)

  return (
    <div style={{
      height: '52px', background: '#fff', borderBottom: '1px solid #e8ecf2',
      display: 'flex', alignItems: 'center', padding: '0 16px',
      position: 'sticky', top: 0, zIndex: 30, gap: '10px',
    }}>
      {/* Hamburger */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}
      >
        <span style={{ width: '18px', height: '2px', background: '#0a1f44', borderRadius: '2px', display: 'block', transition: 'transform 0.2s' }} />
        <span style={{ width: '18px', height: '2px', background: '#0a1f44', borderRadius: '2px', display: 'block' }} />
        <span style={{ width: '18px', height: '2px', background: '#0a1f44', borderRadius: '2px', display: 'block' }} />
      </button>

      {/* Page accent + label */}
      <div style={{ width: '3px', height: '18px', borderRadius: '2px', background: 'linear-gradient(180deg,#3b82f6,#8b5cf6)',flexShrink: 0 }} />
      <div style={{ fontSize: '14px', fontWeight: '600', color: '#0a1f44' }}>{currentPageLabel}</div>

      <div style={{ flex: 1 }} />

      {/* Date */}
      <div className="topbar-date" style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        {new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        {currentTerm && (
          <span title="Current term (from the academic calendar)" style={{ marginLeft: '4px', fontSize: '11px', fontWeight: '600', color: '#1e40af', background: '#eff6ff', border: '1px solid #dbeafe', padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
            {termLabel(currentTerm)}
          </span>
        )}
      </div>

      {/* Notification bell with popover */}
      <div ref={notifRef} style={{ position: 'relative' }}>
        <button
          onClick={() => { setNotifOpen(v => !v); setProfileOpen(false) }}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          title="Notifications"
          style={{
            position: 'relative', background: notifOpen ? '#f0f2f7' : 'none',
            border: 'none', cursor: 'pointer', borderRadius: '8px',
            width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}
          onMouseOver={e => { if (!notifOpen) e.currentTarget.style.background = '#f0f2f7' }}
          onMouseOut={e => { if (!notifOpen) e.currentTarget.style.background = 'none' }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: '5px', right: '5px',
              width: '16px', height: '16px', borderRadius: '50%',
              background: '#ef4444', color: '#fff',
              fontSize: '9px', fontWeight: '700',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #fff',
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Notification popover */}
        {notifOpen && (
          <div style={{
            position: 'fixed', top: '52px', right: 8,
            width: '320px', background: '#fff', borderRadius: '14px',
            boxShadow: '0 12px 40px rgba(10,31,68,0.15)',
            border: '1px solid #e8ecf2', overflow: 'hidden',
            animation: 'dropIn 0.18s cubic-bezier(0.34,1.56,0.64,1)',
            zIndex: 100,
          }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#0a1f44' }}>Notifications</div>
              {unreadCount > 0 && (
                <span style={{ fontSize: '11px', background: '#fee2e2', color: '#9f1239', padding: '2px 8px', borderRadius: '20px', fontWeight: '700' }}>
                  {unreadCount} new
                </span>
              )}
            </div>
            {recentNotifs.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                No notifications yet
              </div>
            ) : (
              <>
                {recentNotifs.map(n => (
                  <button type="button" key={n.id} onClick={() => openNotif(n)} title="Open"
                    onMouseOver={e => { e.currentTarget.style.background = '#eef2ff' }}
                    onMouseOut={e => { e.currentTarget.style.background = n.is_read ? 'transparent' : '#f8fbff' }}
                    style={{
                    padding: '12px 16px', borderBottom: '1px solid #f8fafc', border: 'none', width: '100%', textAlign: 'left', font: 'inherit',
                    display: 'flex', gap: '10px', alignItems: 'flex-start',
                    background: n.is_read ? 'transparent' : '#f8fbff',
                    cursor: 'pointer',
                  }}>
                    <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>{typeIcon(n.type)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: n.is_read ? '500' : '700', color: '#0a1f44', marginBottom: '2px' }}>{stripEmoji(n.title)}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stripEmoji(n.message)}</div>
                    </div>
                    {!n.is_read && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#1d4ed8', flexShrink: 0, marginTop: '4px' }} />}
                  </button>
                ))}
                <button
                  onClick={() => { setNotifOpen(false); onNotificationsClick() }}
                  style={{ width: '100%', padding: '11px', border: 'none', background: '#f8fafc', fontSize: '12px', fontWeight: '600', color: '#1d4ed8', cursor: 'pointer' }}
                >
                  View all notifications →
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Profile dropdown */}
      <div ref={profileRef} style={{ position: 'relative' }}>
        <button
          onClick={() => { setProfileOpen(v => !v); setNotifOpen(false) }}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: profileOpen ? '#f0f2f7' : 'none',
            border: '1px solid transparent',
            borderColor: profileOpen ? '#e2e8f0' : 'transparent',
            borderRadius: '10px', padding: '5px 10px 5px 5px',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseOver={e => { if (!profileOpen) { e.currentTarget.style.background = '#f0f2f7'; e.currentTarget.style.borderColor = '#e2e8f0' } }}
          onMouseOut={e => { if (!profileOpen) { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'transparent' } }}
        >
          <UserAvatar user={user} size={30} fontSize={11} bg={meta.bg} color={meta.color} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#0a1f44', whiteSpace: 'nowrap', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'capitalize' }}>{roleLabel}</div>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transform: profileOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {/* Profile dropdown menu */}
        {profileOpen && (
        <div style={{
          position: 'fixed', top: '52px', right: '8px',
          width: '220px', background: '#fff', borderRadius: '14px',
          boxShadow: '0 12px 40px rgba(10,31,68,0.15)',
          border: '1px solid #e8ecf2', overflow: 'hidden',
          animation: 'dropIn 0.18s cubic-bezier(0.34,1.56,0.64,1)',
          zIndex: 100,
        }}>
            {/* User info header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(135deg,#0a1f44,#1040a0)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <UserAvatar user={user} size={36} fontSize={12} bg={meta.bg} color={meta.color} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
                </div>
              </div>
              <div style={{ marginTop: '8px' }}>
                <span style={{ fontSize: '10px', background: 'rgba(245,195,0,0.2)', color: '#f5c300', padding: '2px 8px', borderRadius: '20px', fontWeight: '700', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {roleLabel}
                </span>
                {actingAsAdmin && (
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginTop: '6px', lineHeight: 1.4 }}>
                    Viewing the {meta.label} screens with full admin access.
                  </div>
                )}
              </div>
            </div>

            {/* Role switcher -- only for accounts with more than one role */}
            {assignedRoles.length > 1 && (
              <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 8px 6px' }}>
                  Switch role
                </div>
                {assignedRoles.map(r => {
                  const m = ROLE_META[r] || { label: r, color: '#475569', bg: '#f1f5f9' }
                  const active = r === user?.role
                  return (
                    <button key={r}
                      disabled={active || switchingRole}
                      onClick={() => { setProfileOpen(false); onSwitchRole?.(r) }}
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: '8px', border: 'none',
                        background: active ? m.bg : 'none',
                        cursor: active ? 'default' : (switchingRole ? 'wait' : 'pointer'),
                        display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px',
                        color: active ? m.color : '#334155', fontWeight: active ? '700' : '500', textAlign: 'left',
                      }}
                      onMouseOver={e => { if (!active) e.currentTarget.style.background = '#f8fafc' }}
                      onMouseOut={e => { if (!active) e.currentTarget.style.background = 'none' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{m.label}</span>
                      {active && <span style={{ fontSize: '11px' }}>✓</span>}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Menu items */}
            {[
              { icon: <Icon name="user" />, label: 'Edit Profile',     action: 'editprofile' },
              { icon: <Icon name="lock" />, label: 'Change Password',  action: 'changepassword' },
            ].map(item => (
              <button key={item.label} style={{ width: '100%', padding: '11px 16px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#334155', textAlign: 'left' }}
                onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseOut={e => e.currentTarget.style.background = 'none'}
                onClick={() => { setProfileOpen(false); onNavigate(item.action) }}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}

            <div style={{ borderTop: '1px solid #f1f5f9', padding: '8px' }}>
              <button
                onClick={() => { setProfileOpen(false); handleLogout() }}
                disabled={loggingOut}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: 'none', background: 'rgba(239,68,68,0.08)', color: '#dc2626', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.14)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                {loggingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}

export default EnhancedTopBar
