import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { useToast } from '../../context/ToastContext'

const panelLabelStyle = { fontSize: '10px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }
const inputStyle = { border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', outline: 'none', background: '#f8fafc', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }

function ProjectTasks({ project, user, canAssign }) {
  const { showToast } = useToast()
  const [tasks, setTasks]     = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', assigned_to: '', due_date: '' })
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    api.get(`/projects/${project.id}/tasks`).then(res => setTasks(res.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [project.id])

  const addTask = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await api.post('/tasks', { project_id: project.id, ...form, assigned_to: form.assigned_to || null, due_date: form.due_date || null })
      setForm({ title: '', assigned_to: '', due_date: '' }); setShowForm(false); load()
    } catch { showToast('Error creating task.') }
    finally { setSaving(false) }
  }

  const toggle = async (task) => {
    try { await api.put(`/tasks/${task.id}`, { is_completed: !task.is_completed }); load() }
    catch { showToast('Error updating task.') }
  }

  const remove = async (id) => {
    if (!confirm('Delete this task?')) return
    try { await api.delete(`/tasks/${id}`); load() }
    catch { showToast('Error deleting task.') }
  }

  const members = project.members?.map(m => m.user).filter(Boolean) || []

  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid #f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={panelLabelStyle}>Tasks</div>
        {canAssign && (
          <button onClick={() => setShowForm(!showForm)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: 'none', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontWeight: '600' }}>
            {showForm ? 'Cancel' : '+ Assign Task'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={addTask} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Task title..." required style={inputStyle} />
          <div className="dg-grid-2" style={{ display: 'grid', gap: '8px' }}>
            <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} style={inputStyle}>
              <option value="">Unassigned</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} style={inputStyle} />
          </div>
          <button type="submit" disabled={saving} style={{ padding: '8px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
            {saving ? 'Saving...' : 'Create Task'}
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ fontSize: '12px', color: '#94a3b8' }}>Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#94a3b8' }}>No tasks assigned yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {tasks.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px', borderRadius: '8px', background: t.is_completed ? '#f0fdf4' : '#fff', border: '1px solid #f1f5f9' }}>
              <input type="checkbox" checked={t.is_completed} onChange={() => toggle(t)} style={{ marginTop: '3px', cursor: 'pointer' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '500', color: t.is_completed ? '#65a380' : '#0a1f44', textDecoration: t.is_completed ? 'line-through' : 'none' }}>{t.title}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                  {t.assignee?.name || 'Unassigned'}{t.due_date ? ` · Due ${t.due_date}` : ''}
                </div>
              </div>
              {canAssign && (
                <button onClick={() => remove(t.id)} style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '13px' }}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ProjectTasks
