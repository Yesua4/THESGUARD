// Review status of a document comment: label + icon + colours (never colour
// alone). Mirrors CommentReviewService::LABELS on the backend.
export const COMMENT_STATUS = {
  open:                  { label: 'Needs revision',        icon: '●', bg: '#fef3c7', color: '#92400e' },
  in_progress:           { label: 'In progress',           icon: '◐', bg: '#dbeafe', color: '#1e40af' },
  awaiting_verification: { label: 'Awaiting verification', icon: '⧗', bg: '#ede9fe', color: '#5b21b6' },
  resolved:              { label: 'Resolved',              icon: '✓', bg: '#d1fae5', color: '#065f46' },
  reopened:              { label: 'Reopened',              icon: '↺', bg: '#fee2e2', color: '#991b1b' },
}
