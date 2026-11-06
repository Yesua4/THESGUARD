// Shared similarity-score color/threshold logic. This exact 30/60 split and
// color set was previously copy-pasted independently into 5 different
// files (PageSimilarity, SimilarityBreakdown, PageReports, PageTitleApproval,
// PageProjects) -- identical today, but a change to one wouldn't have
// touched the others.

// The score bands, named once (also used in the plain-language explainer).
export const SIMILARITY_MODERATE = 30
export const SIMILARITY_HIGH = 60

export const similarityBarColor = score =>
  score >= SIMILARITY_HIGH ? '#ef4444' : score >= SIMILARITY_MODERATE ? '#f59e0b' : '#10b981'

export const similarityScoreColor = score =>
  score >= SIMILARITY_HIGH ? '#dc2626' : score >= SIMILARITY_MODERATE ? '#d97706' : '#059669'

export const similarityBadgeStyle = score => ({
  background: score >= SIMILARITY_HIGH ? '#fee2e2' : score >= SIMILARITY_MODERATE ? '#fef3c7' : '#d1fae5',
  color: score >= SIMILARITY_HIGH ? '#9f1239' : score >= SIMILARITY_MODERATE ? '#92400e' : '#065f46',
})
