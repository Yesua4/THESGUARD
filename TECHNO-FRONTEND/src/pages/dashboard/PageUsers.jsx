import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import api from '../../api/axios'

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
  const [showAddUser, setShowAddUser] = useState(false)
  const [newUser, setNewUser]       = useState({ name:'', email:'', password:'', role:'student', student_id:'', section:'' })
  const [addingUser, setAddingUser] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importing, setImporting]   = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [bulkSection, setBulkSection]   = useState('')
  const [selectedIds, setSelectedIds]   = useState([])

  const load = () => {
    api.get('/users').then(res => setUsers(res.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

const createUser = async e => {
  e.preventDefault(); setAddingUser(true)
  try {
    await api.post('/users', newUser)
    setShowAddUser(false)
    setNewUser({ name:'', email:'', password:'', role:'student', student_id:'', section:'' })
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
        return `• ${msgs[0]}`
      }).join('\n')
      showToast('Please fix the following:\n' + messages, 'error', 8000)
    } else {
      showToast(err.response?.data?.message || 'Error creating user.')
    }
  } finally { setAddingUser(false) }
}

  const startEdit  = u => { setEditing(u.id); setEditForm({ name:u.name, email:u.email, role:u.role, student_id:u.student_id||'', section:u.section||'' }) }
  const cancelEdit = () => { setEditing(null); setEditForm({}) }
  const handleEdit = e => setEditForm({...editForm, [e.target.name]: e.target.value})

  const saveEdit = async id => {
    setSaving(true)
    try { await api.put(`/users/${id}`, editForm); setEditing(null); load() }
    catch { showToast('Error updating user.') }
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
  ? 'name,email,student_id,section,password,role\nJuan dela Cruz,juan@school.edu.ph,2023-00001,BSIT 3A,ThesisGuard2025!,student\n...'
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

  const visibleUsers  = user?.role === 'instructor' ? users.filter(u => u.role === 'student') : users
  const filteredUsers = visibleUsers.filter(u => {
    const q = search.toLowerCase()
    return (!q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.student_id?.toLowerCase().includes(q)) &&
           (!roleFilter || u.role === roleFilter)
  })

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
              <div className="dg-grid-2" style={{ display:'grid', gap:'12px' }}>
                {user?.role === 'admin' && (
                  <div>
                    <label style={labelStyle}>Role</label>
                    <select value={newUser.role} onChange={e => setNewUser({...newUser, role:e.target.value})} style={inputStyle}>
                      {['student','adviser','instructor','panelist','admin'].map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                    </select>
                  </div>
                )}
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
                <input value={newUser.section} onChange={e => setNewUser({...newUser, section:e.target.value})} style={inputStyle} placeholder="e.g. BSIT 3A" />
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
            <button onClick={() => { setNewUser({ name:'', email:'', password:'', role:'student', student_id:'', section:'' }); setShowAddUser(true) }}
              style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', border:'none', borderRadius:'8px', padding:'9px 16px', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>
              {user?.role === 'instructor' ? '+ Add Student' : '+ Add User'}
            </button>
            {['admin','instructor'].includes(user?.role) && (
              <button onClick={() => { setShowImport(true); setImportResult(null) }}
                style={{ background:'#fff', color:'#0a1f44', border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'9px 16px', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>
                ↑ Import CSV
              </button>
            )}
          </div>
        )}
      </div>

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
                  <div>• <strong>role</strong> — student, adviser, instructor, panelist (default: student)</div>
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
              <input value={bulkSection} onChange={e => setBulkSection(e.target.value)} placeholder="Enter section (e.g. BSIT 3A)" style={{ ...inputStyle, flex:1, minWidth:'180px', padding:'6px 10px' }} />
              <button onClick={bulkAssign} style={{ padding:'7px 14px', background:'linear-gradient(135deg,#1d4ed8,#1e40af)', color:'#fff', border:'none', borderRadius:'8px', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>Assign Section</button>
              <button onClick={() => setSelectedIds([])} style={{ padding:'7px 14px', background:'#fff', color:'#64748b', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'12px', cursor:'pointer' }}>Clear</button>
            </div>
          )}

          {/* Filters */}
          <div style={{ display:'flex', gap:'10px', marginBottom:'12px' }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, flex:1 }} placeholder="Search by name, email, or student ID..." />
            {user?.role === 'admin' && (
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ ...inputStyle, width:'auto' }}>
                <option value="">All roles</option>
                {['admin','instructor','adviser','student','panelist'].map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
              </select>
            )}
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
                            <select name="role" value={editForm.role} onChange={handleEdit} style={{ ...inputStyle, padding:'6px 10px' }}>
                              {['admin','instructor','adviser','student','panelist'].map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </td>
                        )}
                        <td style={{ padding:'8px 14px' }}><input name="email" value={editForm.email} onChange={handleEdit} style={{ ...inputStyle, padding:'6px 10px' }} /></td>
                        <td style={{ padding:'8px 14px' }}><input name="student_id" value={editForm.student_id} onChange={handleEdit} style={{ ...inputStyle, padding:'6px 10px' }} placeholder="e.g. 20-1234" /></td>
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
                            <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'700', textTransform:'capitalize', ...rolePill(u.role) }}>{u.role}</span>
                          </td>
                        )}
                        <td style={{ padding:'12px 14px', color:'#64748b' }}>{u.email}</td>
                        <td style={{ padding:'12px 14px', color:'#94a3b8' }}>{u.student_id || '—'}</td>
                      <td style={{ padding:'12px 14px', color:'#94a3b8' }}>{u.section || '—'}</td>
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
