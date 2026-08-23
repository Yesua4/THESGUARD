import { createContext, useContext, useState, useCallback } from 'react'
import api from '../api/axios'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(
    () => JSON.parse(localStorage.getItem('user') || 'null')
  )
  const [school, setSchool] = useState(
    () => JSON.parse(localStorage.getItem('school') || 'null')
  )

  const login = async (email, password) => {
    const res = await api.post('/login', { email, password })
    localStorage.setItem('token', res.data.token)
    localStorage.setItem('user', JSON.stringify(res.data.user))
    setUser(res.data.user)

    // Store school info if returned
    if (res.data.school) {
      localStorage.setItem('school', JSON.stringify(res.data.school))
      setSchool(res.data.school)
    }

    return res.data.user
  }

  // Used by the Google OAuth callback: the backend already issued a Sanctum
  // token (via redirect query param), so this just stores it and fetches
  // the user, mirroring what login() does after a password check.
  const loginWithToken = async token => {
    localStorage.setItem('token', token)
    const res = await api.get('/me')
    localStorage.setItem('user', JSON.stringify(res.data.user))
    setUser(res.data.user)
    if (res.data.school) {
      localStorage.setItem('school', JSON.stringify(res.data.school))
      setSchool(res.data.school)
    }
    return res.data.user
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
      localStorage.setItem('user', JSON.stringify(res.data.user))
      setUser(res.data.user)
      if (res.data.school) {
        localStorage.setItem('school', JSON.stringify(res.data.school))
        setSchool(res.data.school)
      }
    } catch {
      logout()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, school, login, loginWithToken, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)