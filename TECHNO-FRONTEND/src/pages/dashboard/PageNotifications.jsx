import { useState, useEffect } from 'react'
import api from '../../api/axios'
import echo from '../../echo'

// Maps a notification to where clicking it should take the viewer, based on
// the notification's type and the viewer's own role.
function destinationFor(notification, role) {
  const isStudent = role === 'student'
  switch (notification.type) {
    case 'document_uploaded':
    case 'document_status':
    case 'comment':
      if (!notification.document_id) return null
      return { page: isStudent ? 'submit' : 'docreview', documentId: notification.document_id }
    case 'title_pending':
      return { page: 'titleapproval' }
    case 'title_approved':
    case 'title_rejected':
    case 'title_chosen':
    case 'title':
      return { page: isStudent ? 'projects' : 'titleapproval' }
    case 'schedule':
    case 'defense_scheduled':
      return { page: isStudent ? 'myschedule' : 'schedule' }
    case 'defense_verdict':
      return { page: isStudent ? 'projects' : 'evaluate' }
    default:
      return null
  }
}

function PageNotifications({ onRead, user, onNavigate }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading]             = useState(true)

  const load = () => {
    api.get('/notifications').then(res => {
      setNotifications(res.data.notifications)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!user?.id) return
    const channel = echo.private(`App.Models.User.${user.id}`)
    channel.listen('.notification.created', load)
    return () => echo.leave(`App.Models.User.${user.id}`)
  }, [user?.id])

  const markRead = async id => {
    await api.put(`/notifications/${id}/read`)
    load(); onRead()
  }

  const markAllRead = async () => {
    await api.put('/notifications/read-all')
    load(); onRead()
  }

  const openNotification = async n => {
    if (!n.is_read) await markRead(n.id)
    const dest = destinationFor(n, user?.role)
    if (dest) onNavigate?.(dest)
  }

 const typeStyle = type => ({
  title_approved:    { background:'#d1fae5', color:'#065f46',  icon:'✓' },
  title_rejected:    { background:'#fee2e2', color:'#9f1239',  icon:'✕' },
  title_chosen:      { background:'#ede9fe', color:'#4c1d95',  icon:'🏆' },
  defense_verdict:   { background:'#dbeafe', color:'#1e40af',  icon:'🎓' },
  defense_scheduled: { background:'#dbeafe', color:'#1e40af',  icon:'⊞' },
  comment:           { background:'#fef3c7', color:'#92400e',  icon:'✉' },
  schedule:          { background:'#dbeafe', color:'#1e40af',  icon:'⊞' },
  title:             { background:'#d1fae5', color:'#065f46',  icon:'✓' },
}[type] || { background:'#ede9fe', color:'#6d28d9', icon:'●' })

  const unread = (notifications || []).filter(n => !n.is_read)

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44' }}>Notifications</div>
          {unread.length > 0 && (
            <span style={{ fontSize:'11px', background:'#fee2e2', color:'#9f1239', padding:'3px 10px', borderRadius:'20px', fontWeight:'700' }}>{unread.length} unread</span>
          )}
        </div>
        {unread.length > 0 && (
          <button onClick={markAllRead} style={{ fontSize:'12px', color:'#1d4ed8', background:'none', border:'none', cursor:'pointer', fontWeight:'600' }}>
            Mark all as read
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'13px' }}>Loading notifications...</div>
      ) : !notifications || notifications.length === 0 ? (
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:'36px', marginBottom:'12px' }}>🔔</div>
          <div style={{ fontSize:'14px', fontWeight:'600', color:'#0a1f44', marginBottom:'4px' }}>No notifications yet</div>
          <div style={{ fontSize:'12px', color:'#94a3b8' }}>You'll be notified when something important happens.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {notifications.map(n => {
            const ts = typeStyle(n.type)
            const clickable = !!destinationFor(n, user?.role) || !n.is_read
            return (
              <div key={n.id} onClick={() => clickable && openNotification(n)}
                style={{ background:'#fff', borderRadius:'14px', border:`1.5px solid ${n.is_read?'#f1f5f9':'#e2e8f0'}`, padding:'14px 16px', cursor: clickable?'pointer':'default', transition:'border-color 0.15s', opacity: n.is_read ? 0.75 : 1 }}
                onMouseOver={e => { if (clickable) e.currentTarget.style.borderColor='#1d4ed8' }}
                onMouseOut={e => { if (clickable) e.currentTarget.style.borderColor= n.is_read?'#f1f5f9':'#e2e8f0' }}>
                <div style={{ display:'flex', gap:'12px', alignItems:'flex-start' }}>
                  <div style={{ width:'36px', height:'36px', borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', fontWeight:'700', flexShrink:0, background:ts.background, color:ts.color }}>
                    {ts.icon}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'3px' }}>
                      <div style={{ fontSize:'13px', fontWeight: n.is_read?'500':'700', color:'#0a1f44' }}>{n.title}</div>
                      {!n.is_read && <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#1d4ed8', flexShrink:0, marginLeft:'8px', marginTop:'3px' }} />}
                    </div>
                    <div style={{ fontSize:'12px', color:'#64748b', lineHeight:'1.6', marginBottom:'4px' }}>{n.message}</div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ fontSize:'11px', color:'#94a3b8' }}>
                        {n.created_at ? new Date(n.created_at).toLocaleDateString('en-PH',{ month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}
                      </div>
                      {destinationFor(n, user?.role) && (
                        <span style={{ fontSize:'11px', color:'#1d4ed8', fontWeight:'600' }}>View →</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default PageNotifications
