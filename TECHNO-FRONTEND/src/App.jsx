import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import LandingPage from './pages/LandingPage'
import RegisterSchool from './pages/RegisterSchool'
import SuperAdmin from './pages/SuperAdmin'
import OAuthCallback from './pages/OAuthCallback'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

function PrivateRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/register-school" element={<RegisterSchool />} />
      <Route path="/oauth-callback" element={<OAuthCallback />} />
      <Route path="/thesisguard-admin" element={<SuperAdmin />} />
      <Route path="/dashboard" element={
        <PrivateRoute><Dashboard /></PrivateRoute>
      } />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}