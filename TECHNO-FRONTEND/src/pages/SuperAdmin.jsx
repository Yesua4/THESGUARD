import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useToast } from '../context/ToastContext'

// ── Super Admin — read-only directory of registered schools ───────────────────
// This page is only accessible at /thesisguard-admin

export default function SuperAdmin() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [authed, setAuthed]   = useState(false)
  const [pin, setPin]         = useState('')
  const [pinError, setPinError] = useState('')
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch]   = useState('')

  // Simple PIN protection for demo — in production use proper auth
  const DEMO_PIN = '2026'

  const handlePin = e => {
    e.preventDefault()
    if (pin === DEMO_PIN) {
      setAuthed(true)
      loadSchools()
    } else {
      setPinError('Incorrect PIN.')
      setPin('')
    }
  }

  const loadSchools = async () => {
    setLoading(true)
    try {
      // Requires the browser's stored token to belong to a real admin
      // account -- the PIN above only gates this page's URL, it is not a
      // substitute for being logged in.
      const res = await api.get('/schools')
      setSchools(res.data)
    } catch {
      showToast('Error loading schools. Make sure you are logged in as admin.')
    } finally {
      setLoading(false)
    }
  }

  const filtered = schools.filter(s => {
    const q = search.toLowerCase()
    return !q || s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q)
  })

  // ── PIN Gate ──────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={S.page}>
        <div style={S.pinCard}>
          <div style={S.pinLogo}>
            <svg viewBox="0 0 24 24" width="32" height="32" fill="white">
              <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"/>
            </svg>
          </div>
          <div style={S.pinTitle}>ThesisGuard Admin Panel</div>
          <div style={S.pinSub}>Enter your access PIN to continue</div>
          {pinError && <div style={S.pinError}>{pinError}</div>}
          <form onSubmit={handlePin} style={{ width: '100%' }}>
            <input
              type="password" value={pin} onChange={e => setPin(e.target.value)}
              placeholder="Enter PIN" maxLength={8} autoFocus
              style={S.pinInput}
            />
            <button type="submit" style={S.pinBtn}>Access Panel →</button>
          </form>
          <button onClick={() => navigate('/')} style={S.pinBack}>← Back to ThesisGuard</button>
        </div>
      </div>
    )
  }

  // ── Main Panel ────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f7', fontFamily: "'Segoe UI', sans-serif" }}>

      {/* Top bar */}
      <div style={S.topbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={S.topbarLogo}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
              <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"/>
            </svg>
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: '700', fontSize: '14px' }}>ThesisGuard Admin</div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>School Directory</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={loadSchools} style={S.refreshBtn}>↻ Refresh</button>
          <button onClick={() => navigate('/')} style={S.backBtn}>← Back to Site</button>
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* Stats */}
        <div style={S.statsGrid}>
          <div style={S.statCard}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>🏫</div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#0a1f44' }}>{schools.length}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Schools</div>
          </div>
          <div style={S.statCard}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>👤</div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#0a1f44' }}>{schools.reduce((a, s) => a + (s.users_count || 0), 0)}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Users</div>
          </div>
        </div>

        {/* Search */}
        <div style={{ marginBottom: '16px' }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by school name or email..."
            style={S.filterInput}
          />
        </div>

        {/* Schools table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8', fontSize: '13px' }}>Loading schools...</div>
        ) : filtered.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            {schools.length === 0 ? 'No schools registered yet.' : 'No schools match your search.'}
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#0a1f44' }}>Registered Schools</div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{filtered.length} school{filtered.length !== 1 ? 's' : ''}</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['School Name', 'Email', 'Address', 'Users', 'Registered'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(school => (
                  <tr key={school.id} style={{ borderBottom: '1px solid #f8fafc' }}
                    onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: '600', color: '#0a1f44', marginBottom: '2px' }}>{school.name}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>/{school.slug}</div>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#64748b' }}>{school.email}</td>
                    <td style={{ padding: '14px 16px', color: '#64748b' }}>{school.address || '—'}</td>
                    <td style={{ padding: '14px 16px', color: '#64748b' }}>{school.users_count || 0}</td>
                    <td style={{ padding: '14px 16px', color: '#94a3b8', fontSize: '12px' }}>
                      {school.created_at ? new Date(school.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const S = {
  page: { minHeight: '100vh', background: '#0a1f44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI', sans-serif" },
  pinCard: { background: '#fff', borderRadius: '20px', padding: '40px', width: '100%', maxWidth: '380px', textAlign: 'center', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' },
  pinLogo: { width: '60px', height: '60px', borderRadius: '16px', background: 'linear-gradient(135deg,#0a1f44,#1040a0)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' },
  pinTitle: { fontSize: '18px', fontWeight: '800', color: '#0a1f44', marginBottom: '6px' },
  pinSub: { fontSize: '13px', color: '#94a3b8', marginBottom: '24px' },
  pinError: { background: '#fee2e2', color: '#dc2626', fontSize: '12px', padding: '8px 12px', borderRadius: '8px', marginBottom: '12px' },
  pinInput: { width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '12px', fontSize: '18px', textAlign: 'center', outline: 'none', marginBottom: '12px', letterSpacing: '6px', fontFamily: 'monospace' },
  pinBtn: { width: '100%', padding: '13px', background: 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', marginBottom: '10px' },
  pinBack: { background: 'none', border: 'none', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' },
  topbar: { background: 'linear-gradient(135deg,#0a1f44,#1040a0)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  topbarLogo: { width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  refreshBtn: { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '8px 16px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' },
  backBtn: { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '8px 16px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '12px', marginBottom: '20px', maxWidth: '400px' },
  statCard: { background: '#fff', borderRadius: '14px', border: '1px solid #e8ecf2', padding: '18px', textAlign: 'center', position: 'relative', overflow: 'hidden' },
  filterInput: { width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', outline: 'none', background: '#fff', fontFamily: 'inherit' },
}
