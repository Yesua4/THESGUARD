import { useAuth } from '../context/AuthContext'
import DashboardShell from './dashboard/DashboardShell'
import AwaitingEnrollment from './dashboard/AwaitingEnrollment'
import ChooseOwnPassword from './dashboard/ChooseOwnPassword'

// A self-registered student waits on a holding screen until an instructor
// enrolls them by importing the class list (the API blocks everything else).
export default function Dashboard() {
  const { user } = useAuth()
  if (user?.awaiting_enrollment) return <AwaitingEnrollment />
  // Signed in with a password someone else set -> choose their own first.
  if (user?.must_change_password) return <ChooseOwnPassword />
  return <DashboardShell />
}
