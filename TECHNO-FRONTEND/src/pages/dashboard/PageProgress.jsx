import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/axios'
import { useSchoolActivity } from '../../hooks/useSchoolActivity'
import SimilarityBreakdown from './SimilarityBreakdown'
import { useProjectChannel } from '../../hooks/useProjectChannel'
import Icon from '../../components/Icon'
import { humanStatus } from '../../utils/humanStatus'
import { SkeletonPage } from '../../components/Skeleton'
import { researchWord, researchTypeOf } from '../../utils/research'
import { timeRange } from '../../constants/defense'
import { isNotChosenTitle } from '../../constants/projectStatus'

const PASSED = ['passed_no_revisions', 'passed_with_revisions']
const VERDICT_TEXT = {
  passed_no_revisions:   'Passed (no revisions needed)',
  passed_with_revisions: 'Passed (with revisions needed)',
  conditional:           'Conditional pass: complete the panel\'s conditions',
  failed:                'Not passed: check the panel\'s recommendations',
}

// The proposal this page follows: the final title once it's set, otherwise
// the newest one still in play (pending or approved), otherwise the newest.
function pickProject(mine) {
  const newest = [...mine].sort((a, b) => b.id - a.id)
  return newest.find(p => p.is_final_title)
    || newest.find(p => p.title_status !== 'rejected' && !isNotChosenTitle(p))
    || newest[0] || null
}

function PageProgress() {
  const { user } = useAuth()
  const [project, setProject]     = useState(null)
  const [group, setGroup]         = useState(null)
  const [documents, setDocuments] = useState([])
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading]     = useState(true)

  const load = useCallback(() => {
    Promise.all([api.get('/projects'), api.get('/groups'), api.get('/documents'), api.get('/schedules')])
      .then(([projRes, groupRes, docRes, schedRes]) => {
        const proj = pickProject(projRes.data.filter(p => p.members?.some(m => m.user_id === user.id)))
        const grp  = groupRes.data.find(g => g.members?.some(m => m.user_id === user.id)) || null
        setProject(proj)
        setGroup(grp)
        setDocuments(docRes.data.filter(d => d.project_id === proj?.id))
        setSchedules(schedRes.data.filter(s => (!grp || s.group_id === grp.id) && s.status !== 'cancelled'))
      }).finally(() => setLoading(false))
  }, [user.id])

  useEffect(() => { load() }, [load])

  // Live updates: a new document, a status change, or an evaluation on
  // this student's own project all already broadcast -- refresh the whole
  // progress snapshot (documents, status, similarity) when any of them
  // fire, instead of needing a manual reload to see a chapter get approved.
  useProjectChannel(project?.id, load)
  // Live: group/title/schedule/document/evaluation changes, including
  // before this student has a project id to listen on.
  useSchoolActivity(['projects', 'groups', 'schedules', 'documents', 'evaluations'], load)

  if (loading) return <SkeletonPage label="Loading your progress" />

  // ── What has actually happened ───────────────────────────────────────────
  const isThesis = researchTypeOf(group) === 'thesis'
  // The latest defense of each type (a re-defense replaces the earlier one).
  const latest = type => schedules.filter(s => s.defense_type === type)
    .sort((a, b) => String(b.defense_date).localeCompare(String(a.defense_date)))[0] || null
  const def = { title: latest('title'), outline: latest('outline'), pre: latest('pre_deployment'), final: latest('final') }
  const passed = s => PASSED.includes(s?.verdict)
  const when = s => `${new Date(s.defense_date).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${timeRange(s)} — ${s.venue || 'Venue TBA'}`

  const finalTitle = !!project?.is_final_title
  const archived   = project?.status === 'archived' && !isNotChosenTitle(project)
  // Passing a later defense means the earlier ones were passed too.
  const finalPassed   = passed(def.final) || archived
  const prePassed     = passed(def.pre) || finalPassed
  const outlinePassed = passed(def.outline) || prePassed || (isThesis && finalPassed)

  // A defense stage: done when passed, red when failed, blue once scheduled.
  const defenseStage = (s, waitingText, doneAlso = false) => {
    const done = passed(s) || doneAlso
    return {
      done,
      warning: !done && s?.verdict === 'failed',
      inProgress: !done && !!s && s.verdict !== 'failed',
      description: s?.verdict ? `${VERDICT_TEXT[s.verdict] || s.verdict}. (${when(s)})`
        : s ? `Scheduled: ${when(s)}`
        : done ? 'Completed.' : waitingText,
    }
  }
  const approvedDocs = documents.filter(d => d.status === 'approved').length
  const outline = defenseStage(def.outline,
    approvedDocs
      ? `${approvedDocs} document(s) approved. Waiting for the ${isThesis ? 'proposal' : 'outline'} defense schedule.`
      : finalTitle ? (isThesis ? 'Write your chapters for the proposal defense.' : 'Write your chapters and build the system UI (100%) with initial functionality (30%).')
      : 'Your final title must be set first.',
    outlinePassed)

  const shortTitle = project ? `"${project.title.length > 60 ? project.title.slice(0, 60) + '…' : project.title}"` : ''

  // ── Phase 1 ──────────────────────────────────────────────────────────────
  const phase1 = [
    {
      id: 1, icon: <Icon name="users" />, label: 'Grouped', phase: 'Phase 1',
      description: group ? `Assigned to ${group.group_name}` : 'Waiting to be assigned to a group.',
      done: !!group,
    },
    {
      id: 2, icon: <Icon name="search" />, label: 'Environmental scanning', phase: 'Phase 1',
      description: group ? 'Conduct problem analysis (Problem Tree, Solution Tree, MCUA Matrix).' : 'Complete grouping first.',
      done: !!project, // proxy: if they have a proposal, scanning was done
    },
    {
      id: 3, icon: <Icon name="edit" />, label: 'Proposal submitted', phase: 'Phase 1',
      description: project ? shortTitle : 'No proposal submitted yet.',
      done: !!project,
    },
    {
      id: 4, icon: <Icon name="mic" />, label: 'Title defense', phase: 'Phase 1',
      description:
        finalTitle ? `Final title set: ${shortTitle}`
        : project?.title_status === 'rejected' ? 'Title returned for revision. Check the feedback and submit a revised proposal.'
        : def.title ? `Scheduled: ${when(def.title)}. Your final title is set after the defense.`
        : project?.title_status === 'approved' ? 'Approved for the title defense. Waiting for the defense schedule.'
        : project ? 'Waiting for your instructor or adviser to review your proposal.'
        : 'Submit a proposal first.',
      done: finalTitle,
      warning: !finalTitle && project?.title_status === 'rejected',
      inProgress: !finalTitle && project?.title_status !== 'rejected' && (!!def.title || project?.title_status === 'approved'),
    },
    {
      id: 5, icon: <Icon name="file" />, phase: 'Phase 1',
      label: isThesis ? 'Manuscript (proposal defense)' : 'Manuscript & prototype (outline defense)',
      ...outline,
      inProgress: outline.inProgress || (!outline.done && !outline.warning && documents.length > 0),
    },
  ]

  // ── Phase 2 ──────────────────────────────────────────────────────────────
  const developed = prePassed || (isThesis ? !!def.final : !!def.pre)
  const phase2 = [
    {
      id: 6, icon: <Icon name="settings" />, phase: 'Phase 2',
      label: isThesis ? 'Full study and manuscript' : 'Full system development',
      description: developed
        ? (isThesis ? 'Study and manuscript completed for the final defense.' : 'System fully developed with complete functionality and testing.')
        : outlinePassed
          ? (isThesis ? 'Complete the study and the remaining chapters.' : 'Develop the full system and apply the panel\'s recommendations.')
          : `Pass the ${isThesis ? 'proposal' : 'outline'} defense first.`,
      done: developed,
      inProgress: !developed && outlinePassed,
    },
    // Thesis groups have no pre-deployment defense.
    ...(isThesis ? [] : [{
      id: 7, icon: <Icon name="mic" />, label: 'Pre-deployment defense', phase: 'Phase 2',
      ...defenseStage(def.pre, 'Your instructor will schedule it once the system is developed.', finalPassed),
    }]),
  ]

  // ── Phase 3 ──────────────────────────────────────────────────────────────
  const deployed = !!def.final || finalPassed
  const phase3 = [
    ...(isThesis ? [] : [{
      id: 8, icon: <Icon name="send" />, label: 'Deployment & testing', phase: 'Phase 3',
      description: deployed ? 'System deployed and pilot testing completed.'
        : prePassed ? 'Apply the panel\'s recommendations and deploy to a live environment.'
        : 'Pass the pre-deployment defense first.',
      done: deployed,
      inProgress: !deployed && prePassed,
    }]),
    {
      id: 9, icon: <Icon name="mic" />, label: 'Final defense', phase: 'Phase 3',
      ...defenseStage(def.final, 'Your final defense will be scheduled by your instructor.', archived),
    },
    {
      id: 10, icon: <Icon name="graduation" />, label: 'Completed', phase: 'Phase 3',
      description: archived
        ? `Congratulations! Your ${isThesis ? 'thesis' : 'capstone'} is complete and in the archive.`
        : finalPassed ? 'Final defense passed. Your instructor will archive the project.'
        : 'Pass the final defense to finish.',
      done: archived,
      inProgress: !archived && finalPassed,
    },
  ]

  const allStages = [...phase1, ...phase2, ...phase3]
  const completedCount = allStages.filter(s => s.done).length
  const percentage = Math.round((completedCount / allStages.length) * 100)
  const currentStage = allStages.find(s => !s.done) || allStages[allStages.length - 1]

  const phaseGroups = [
    { label: 'Phase 1 — Proposal & Initial Defense', color: '#6d28d9', bg: '#ede9fe', stages: phase1 },
    { label: isThesis ? 'Phase 2 — Study' : 'Phase 2 — Development & Pre-Deployment', color: '#1d4ed8', bg: '#dbeafe', stages: phase2 },
    { label: isThesis ? 'Phase 3 — Final Defense' : 'Phase 3 — Deployment & Final Defense',  color: '#b45309', bg: '#fef3c7', stages: phase3 },
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
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginBottom: '6px', fontWeight: '600' }}>MY {user?.institute ? researchWord(user).toUpperCase() : 'THESIS / CAPSTONE'} PROGRESS</div>
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

      {/* Similarity report */}
      {project && (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '16px 20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#0a1f44', marginBottom: '4px' }}>Similarity Report</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
            {project.similarity_score >= 60 ? 'High similarity — please review your proposal carefully.' : project.similarity_score >= 30 ? 'Moderate similarity — your adviser may ask for revision.' : 'Low similarity — your proposal looks original.'}
          </div>
          <SimilarityBreakdown projectId={project.id} overallScore={project.similarity_score} forStudent />
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
                      {stage.done ? <Icon name="check-circle" /> : stage.warning ? <Icon name="x-circle" /> : stage.inProgress ? <Icon name="clock" /> : stage.icon}
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
                                {label[type]} v{doc.version} — {humanStatus(doc.status)}
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
