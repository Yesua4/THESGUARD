import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/axios'

function PageProgress() {
  const { user } = useAuth()
  const [project, setProject]     = useState(null)
  const [group, setGroup]         = useState(null)
  const [documents, setDocuments] = useState([])
  const [schedule, setSchedule]   = useState(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([api.get('/projects'), api.get('/groups'), api.get('/documents'), api.get('/schedules')])
      .then(([projRes, groupRes, docRes, schedRes]) => {
        setProject(projRes.data.find(p => p.members?.some(m => m.user_id === user.id)) || null)
        setGroup(groupRes.data.find(g => g.members?.some(m => m.user_id === user.id)) || null)
        const myProject = projRes.data.find(p => p.members?.some(m => m.user_id === user.id))
        setDocuments(docRes.data.filter(d => d.project_id === myProject?.id))
        setSchedule(schedRes.data[0] || null)
      }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ textAlign:'center', padding:'60px', color:'#94a3b8', fontSize:'13px' }}>Loading your progress...</div>

  // ── Generalized stage definitions ────────────────────────────────────────
  // Phase 1 (Semester 1 equivalent)
  const phase1 = [
    {
      id: 1,
      icon: '👥',
      label: 'Grouped',
      phase: 'Phase 1',
      description: group
        ? `Assigned to ${group.group_name}`
        : 'Waiting to be assigned to a group.',
      done: !!group,
    },
    {
      id: 2,
      icon: '🔍',
      label: 'Environmental scanning',
      phase: 'Phase 1',
      description: group
        ? 'Conduct problem analysis (Problem Tree, Solution Tree, MCUA Matrix).'
        : 'Complete grouping first.',
      done: !!project, // proxy: if they have a proposal, scanning was done
    },
    {
      id: 3,
      icon: '📝',
      label: 'Proposal submitted',
      phase: 'Phase 1',
      description: project
        ? `"${project.title.length > 60 ? project.title.slice(0, 60) + '…' : project.title}"`
        : 'No proposal submitted yet.',
      done: !!project,
    },
    {
      id: 4,
      icon: '🎤',
      label: 'Title defense',
      phase: 'Phase 1',
      description:
        project?.title_status === 'approved'
          ? 'Title approved by the panel.'
          : project?.title_status === 'rejected'
          ? 'Title returned for revision. Check feedback.'
          : project
          ? 'Awaiting panel review and approval.'
          : 'Submit a proposal first.',
      done: project?.title_status === 'approved',
      warning: project?.title_status === 'rejected',
    },
    {
      id: 5,
      icon: '📄',
      label: 'Manuscript & prototype (outline defense)',
      phase: 'Phase 1',
      description:
        documents.some(d => d.status === 'approved')
          ? `${documents.filter(d => d.status === 'approved').length} document(s) approved. System prototype submitted.`
          : project?.title_status === 'approved'
          ? 'Write chapters and build system UI (100%) with initial functionality (30%).'
          : 'Title must be approved first.',
      done: documents.some(d => d.status === 'approved'),
      inProgress: documents.length > 0 && !documents.some(d => d.status === 'approved'),
    },
  ]

  // Phase 2 (Semester 2 equivalent)
  const phase2 = [
    {
      id: 6,
      icon: '⚙️',
      label: 'Full system development',
      phase: 'Phase 2',
      description:
        project?.status === 'for_defense' || project?.status === 'approved' || project?.status === 'archived'
          ? 'System fully developed with complete functionality and testing.'
          : 'Complete all Phase 1 stages first.',
      done: ['for_defense', 'approved', 'archived'].includes(project?.status),
      inProgress: project?.status === 'ongoing' && documents.length > 0,
    },
    {
      id: 7,
      icon: '🎤',
      label: 'Pre-deployment defense',
      phase: 'Phase 2',
      description:
        project?.status === 'for_defense'
          ? 'Scheduled for pre-deployment defense. Present full system and testing results.'
          : ['approved', 'archived'].includes(project?.status)
          ? 'Pre-deployment defense completed.'
          : 'System must reach "For Defense" status.',
      done: ['approved', 'archived'].includes(project?.status),
      inProgress: project?.status === 'for_defense',
    },
  ]

  // Phase 3 (Semester 3 equivalent)
  const phase3 = [
    {
      id: 8,
      icon: '🚀',
      label: 'Deployment & testing',
      phase: 'Phase 3',
      description:
        project?.status === 'archived' || project?.status === 'approved'
          ? 'System deployed and pilot testing completed.'
          : 'Apply panel recommendations and deploy to a live environment.',
      done: ['approved', 'archived'].includes(project?.status),
    },
    {
      id: 9,
      icon: '🎤',
      label: 'Final defense',
      phase: 'Phase 3',
      description: schedule
        ? `Scheduled on ${new Date(schedule.defense_date).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${schedule.defense_time?.slice(0, 5)} — ${schedule.venue || 'Venue TBA'}`
        : project?.status === 'archived'
        ? 'Final defense completed.'
        : 'Your final defense will be scheduled by your instructor.',
      done: project?.status === 'archived',
      inProgress: !!schedule && project?.status !== 'archived',
    },
    {
      id: 10,
      icon: '🎓',
      label: 'Completed',
      phase: 'Phase 3',
      description:
        project?.status === 'archived'
          ? '🎉 Congratulations! Your thesis/capstone project is complete.'
          : 'Complete all previous stages to finish.',
      done: project?.status === 'archived',
    },
  ]

  const allStages = [...phase1, ...phase2, ...phase3]
  const completedCount = allStages.filter(s => s.done).length
  const percentage = Math.round((completedCount / allStages.length) * 100)
  const currentStage = allStages.find(s => !s.done) || allStages[allStages.length - 1]

  const phaseGroups = [
    { label: 'Phase 1 — Proposal & Initial Defense', color: '#6d28d9', bg: '#ede9fe', stages: phase1 },
    { label: 'Phase 2 — Development & Pre-Deployment', color: '#1d4ed8', bg: '#dbeafe', stages: phase2 },
    { label: 'Phase 3 — Deployment & Final Defense',  color: '#b45309', bg: '#fef3c7', stages: phase3 },
  ]

  return (
    <div>
      {/* Progress header */}
      <div style={{
        background: 'linear-gradient(135deg,#0a1f44,#1040a0)',
        borderRadius: '16px', padding: '24px 28px', marginBottom: '20px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '150px', height: '150px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginBottom: '6px', fontWeight: '600' }}>MY THESIS / CAPSTONE PROGRESS</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ color: '#fff', fontSize: '20px', fontWeight: '700' }}>
              {completedCount} of {allStages.length} stages completed
            </div>
            <div style={{ color: '#f5c300', fontSize: '28px', fontWeight: '800' }}>{percentage}%</div>
          </div>
          <div style={{ height: '8px', background: 'rgba(255,255,255,0.15)', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px' }}>
            <div style={{
              height: '100%', borderRadius: '8px',
              background: percentage === 100 ? 'linear-gradient(90deg,#34d399,#10b981)' : 'linear-gradient(90deg,#f5c300,#e8a800)',
              width: `${percentage}%`, transition: 'width 0.7s ease',
            }} />
          </div>
          {currentStage && !currentStage.done && (
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>
              Current step: <span style={{ color: '#f5c300', fontWeight: '600' }}>{currentStage.label}</span>
            </div>
          )}
        </div>
      </div>

      {/* Similarity card */}
      {project && (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '16px 20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#0a1f44' }}>Similarity Score</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: project.similarity_score >= 60 ? '#dc2626' : project.similarity_score >= 30 ? '#d97706' : '#059669' }}>
              {project.similarity_score}%
            </div>
          </div>
          <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '8px', overflow: 'hidden', marginBottom: '6px' }}>
            <div style={{ height: '100%', borderRadius: '8px', background: project.similarity_score >= 60 ? '#ef4444' : project.similarity_score >= 30 ? '#f59e0b' : '#10b981', width: `${project.similarity_score}%` }} />
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {project.similarity_score >= 60 ? 'High similarity — please review your proposal carefully.' : project.similarity_score >= 30 ? 'Moderate similarity — your adviser may ask for revision.' : 'Low similarity — your proposal looks original.'}
          </div>
        </div>
      )}

      {/* Phase groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {phaseGroups.map(phase => (
          <div key={phase.label}>
            {/* Phase header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              marginBottom: '10px', paddingBottom: '8px',
              borderBottom: `2px solid ${phase.bg}`,
            }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: phase.color, flexShrink: 0 }} />
              <div style={{ fontSize: '12px', fontWeight: '700', color: phase.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {phase.label}
              </div>
            </div>

            {/* Stage cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {phase.stages.map(stage => {
                const borderColor = stage.done ? '#a7f3d0' : stage.warning ? '#fecaca' : stage.inProgress ? '#bfdbfe' : '#e8ecf2'
                const bgColor     = stage.done ? '#f0fdf4' : stage.warning ? '#fff5f5' : stage.inProgress ? '#eff6ff' : '#fff'
                const labelColor  = stage.done ? '#065f46' : stage.warning ? '#9f1239' : stage.inProgress ? '#1d4ed8' : '#94a3b8'
                const descColor   = stage.done ? '#059669' : stage.warning ? '#dc2626' : stage.inProgress ? '#2563eb' : '#94a3b8'

                return (
                  <div key={stage.id} style={{
                    background: bgColor, borderRadius: '14px',
                    border: `1.5px solid ${borderColor}`,
                    padding: '14px 16px', display: 'flex', gap: '12px', alignItems: 'flex-start',
                  }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: bgColor, border: `1.5px solid ${borderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
                      {stage.done ? '✅' : stage.warning ? '❌' : stage.inProgress ? '⏳' : stage.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: labelColor }}>
                          {stage.label}
                        </div>
                        {stage.done      && <span style={{ fontSize: '10px', background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '20px', fontWeight: '700' }}>Done</span>}
                        {stage.warning   && <span style={{ fontSize: '10px', background: '#fee2e2', color: '#9f1239', padding: '2px 8px', borderRadius: '20px', fontWeight: '700' }}>Needs Revision</span>}
                        {stage.inProgress && <span style={{ fontSize: '10px', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '20px', fontWeight: '700' }}>In Progress</span>}
                        {!stage.done && !stage.warning && !stage.inProgress && <span style={{ fontSize: '10px', background: '#f8fafc', color: '#94a3b8', padding: '2px 8px', borderRadius: '20px', fontWeight: '700' }}>Pending</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: descColor, lineHeight: '1.6' }}>
                        {stage.description}
                      </div>
                      {/* Title feedback */}
                      {stage.id === 4 && stage.warning && project?.title_feedback && (
                        <div style={{ marginTop: '8px', background: '#fff', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: '#64748b' }}>
                          <span style={{ fontWeight: '600', color: '#0a1f44' }}>Feedback: </span>{project.title_feedback}
                        </div>
                      )}
                      {/* Document badges */}
                      {stage.id === 5 && documents.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }}>
                          {['proposal','chapter1','chapter2','chapter3','chapter4','chapter5','final_manuscript'].map(type => {
                            const doc = documents.filter(d => d.type === type).sort((a, b) => b.version - a.version)[0]
                            const label = { proposal:'Proposal', chapter1:'Ch.1', chapter2:'Ch.2', chapter3:'Ch.3', chapter4:'Ch.4', chapter5:'Ch.5', final_manuscript:'Final' }
                            if (!doc) return null
                            return (
                              <span key={type} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: '600', background: doc.status === 'approved' ? '#d1fae5' : doc.status === 'needs_revision' ? '#fef3c7' : '#f1f5f9', color: doc.status === 'approved' ? '#065f46' : doc.status === 'needs_revision' ? '#92400e' : '#64748b' }}>
                                {label[type]} v{doc.version} — {doc.status}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PageProgress
