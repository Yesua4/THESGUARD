// Shared similarity-score color/threshold logic. This exact 30/60 split and
// color set was previously copy-pasted independently into 5 different
// files (PageSimilarity, SimilarityBreakdown, PageReports, PageTitleApproval,
// PageProjects) -- identical today, but a change to one wouldn't have
// touched the others.

export const similarityBarColor = score =>
  score >= 60 ? '#ef4444' : score >= 30 ? '#f59e0b' : '#10b981'

export const similarityScoreColor = score =>
  score >= 60 ? '#dc2626' : score >= 30 ? '#d97706' : '#059669'

export const similarityBadgeStyle = score => ({
  background: score >= 60 ? '#fee2e2' : score >= 30 ? '#fef3c7' : '#d1fae5',
  color: score >= 60 ? '#9f1239' : score >= 30 ? '#92400e' : '#065f46',
})
