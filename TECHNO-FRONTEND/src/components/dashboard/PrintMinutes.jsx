// Defense minutes laid out like the paper form (Outline Defense Minutes
// template), for printing or "Save as PDF" in the browser's print dialog.
const TYPE_TITLE = { title: 'TITLE DEFENSE', outline: 'OUTLINE DEFENSE', pre_deployment: 'PRE-DEPLOYMENT DEFENSE', final: 'FINAL DEFENSE' }
const ROLE_ORDER = ['chair', 'member1', 'member2', 'adviser']

export default function PrintMinutes({ project, minute, onClose }) {
  const date = minute.defense_date ? new Date(minute.defense_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : ''
  const members = (project?.group?.members || []).map(m => m.user?.name).filter(Boolean)
  const adviserName = project?.adviser?.name || project?.group?.adviser?.name || ''
  const cell = { border: '1px solid #000', padding: '6px 8px', verticalAlign: 'top', fontSize: '11pt' }

  // One block of rows per panelist, in panel order, so the name and the
  // signature line sit beside all of that panelist's comments.
  const groups = []
  const sorted = [...(minute.items || [])].sort((a, b) => {
    const ra = ROLE_ORDER.indexOf(a.panel_role), rb = ROLE_ORDER.indexOf(b.panel_role)
    return (ra < 0 ? 9 : ra) - (rb < 0 ? 9 : rb)
  })
  sorted.forEach(item => {
    const key = `${item.panelist_name}|${item.panelist_role || ''}`
    const g = groups.find(x => x.key === key)
    if (g) g.items.push(item)
    else groups.push({ key, name: item.panelist_name, role: item.panelist_role, items: [item] })
  })

  return (
    <div role="dialog" aria-modal="true" aria-label="Printable defense minutes"
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,31,68,0.45)', zIndex: 80, overflowY: 'auto', padding: '20px' }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .tg-print-sheet, .tg-print-sheet * { visibility: visible !important; }
          .tg-print-sheet { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; margin: 0 !important; }
          .tg-no-print { display: none !important; }
          @page { size: A4 landscape; margin: 0.6in; }
        }
      `}</style>
      <div className="tg-no-print" style={{ maxWidth: '1000px', margin: '0 auto 12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => window.print()} style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', background: '#fff', color: '#0a1f44', fontWeight: 700, cursor: 'pointer' }}>🖨 Print / Save as PDF</button>
        <button type="button" onClick={onClose} style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Close</button>
      </div>

      <div className="tg-print-sheet" style={{ maxWidth: '1000px', margin: '0 auto', background: '#fff', color: '#000', padding: '36px 44px', fontFamily: '"Times New Roman", serif', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '14pt', marginBottom: '14px' }}>{TYPE_TITLE[minute.defense_type] || 'DEFENSE'} MINUTES</div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
          <tbody>
            <tr><td style={{ ...cell, width: '22%', fontWeight: 700 }}>Title:</td><td style={cell}>{project?.title}</td></tr>
            <tr><td style={{ ...cell, fontWeight: 700 }}>Program:</td><td style={cell}>{project?.program || ''}</td></tr>
            <tr><td style={{ ...cell, fontWeight: 700 }}>Date of Defense:</td><td style={cell}>{date}</td></tr>
            <tr><td style={{ ...cell, fontWeight: 700 }}>Members:</td><td style={cell}>{members.map((n, i) => <div key={n}>{i + 1}. {n}</div>)}</td></tr>
          </tbody>
        </table>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...cell, width: '22%' }}>Panelists</th>
              <th style={{ ...cell, width: '8%' }}>Page No.</th>
              <th style={{ ...cell, width: '38%' }}>Comments / Suggestions / Recommendations</th>
              <th style={{ ...cell, width: '32%' }}>Action/s Taken</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && <tr><td style={{ ...cell, height: '120px' }} /><td style={cell} /><td style={cell} /><td style={cell} /></tr>}
            {groups.map(g => g.items.map((item, i) => (
              <tr key={item.id}>
                {i === 0 && (
                  <td style={cell} rowSpan={g.items.length}>
                    <div style={{ fontWeight: 700 }}>{g.name}</div>
                    {g.role && <div style={{ fontStyle: 'italic' }}>{g.role}</div>}
                    <div style={{ marginTop: '28px' }}>Signature: ____________</div>
                    <div style={{ marginTop: '8px' }}>Date Signed: __________</div>
                  </td>
                )}
                <td style={{ ...cell, textAlign: 'center' }}>{item.page_no || ''}</td>
                <td style={{ ...cell, whiteSpace: 'pre-line' }}>{item.comment}</td>
                <td style={{ ...cell, whiteSpace: 'pre-line' }}>{item.action_taken || ''}</td>
              </tr>
            )))}
          </tbody>
        </table>

        <div style={{ marginTop: '36px', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ textAlign: 'center', minWidth: '260px' }}>
            <div style={{ borderBottom: '1px solid #000', fontWeight: 700, paddingBottom: '2px' }}>{adviserName || ' '}</div>
            <div>Adviser</div>
            <div style={{ marginTop: '10px' }}>Date Signed: ________________</div>
          </div>
        </div>
      </div>
    </div>
  )
}
