// Shared display helpers for Document records.
// Canonical Document.status enum (verified against Laravel backend validation rules):
//   pending | under_review | approved | needs_revision
// NOTE: there is no "rejected" status for Document — that value belongs to
// Project.title_status, not Document.status. Any prior "rejected" branch in
// document status helpers was incorrect and has been removed here.

export const typeLabel = {
  proposal: 'Proposal',
  chapter1: 'Chapter 1',
  chapter2: 'Chapter 2',
  chapter3: 'Chapter 3',
  chapter4: 'Chapter 4',
  chapter5: 'Chapter 5',
  final_manuscript: 'Final Manuscript',
}

export const statusStyle = s => ({
  background:
    s === 'approved'       ? '#d1fae5' :
    s === 'needs_revision' ? '#fef3c7' :
    s === 'under_review'   ? '#dbeafe' : '#f1f5f9',
  color:
    s === 'approved'       ? '#065f46' :
    s === 'needs_revision' ? '#92400e' :
    s === 'under_review'   ? '#1e40af' : '#475569',
})

export const statusLabel = s =>
  s === 'approved'       ? '✓ Approved' :
  s === 'needs_revision' ? '↩ Needs Revision' :
  s === 'under_review'   ? '👁 Under Review' : 'Pending'

export const fileIcon = p => !p ? 'FILE' : p.endsWith('.pdf') ? 'PDF' : 'DOC'

export const fileStyle = p => !p
  ? { background: '#f1f5f9', color: '#64748b' }
  : p.endsWith('.pdf')
    ? { background: '#fee2e2', color: '#dc2626' }
    : { background: '#dbeafe', color: '#1d4ed8' }
