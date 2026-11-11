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
import PageInstitutes from './PageInstitutes'
import PageMyGroup from './PageMyGroup'
import PageNotifications from './PageNotifications'
import PageDocumentReview from './document-review/PageDocumentReview'
import PageEvaluate from './PageEvaluate'
import PageChangePassword from './PageChangePassword'
import PageEditProfile from './PageEditProfile'
import PageMinutes from './PageMinutes'
import PageAcademicCalendar from './PageAcademicCalendar'
import PageCommentReview from './PageCommentReview'
import PagePanelComments from './PagePanelComments'
import { canOpen } from '../../config/pageAccess'
import Icon from '../../components/Icon'

function PageRouter({ page, setPage, setUnreadCount, user, navTarget, clearNavTarget, onNotificationNavigate }) {
  const handleNotificationsRead = () => setUnreadCount(0)

  // A nav target only applies once we've actually switched to its page.
  const target = navTarget?.page === page ? navTarget : null

  // A page that isn't in this role's menu never opens (e.g. a student can't
  // open Manage Groups through a link). The server checks again on its side.
  if (!canOpen(user?.role, page)) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e8ecf2', borderRadius: '14px', padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '28px', marginBottom: '8px' }}><Icon name="lock" /></div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0a1f44', marginBottom: '4px' }}>This page isn't available for your role</div>
        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Use the menu on the left to find what you need.</div>
        <button type="button" onClick={() => setPage('dashboard')} style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg,#0a1f44,#1040a0)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Go to Dashboard</button>
      </div>
    )
  }

  switch (page) {
    case 'dashboard':     return <PageDashboard user={user} onNavigate={setPage} />
    case 'progress':      return <PageProgress />
    case 'groups':        return <PageGroups />
    case 'projects':      return <PageProjects />
    case 'titleapproval': return <PageTitleApproval />
    case 'similarity':    return <PageSimilarity />
    case 'schedule':      return <PageSchedule />
    case 'myschedule':    return <PageMySchedule />
    case 'submit':        return <PageSubmit initialDocumentId={target?.documentId} initialCommentId={target?.commentId} onConsumeInitialDocument={clearNavTarget} />
    case 'contributions': return <PageContributions />
    case 'mycontrib':     return <PageContributions />
    case 'users':         return <PageUsers />
    case 'archive':       return <PageArchive />
    case 'minutes':       return <PageMinutes />
    case 'reports':       return <PageReports />
    case 'settings':      return <PageSettings />
    case 'institutes':    return <PageInstitutes />
    case 'panelcomments': return <PagePanelComments user={user} />
    case 'comments':      return <PageCommentReview user={user} onOpen={onNotificationNavigate} />
    case 'calendar':      return <PageAcademicCalendar />
    case 'mygroup':       return <PageMyGroup />
    case 'notifications': return <PageNotifications onRead={handleNotificationsRead} user={user} onNavigate={onNotificationNavigate} />
    case 'docreview':     return <PageDocumentReview initialDocumentId={target?.documentId} initialCommentId={target?.commentId} onConsumeInitialDocument={clearNavTarget} />
    case 'evaluate':      return <PageEvaluate />
    case 'changepassword':return <PageChangePassword />
    case 'editprofile':   return <PageEditProfile onNavigate={setPage} />
    default:              return <PageDashboard user={user} />
  }
}

export default PageRouter
