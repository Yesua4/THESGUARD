import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import api from '../api/axios'
import echo from '../echo'

const AuthContext = createContext()

// The admin can act as any role (backend keeps role='admin' for access and
// sends the screen role as acting_role). Every screen reads `user.role`, so
// the acting role becomes `role` here, and `base_role` keeps the real one.
// Safe to apply twice (localStorage holds the normalized form).
const normalizeUser = u => u && ({
  ...u,
  role: u.acting_role || u.base_role || u.role,
  base_role: u.acting_role ? 'admin' : (u.base_role || u.role),
})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(
    () => normalizeUser(JSON.parse(localStorage.getItem('user') || 'null'))
  )
  const storeUser = u => {
    const nu = normalizeUser(u)
    localStorage.setItem('user', JSON.stringify(nu))
    setUser(nu)
  }
  const [school, setSchool] = useState(
    () => JSON.parse(localStorage.getItem('school') || 'null')
  )

  const login = async (email, password) => {
    const res = await api.post('/login', { email, password })
    localStorage.setItem('token', res.data.token)
    storeUser(res.data.user)

    // Store school info if returned
    if (res.data.school) {
      localStorage.setItem('school', JSON.stringify(res.data.school))
      setSchool(res.data.school)
    }

    return normalizeUser(res.data.user)
  }

  // Student self-registration; signs the new student straight in.
  const register = async data => {
    const res = await api.post('/register', data)
    localStorage.setItem('token', res.data.token)
    storeUser(res.data.user)
    if (res.data.school) {
      localStorage.setItem('school', JSON.stringify(res.data.school))
      setSchool(res.data.school)
    }
    return normalizeUser(res.data.user)
  }

  // Used by the Google OAuth callback: the backend already issued a Sanctum
  // token (via redirect query param), so this just stores it and fetches
  // the user, mirroring what login() does after a password check.
  const loginWithToken = async token => {
    localStorage.setItem('token', token)
    const res = await api.get('/me')
    storeUser(res.data.user)
    if (res.data.school) {
      localStorage.setItem('school', JSON.stringify(res.data.school))
      setSchool(res.data.school)
    }
    return normalizeUser(res.data.user)
  }

  const logout = async () => {
    try { await api.post('/logout') } catch {}
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('school')
    setUser(null)
    setSchool(null)
  }

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get('/me')
      storeUser(res.data.user)
      if (res.data.school) {
        localStorage.setItem('school', JSON.stringify(res.data.school))
        setSchool(res.data.school)
      }
    } catch (err) {
      // Only an expired/invalid token should sign the user out -- a network
      // blip or a cold-starting backend must not.
      if (err.response?.status === 401) logout()
    }
  }, [])

  // Live: when the admin changes this account's roles or sections, a class
  // list enrolls this student, or the role is switched on another device,
  // the server pings the user's private channel and we refetch /me.
  useEffect(() => {
    if (!user?.id) return
    const channel = echo.private(`App.Models.User.${user.id}`)
    const listener = () => refreshUser()
    channel.listen('.account.changed', listener)
    return () => channel.stopListening('.account.changed', listener)
  }, [user?.id, refreshUser])

  // Switch the active role to another role the admin assigned to this
  // account. The server checks the role is actually assigned.
  const switchRole = async role => {
    const res = await api.post('/me/switch-role', { role })
    storeUser(res.data.user)
    return normalizeUser(res.data.user)
  }

  return (
    <AuthContext.Provider value={{ user, school, login, register, loginWithToken, logout, refreshUser, switchRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)