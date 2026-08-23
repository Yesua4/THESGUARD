import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/axios'

function PageContributions() {
  const { user } = useAuth()
  const [data, setData]                 = useState(null)
  const [projects, setProjects]         = useState([])
  const [selectedProject, setSelected] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const [loading, setLoading]           = useState(true)
  const [githubData, setGithubData] = useState(null)
  const [githubLoading, setGithubLoading] = useState(false)

  const colors = ['#1d4ed8','#0891b2','#059669','#d97706','#dc2626']

  const load = (pid='') => {
    setLoading(true)
    api.get(pid ? `/contributions/${pid}` : '/contributions')
      .then(res => setData(res.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    if (['admin','adviser','instructor'].includes(user?.role))
      api.get('/projects').then(res => setProjects(res.data))
  }, [])
  
  const fetchGithub = async (repoUrl) => {
  setGithubLoading(true)
  try {
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/)
    if (!match) return
    const [, owner, repo] = match
    const repoClean = repo.replace(/\.git$/, '')
    const res = await fetch(`https://api.github.com/repos/${owner}/${repoClean}/contributors`)
    if (!res.ok) throw new Error('Not found')
    const contributors = await res.json()
    setGithubData({ owner, repo: repoClean, contributors, url: repoUrl })
  } catch {
    setGithubData({ error: true, url: repoUrl })
  } finally { setGithubLoading(false) }
}

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44' }}>
          {user?.role === 'student' ? 'My Contributions' : 'Contribution Analytics'}
        </div>
        {['admin','adviser','instructor'].includes(user?.role) && (
          <div style={{ display:'flex', gap:'8px' }}>
            <input
              value={projectSearch}
              onChange={e => setProjectSearch(e.target.value)}
              placeholder="Search projects..."
              style={{ border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', outline:'none', background:'#f8fafc', width:'180px' }}
            />
            <select value={selectedProject} onChange={e => {
            setSelected(e.target.value)
            load(e.target.value)
            const proj = projects.find(p => String(p.id) === e.target.value)
            if (proj?.github_url) fetchGithub(proj.github_url)
            else setGithubData(null)
          }}
              style={{ border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', outline:'none', background:'#f8fafc', maxWidth:'260px' }}>
              <option value="">All projects</option>
              {projects
                .filter(p => p.title?.toLowerCase().includes(projectSearch.toLowerCase()))
                // Two different groups can submit the same title (the similarity
                // checker flags it, but both records still exist) -- append the
                // group name so entries that look identical in the list are
                // actually distinguishable before/after picking one.
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.title}{p.group?.group_name ? ` — ${p.group.group_name}` : ''}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'13px' }}>Loading...</div>
      ) : !data || data.total === 0 ? (
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', padding:'48px', textAlign:'center', color:'#94a3b8', fontSize:'13px' }}>
          No contributions yet. Activities are logged automatically when documents are uploaded.
        </div>
      ) : (
        <div className="dg-grid-2" style={{ display:'grid', gap:'14px' }}>
          {/* Breakdown */}
          <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
            <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'14px 18px' }}>
              <div style={{ fontSize:'13px', fontWeight:'700', color:'#fff' }}>Contribution Breakdown</div>
            </div>
            <div style={{ padding:'18px' }}>
              {data.analytics.map((a, i) => (
                <div key={a.user_id} style={{ marginBottom:'16px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'6px' }}>
                    <div style={{ width:'28px', height:'28px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'700', color:'#fff', flexShrink:0, background:colors[i%colors.length] }}>
                      {a.name.split(' ').map(x=>x[0]).join('').slice(0,2)}
                    </div>
                    <span style={{ fontSize:'13px', fontWeight:'600', color:'#0a1f44', flex:1 }}>{a.name}</span>
                    <span style={{ fontSize:'14px', fontWeight:'800', color:colors[i%colors.length] }}>{a.percentage}%</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    <div style={{ flex:1, height:'8px', background:'#f1f5f9', borderRadius:'8px', overflow:'hidden' }}>
                      <div style={{ height:'100%', borderRadius:'8px', background:colors[i%colors.length], width:`${a.percentage}%`, transition:'width 0.5s ease' }} />
                    </div>
                    <span style={{ fontSize:'11px', color:'#94a3b8', flexShrink:0 }}>{a.count} activities</span>
                  </div>
                </div>
              ))}
              <div style={{ paddingTop:'12px', borderTop:'1px solid #f1f5f9', fontSize:'11px', color:'#94a3b8' }}>
                Based on {data.total} total recorded activities
              </div>
            </div>
          </div>

          {/* Activity log */}
          <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
            <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'14px 18px' }}>
              <div style={{ fontSize:'13px', fontWeight:'700', color:'#fff' }}>Activity Log</div>
            </div>
            <div style={{ padding:'14px' }}>
              {data.activities.length === 0 ? (
                <div style={{ textAlign:'center', padding:'24px 0', color:'#94a3b8', fontSize:'13px' }}>No activities yet.</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column' }}>
                  {data.activities.map((a, i) => (
                    <div key={i} style={{ display:'flex', gap:'10px', padding:'10px 0', borderBottom:'1px solid #f8fafc' }}>
                      <div style={{ width:'26px', height:'26px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'700', color:'#fff', flexShrink:0, marginTop:'1px', background:colors[i%colors.length] }}>
                        {a.name.split(' ').map(x=>x[0]).join('').slice(0,2)}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:'13px', fontWeight:'600', color:'#0a1f44' }}>{a.name}</div>
                        <div style={{ fontSize:'11px', color:'#64748b', marginTop:'1px' }}>{a.action} — {a.description}</div>
                      </div>
                      <div style={{ fontSize:'11px', color:'#94a3b8', flexShrink:0, whiteSpace:'nowrap' }}>{a.date}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* GitHub Contributions */}
      {(githubData || githubLoading) && (
        <div style={{ marginTop:'14px', background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
          <div style={{ background:'linear-gradient(135deg,#24292e,#404448)', padding:'14px 18px', display:'flex', alignItems:'center', gap:'10px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
            <div style={{ fontSize:'13px', fontWeight:'700', color:'#fff' }}>GitHub Contributions</div>
            {githubData?.url && (
              <a href={githubData.url} target="_blank" rel="noreferrer" style={{ marginLeft:'auto', fontSize:'11px', color:'rgba(255,255,255,0.6)', textDecoration:'none', fontWeight:'600' }}>
                View Repo →
              </a>
            )}
          </div>
          <div style={{ padding:'16px 18px' }}>
            {githubLoading && <div style={{ fontSize:'13px', color:'#94a3b8' }}>Loading GitHub data...</div>}
            {githubData?.error && (
              <div style={{ fontSize:'13px', color:'#d97706' }}>⚠ Could not load GitHub data. Make sure the repo is public.</div>
            )}
            {githubData?.contributors && (
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                {githubData.contributors.map((c, i) => (
                  <div key={c.login} style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                    <img src={c.avatar_url} alt={c.login} style={{ width:'32px', height:'32px', borderRadius:'50%', flexShrink:0 }} />
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                        <a href={c.html_url} target="_blank" rel="noreferrer" style={{ fontSize:'13px', fontWeight:'600', color:'#0a1f44', textDecoration:'none' }}>{c.login}</a>
                        <span style={{ fontSize:'12px', fontWeight:'700', color:'#1d4ed8' }}>{c.contributions} commits</span>
                      </div>
                      <div style={{ height:'6px', background:'#f1f5f9', borderRadius:'6px', overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:'6px', background:'linear-gradient(90deg,#24292e,#1d4ed8)', width:`${Math.round((c.contributions / githubData.contributors[0].contributions) * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default PageContributions
