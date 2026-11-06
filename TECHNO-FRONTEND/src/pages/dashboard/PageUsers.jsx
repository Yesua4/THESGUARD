import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import api from '../../api/axios'
import { ROLE_ORDER, userRoles } from '../../constants/roles'
import { SectionPicker, SectionField } from '../../components/dashboard/SectionPicker'
import { ImportClassListModal, RosterModal } from '../../components/dashboard/ClassRoster'
import { useSchoolStaffChannel } from '../../hooks/useSchoolStaffChannel'

// Student and admin accounts hold only that one role; the faculty roles
// (instructor, adviser, panelist) can be combined freely.
const EXCLUSIVE_ROLES = ['student', 'admin']

const toggleRole = (roles, role) => {
  if (roles.includes(role)) {
    const next = roles.filter(r => r !== role)
    return next.length ? next : roles   // always keep at least one
  }
  if (EXCLUSIVE_ROLES.includes(role)) return [role]
  return ROLE_ORDER.filter(r => r === role || (roles.includes(r) && !EXCLUSIVE_ROLES.includes(r)))
}

function RoleChecks({ roles, onChange, disabled, compact }) {
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap: compact ? '4px' : '6px' }}>
      {ROLE_ORDER.map(r => {
        const on = roles.includes(r)
        return (
          <label key={r} title={disabled ? 'You cannot change the roles on your own account.' : undefined}
            style={{
              display:'inline-flex', alignItems:'center', gap:'4px',
              fontSize: compact ? '11px' : '12px', fontWeight: on ? '700' : '500',
              padding: compact ? '3px 8px' : '5px 10px', borderRadius:'20px',
              border: `1.5px solid ${on ? '#1d4ed8' : '#e2e8f0'}`,
              background: on ? '#eff6ff' : '#fff', color: on ? '#1d4ed8' : '#64748b',
              cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
              textTransform:'capitalize', userSelect:'none',
            }}>
            <input type="checkbox" checked={on} disabled={disabled}
              onChange={() => onChange(toggleRole(roles, r))}
              style={{ margin:0, width:'12px', height:'12px' }} />
            {r}
          </label>
        )
      })}
    </div>
  )
}

// Names come as "Juan Dela Cruz", as "DELA CRUZ, JUAN SANTOS" (registrar /
// CSV format), or with separate first/last fields (self-registered).
function nameParts(u) {
  if (u.last_name || u.first_name) return { last: u.last_name || '', first: u.first_name || '' }
  const name = (u.name || '').trim()
  if (name.includes(',')) {
    const [last, rest = ''] = name.split(',')
    return { last: last.trim(), first: rest.trim().split(/\s+/)[0] || '' }
  }
  const words = name.split(/\s+/)
  return { last: words.length > 1 ? words[words.length - 1] : name, first: words[0] || '' }
}

const SORTS = {
  last:    { label: 'Last name',   asc: 'A → Z', desc: 'Z → A' },
  first:   { label: 'First name',  asc: 'A → Z', desc: 'Z → A' },
  section: { label: 'Section',     asc: 'A → Z', desc: 'Z → A' },
  sid:     { label: 'Student ID',  asc: 'Lowest first', desc: 'Highest first' },
  added:   { label: 'Date added',  asc: 'Oldest first', desc: 'Newest first' },
}

function compareUsers(a, b, key) {
  const text = (x, y) => (x || '').localeCompare(y || '', undefined, { sensitivity: 'base', numeric: true })
  const byLast = text(nameParts(a).last, nameParts(b).last) || text(nameParts(a).first, nameParts(b).first)
  switch (key) {
    case 'first':   return text(nameParts(a).first, nameParts(b).first) || byLast
    // Accounts without a section/ID go last; ties fall back to last name.
    case 'section': return (!a.section - !b.section) || text(a.section, b.section) || byLast
    case 'sid':     return (!a.student_id - !b.student_id) || text(a.student_id, b.student_id) || byLast
    case 'added':   return (new Date(a.created_at || 0) - new Date(b.created_at || 0)) || (a.id - b.id)
    default:        return byLast
  }
}

function PageUsers() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [editingId, setEditing]     = useState(null)
  const [editForm, setEditForm]     = useState({})
  const [saving, setSaving]         = useState(false)
  const [search, setSearch]         = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  // Sorting -- remembered between visits.
  const [sortKey, setSortKey] = useState(() => localStorage.getItem('tg_users_sort') || 'last')
  const [sortDir, setSortDir] = useState(() => localStorage.getItem('tg_users_sort_dir') || 'asc')
  useEffect(() => { localStorage.setItem('tg_users_sort', sortKey); localStorage.setItem('tg_users_sort_dir', sortDir) }, [sortKey, sortDir])
  const [showAddUser, setShowAddUser] = useState(false)
  const [newUser, setNewUser]       = useState({ name:'', email:'', password:'', roles:['student'], student_id:'', section:'', handled_sections:[] })
  const [addingUser, setAddingUser] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importing, setImporting]   = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [bulkSection, setBulkSection]   = useState('')
  const [selectedIds, setSelectedIds]   = useState([])
  const [showClassList, setShowClassList] = useState(false)
  const [showRoster, setShowRoster]       = useState(false)

  const load = () => {
    api.get('/users').then(res => setUsers(res.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Live: another admin/instructor edits an account, a class list is
  // imported, or a student signs up and gets enrolled.
  useSchoolStaffChannel(user?.school_id, ['admin', 'instructor'].includes(user?.role), load)

const createUser = async e => {
  e.preventDefault(); setAddingUser(true)
  try {
    await api.post('/users', newUser)
    setShowAddUser(false)
    setNewUser({ name:'', email:'', password:'', roles:['student'], student_id:'', section:'', handled_sections:[] })
    load()
  } catch (err) {
    // ── Validation errors ──────────────────────────────────
    const errors = err.response?.data?.errors
    if (errors) {
      const messages = Object.entries(errors).map(([field, msgs]) => {
        if (field === 'email')      return '• Email address is already registered.'
        if (field === 'name')       return '• Name is required.'
        if (field === 'password')   return '• Password must be at least 12 characters.'
        if (field === 'student_id') return '• Student ID is already registered.'
        if (field === 'roles')      return `• ${msgs[0]}`
        return `• ${msgs[0]}`
      }).join('\n')
      showToast('Please fix the following:\n' + messages, 'error', 8000)
    } else {
      showToast(err.response?.data?.message || 'Error creating user.')
    }
  } finally { setAddingUser(false) }
}

  const startEdit  = u => { setEditing(u.id); setEditForm({ name:u.name, email:u.email, roles:userRoles(u), student_id:u.student_id||'', section:u.section||'', handled_sections:u.handled_sections||[] }) }
  const cancelEdit = () => { setEditing(null); setEditForm({}) }
  const handleEdit = e => setEditForm({...editForm, [e.target.name]: e.target.value})

  const saveEdit = async id => {
    setSaving(true)
    // Only admins manage roles, and never their own.
    const payload = { ...editForm }
    if (user?.role !== 'admin' || id === user?.id) delete payload.roles
    if (user?.role !== 'admin') delete payload.handled_sections
    try { await api.put(`/users/${id}`, payload); setEditing(null); load() }
    catch (err) { showToast(err.response?.data?.message || 'Error updating user.') }
    finally { setSaving(false) }
  }

  const deleteUser = async (id, name) => {
    if (!confirm(`Delete account for ${name}?`)) return
    try { await api.delete(`/users/${id}`); load() }
    catch { showToast('Error deleting user.') }
  }

  const importCSV = async e => {
    e.preventDefault()
    if (!importFile) return
    setImporting(true)
    const fd = new FormData()
    fd.append('file', importFile)
    try {
      const res = await api.post('/users/import', fd, { headers:{ 'Content-Type':'multipart/form-data' } })
      setImportResult(res.data)
      setImportFile(null)
      load()
    } catch (err) {
      setImportResult({ message: err.response?.data?.message || 'Import failed.', created:0, skipped:[] })
    } finally { setImporting(false) }
  }

  const downloadTemplate = () => {
  const csv = user?.role === 'admin'
  ? 'name,email,student_id,section,password,role\nJuan dela Cruz,juan@school.edu.ph,2023-00001,BSIT 3A,ThesisGuard2025!,student\nMaria Santos,maria@school.edu.ph,,,ThesisGuard2025!,instructor|adviser|panelist\n...'
  : 'name,email,student_id,section,password\nJuan dela Cruz,juan@school.edu.ph,2023-00001,BSIT 3A,ThesisGuard2025!\n...'
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'students_import_template.csv'
  })
  a.click()
  URL.revokeObjectURL(a.href)
  }

  const bulkAssign = async () => {
    if (!bulkSection || selectedIds.length === 0) { showToast('Select students and enter a section first.'); return }
    try {
      await Promise.all(selectedIds.map(id => api.put(`/users/${id}`, { section: bulkSection })))
      setSelectedIds([]); setBulkSection(''); load()
    } catch { showToast('Error assigning section.') }
  }

  const toggleSelect = id => setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  // Every section already used in the school, offered as quick picks when
  // the admin assigns an instructor's sections.
  const knownSections = [...new Set(users.flatMap(u => [u.section, ...(u.handled_sections || [])]).filter(Boolean))]
  const handlesSections = u => userRoles(u).includes('instructor')

  const visibleUsers  = user?.role === 'instructor' ? users.filter(u => userRoles(u).includes('student')) : users
  const filteredUsers = visibleUsers.filter(u => {
    const q = search.toLowerCase()
    return (!q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.student_id?.toLowerCase().includes(q) || u.section?.toLowerCase().includes(q)) &&
           (!roleFilter || userRoles(u).includes(roleFilter))
  }).sort((a, b) => (sortDir === 'desc' ? -1 : 1) * compareUsers(a, b, sortKey))

  const rolePill = role => ({
    admin:      { background:'#fee2e2', color:'#9f1239' },
    instructor: { background:'#dbeafe', color:'#1e40af' },
    adviser:    { background:'#d1fae5', color:'#065f46' },
    student:    { background:'#fef3c7', color:'#92400e' },
    panelist:   { background:'#ede9fe', color:'#6d28d9' },
  }[role] || { background:'#f1f5f9', color:'#475569' })

  const inputStyle = { border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', outline:'none', background:'#f8fafc', fontFamily:'inherit', width:'100%', boxSizing:'border-box' }
  const labelStyle = { fontSize:'11px', fontWeight:'700', color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:'5px' }

  return (
    <div>
      {/* Add user modal */}
      {showAddUser && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,31,68,0.4)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:'min(480px, 92vw)', maxHeight:'90vh', overflowY:'auto', background:'#fff', borderRadius:'16px', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'18px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:'14px', fontWeight:'700', color:'#fff' }}>
                {user?.role === 'instructor' ? 'Add Student Account' : 'Create New Account'}
              </div>
              <button onClick={() => setShowAddUser(false)} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:'26px', height:'26px', borderRadius:'6px', cursor:'pointer', fontSize:'14px' }}>✕</button>
            </div>
            <form onSubmit={createUser} style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'12px' }}>
              <div>
                <label style={labelStyle}>Full Name</label>
                <input value={newUser.name} onChange={e => setNewUser({...newUser, name:e.target.value})} required style={inputStyle} placeholder="e.g. Juan dela Cruz" />
              </div>
              <div>
                <label style={labelStyle}>Email Address</label>
                <input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email:e.target.value})} required style={inputStyle} placeholder="e.g. juan@dnsc.edu.ph" />
              </div>
              {user?.role === 'admin' && (
                <div>
                  <label style={labelStyle}>Roles <span style={{ color:'#cbd5e1', textTransform:'none', fontWeight:'400' }}>(faculty can have several)</span></label>
                  <RoleChecks roles={newUser.roles} onChange={roles => setNewUser({...newUser, roles})} />
                </div>
              )}
              {user?.role === 'admin' && newUser.roles.includes('instructor') && (
                <div>
                  <label style={labelStyle}>Handles Sections <span style={{ color:'#cbd5e1', textTransform:'none', fontWeight:'400' }}>(the instructor only sees these)</span></label>
                  <SectionPicker value={newUser.handled_sections} suggestions={knownSections}
                    onChange={handled_sections => setNewUser({...newUser, handled_sections})} />
                </div>
              )}
              <div>
                <div>
                  <label style={labelStyle}>Student ID <span style={{ color:'#cbd5e1', textTransform:'none', fontWeight:'400' }}>(optional)</span></label>
                  <input value={newUser.student_id} onChange={e => setNewUser({...newUser, student_id:e.target.value})} style={inputStyle} placeholder="e.g. 22-1234" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Password</label>
                <input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password:e.target.value})} required style={inputStyle} placeholder="Minimum 12 characters" />
              </div>
              <div>
                <label style={labelStyle}>Course / Section <span style={{ color:'#cbd5e1', textTransform:'none', fontWeight:'400' }}>(optional)</span></label>
                <SectionField user={user} value={newUser.section} onChange={section => setNewUser({...newUser, section})} style={inputStyle} />
              </div>
              <div style={{ display:'flex', gap:'10px', paddingTop:'4px' }}>
                <button type="submit" disabled={addingUser} style={{ flex:1, padding:'10px', background: addingUser?'#cbd5e1':'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor:addingUser?'not-allowed':'pointer' }}>
                  {addingUser ? 'Creating...' : 'Create Account'}
                </button>
                <button type="button" onClick={() => setShowAddUser(false)} style={{ flex:1, padding:'10px', background:'#f8fafc', color:'#475569', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'13px', cursor:'pointer' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44' }}>
          {user?.role === 'instructor' ? 'Student Accounts' : 'User Accounts'}
        </div>
        {['admin','instructor'].includes(user?.role) && (
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={() => { setNewUser({ name:'', email:'', password:'', roles:['student'], student_id:'', section:'', handled_sections:[] }); setShowAddUser(true) }}
              style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', border:'none', borderRadius:'8px', padding:'9px 16px', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>
              {user?.role === 'instructor' ? '+ Add Student' : '+ Add User'}
            </button>
            <button onClick={() => setShowClassList(true)}
              title="Enroll students from the registrar's class list, matched by Student No."
              style={{ background:'linear-gradient(135deg,#059669,#047857)', color:'#fff', border:'none', borderRadius:'8px', padding:'9px 16px', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>
              ↑ Import Class List
            </button>
            <button onClick={() => setShowRoster(true)}
              style={{ background:'#fff', color:'#0a1f44', border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'9px 16px', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>
              Class Roster
            </button>
            <button onClick={() => { setShowImport(true); setImportResult(null) }}
              title="Create accounts from a CSV that includes emails"
              style={{ background:'#fff', color:'#0a1f44', border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'9px 16px', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>
              ↑ Import CSV
            </button>
          </div>
        )}
      </div>

{showClassList && <ImportClassListModal user={user} onClose={() => setShowClassList(false)} onDone={load} />}
{showRoster && <RosterModal onClose={() => setShowRoster(false)} />}

{/* CSV Import Modal */}
{showImport && (
  <div style={{ position:'fixed', inset:0, background:'rgba(10,31,68,0.4)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center' }}>
    <div style={{ width:'min(480px, 92vw)', maxHeight:'90vh', overflowY:'auto', background:'#fff', borderRadius:'16px', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
      <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'18px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:'14px', fontWeight:'700', color:'#fff' }}>{user?.role === 'instructor' ? 'Import Students from CSV' : 'Import Users from CSV'}</div>
        <button onClick={() => { setShowImport(false); setImportResult(null); setImportFile(null) }} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:'26px', height:'26px', borderRadius:'6px', cursor:'pointer', fontSize:'14px' }}>✕</button>
      </div>
      <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'14px' }}>
        {!importResult ? (
          <>
            {/* Format info box */}
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'10px', padding:'12px 14px' }}>
              <div style={{ fontSize:'12px', fontWeight:'700', color:'#065f46', marginBottom:'6px' }}>📋 CSV Format Required</div>
              <div style={{ fontSize:'11px', color:'#047857', lineHeight:'1.7' }}>
                Columns: <strong>name, email, student_id, section, password{user?.role === 'admin' ? ', role' : ''}</strong><br/>
                • <strong>name</strong> and <strong>email</strong> are required per row<br/>
                • <strong>student_id</strong> — optional<br/>
                • <strong>section</strong> — e.g. BSIT 3A (optional)<br/>
                • <strong>password</strong> — leave blank to use default: <code style={{ fontSize:'11px' }}>ThesisGuard2025!</code>
                
                {user?.role === 'admin' && (
                  <div>• <strong>role</strong> — student, adviser, instructor, panelist (default: student). For several roles separate with <code style={{ fontSize:'11px' }}>|</code>, e.g. <code style={{ fontSize:'11px' }}>instructor|adviser|panelist</code></div>
                )}
              </div>
              <button
                onClick={downloadTemplate}
                style={{
                  marginTop:'10px', fontSize:'11px', fontWeight:'700',
                  color:'#059669', background:'#fff',
                  border:'1px solid #a7f3d0', borderRadius:'6px',
                  padding:'5px 12px', cursor:'pointer',
                  display:'flex', alignItems:'center', gap:'5px',
                }}
              >
                ↓ Download Sample Template
              </button>
            </div>

            {/* Drag and drop file picker */}
            <div>
              <label style={{ fontSize:'11px', fontWeight:'700', color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:'6px' }}>Select CSV File</label>
              <div
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='#1d4ed8'; e.currentTarget.style.background='#eff6ff' }}
                onDragLeave={e => { e.currentTarget.style.borderColor='#e2e8f0'; e.currentTarget.style.background='#f8fafc' }}
                onDrop={e => {
                  e.preventDefault()
                  e.currentTarget.style.borderColor='#e2e8f0'
                  e.currentTarget.style.background='#f8fafc'
                  const file = e.dataTransfer.files[0]
                  if (file && (file.name.endsWith('.csv') || file.name.endsWith('.txt'))) setImportFile(file)
                  else showToast('Please drop a .csv file only.')
                }}
                style={{ border:'2px dashed #e2e8f0', borderRadius:'10px', padding:'28px 20px', textAlign:'center', background:'#f8fafc', transition:'all 0.15s', cursor:'pointer' }}
              >
                {importFile ? (
                  <div>
                    <div style={{ fontSize:'28px', marginBottom:'8px' }}>📄</div>
                    <div style={{ fontSize:'13px', fontWeight:'600', color:'#059669', marginBottom:'4px' }}>{importFile.name}</div>
                    <div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'10px' }}>{(importFile.size / 1024).toFixed(1)} KB</div>
                    <button type="button" onClick={() => setImportFile(null)} style={{ fontSize:'11px', color:'#dc2626', background:'none', border:'1px solid #fca5a5', borderRadius:'6px', padding:'4px 10px', cursor:'pointer', fontWeight:'600' }}>Remove</button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize:'32px', marginBottom:'8px' }}>📂</div>
                    <div style={{ fontSize:'13px', color:'#64748b', fontWeight:'500', marginBottom:'4px' }}>Drag & drop your CSV file here</div>
                    <div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'12px' }}>or</div>
                    <label style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', fontSize:'12px', padding:'8px 18px', borderRadius:'8px', cursor:'pointer', fontWeight:'600' }}>
                      Browse File
                      <input type="file" accept=".csv,.txt" style={{ display:'none' }} onChange={e => { if (e.target.files[0]) setImportFile(e.target.files[0]) }} />
                    </label>
                    <div style={{ fontSize:'11px', color:'#94a3b8', marginTop:'10px' }}>Only .csv files accepted</div>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display:'flex', gap:'10px' }}>
              <button
                onClick={importCSV}
                disabled={importing || !importFile}
                style={{ flex:1, padding:'10px', background: importing || !importFile ? '#cbd5e1' : 'linear-gradient(135deg,#059669,#047857)', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor: importing || !importFile ? 'not-allowed' : 'pointer' }}
              >
                {importing ? 'Importing...' : (user?.role === 'instructor' ? '📂 Import Students' : '📂 Import Users')}
              </button>
              <button type="button" onClick={() => { setShowImport(false); setImportResult(null); setImportFile(null) }} style={{ flex:1, padding:'10px', background:'#f8fafc', color:'#475569', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'13px', cursor:'pointer' }}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ background: importResult.created > 0 ? '#d1fae5' : '#fef3c7', borderRadius:'10px', padding:'14px', textAlign:'center' }}>
              <div style={{ fontSize:'24px', fontWeight:'800', color: importResult.created > 0 ? '#065f46' : '#92400e' }}>{importResult.created}</div>
              <div style={{ fontSize:'13px', color:'#475569' }}>{importResult.message}</div>
            </div>
            {importResult.skipped?.length > 0 && (
              <div style={{ background:'#fef3c7', borderRadius:'10px', padding:'12px', fontSize:'12px', color:'#92400e', maxHeight:'140px', overflowY:'auto' }}>
                <div style={{ fontWeight:'700', marginBottom:'4px' }}>Skipped rows:</div>
                {importResult.skipped.map((s, i) => <div key={i}>• {s}</div>)}
              </div>
            )}
            <button onClick={() => { setShowImport(false); setImportResult(null); setImportFile(null) }} style={{ width:'100%', padding:'10px', background:'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor:'pointer' }}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  </div>
)}

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'13px' }}>Loading users...</div>
      ) : (
        <div>
          {/* Bulk section assign bar — shows when students are selected */}
          {selectedIds.length > 0 && (
            <div style={{ background:'#eff6ff', border:'1.5px solid #bfdbfe', borderRadius:'10px', padding:'10px 14px', marginBottom:'12px', display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
              <span style={{ fontSize:'12px', fontWeight:'700', color:'#1d4ed8' }}>{selectedIds.length} student(s) selected</span>
              <SectionField user={user} value={bulkSection} onChange={setBulkSection} placeholder="Enter section (e.g. BSIT 3A)" style={{ ...inputStyle, flex:1, minWidth:'180px', padding:'6px 10px' }} />
              <button onClick={bulkAssign} style={{ padding:'7px 14px', background:'linear-gradient(135deg,#1d4ed8,#1e40af)', color:'#fff', border:'none', borderRadius:'8px', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>Assign Section</button>
              <button onClick={() => setSelectedIds([])} style={{ padding:'7px 14px', background:'#fff', color:'#64748b', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'12px', cursor:'pointer' }}>Clear</button>
            </div>
          )}

          {/* Filters */}
          <div style={{ display:'flex', gap:'10px', marginBottom:'12px', flexWrap:'wrap', alignItems:'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, flex:1, minWidth:'220px' }} placeholder="Search by name, email, student ID, or section..." />
            {user?.role === 'admin' && (
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ ...inputStyle, width:'auto' }}>
                <option value="">All roles</option>
                {['admin','instructor','adviser','student','panelist'].map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
              </select>
            )}
            <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#64748b', whiteSpace:'nowrap' }}>
              Sort by
              <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={{ ...inputStyle, width:'auto' }} aria-label="Sort by">
                {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              title="Switch the order" aria-label={`Order: ${SORTS[sortKey][sortDir]}. Click to switch.`}
              style={{ ...inputStyle, width:'auto', whiteSpace:'nowrap', cursor:'pointer', fontWeight:600, color:'#1d4ed8' }}>
              {sortDir === 'asc' ? '↑' : '↓'} {SORTS[sortKey][sortDir]}
            </button>
          </div>

          <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  {['Name', ...(user?.role==='admin'?['Role']:[]), 'Email', 'Student ID', 'Section', 'Action'].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'10px 14px', fontSize:'10px', fontWeight:'700', color:'#94a3b8', letterSpacing:'0.08em', textTransform:'uppercase', borderBottom:'1px solid #f1f5f9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id} style={{ borderBottom:'1px solid #f8fafc' }}
                    onMouseOver={e => e.currentTarget.style.background='#f8fafc'}
                    onMouseOut={e => e.currentTarget.style.background='transparent'}>
                    {editingId === u.id ? (
                      <>
                        <td style={{ padding:'8px 14px' }}><input name="name" value={editForm.name} onChange={handleEdit} style={{ ...inputStyle, padding:'6px 10px' }} /></td>
                        {user?.role === 'admin' && (
                          <td style={{ padding:'8px 14px' }}>
                            <RoleChecks compact roles={editForm.roles || []} disabled={u.id === user?.id}
                              onChange={roles => setEditForm({ ...editForm, roles })} />
                          </td>
                        )}
                        <td style={{ padding:'8px 14px' }}><input name="email" value={editForm.email} onChange={handleEdit} style={{ ...inputStyle, padding:'6px 10px' }} /></td>
                        <td style={{ padding:'8px 14px' }}><input name="student_id" value={editForm.student_id} onChange={handleEdit} style={{ ...inputStyle, padding:'6px 10px' }} placeholder="e.g. 20-1234" /></td>
                        <td style={{ padding:'8px 14px' }}>
                          {user?.role === 'admin' && (editForm.roles || []).includes('instructor') ? (
                            <SectionPicker compact value={editForm.handled_sections} suggestions={knownSections}
                              onChange={handled_sections => setEditForm({ ...editForm, handled_sections })} />
                          ) : (
                            <SectionField user={user} value={editForm.section} onChange={section => setEditForm({ ...editForm, section })} style={{ ...inputStyle, padding:'6px 10px' }} placeholder="e.g. BSIT 4A" />
                          )}
                        </td>
                        <td style={{ padding:'8px 14px' }}>
                          <div style={{ display:'flex', gap:'6px' }}>
                            <button onClick={() => saveEdit(u.id)} disabled={saving} style={{ fontSize:'11px', padding:'5px 12px', borderRadius:'6px', border:'none', background:'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', cursor:'pointer', fontWeight:'700' }}>{saving?'Saving...':'Save'}</button>
                            <button onClick={cancelEdit} style={{ fontSize:'11px', padding:'5px 12px', borderRadius:'6px', border:'1.5px solid #e2e8f0', background:'#fff', cursor:'pointer', color:'#64748b' }}>Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding:'12px 14px', fontWeight:'600', color:'#0a1f44' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                            <div style={{ width:'28px', height:'28px', borderRadius:'50%', fontSize:'10px', fontWeight:'700', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, ...rolePill(u.role) }}>
                              {u.name?.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase()}
                            </div>
                            {u.name}
                          </div>
                        </td>
                        {user?.role === 'admin' && (
                          <td style={{ padding:'12px 14px' }}>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
                              {userRoles(u).map(r => (
                                <span key={r} title={userRoles(u).length > 1 && r === u.role ? 'Currently active role' : undefined}
                                  style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'700', textTransform:'capitalize', ...rolePill(r) }}>
                                  {r}
                                </span>
                              ))}
                            </div>
                          </td>
                        )}
                        <td style={{ padding:'12px 14px', color:'#64748b' }}>{u.email}</td>
                        <td style={{ padding:'12px 14px', color:'#94a3b8' }}>{u.student_id || '—'}</td>
                      <td style={{ padding:'12px 14px', color:'#94a3b8' }}>
                        {handlesSections(u) && u.handled_sections?.length ? (
                          <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }} title="Sections this instructor handles">
                            {u.handled_sections.map(s => (
                              <span key={s} style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', fontWeight:'700', background:'#dbeafe', color:'#1e40af' }}>{s}</span>
                            ))}
                          </div>
                        ) : (u.section || '—')}
                      </td>
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', gap:'6px' }}>
                          <button onClick={() => startEdit(u)}
    style={{ fontSize:'11px', padding:'5px 12px', borderRadius:'6px', border:'1.5px solid #e2e8f0', background:'#fff', cursor:'pointer', color:'#1d4ed8', fontWeight:'600' }}>Edit</button>
                            <button onClick={() => deleteUser(u.id, u.name)} style={{ fontSize:'11px', padding:'5px 12px', borderRadius:'6px', border:'1.5px solid #fecaca', background:'#fff', cursor:'pointer', color:'#dc2626', fontWeight:'600' }}>Delete</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default PageUsers
