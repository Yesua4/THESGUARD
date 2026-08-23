import { useState, useEffect } from 'react'
import api from '../../api/axios'

function QuickActionsWidget({ user, onNavigate }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const tasks = []
    const promises = []

    if (user?.role === 'instructor' || user?.role === 'admin') {
      promises.push(
        api.get('/projects').then(res => {
          const pending = res.data.filter(p => p.title_status === 'pending').length
          const flagged = res.data.filter(p => p.similarity_score >= 60).length
          if (pending > 0) tasks.push({ icon: '⏳', label: `${pending} title${pending > 1 ? 's' : ''} awaiting approval`, page: 'titleapproval', color: '#92400e', bg: '#fef3c7' })
          if (flagged > 0) tasks.push({ icon: '🚩', label: `${flagged} project${flagged > 1 ? 's' : ''} flagged for similarity`, page: 'similarity', color: '#9f1239', bg: '#fee2e2' })
        })
      )
      promises.push(
        api.get('/documents').then(res => {
          const pending = res.data.filter(d => d.status === 'pending').length
          if (pending > 0) tasks.push({ icon: '📄', label: `${pending} document${pending > 1 ? 's' : ''} pending review`, page: 'docreview', color: '#1e40af', bg: '#dbeafe' })
        }).catch(() => {})
      )
    }

    if (user?.role === 'adviser') {
      promises.push(
        api.get('/documents').then(res => {
          const pending = res.data.filter(d => d.status === 'pending').length
          if (pending > 0) tasks.push({ icon: '📄', label: `${pending} document${pending > 1 ? 's' : ''} to review`, page: 'docreview', color: '#1e40af', bg: '#dbeafe' })
        }).catch(() => {})
      )
    }

    if (user?.role === 'student') {
      promises.push(
        api.get('/projects').then(res => {
          const myProject = res.data.find(p => p.members?.some(m => m.user_id === user.id))
          if (!myProject) {
            tasks.push({ icon: '📝', label: 'Submit your capstone proposal', page: 'projects', color: '#1e40af', bg: '#dbeafe' })
          } else if (myProject.title_status === 'rejected') {
            tasks.push({ icon: '❌', label: 'Title returned — revise your proposal', page: 'projects', color: '#9f1239', bg: '#fee2e2' })
          } else if (myProject.title_status === 'approved') {
            tasks.push({ icon: '📤', label: 'Upload your chapter documents', page: 'submit', color: '#065f46', bg: '#d1fae5' })
          }
        })
      )
      promises.push(
        api.get('/groups').then(res => {
          const myGroup = res.data.find(g => g.members?.some(m => m.user_id === user.id))
          if (!myGroup) tasks.push({ icon: '👥', label: 'Not yet assigned to a group', page: 'mygroup', color: '#92400e', bg: '#fef3c7' })
        })
      )
    }

    if (user?.role === 'panelist') {
      promises.push(
        api.get('/projects').then(res => {
          const forDefense = res.data.filter(p => p.status === 'for_defense').length
          if (forDefense > 0) tasks.push({ icon: '📋', label: `${forDefense} project${forDefense > 1 ? 's' : ''} ready for evaluation`, page: 'evaluate', color: '#4c1d95', bg: '#ede9fe' })
        })
      )
    }

    Promise.all(promises).finally(() => {
      setItems(tasks)
      setLoading(false)
    })
  }, [user])

  if (loading) return null
  if (items.length === 0) return (
    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '14px 16px' }}>
      <div style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        To-Do
      </div>
      <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '16px' }}>✨</span> All caught up — nothing pending.
      </div>
    </div>
  )

  return (
    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          To-Do · {items.length} item{items.length > 1 ? 's' : ''}
        </span>
      </div>
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => onNavigate(item.page)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 16px', border: 'none', borderBottom: i < items.length - 1 ? '1px solid #f8fafc' : 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
          onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
          onMouseOut={e => e.currentTarget.style.background = 'none'}
        >
          <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>
            {item.icon}
          </div>
          <span style={{ fontSize: '12px', color: item.color, fontWeight: '600', flex: 1 }}>{item.label}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      ))}
    </div>
  )
}

export default QuickActionsWidget
