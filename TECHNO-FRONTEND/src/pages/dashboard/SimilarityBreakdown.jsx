import { useState, useEffect, useMemo } from 'react'
import api from '../../api/axios'
import { highlightOverlap } from '../../utils/textOverlap'
import { similarityBarColor, similarityScoreColor, similarityBadgeStyle } from '../../utils/similarityColors'

function SemanticMatches({ ownText, otherText, label }) {
  const [segments, setSegments] = useState(null)

  useEffect(() => {
    if (!ownText || !otherText) { setSegments(null); return }
    let cancelled = false
    api.post('/similarity/explain', { own_text: ownText, other_text: otherText })
      .then(res => { if (!cancelled) setSegments(res.data.segments || []) })
      .catch(() => { if (!cancelled) setSegments([]) })
    return () => { cancelled = true }
  }, [ownText, otherText])

  const matched = (segments || []).filter(s => s.matched)
  if (!segments || matched.length === 0) return null

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>
        Semantically Similar {label} (different wording, same meaning)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {matched.map((s, i) => (
          <div key={i} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '8px 10px' }}>
            <div style={{ fontSize: '12px', color: '#1e3a8a', marginBottom: '4px' }}>"{s.text}"</div>
            <div style={{ fontSize: '11px', color: '#3b82f6' }}>≈ "{s.matched_with}" <span style={{ fontWeight: '700' }}>({s.score}% semantic match)</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HighlightedText({ ownText, otherText }) {
  const segments = useMemo(() => highlightOverlap(ownText, otherText), [ownText, otherText])
  if (!ownText) return null
  return (
    <div style={{ fontSize: '12px', lineHeight: '1.7', color: '#334155' }}>
      {segments.map((s, i) => s.matched ? (
        <mark key={i} title="This phrase also appears in the matched proposal" style={{ background: 'rgba(239,68,68,0.22)', color: '#9f1239', borderRadius: '3px', padding: '0 2px' }}>
          {s.text}
        </mark>
      ) : (
        <span key={i}>{s.text}</span>
      ))}
    </div>
  )
}

function SimilarityBreakdown({ projectId, overallScore }) {
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showText, setShowText] = useState(false)

  useEffect(() => {
    if (!projectId) return
    api.get(`/projects/${projectId}/similarity`)
      .then(res => setDetails(res.data))
      .catch(() => setDetails(null))
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) return <div style={{ fontSize:'12px', color:'#94a3b8' }}>Loading similarity data...</div>

  const scores = details ?? { title_score:null, abstract_score:null, objectives_score:null, matched_title:null }

  const bar = (score) => (
    <div style={{ flex:1, height:'8px', background:'#f1f5f9', borderRadius:'8px', overflow:'hidden' }}>
      <div style={{ height:'100%', borderRadius:'8px', background:similarityBarColor(score), width:`${score}%`, transition:'width 0.5s ease' }} />
    </div>
  )

  const scoreStyle = s => ({ color: similarityScoreColor(s), fontWeight:'700' })
  const badgeStyle = similarityBadgeStyle

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'14px' }}>
        <div style={{ fontSize:'28px', fontWeight:'800', ...scoreStyle(overallScore) }}>{overallScore}%</div>
        <span style={{ fontSize:'11px', padding:'4px 10px', borderRadius:'20px', fontWeight:'700', ...badgeStyle(overallScore) }}>
          {overallScore>=60 ? 'High — review carefully' : overallScore>=30 ? 'Moderate' : 'Low — acceptable'}
        </span>
      </div>

      {scores.title_score !== null ? (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'12px' }}>
          {[['Title', scores.title_score], ['Abstract', scores.abstract_score], ['Objectives', scores.objectives_score], ['Overall', overallScore]].map(([label, val]) => (
            <div key={label} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <span style={{ fontSize:'11px', color:'#94a3b8', width:'70px', flexShrink:0, fontWeight:'600' }}>{label}</span>
              {bar(val)}
              <span style={{ fontSize:'12px', width:'38px', textAlign:'right', flexShrink:0, ...scoreStyle(val) }}>{val}%</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize:'12px', color:'#94a3b8', marginBottom:'12px' }}>Detailed field breakdown not available.</div>
      )}

      {scores.matched_title && (
        <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'10px', padding:'10px 12px', marginBottom:'10px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
            <div style={{ fontSize:'10px', fontWeight:'700', color:'#d97706', letterSpacing:'0.08em', textTransform:'uppercase' }}>Most Similar To</div>
            {(scores.matched_abstract || scores.matched_objectives) && (
              <button onClick={() => setShowText(v => !v)} style={{ fontSize:'11px', color:'#1d4ed8', background:'none', border:'none', cursor:'pointer', fontWeight:'600' }}>
                {showText ? 'Hide matched text' : 'Show matched text'}
              </button>
            )}
          </div>
          <div style={{ fontSize:'13px', color:'#92400e', fontWeight:'600' }}>{scores.matched_title}</div>

          {showText && (
            <div style={{ marginTop:'10px', display:'flex', flexDirection:'column', gap:'10px' }}>
              {scores.own_abstract && (
                <div>
                  <div style={{ fontSize:'10px', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', marginBottom:'4px' }}>Abstract</div>
                  <HighlightedText ownText={scores.own_abstract} otherText={scores.matched_abstract} />
                  <SemanticMatches ownText={scores.own_abstract} otherText={scores.matched_abstract} label="Sentences" />
                </div>
              )}
              {scores.own_objectives && (
                <div>
                  <div style={{ fontSize:'10px', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', marginBottom:'4px' }}>Objectives</div>
                  <HighlightedText ownText={scores.own_objectives} otherText={scores.matched_objectives} />
                  <SemanticMatches ownText={scores.own_objectives} otherText={scores.matched_objectives} label="Objectives" />
                </div>
              )}
              <div style={{ fontSize:'11px', color:'#94a3b8' }}>
                <mark style={{ background:'rgba(239,68,68,0.22)', color:'#9f1239', borderRadius:'3px', padding:'0 2px' }}>Highlighted</mark> phrases are verbatim matches; <span style={{ color:'#3b82f6', fontWeight:'600' }}>blue boxes</span> below are semantically similar phrasing detected by SBERT.
              </div>
            </div>
          )}
        </div>
      )}

      {overallScore >= 30 && (
        <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'8px', padding:'8px 12px', fontSize:'12px', color:'#92400e' }}>
          ⚠ Review the abstract and objectives carefully before approving.
        </div>
      )}
    </div>
  )
}

export default SimilarityBreakdown
