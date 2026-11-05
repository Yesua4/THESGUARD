import { useAuth } from '../context/AuthContext'
import DashboardShell from './dashboard/DashboardShell'
import AwaitingEnrollment from './dashboard/AwaitingEnrollment'

// A self-registered student waits on a holding screen until an instructor
// enrolls them by importing the class list (the API blocks everything else).
export default function Dashboard() {
  const { user } = useAuth()
  return user?.awaiting_enrollment ? <AwaitingEnrollment /> : <DashboardShell />
}
