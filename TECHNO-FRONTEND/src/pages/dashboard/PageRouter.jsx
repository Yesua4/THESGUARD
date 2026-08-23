import PageDashboard from './PageDashboard'
import PageProgress from './PageProgress'
import PageGroups from './PageGroups'
import PageProjects from './PageProjects'
import PageTitleApproval from './PageTitleApproval'
import PageSimilarity from './PageSimilarity'
import PageSchedule from './PageSchedule'
import PageMySchedule from './PageMySchedule'
import PageSubmit from './document-review/PageSubmit'
import PageContributions from './PageContributions'
import PageUsers from './PageUsers'
import PageArchive from './PageArchive'
import PageReports from './PageReports'
import PageSettings from './PageSettings'
import PageMyGroup from './PageMyGroup'
import PageNotifications from './PageNotifications'
import PageDocumentReview from './document-review/PageDocumentReview'
import PageEvaluate from './PageEvaluate'
import PageChangePassword from './PageChangePassword'
import PageEditProfile from './PageEditProfile'

function PageRouter({ page, setPage, setUnreadCount, user, navTarget, clearNavTarget, onNotificationNavigate }) {
  const handleNotificationsRead = () => setUnreadCount(0)

  // A nav target only applies once we've actually switched to its page.
  const target = navTarget?.page === page ? navTarget : null

  // Import or inline all your existing page components below:
  switch (page) {
    case 'dashboard':     return <PageDashboard user={user} onNavigate={setPage} />
    case 'progress':      return <PageProgress />
    case 'groups':        return <PageGroups />
    case 'projects':      return <PageProjects />
    case 'titleapproval': return <PageTitleApproval />
    case 'similarity':    return <PageSimilarity />
    case 'schedule':      return <PageSchedule />
    case 'myschedule':    return <PageMySchedule />
    case 'submit':        return <PageSubmit initialDocumentId={target?.documentId} onConsumeInitialDocument={clearNavTarget} />
    case 'contributions': return <PageContributions />
    case 'mycontrib':     return <PageContributions />
    case 'users':         return <PageUsers />
    case 'archive':       return <PageArchive />
    case 'reports':       return <PageReports />
    case 'settings':      return <PageSettings />
    case 'mygroup':       return <PageMyGroup />
    case 'notifications': return <PageNotifications onRead={handleNotificationsRead} user={user} onNavigate={onNotificationNavigate} />
    case 'docreview':     return <PageDocumentReview initialDocumentId={target?.documentId} onConsumeInitialDocument={clearNavTarget} />
    case 'evaluate':      return <PageEvaluate />
    case 'changepassword':return <PageChangePassword />
    case 'editprofile':   return <PageEditProfile />
    default:              return <PageDashboard user={user} />
  }
}

export default PageRouter
