import { useState } from 'react'

// Sections are compared trimmed, upper-cased, single-spaced (same as the API).
const normalizeSection = s => (s || '').trim().replace(/\s+/g, ' ').toUpperCase()

/**
 * Multi-select for the sections an instructor handles (admin only).
 * Shows the chosen sections as removable chips, quick-add chips for sections
 * that already exist in the school, and a box to type a new one.
 */
export function SectionPicker({ value, onChange, suggestions = [], compact }) {
  const [draft, setDraft] = useState('')
  const chosen = value || []
  const add = raw => {
    const s = normalizeSection(raw)
    if (s && !chosen.includes(s)) onChange([...chosen, s].sort())
    setDraft('')
  }
  const remove = s => onChange(chosen.filter(x => x !== s))
  const unused = [...new Set(suggestions.map(normalizeSection).filter(Boolean))]
    .filter(s => !chosen.includes(s)).sort()

  const chip = { display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'11px', fontWeight:'700', padding: compact ? '2px 8px' : '3px 10px', borderRadius:'20px' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'6px', minWidth: compact ? '180px' : undefined }}>
      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
        {chosen.length === 0 && <span style={{ fontSize:'11px', color:'#94a3b8' }}>No sections yet: sees all students</span>}
        {chosen.map(s => (
          <span key={s} style={{ ...chip, background:'#dbeafe', color:'#1e40af' }}>
            {s}
            <button type="button" onClick={() => remove(s)} aria-label={`Remove ${s}`}
              style={{ border:'none', background:'none', color:'#1e40af', cursor:'pointer', padding:0, fontSize:'12px', lineHeight:1 }}>×</button>
          </span>
        ))}
      </div>
      {unused.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
          {unused.map(s => (
            <button key={s} type="button" onClick={() => add(s)}
              style={{ ...chip, border:'1px dashed #cbd5e1', background:'#fff', color:'#64748b', cursor:'pointer', fontWeight:'600' }}>
              + {s}
            </button>
          ))}
        </div>
      )}
      <div style={{ display:'flex', gap:'4px' }}>
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(draft) } }}
          placeholder="Add section, e.g. BSIT 4A"
          style={{ flex:1, minWidth:0, border:'1.5px solid #e2e8f0', borderRadius:'8px', padding: compact ? '4px 8px' : '7px 10px', fontSize:'12px', outline:'none', background:'#f8fafc', fontFamily:'inherit' }} />
        <button type="button" onClick={() => add(draft)} disabled={!draft.trim()}
          style={{ fontSize:'11px', padding:'4px 10px', borderRadius:'8px', border:'1.5px solid #e2e8f0', background:'#fff', color:'#1d4ed8', fontWeight:'700', cursor: draft.trim() ? 'pointer' : 'not-allowed' }}>
          Add
        </button>
      </div>
    </div>
  )
}

/**
 * Single section field for forms an instructor fills in (new student, new
 * group). An instructor the admin assigned sections to picks from those;
 * everyone else gets the usual free-text box.
 */
export function SectionField({ user, value, onChange, style, placeholder = 'e.g. BSIT 3A' }) {
  const mine = user?.role === 'instructor' ? (user?.handled_sections || []) : []
  if (mine.length === 0) {
    return <input value={value} onChange={e => onChange(e.target.value)} style={style} placeholder={placeholder} />
  }
  return (
    <select value={normalizeSection(value)} onChange={e => onChange(e.target.value)} style={style} required>
      {mine.length > 1 && <option value="">Select one of your sections...</option>}
      {mine.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  )
}
