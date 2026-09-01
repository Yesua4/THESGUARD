import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { useToast } from '../../context/ToastContext'

function PageSettings() {
  const { showToast } = useToast()
  const [panelists, setPanelists] = useState([])
  const [rooms, setRooms]         = useState([])
  const [rForm, setRForm]         = useState({ room_name:'', building:'', capacity:'' })
  const [savingR, setSavingR]     = useState(false)
  const [editingR, setEditingR]   = useState(null)

  const loadAll = () => {
    api.get('/users?role=panelist').then(res => setPanelists(res.data))
    api.get('/rooms').then(res => setRooms(res.data))
  }

  useEffect(() => { loadAll() }, [])

  const submitRoom = async e => {
    e.preventDefault(); setSavingR(true)
    try {
      editingR ? await api.put(`/rooms/${editingR}`, rForm) : await api.post('/rooms', rForm)
      setEditingR(null); setRForm({ room_name:'', building:'', capacity:'' }); loadAll()
    } catch { showToast('Error saving room.') }
    finally { setSavingR(false) }
  }

  const deleteR = async id => { if (!confirm('Delete this room?'))     return; await api.delete(`/rooms/${id}`); loadAll() }
  const editR   = r => { setEditingR(r.id); setRForm({ room_name:r.room_name, building:r.building||'', capacity:r.capacity||'' }) }

  const inputStyle = { border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', outline:'none', background:'#f8fafc', fontFamily:'inherit', width:'100%', boxSizing:'border-box' }
  const labelStyle = { fontSize:'11px', fontWeight:'700', color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:'5px' }

  const Section = ({ title, count, children }) => (
    <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden', marginBottom:'10px' }}>
      <div style={{ background:'#f8fafc', padding:'12px 16px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', gap:'8px' }}>
        <span style={{ fontSize:'13px', fontWeight:'700', color:'#0a1f44' }}>{title}</span>
        <span style={{ fontSize:'11px', background:'#dbeafe', color:'#1e40af', padding:'2px 8px', borderRadius:'20px', fontWeight:'700' }}>{count}</span>
      </div>
      {children}
    </div>
  )

  return (
    <div>
      <div style={{ fontSize:'18px', fontWeight:'700', color:'#0a1f44', marginBottom:'16px' }}>Rooms & Panelists</div>
      <div className="dg-grid-2" style={{ display:'grid', gap:'14px' }}>

        {/* Panelists */}
        <div>
          <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'12px', padding:'12px 16px', marginBottom:'10px', fontSize:'12px', color:'#92400e' }}>
            Panelists are regular accounts with the <strong>panelist</strong> role. Add or remove them from <strong>User Management</strong> — this list is read-only.
          </div>

          <Section title="Panelists List" count={panelists.length}>
            {panelists.length === 0 ? (
              <div style={{ padding:'24px', textAlign:'center', color:'#94a3b8', fontSize:'13px' }}>No panelist accounts yet.</div>
            ) : panelists.map(p => (
              <div key={p.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 16px', borderBottom:'1px solid #f8fafc' }}
                onMouseOver={e => e.currentTarget.style.background='#f8fafc'}
                onMouseOut={e => e.currentTarget.style.background='transparent'}>
                <div style={{ width:'34px', height:'34px', borderRadius:'50%', background:'#ede9fe', color:'#6d28d9', fontSize:'11px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700', flexShrink:0 }}>
                  {p.name.split(' ').map(x=>x[0]).join('').slice(0,2)}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'13px', fontWeight:'600', color:'#0a1f44' }}>{p.name}</div>
                  <div style={{ fontSize:'11px', color:'#94a3b8' }}>{p.email || '—'}</div>
                </div>
              </div>
            ))}
          </Section>
        </div>

        {/* Rooms */}
        <div>
          <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e8ecf2', overflow:'hidden', marginBottom:'10px' }}>
            <div style={{ background:'linear-gradient(135deg,#0a1f44,#1040a0)', padding:'14px 18px' }}>
              <div style={{ fontSize:'13px', fontWeight:'700', color:'#fff' }}>{editingR ? 'Edit Room' : 'Add Room'}</div>
            </div>
            <form onSubmit={submitRoom} style={{ padding:'16px', display:'flex', flexDirection:'column', gap:'10px' }}>
              <div><label style={labelStyle}>Room Name</label><input value={rForm.room_name} onChange={e => setRForm({...rForm, room_name:e.target.value})} style={inputStyle} placeholder="e.g. ICT Lab 2" required /></div>
              <div><label style={labelStyle}>Building <span style={{ color:'#cbd5e1', textTransform:'none', fontWeight:'400' }}>(optional)</span></label><input value={rForm.building} onChange={e => setRForm({...rForm, building:e.target.value})} style={inputStyle} placeholder="e.g. ICT Building" /></div>
              <div><label style={labelStyle}>Capacity <span style={{ color:'#cbd5e1', textTransform:'none', fontWeight:'400' }}>(optional)</span></label><input type="number" value={rForm.capacity} onChange={e => setRForm({...rForm, capacity:e.target.value})} style={inputStyle} placeholder="e.g. 30" /></div>
              <div style={{ display:'flex', gap:'8px' }}>
                <button type="submit" disabled={savingR} style={{ flex:1, padding:'9px', borderRadius:'8px', border:'none', background:savingR?'#cbd5e1':'linear-gradient(135deg,#0a1f44,#1040a0)', color:'#fff', fontSize:'13px', fontWeight:'700', cursor:savingR?'not-allowed':'pointer' }}>
                  {savingR ? 'Saving...' : editingR ? 'Update' : 'Add Room'}
                </button>
                {editingR && <button type="button" onClick={() => { setEditingR(null); setRForm({ room_name:'', building:'', capacity:'' }) }} style={{ padding:'9px 14px', borderRadius:'8px', border:'1.5px solid #e2e8f0', background:'#fff', fontSize:'13px', cursor:'pointer', color:'#64748b' }}>Cancel</button>}
              </div>
            </form>
          </div>

          <Section title="Rooms List" count={rooms.length}>
            {rooms.length === 0 ? (
              <div style={{ padding:'24px', textAlign:'center', color:'#94a3b8', fontSize:'13px' }}>No rooms added yet.</div>
            ) : rooms.map(r => (
              <div key={r.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 16px', borderBottom:'1px solid #f8fafc' }}
                onMouseOver={e => e.currentTarget.style.background='#f8fafc'}
                onMouseOut={e => e.currentTarget.style.background='transparent'}>
                <div style={{ width:'34px', height:'34px', borderRadius:'8px', background:'#dbeafe', color:'#1d4ed8', fontSize:'11px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700', flexShrink:0 }}>RM</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'13px', fontWeight:'600', color:'#0a1f44' }}>{r.room_name}</div>
                  <div style={{ fontSize:'11px', color:'#94a3b8' }}>{r.building || '—'}{r.capacity ? ` · ${r.capacity} seats` : ''}</div>
                </div>
                <div style={{ display:'flex', gap:'8px' }}>
                  <button onClick={() => editR(r)} style={{ fontSize:'11px', color:'#1d4ed8', background:'none', border:'none', cursor:'pointer', fontWeight:'600' }}>Edit</button>
                  <button onClick={() => deleteR(r.id)} style={{ fontSize:'11px', color:'#dc2626', background:'none', border:'none', cursor:'pointer', fontWeight:'600' }}>Delete</button>
                </div>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </div>
  )
}

export default PageSettings
