import { INDIVIDUAL_CRITERIA, GROUP_CRITERIA, VERDICTS } from '../../constants/evaluation'
import { DEFENSE_TYPE_LABEL } from '../../constants/defense'
import Icon from '../Icon'

// A panelist's evaluation laid out like the paper sheet, for printing or
// "Save as PDF" (the browser's print dialog). Everything else on the page is
// hidden while printing.
export default function PrintEvaluationSheet({ project, schedule, evaluation, panelistName, onClose }) {
  const presenters = evaluation?.individual_scores || []
  const type = DEFENSE_TYPE_LABEL[schedule?.defense_type] || 'Defense'
  const date = schedule?.defense_date ? new Date(schedule.defense_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : ''
  const cell = { border: '1px solid #000', padding: '6px 8px', verticalAlign: 'top', fontSize: '11pt' }
  const box = on => (on ? '[ ✓ ]' : '[   ]')

  return (
    <div role="dialog" aria-modal="true" aria-label="Printable evaluation sheet"
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,31,68,0.45)', zIndex: 80, overflowY: 'auto', padding: '20px' }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .tg-print-sheet, .tg-print-sheet * { visibility: visible !important; }
          .tg-print-sheet { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; margin: 0 !important; }
          .tg-no-print { display: none !important; }
          @page { size: A4; margin: 0.8in; }
        }
      `}</style>
      <div className="tg-no-print" style={{ maxWidth: '800px', margin: '0 auto 12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => window.print()} style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', background: '#fff', color: '#0a1f44', fontWeight: 700, cursor: 'pointer' }}><Icon name="printer" /> Print / Save as PDF</button>
        <button type="button" onClick={onClose} style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Close</button>
      </div>

      <div className="tg-print-sheet" style={{ maxWidth: '800px', margin: '0 auto', background: '#fff', color: '#000', padding: '40px 48px', fontFamily: '"Times New Roman", serif', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '14pt', marginBottom: '14px', textTransform: 'uppercase' }}>{type} Evaluation</div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
          <tbody>
            <tr><td style={{ ...cell, width: '30%', fontWeight: 700 }}>Title of Project:</td><td style={cell}>{project?.title}</td></tr>
            <tr><td style={{ ...cell, fontWeight: 700 }}>Name of Presenters:</td><td style={cell}>{presenters.map((p, i) => <div key={p.user_id}>{i + 1}. {p.name}</div>)}</td></tr>
            {date && <tr><td style={{ ...cell, fontWeight: 700 }}>Date of Defense:</td><td style={cell}>{date}</td></tr>}
          </tbody>
        </table>

        <div style={{ fontWeight: 700, margin: '10px 0 6px' }}>Individual Grade (100%)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
          <thead>
            <tr>
              <th style={{ ...cell, textAlign: 'left' }} rowSpan={2}>Criteria and Weight</th>
              <th style={{ ...cell, textAlign: 'center' }} colSpan={Math.max(1, presenters.length)}>Score</th>
            </tr>
            <tr>{(presenters.length ? presenters : [{}]).map((p, i) => <th key={i} style={{ ...cell, textAlign: 'center', width: '12%' }}>{i + 1}</th>)}</tr>
          </thead>
          <tbody>
            {INDIVIDUAL_CRITERIA.map(c => (
              <tr key={c.key}>
                <td style={cell}>
                  <div style={{ fontWeight: 700 }}>{c.label} ({c.max}%)</div>
                  {c.points && c.points.map(pt => <div key={pt} style={{ paddingLeft: '10px' }}>{pt}</div>)}
                  {c.groups && c.groups.map(([g, pts]) => (
                    <div key={g} style={{ paddingLeft: '10px', marginTop: '4px' }}>
                      <div style={{ fontStyle: 'italic' }}>{g}</div>
                      {pts.map(pt => <div key={pt} style={{ paddingLeft: '10px' }}>{pt}</div>)}
                    </div>
                  ))}
                </td>
                {presenters.map(p => <td key={p.user_id} style={{ ...cell, textAlign: 'center' }}>{p[c.key]}</td>)}
              </tr>
            ))}
            <tr>
              <td style={{ ...cell, fontWeight: 700 }}>Total</td>
              {presenters.map(p => <td key={p.user_id} style={{ ...cell, textAlign: 'center', fontWeight: 700 }}>{p.total}</td>)}
            </tr>
          </tbody>
        </table>

        <div style={{ fontWeight: 700, margin: '10px 0 6px' }}>Group Grade (100%)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
          <thead><tr><th style={{ ...cell, textAlign: 'left' }}>Criteria and Weight</th><th style={{ ...cell, width: '18%' }}>Score</th></tr></thead>
          <tbody>
            {GROUP_CRITERIA.map(c => (
              <tr key={c.key}>
                <td style={cell}>
                  <div style={{ fontWeight: 700 }}>{c.label} ({c.max}%)</div>
                  {c.points.map(pt => <div key={pt} style={{ paddingLeft: '10px' }}>{pt}</div>)}
                </td>
                <td style={{ ...cell, textAlign: 'center' }}>{evaluation?.[c.key === 'documentation' ? 'group_documentation' : 'group_software']}</td>
              </tr>
            ))}
            <tr><td style={{ ...cell, fontWeight: 700 }}>Total</td><td style={{ ...cell, textAlign: 'center', fontWeight: 700 }}>{evaluation?.group_total}</td></tr>
          </tbody>
        </table>

        <div style={{ fontWeight: 700, marginBottom: '6px' }}>Verdict:</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px', marginBottom: '10px' }}>
          {VERDICTS.map(([v, l]) => <div key={v}>{box(evaluation?.verdict === v)} {l}</div>)}
        </div>
        <div style={{ marginBottom: '6px' }}>
          To comply the necessary requirements to get a passing grade on{' '}
          <span style={{ borderBottom: '1px solid #000', padding: '0 30px' }}>
            {evaluation?.comply_by ? new Date(evaluation.comply_by).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
          </span>
        </div>
        {evaluation?.remarks && <div style={{ marginTop: '10px' }}><strong>Remarks:</strong> {evaluation.remarks}</div>}

        <div style={{ marginTop: '50px', width: '280px' }}>
          <div style={{ borderBottom: '1px solid #000', textAlign: 'center', fontWeight: 700, textTransform: 'uppercase', paddingBottom: '2px' }}>{panelistName}</div>
          <div style={{ textAlign: 'center', fontSize: '10pt' }}>Name and Signature of the Panelist</div>
        </div>
      </div>
    </div>
  )
}
