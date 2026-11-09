import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { useSchoolActivity } from '../../hooks/useSchoolActivity'
import { useProjectsChannel } from '../../hooks/useProjectChannel'
import { DEFENSE_TYPE_LABEL, PANEL_ROLE_LABEL, timeRange } from '../../constants/defense'
import { useAuth } from '../../context/AuthContext'
import Icon from '../../components/Icon'

function PageMySchedule() {
  const { user } = useAuth()
  const heading = user?.role === 'panelist' ? 'My Panel Schedule' : user?.role === 'student' ? 'My Defense Schedule' : 'Defense Schedule'
  const emptyNote = user?.role === 'panelist' ? "You're not on any defense panel yet. Defenses you're assigned to will show here."
    : user?.role === 'student' ? 'Your instructor will schedule your defense. Check back later.'
    : "None of your groups has a defense scheduled yet."
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading]     = useState(true)

  const load = () => api.get('/schedules').then(res => setSchedules(res.data)).finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  // Live updates: a schedule's own project is reached through its group
  // (see ScheduleController::broadcastToGroupProjects on the backend --
  // schedules are keyed by group, not project), so this is what the
  // instructor/adviser just scheduling or rescheduling a defense actually
  // broadcasts to. Without this, finding out meant reloading the page.
  useProjectsChannel(schedules.flatMap(s => (s.group?.projects || []).map(p => p.id)), load)
  // Live: a first defense being booked (no project ids to listen on yet).
  useSchoolActivity(['schedules', 'groups'], load)

  const formatDate = d => !d ? '—' : new Date(d).toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'})

  return (
    <div>
      <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44', marginBottom:'16px' }}>{heading}</div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'13px' }}>Loading...</div>
      ) : schedules.length === 0 ? (
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:'32px', marginBottom:'12px' }}><Icon name="calendar" /></div>
          <div style={{ fontSize:'14px', fontWeight:'600', color:'#0a1f44', marginBottom:'4px' }}>No defense scheduled yet</div>
          <div style={{ fontSize:'12px', color:'#94a3b8' }}>{emptyNote}</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
          {schedules.map(s => (
            <div key={s.id} style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
              {/* Header */}
              <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'20px 24px' }}>
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.5)', fontWeight:'700', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'6px' }}>{DEFENSE_TYPE_LABEL[s.defense_type] || 'Defense'} · Confirmed</div>
                <div style={{ fontSize:'20px', fontWeight:'800', color:'#fff', marginBottom:'4px' }}>{formatDate(s.defense_date)}</div>
                <div style={{ display:'flex', gap:'16px' }}>
                  <span style={{ fontSize:'13px', color:'rgba(255,255,255,0.7)', display:'flex', alignItems:'center', gap:'5px' }}><Icon name="clock" /> {timeRange(s)}</span>
                  <span style={{ fontSize:'13px', color:'rgba(255,255,255,0.7)', display:'flex', alignItems:'center', gap:'5px' }}><Icon name="map-pin" /> {s.venue || 'Venue TBA'}</span>
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
                    {(s.panel || []).length > 0 ? (
                      <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
                        {s.panel.map(p => (
                          <div key={p.id} style={{ fontSize:'13px', color:'#334155' }}>
                            <span style={{ color:'#94a3b8' }}>{PANEL_ROLE_LABEL[p.role]}:</span> {p.user?.name}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize:'13px', color:'#334155' }}>{s.panelists || 'Not yet assigned'}</div>
                    )}
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
