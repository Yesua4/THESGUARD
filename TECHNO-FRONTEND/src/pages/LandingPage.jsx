import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import teamIC from '../assets/team-ic.jpg'
import teamJM from '../assets/team-jm.jpg'
import teamPG from '../assets/team-pg.jpg'
import logo from '../assets/capstoneguard.png'

/* ─── Scroll-reveal hook ─────────────────────────────────────── */
function useReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('visible')
      }),
      { threshold: 0.12 }
    )
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}

/* ─── Role data ──────────────────────────────────────────────── */
const ROLES = {
  student: {
    label: 'Student',
    title: 'Student',
    desc: 'Students have a centralized hub to submit proposals, upload documents, track contributions, and monitor their project status and defense schedule in real time.',
    perks: ['Submit and track proposal titles', 'Upload chapter documents', 'View contribution analytics', 'Receive real-time notifications', 'View defense schedule'],
    screenTitle: 'Student Dashboard',
    items: [
      { label: 'My Progress — Stage 4 of 6', badge: 'In Progress', color: '#2e7dff', badgeClass: 'badge-blue' },
      { label: 'Title Status', badge: 'Approved', color: '#28c840', badgeClass: 'badge-green' },
      { label: 'Chapter 1 — v2', badge: 'Under Review', color: '#f0b429', badgeClass: 'badge-amber' },
      { label: 'Defense Schedule', badge: 'June 20, 2026', color: '#2e7dff', badgeClass: 'badge-blue' },
      { label: 'My Contributions', badge: '38%', color: '#28c840', badgeClass: 'badge-green' },
    ]
  },
  instructor: {
    label: 'Instructor',
    title: 'Instructor',
    desc: 'Instructors manage the entire thesis and capstone process — approving titles, assigning advisers, scheduling defenses, and generating institutional reports.',
    perks: ['Approve or reject proposal titles', 'Manage groups and assign advisers', 'Schedule defenses by group', 'View similarity breakdown per proposal', 'Generate and export reports'],
    screenTitle: 'Title Approval Panel',
    items: [
      { label: 'Group A — AI Research System', badge: '62% Similar', color: '#f0b429', badgeClass: 'badge-amber' },
      { label: 'Group B — IoT Smart Campus', badge: '12% Similar', color: '#28c840', badgeClass: 'badge-green' },
      { label: 'Group C — Fire Detection', badge: '78% Similar', color: '#ff5f57', badgeClass: 'badge-red' },
      { label: 'Group D — E-Commerce App', badge: '8% Similar', color: '#28c840', badgeClass: 'badge-green' },
    ]
  },
  adviser: {
    label: 'Advisory Committee',
    title: 'Advisory Committee',
    desc: 'Composed of the research adviser, panel chair, and panel members — the advisory committee reviews documents, provides structured feedback, and conducts evaluations digitally.',
    perks: ['Review and comment on documents', 'Approve or request revisions', 'Page-referenced commenting', 'Access assigned projects only', 'View similarity reports'],
    screenTitle: 'Documents Review',
    items: [
      { label: 'Proposal — Group A v3', badge: 'Approved', color: '#2e7dff', badgeClass: 'badge-green' },
      { label: 'Chapter 1 — Group A v2', badge: 'Needs Revision', color: '#f0b429', badgeClass: 'badge-amber' },
      { label: 'Chapter 2 — Group A v1', badge: 'Under Review', color: '#2e7dff', badgeClass: 'badge-blue' },
      { label: 'Comments added — Page 4', badge: 'Sent', color: '#28c840', badgeClass: 'badge-green' },
    ]
  },
  admin: {
    label: 'Administrator',
    title: 'Administrator',
    desc: 'Administrators have institution-wide oversight — managing all user accounts, monitoring all projects across programs, and maintaining the archival system.',
    perks: ['Create and manage all user accounts', 'View all projects across programs', 'Manage archive and similarity data', 'Generate institutional reports', 'Manage rooms and panelists'],
    screenTitle: 'Admin Dashboard',
    items: [
      { label: 'Total Projects', badge: '24 Active', color: '#28c840', badgeClass: 'badge-green' },
      { label: 'User Accounts', badge: '47 Users', color: '#2e7dff', badgeClass: 'badge-blue' },
      { label: 'Flagged Proposals', badge: '3 Flagged', color: '#f0b429', badgeClass: 'badge-amber' },
      { label: 'Archived Projects', badge: '18 Archived', color: '#28c840', badgeClass: 'badge-green' },
    ]
  }
}

export default function LandingPage() {
  const navigate = useNavigate()
  const [navOpen, setNavOpen] = useState(false)
  const [navScrolled, setNavScrolled] = useState(false)
  const [activeRole, setActiveRole] = useState('student')
  useReveal()

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setNavOpen(false)
  }

  const role = ROLES[activeRole]

  return (
    <>
      <style>{CSS}</style>

        {/* NAV */}
        <nav className={`cg-nav${navScrolled ? ' scrolled' : ''}`}>
        <div className="cg-nav-logo">
            <img src={logo} alt="ThesisGuard" style={{height: '36px', width: 'auto'}} />
            <span className="cg-logo-text">Thesis<span>Guard</span></span>
            <span className="cg-logo-by">by AcadVance</span>
        </div>
        <div className={`cg-nav-links${navOpen ? ' open' : ''}`}>
            {[['about','About'],['features','Features'],['howitworks','How It Works'],['roles','Roles'],['team','Team']].map(([id,label]) => (
            <button key={id} className="cg-nav-link" onClick={() => scrollTo(id)}>{label}</button>
            ))}
            <button className="cg-nav-cta" onClick={() => navigate('/register-school')}>Get Started</button>
        </div>
        <button className="cg-nav-toggle" onClick={() => setNavOpen(o => !o)}>
            <span style={{ transform: navOpen ? 'rotate(45deg) translate(5px,5px)' : 'none' }} />
            <span style={{ opacity: navOpen ? 0 : 1 }} />
            <span style={{ transform: navOpen ? 'rotate(-45deg) translate(5px,-5px)' : 'none' }} />
        </button>
        </nav>
          


      {/* HERO */}
      <section className="cg-hero" id="home">
        <div className="hero-grid" /><div className="hero-glow" /><div className="hero-glow2" />
        <div className="hero-content">
          <div className="hero-badge"><div className="hero-badge-dot" /><span>Capstone &amp; Thesis Management Platform</span></div>
          <h1>Secure. Smart.<br /><em>ThesisGuard.</em></h1>
          <p>A secure role-based thesis and capstone project monitoring and archival system with contribution analytics and proposal similarity detection — built for Philippine higher education institutions.</p>
          <div className="hero-buttons">
            <button className="btn-primary" onClick={() => navigate('/register-school')}>Get Started Free →</button>
            <button className="btn-secondary" onClick={() => scrollTo('howitworks')}>How It Works →</button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-card">
            <div className="hero-card-header">
              <span className="hero-card-title">Similarity Dashboard</span>
              <div className="hero-card-dots"><span className="dot-r"/><span className="dot-y"/><span className="dot-g"/></div>
            </div>
            <div className="stat-row">
              <div className="stat-box"><div className="stat-num">98%</div><div className="stat-label">Detection accuracy</div></div>
              <div className="stat-box"><div className="stat-num">5</div><div className="stat-label">User roles</div></div>
            </div>
            {[['Title Similarity',61],['Abstract Similarity',42],['Objectives Similarity',28]].map(([label,pct]) => (
              <div key={label} className="progress-item">
                <div className="progress-label"><span>{label}</span><span style={{color:'var(--gold)'}}>{pct}%</span></div>
                <div className="progress-bar"><div className="progress-fill" style={{width:`${pct}%`}}/></div>
              </div>
            ))}
          </div>
        </div>
        <div className="hero-stats">
          {[['5','User Roles'],['3','NLP Algorithms'],['100%','Web-Based'],['∞','Programs Supported']].map(([n,l]) => (
            <div key={l} className="hero-stat"><div className="hero-stat-num">{n}</div><div className="hero-stat-label">{l}</div></div>
          ))}
        </div>
      </section>

      {/* ABOUT */}
      <section className="cg-about" id="about">
        <div className="about-inner">
          <div className="about-visual reveal">
            <div className="about-img">
              <div className="about-img-grid"/>
              <div className="role-chips">
                {[['chip-blue','Student'],['chip-gold','Instructor'],['chip-green','Adviser'],['chip-red','Panelist'],['chip-purple','Administrator'],['chip-blue','RBAC Security'],['chip-gold','SBERT + TF-IDF'],['chip-green','spaCy + NLTK'],['chip-red','Document Versioning'],['chip-purple','Contribution Analytics']].map(([cls,lbl]) => (
                  <div key={lbl} className={`chip ${cls}`}><span className="chip-dot"/>{lbl}</div>
                ))}
              </div>
            </div>
            <div className="about-badge">All Programs. One Platform.</div>
          </div>
          <div className="about-text reveal reveal-delay-2">
            <span className="section-tag">About the System</span>
            <h2 className="section-title">What is <span style={{color:'var(--accent)'}}>ThesisGuard?</span></h2>
            <p className="section-sub">ThesisGuard is a comprehensive web-based platform designed to centralize, secure, and streamline the management of thesis and capstone projects across all academic programs in Philippine higher education institutions.</p>
            <div className="about-points">
              {[['🔒','Role-Based Access Control','Five distinct user roles with tailored dashboards and permissions — no more information overload or unauthorized access.'],['📊','NLP-Powered Similarity Detection','Combines SBERT, TF-IDF, spaCy, and NLTK to detect proposal similarities across title, abstract, and objectives.'],['📁','Digital Archival & Version Control','Every document revision is tracked. Approved projects are permanently archived in a searchable digital repository.']].map(([icon,title,desc]) => (
                <div key={title} className="about-point">
                  <div className="about-point-icon">{icon}</div>
                  <div className="about-point-text"><h4>{title}</h4><p>{desc}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="cg-features" id="features">
        <div className="features-header reveal">
          <span className="section-tag">Core Features</span>
          <h2 className="section-title">Everything You Need,<br/>All in One Place</h2>
          <p className="section-sub">ThesisGuard integrates all the tools needed for complete thesis and capstone project management from submission to archival.</p>
        </div>
        <div className="features-grid">
          {[['🔐','Secure Role-Based Access','Five user roles each with precisely defined permissions and personalized dashboards.','Security'],['🧠','Proposal Similarity Detection','Hybrid NLP using SBERT, TF-IDF, spaCy, and NLTK for per-field similarity percentages.','NLP / AI'],['📄','Document Version Control','Complete revision history for all manuscripts. Upload PDF or DOCX, receive inline comments.','Documents'],['📈','Contribution Analytics','System-tracked activity logs measure individual participation — objective and auditable.','Analytics'],['📅','Defense Scheduling','Assign rooms and panelists. Students receive real-time in-app notifications.','Scheduling'],['📋','Reports & Archival','Generate reports, export as CSV, and archive approved projects permanently.','Reports']].map(([icon,title,desc,tag],i) => (
            <div key={title} className={`feature-card reveal reveal-delay-${(i%3)+1}`}>
              <div className="feature-icon">{icon}</div>
              <div className="feature-title">{title}</div>
              <div className="feature-desc">{desc}</div>
              <span className="feature-tag">{tag}</span>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="cg-howitworks" id="howitworks">
        <div className="howitworks-glow"/>
        <div className="howitworks-header reveal">
          <span className="section-tag" style={{background:'rgba(46,125,255,0.2)',color:'#7db3ff'}}>How It Works</span>
          <h2 className="section-title">From Submission to Archival</h2>
          <p className="section-sub" style={{margin:'0 auto'}}>A streamlined four-step process that guides every research group from initial proposal to final archival.</p>
        </div>
        <div className="cg-steps">
          {[['1','Submit Proposal','Students submit their research title, abstract, and objectives through the platform.'],['2','Similarity Check','The NLP engine checks the proposal against all archived projects and returns per-field similarity percentages.'],['3','Review & Approve','The instructor reviews the similarity report and approves or returns the title for revision.'],['4','Monitor & Archive','Documents are reviewed with version tracking, defenses scheduled, and projects archived permanently.']].map(([num,title,desc],i) => (
            <div key={num} className={`cg-step reveal reveal-delay-${i+1}`}>
              <div className="step-num">{num}</div>
              <div className="step-title">{title}</div>
              <div className="step-desc">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ROLES */}
      <section className="cg-roles" id="roles">
        <div className="roles-header reveal">
          <span className="section-tag">User Roles</span>
          <h2 className="section-title">Built for Every Stakeholder</h2>
          <p className="section-sub" style={{margin:'0 auto'}}>ThesisGuard serves five distinct user roles, each with a dedicated dashboard tailored to their specific needs.</p>
        </div>
        <div className="roles-tabs">
          {Object.entries(ROLES).map(([key,r]) => (
            <button key={key} className={`role-tab${activeRole===key?' active':''}`} onClick={()=>setActiveRole(key)}>{r.label}</button>
          ))}
        </div>
        <div className="role-panel-active">
          <div className="role-info">
            <h3>{role.title}</h3><p>{role.desc}</p>
            <div className="role-perks">
              {role.perks.map(p=><div key={p} className="role-perk"><div className="perk-check">✓</div>{p}</div>)}
            </div>
          </div>
          <div className="role-visual">
            <div className="role-screen">
              <div className="role-screen-bar">
                <div className="role-screen-dots"><span style={{background:'#ff5f57'}}/><span style={{background:'#febc2e'}}/><span style={{background:'#28c840'}}/></div>
                <span className="role-screen-title">{role.screenTitle}</span>
              </div>
              <div className="role-screen-body">
                {role.items.map((item,i)=>(
                  <div key={i} className="mini-item">
                    <div className="mini-dot" style={{background:item.color}}/>
                    <div className="mini-text">{item.label}</div>
                    <div className={`mini-badge ${item.badgeClass}`}>{item.badge}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TECH STACK */}
      <section className="cg-techstack" id="techstack">
        <div className="techstack-header reveal">
          <span className="section-tag">Technology</span>
          <h2 className="section-title">Built with Modern Technology</h2>
          <p className="section-sub" style={{margin:'0 auto'}}>A robust full-stack architecture combining PHP, JavaScript, and Python for seamless performance.</p>
        </div>
        <div className="tech-grid">
          {[['⚛️','React','User Interface','Frontend'],['🐘','Laravel 12','REST API & Backend Logic','Backend'],['🐍','Python FastAPI','NLP Similarity Service','Microservice'],['🗄️','MySQL','Database','Database'],['🤖','SBERT','Semantic Similarity','NLP'],['📊','TF-IDF','Lexical Similarity','NLP'],['🔑','Laravel Sanctum','Token Authentication','Security'],['🛡️','bcrypt + Pepper','Password Security','Security']].map(([icon,name,role,layer],i)=>(
            <div key={name} className={`tech-card reveal reveal-delay-${(i%4)+1}`}>
              <div className="tech-icon">{icon}</div>
              <div className="tech-name">{name}</div>
              <div className="tech-role">{role}</div>
              <span className="tech-layer">{layer}</span>
            </div>
          ))}
        </div>
      </section>

      {/* TEAM */}
      <section className="cg-team" id="team">
        <div className="team-header reveal">
          <span className="section-tag">The Team</span>
          <h2 className="section-title">Meet AcadVance</h2>
          <p className="section-sub" style={{margin:'0 auto'}}>ThesisGuard was built by third-year BSIT students — now turning it into a real startup.</p>
        </div>
        <div className="team-grid">
          {[
            ['IC', 'Ialnaj T. Chu',       'Systems Analyst',      'avatar-2', teamIC],
            ['JM', 'Joshua M. Molid',     'Full-Stack Developer',  'avatar-1', teamJM],
            ['PG', 'Prince Earl Gabatino','Project Manager',       'avatar-3', teamPG],
            ].map(([initials, name, role, cls, photo]) => (
            <div key={name} className="team-card reveal">
                <div className={`team-avatar ${cls}`}>
                {photo
                    ? <img src={photo} alt={name} style={{width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%'}} />
                    : initials
                }
                </div>
                <div className="team-name">{name}</div>
                <div className="team-role">{role}</div>
                <div className="team-program">BS Information Technology</div>
            </div>
            ))}
        </div>
      </section>

      {/* CTA */}
      <section className="cg-cta" id="cta">
        <div className="cta-glow"/>
        <h2>Ready to <em>Modernize</em><br/>Research Management?</h2>
        <p>ThesisGuard brings security, automation, and clarity to every step of the thesis and capstone journey.</p>
        <div className="cta-buttons">
          <button className="btn-primary" onClick={() => navigate('/register-school')} >Get Started Free →</button>
          <a href="mailto:acadvancea@gmail.com" className="btn-secondary">Contact AcadVance</a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="cg-footer">
        <div className="footer-logo">Thesis<span>Guard</span></div>
        <p className="footer-text">A Secure Role-Based Thesis and Capstone Project Monitoring and Archival System<br/>with Contribution Analytics and Proposal Similarity Detection<br/><br/>© 2026 AcadVance. All rights reserved.</p>
      </footer>
    </>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap');
:root{--navy:#0a1628;--blue:#1a3a6b;--accent:#2e7dff;--gold:#f0b429;--light:#f4f7ff;--white:#ffffff;--text:#1a2540;--muted:#6b7a99;--border:rgba(46,125,255,0.15);}
*{margin:0;padding:0;box-sizing:border-box;}
html{scroll-behavior:smooth;}
body{font-family:'DM Sans',sans-serif;background:var(--white);color:var(--text);overflow-x:hidden;}
.cg-nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:18px 5%;display:flex;align-items:center;justify-content:space-between;transition:all 0.3s;}
.cg-nav.scrolled{background:rgba(10,22,40,0.97);backdrop-filter:blur(12px);border-bottom:1px solid rgba(46,125,255,0.2);}
.cg-nav-logo{display:flex;align-items:center;gap:10px;}
.cg-logo-icon{width:36px;height:36px;background:var(--accent);border-radius:8px;display:flex;align-items:center;justify-content:center;}
.cg-logo-text{font-family:'Playfair Display',serif;font-size:1.3rem;color:var(--white);font-weight:700;}
.cg-logo-text span{color:var(--gold);}
.cg-logo-by{font-size:10px;color:rgba(255,255,255,0.35);margin-left:2px;}
.cg-nav-links{display:flex;align-items:center;gap:8px;}
.cg-nav-link{background:none;border:none;color:rgba(255,255,255,0.75);font-size:0.9rem;font-weight:500;cursor:pointer;padding:8px 12px;border-radius:6px;transition:color 0.2s;font-family:'DM Sans',sans-serif;}
.cg-nav-link:hover{color:white;}
.cg-nav-cta{background:var(--accent);color:white;border:none;padding:9px 20px;border-radius:8px;font-weight:600;font-size:0.9rem;cursor:pointer;transition:background 0.2s;font-family:'DM Sans',sans-serif;margin-left:8px;}
.cg-nav-cta:hover{background:#1a6de8;}
.cg-nav-toggle{display:none;flex-direction:column;gap:5px;background:none;border:none;cursor:pointer;padding:4px;}
.cg-nav-toggle span{display:block;width:24px;height:2px;background:white;border-radius:2px;transition:0.3s;}
.cg-hero{min-height:100vh;background:var(--navy);position:relative;display:flex;align-items:center;overflow:hidden;padding:120px 5% 80px;}
.hero-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(46,125,255,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(46,125,255,0.06) 1px,transparent 1px);background-size:60px 60px;pointer-events:none;}
.hero-glow{position:absolute;top:-200px;right:-100px;width:700px;height:700px;background:radial-gradient(circle,rgba(46,125,255,0.18) 0%,transparent 70%);pointer-events:none;}
.hero-glow2{position:absolute;bottom:-200px;left:-100px;width:500px;height:500px;background:radial-gradient(circle,rgba(240,180,41,0.08) 0%,transparent 70%);pointer-events:none;}
.hero-content{position:relative;z-index:2;max-width:640px;}
.hero-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(46,125,255,0.15);border:1px solid rgba(46,125,255,0.3);border-radius:100px;padding:6px 16px;margin-bottom:28px;}
.hero-badge-dot{width:7px;height:7px;background:var(--gold);border-radius:50%;animation:pulse 2s infinite;}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.5;transform:scale(1.3);}}
.hero-badge span{font-size:0.8rem;color:rgba(255,255,255,0.8);font-weight:500;letter-spacing:0.05em;text-transform:uppercase;}
.hero-content h1{font-family:'Playfair Display',serif;font-size:clamp(2.8rem,6vw,4.5rem);color:var(--white);line-height:1.1;margin-bottom:20px;font-weight:900;}
.hero-content h1 em{color:var(--gold);font-style:normal;}
.hero-content p{font-size:1.1rem;color:rgba(255,255,255,0.65);line-height:1.8;margin-bottom:36px;max-width:520px;}
.hero-buttons{display:flex;gap:14px;flex-wrap:wrap;}
.btn-primary{background:var(--accent);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:0.95rem;display:inline-flex;align-items:center;gap:8px;transition:all 0.2s;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;}
.btn-primary:hover{background:#1a6de8;transform:translateY(-2px);}
.btn-secondary{background:transparent;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:0.95rem;display:inline-flex;align-items:center;gap:8px;transition:all 0.2s;border:1px solid rgba(255,255,255,0.25);cursor:pointer;font-family:'DM Sans',sans-serif;}
.btn-secondary:hover{background:rgba(255,255,255,0.07);transform:translateY(-2px);}
.hero-visual{position:absolute;right:5%;top:50%;transform:translateY(-50%);width:42%;max-width:550px;z-index:2;}
.hero-card{background:rgba(255,255,255,0.04);border:1px solid rgba(46,125,255,0.2);border-radius:20px;padding:28px;backdrop-filter:blur(10px);animation:float 4s ease-in-out infinite;}
@keyframes float{0%,100%{transform:translateY(0);}50%{transform:translateY(-12px);}}
.hero-card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;}
.hero-card-title{color:white;font-weight:600;font-size:0.95rem;}
.hero-card-dots{display:flex;gap:6px;}
.hero-card-dots span{width:10px;height:10px;border-radius:50%;}
.dot-r{background:#ff5f57;}.dot-y{background:#febc2e;}.dot-g{background:#28c840;}
.stat-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;}
.stat-box{background:rgba(46,125,255,0.1);border:1px solid rgba(46,125,255,0.2);border-radius:12px;padding:16px;}
.stat-num{font-family:'Playfair Display',serif;font-size:1.8rem;color:var(--gold);font-weight:700;}
.stat-label{font-size:0.75rem;color:rgba(255,255,255,0.5);margin-top:2px;}
.progress-item{margin-bottom:12px;}
.progress-label{display:flex;justify-content:space-between;margin-bottom:6px;}
.progress-label span{font-size:0.78rem;color:rgba(255,255,255,0.7);}
.progress-bar{height:6px;background:rgba(255,255,255,0.1);border-radius:100px;overflow:hidden;}
.progress-fill{height:100%;border-radius:100px;background:linear-gradient(90deg,var(--accent),var(--gold));}
.hero-stats{position:absolute;bottom:40px;left:5%;right:5%;display:flex;gap:40px;z-index:2;}
.hero-stat{text-align:center;}
.hero-stat-num{font-family:'Playfair Display',serif;font-size:2rem;color:var(--gold);font-weight:700;}
.hero-stat-label{font-size:0.8rem;color:rgba(255,255,255,0.5);margin-top:2px;}
.cg-about,.cg-features,.cg-roles,.cg-techstack,.cg-team,.cg-howitworks,.cg-cta{padding:90px 5%;}
.section-tag{display:inline-block;background:rgba(46,125,255,0.1);color:var(--accent);border:1px solid rgba(46,125,255,0.2);border-radius:100px;padding:5px 16px;font-size:0.78rem;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;margin-bottom:16px;}
.section-title{font-family:'Playfair Display',serif;font-size:clamp(2rem,4vw,2.8rem);font-weight:900;line-height:1.2;margin-bottom:16px;}
.section-sub{font-size:1rem;color:var(--muted);line-height:1.8;max-width:560px;}
.cg-about{background:var(--light);}
.about-inner{display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center;}
.about-visual{position:relative;}
.about-img{width:100%;border-radius:20px;background:var(--navy);padding:32px;position:relative;overflow:hidden;}
.about-img-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(46,125,255,0.08) 1px,transparent 1px),linear-gradient(90deg,rgba(46,125,255,0.08) 1px,transparent 1px);background-size:30px 30px;}
.role-chips{display:flex;flex-wrap:wrap;gap:10px;position:relative;z-index:1;}
.chip{padding:10px 18px;border-radius:100px;font-size:0.85rem;font-weight:600;display:flex;align-items:center;gap:8px;}
.chip-blue{background:rgba(46,125,255,0.2);color:#7db3ff;border:1px solid rgba(46,125,255,0.3);}
.chip-gold{background:rgba(240,180,41,0.15);color:#f0b429;border:1px solid rgba(240,180,41,0.3);}
.chip-green{background:rgba(40,200,100,0.15);color:#28c864;border:1px solid rgba(40,200,100,0.3);}
.chip-red{background:rgba(255,95,87,0.15);color:#ff7070;border:1px solid rgba(255,95,87,0.3);}
.chip-purple{background:rgba(180,100,255,0.15);color:#c87aff;border:1px solid rgba(180,100,255,0.3);}
.chip-dot{width:8px;height:8px;border-radius:50%;background:currentColor;}
.about-badge{position:absolute;bottom:-20px;right:-20px;background:var(--accent);color:white;border-radius:16px;padding:16px 22px;font-weight:700;font-size:0.9rem;box-shadow:0 8px 32px rgba(46,125,255,0.4);}
.about-text .section-sub{margin-bottom:28px;}
.about-points{display:flex;flex-direction:column;gap:16px;}
.about-point{display:flex;gap:14px;align-items:flex-start;}
.about-point-icon{width:40px;height:40px;background:rgba(46,125,255,0.1);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.1rem;}
.about-point-text h4{font-weight:600;margin-bottom:4px;font-size:0.95rem;}
.about-point-text p{font-size:0.88rem;color:var(--muted);line-height:1.6;}
.cg-features{background:white;}
.features-header{text-align:center;margin-bottom:56px;}
.features-header .section-sub{margin:0 auto;}
.features-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;}
.feature-card{background:var(--light);border:1px solid var(--border);border-radius:18px;padding:28px;transition:all 0.3s;cursor:default;}
.feature-card:hover{background:var(--navy);border-color:rgba(46,125,255,0.3);transform:translateY(-6px);box-shadow:0 20px 60px rgba(10,22,40,0.15);}
.feature-card:hover .feature-title{color:white;}
.feature-card:hover .feature-desc{color:rgba(255,255,255,0.6);}
.feature-icon{width:52px;height:52px;background:rgba(46,125,255,0.12);border-radius:14px;display:flex;align-items:center;justify-content:center;margin-bottom:18px;font-size:1.5rem;transition:0.3s;}
.feature-card:hover .feature-icon{background:rgba(46,125,255,0.25);}
.feature-title{font-weight:700;font-size:1rem;margin-bottom:8px;transition:0.3s;}
.feature-desc{font-size:0.88rem;color:var(--muted);line-height:1.7;transition:0.3s;}
.feature-tag{display:inline-block;margin-top:14px;font-size:0.75rem;font-weight:600;color:var(--accent);background:rgba(46,125,255,0.1);padding:3px 12px;border-radius:100px;}
.cg-howitworks{background:var(--navy);position:relative;overflow:hidden;}
.howitworks-glow{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:600px;background:radial-gradient(circle,rgba(46,125,255,0.1) 0%,transparent 70%);pointer-events:none;}
.cg-howitworks .section-title{color:white;}
.cg-howitworks .section-sub{color:rgba(255,255,255,0.55);}
.howitworks-header{text-align:center;margin-bottom:60px;position:relative;z-index:1;}
.cg-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;position:relative;z-index:1;}
.cg-steps::before{content:'';position:absolute;top:44px;left:12%;right:12%;height:2px;background:linear-gradient(90deg,var(--accent),var(--gold));z-index:0;opacity:0.3;}
.cg-step{text-align:center;position:relative;z-index:1;}
.step-num{width:88px;height:88px;border-radius:50%;background:rgba(46,125,255,0.15);border:2px solid rgba(46,125,255,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-family:'Playfair Display',serif;font-size:1.8rem;color:var(--gold);font-weight:700;transition:0.3s;}
.cg-step:hover .step-num{background:var(--accent);border-color:var(--accent);color:white;}
.step-title{font-weight:700;color:white;margin-bottom:8px;font-size:0.95rem;}
.step-desc{font-size:0.83rem;color:rgba(255,255,255,0.5);line-height:1.7;}
.cg-roles{background:var(--light);}
.roles-header{text-align:center;margin-bottom:48px;}
.roles-tabs{display:flex;justify-content:center;gap:8px;margin-bottom:40px;flex-wrap:wrap;}
.role-tab{padding:10px 22px;border-radius:100px;border:1px solid var(--border);background:white;font-size:0.88rem;font-weight:600;cursor:pointer;transition:all 0.2s;color:var(--muted);font-family:'DM Sans',sans-serif;}
.role-tab.active,.role-tab:hover{background:var(--navy);color:white;border-color:var(--navy);}
.role-panel-active{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;}
.role-info h3{font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:900;margin-bottom:12px;}
.role-info p{color:var(--muted);line-height:1.8;margin-bottom:24px;font-size:0.95rem;}
.role-perks{display:flex;flex-direction:column;gap:10px;}
.role-perk{display:flex;align-items:center;gap:10px;font-size:0.9rem;}
.perk-check{width:20px;height:20px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:0.7rem;flex-shrink:0;}
.role-visual{background:var(--navy);border-radius:18px;padding:28px;}
.role-screen{background:rgba(255,255,255,0.03);border:1px solid rgba(46,125,255,0.2);border-radius:12px;overflow:hidden;}
.role-screen-bar{background:rgba(46,125,255,0.1);padding:10px 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(46,125,255,0.15);}
.role-screen-dots{display:flex;gap:5px;}
.role-screen-dots span{width:8px;height:8px;border-radius:50%;}
.role-screen-title{font-size:0.75rem;color:rgba(255,255,255,0.5);}
.role-screen-body{padding:16px;}
.mini-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(46,125,255,0.1);margin-bottom:8px;}
.mini-item:last-child{margin-bottom:0;}
.mini-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.mini-text{font-size:0.78rem;color:rgba(255,255,255,0.6);flex:1;}
.mini-badge{margin-left:auto;font-size:0.68rem;padding:2px 8px;border-radius:100px;white-space:nowrap;}
.badge-green{background:rgba(40,200,100,0.15);color:#28c864;}
.badge-amber{background:rgba(240,180,41,0.15);color:#f0b429;}
.badge-blue{background:rgba(46,125,255,0.15);color:#7db3ff;}
.badge-red{background:rgba(255,95,87,0.15);color:#ff7070;}
.cg-techstack{background:var(--light);}
.techstack-header{text-align:center;margin-bottom:48px;}
.tech-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;}
.tech-card{border:1px solid var(--border);border-radius:16px;padding:24px;text-align:center;transition:0.3s;background:white;}
.tech-card:hover{border-color:var(--accent);transform:translateY(-4px);box-shadow:0 12px 40px rgba(46,125,255,0.1);}
.tech-icon{font-size:2.2rem;margin-bottom:12px;}
.tech-name{font-weight:700;font-size:0.95rem;margin-bottom:4px;}
.tech-role{font-size:0.8rem;color:var(--muted);}
.tech-layer{font-size:0.72rem;font-weight:600;color:var(--accent);background:rgba(46,125,255,0.1);padding:2px 10px;border-radius:100px;margin-top:8px;display:inline-block;}
.cg-team{background:white;}
.team-header{text-align:center;margin-bottom:48px;}
.team-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;max-width:860px;margin:0 auto;}
.team-card{background:var(--light);border:1px solid var(--border);border-radius:20px;padding:32px;text-align:center;transition:0.3s;}
.team-card:hover{transform:translateY(-6px);box-shadow:0 20px 60px rgba(10,22,40,0.1);border-color:var(--accent);}
.team-avatar{width:80px;height:80px;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:900;color:white;}
.avatar-1{background:linear-gradient(135deg,var(--accent),#0a5cd4);}
.avatar-2{background:linear-gradient(135deg,#8b5cf6,#6d28d9);}
.avatar-3{background:linear-gradient(135deg,var(--gold),#d97706);}
.team-name{font-weight:700;font-size:1rem;margin-bottom:4px;}
.team-role{font-size:0.83rem;color:var(--muted);}
.team-program{font-size:0.78rem;color:var(--accent);font-weight:600;margin-top:6px;}
.cg-cta{background:var(--navy);text-align:center;position:relative;overflow:hidden;}
.cta-glow{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:300px;background:radial-gradient(ellipse,rgba(46,125,255,0.2) 0%,transparent 70%);pointer-events:none;}
.cg-cta h2{font-family:'Playfair Display',serif;font-size:clamp(2rem,4vw,3rem);color:white;font-weight:900;margin-bottom:16px;position:relative;z-index:1;}
.cg-cta h2 em{color:var(--gold);font-style:normal;}
.cg-cta p{color:rgba(255,255,255,0.6);font-size:1rem;margin-bottom:36px;position:relative;z-index:1;}
.cta-buttons{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;position:relative;z-index:1;}
.cg-footer{background:#060e1c;padding:40px 5%;text-align:center;}
.footer-logo{font-family:'Playfair Display',serif;font-size:1.4rem;color:white;font-weight:700;margin-bottom:12px;}
.footer-logo span{color:var(--gold);}
.footer-text{font-size:0.83rem;color:rgba(255,255,255,0.3);line-height:1.8;}
.reveal{opacity:0;transform:translateY(30px);transition:opacity 0.7s ease,transform 0.7s ease;}
.reveal.visible{opacity:1;transform:none;}
.reveal-delay-1{transition-delay:0.1s;}
.reveal-delay-2{transition-delay:0.2s;}
.reveal-delay-3{transition-delay:0.3s;}
.reveal-delay-4{transition-delay:0.4s;}
@media(max-width:1024px){
  .hero-visual{display:none;}
  .hero-content{max-width:100%;}
  .about-inner{grid-template-columns:1fr;}
  .features-grid{grid-template-columns:repeat(2,1fr);}
  .cg-steps{grid-template-columns:repeat(2,1fr);}
  .cg-steps::before{display:none;}
  .tech-grid{grid-template-columns:repeat(2,1fr);}
  .role-panel-active{grid-template-columns:1fr;}
}
@media(max-width:768px){
  .cg-nav{padding:16px 5%;}
  .cg-nav-links{display:none;position:fixed;top:70px;left:0;right:0;background:rgba(10,22,40,0.98);flex-direction:column;padding:20px;gap:16px;border-bottom:1px solid rgba(46,125,255,0.2);}
  .cg-nav-links.open{display:flex;}
  .cg-nav-toggle{display:flex;}
  .cg-hero{padding:100px 5% 140px;}
  .hero-stats{flex-wrap:wrap;gap:20px;justify-content:center;}
  .cg-about,.cg-features,.cg-roles,.cg-techstack,.cg-team,.cg-howitworks,.cg-cta{padding:60px 5%;}
  .features-grid{grid-template-columns:1fr;}
  .cg-steps{grid-template-columns:1fr 1fr;}
  .team-grid{grid-template-columns:1fr;}
  .tech-grid{grid-template-columns:1fr 1fr;}
}
@media(max-width:480px){
  .cg-steps{grid-template-columns:1fr;}
  .tech-grid{grid-template-columns:1fr;}
  .hero-buttons{flex-direction:column;}
  .btn-primary,.btn-secondary{justify-content:center;}
}
`