// Where clicking a notification should take the viewer, based on its type
// and the viewer's role. Used by the bell's drop-down and the full
// Notifications page, so both open the same thing. null = no specific page
// (the caller then shows the Notifications page).
export function destinationFor(notification, role) {
  const isStudent = role === 'student'
  switch (notification.type) {
    case 'document_uploaded':
    case 'document_status':
    case 'comment':
      if (!notification.document_id) return null
      // comment_id: jump straight to that comment's thread and highlight.
      return { page: isStudent ? 'submit' : 'docreview', documentId: notification.document_id, commentId: notification.comment_id || null }
    case 'title_pending':
      return { page: 'titleapproval' }
    case 'title_approved':
    case 'title_rejected':
    case 'title_chosen':
    case 'title':
      return { page: isStudent ? 'projects' : 'titleapproval' }
    case 'schedule':
    case 'defense_scheduled':
      return { page: isStudent ? 'myschedule' : 'schedule' }
    case 'defense_verdict':
      return { page: isStudent ? 'projects' : 'evaluate' }
    case 'minutes_comment':
    case 'minutes_addressed':
      return { page: 'minutes' }
    case 'recommendation':
      return { page: isStudent ? 'mygroup' : 'groups' }
    default:
      return null
  }
}
