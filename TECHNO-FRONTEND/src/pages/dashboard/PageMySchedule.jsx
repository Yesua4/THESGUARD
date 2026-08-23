import { useState, useEffect } from 'react'
import api from '../../api/axios'

function PageMySchedule() {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    api.get('/schedules').then(res => setSchedules(res.data)).finally(() => setLoading(false))
  }, [])

  const formatDate = d => !d ? '—' : new Date(d).toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'})
  const formatTime = t => {
    if (!t) return '—'
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    return `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
  }

  return (
    <div>
      <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44', marginBottom:'16px' }}>My Defense Schedule</div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'13px' }}>Loading...</div>
      ) : schedules.length === 0 ? (
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:'32px', marginBottom:'12px' }}>📅</div>
          <div style={{ fontSize:'14px', fontWeight:'600', color:'#0a1f44', marginBottom:'4px' }}>No defense scheduled yet</div>
          <div style={{ fontSize:'12px', color:'#94a3b8' }}>Your instructor will schedule your defense. Check back later.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
          {schedules.map(s => (
            <div key={s.id} style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
              {/* Header */}
              <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'20px 24px' }}>
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.5)', fontWeight:'700', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'6px' }}>Confirmed Defense Schedule</div>
                <div style={{ fontSize:'20px', fontWeight:'800', color:'#fff', marginBottom:'4px' }}>{formatDate(s.defense_date)}</div>
                <div style={{ display:'flex', gap:'16px' }}>
                  <span style={{ fontSize:'13px', color:'rgba(255,255,255,0.7)', display:'flex', alignItems:'center', gap:'5px' }}>🕐 {formatTime(s.defense_time)}</span>
                  <span style={{ fontSize:'13px', color:'rgba(255,255,255,0.7)', display:'flex', alignItems:'center', gap:'5px' }}>📍 {s.venue || 'Venue TBA'}</span>
                </div>
              </div>

              <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:'16px' }}>
                {/* Group / Project */}
                <div>
                  <div style={{ fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'4px' }}>Project / Group</div>
                  <div style={{ fontSize:'14px', fontWeight:'600', color:'#0a1f44' }}>{s.group?.group_name || s.project?.title || '—'}</div>
                </div>

                {/* Members */}
                <div>
                  <div style={{ fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'8px' }}>Group Members</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                    {(s.group?.members || s.project?.members)?.map(m => (
                      <div key={m.id} style={{ display:'flex', alignItems:'center', gap:'7px', background:'#f8fafc', borderRadius:'8px', padding:'6px 10px' }}>
                        <div style={{ width:'24px', height:'24px', borderRadius:'50%', background:'#dbeafe', color:'#1d4ed8', fontSize:'9px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700', flexShrink:0 }}>
                          {m.user?.name?.split(' ').map(x=>x[0]).join('').slice(0,2)||'U'}
                        </div>
                        <div>
                          <div style={{ fontSize:'12px', fontWeight:'600', color:'#0a1f44' }}>{m.user?.name}</div>
                          <div style={{ fontSize:'10px', color:'#94a3b8' }}>{m.is_leader?'Leader':'Member'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Panelists & Adviser */}
                <div className="dg-grid-2" style={{ display:'grid', gap:'14px' }}>
                  <div>
                    <div style={{ fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'4px' }}>Panelists</div>
                    <div style={{ fontSize:'13px', color:'#334155' }}>{s.panelists || 'Not yet assigned'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'4px' }}>Adviser</div>
                    <div style={{ fontSize:'13px', color:'#334155' }}>{s.adviser?.name || '—'}</div>
                  </div>
                </div>
              </div>

              {/* Status bar */}
              <div style={{ padding:'10px 24px', background: s.status==='completed'?'#d1fae5':s.status==='cancelled'?'#fee2e2':'#dbeafe', fontSize:'12px', fontWeight:'700', color: s.status==='completed'?'#065f46':s.status==='cancelled'?'#9f1239':'#1e40af', textTransform:'capitalize' }}>
                Status: {s.status}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default PageMySchedule
