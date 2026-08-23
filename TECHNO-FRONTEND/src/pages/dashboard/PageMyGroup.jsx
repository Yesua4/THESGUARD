import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/axios'

function PageMyGroup() {
  const { user } = useAuth()
  const [group, setGroup]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/groups').then(res => {
      setGroup(res.data.find(g => g.members?.some(m => m.user_id === user.id)) || null)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ textAlign:'center', padding:'60px', color:'#94a3b8', fontSize:'13px' }}>Loading...</div>

  if (!group) return (
    <div>
      <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44', marginBottom:'16px' }}>My Group</div>
      <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'48px', textAlign:'center' }}>
        <div style={{ fontSize:'32px', marginBottom:'12px' }}>👥</div>
        <div style={{ fontSize:'14px', fontWeight:'600', color:'#0a1f44', marginBottom:'4px' }}>Not yet assigned to a group</div>
        <div style={{ fontSize:'12px', color:'#94a3b8' }}>Your instructor will assign you to a group. Check back later.</div>
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44', marginBottom:'16px' }}>My Group</div>
      <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'24px 28px' }}>
          <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.5)', fontWeight:'700', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'4px' }}>Group</div>
          <div style={{ fontSize:'22px', fontWeight:'800', color:'#fff', marginBottom:'4px' }}>{group.group_name}</div>
          <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.55)' }}>{group.batch || 'No batch set'}</div>
        </div>

        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:'20px' }}>
          {/* Members */}
          <div>
            <div style={{ fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'10px' }}>Members</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {group.members?.map(m => (
                <div key={m.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 14px', background:'#f8fafc', borderRadius:'10px' }}>
                  <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#dbeafe', color:'#1d4ed8', fontSize:'12px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700', flexShrink:0 }}>
                    {m.user?.name?.split(' ').map(x=>x[0]).join('').slice(0,2)}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'13px', fontWeight:'600', color:'#0a1f44' }}>
                      {m.user?.name}
                      {m.user_id===user.id && <span style={{ marginLeft:'6px', fontSize:'11px', color:'#94a3b8' }}>(you)</span>}
                    </div>
                    <div style={{ fontSize:'11px', color:'#94a3b8' }}>{m.user?.student_id || m.user?.email}</div>
                  </div>
                  <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'600', background: m.is_leader?'#ede9fe':'#f1f5f9', color: m.is_leader?'#6d28d9':'#64748b' }}>
                    {m.is_leader ? '★ Leader' : 'Member'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Adviser */}
          <div>
            <div style={{ fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'10px' }}>Adviser</div>
            {group.adviser ? (
              <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 14px', background:'#f0fdf4', borderRadius:'10px', border:'1px solid #bbf7d0' }}>
                <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'#d1fae5', color:'#059669', fontSize:'12px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700', flexShrink:0 }}>
                  {group.adviser.name?.split(' ').map(x=>x[0]).join('').slice(0,2)}
                </div>
                <div>
                  <div style={{ fontSize:'13px', fontWeight:'600', color:'#065f46' }}>{group.adviser.name}</div>
                  <div style={{ fontSize:'11px', color:'#6ee7b7' }}>{group.adviser.email}</div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize:'13px', color:'#94a3b8', padding:'10px 14px', background:'#f8fafc', borderRadius:'10px' }}>Not yet assigned</div>
            )}
          </div>

          {/* Projects */}
          <div>
            <div style={{ fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'10px' }}>Projects</div>
            {group.projects?.length > 0 ? group.projects.map(p => (
              <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'#f8fafc', borderRadius:'10px', marginBottom:'6px' }}>
                <div style={{ fontSize:'13px', color:'#0a1f44', fontWeight:'500' }}>{p.title}</div>
                <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'600', background: p.title_status==='approved'?'#d1fae5':p.title_status==='rejected'?'#fee2e2':'#fef3c7', color: p.title_status==='approved'?'#065f46':p.title_status==='rejected'?'#9f1239':'#92400e' }}>
                  {p.title_status}
                </span>
              </div>
            )) : (
              <div style={{ fontSize:'13px', color:'#94a3b8', padding:'10px 14px', background:'#f8fafc', borderRadius:'10px' }}>No proposals submitted yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PageMyGroup
