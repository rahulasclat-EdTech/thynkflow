import React, { createContext, useContext, useState, useEffect } from 'react'
import api from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tf_user')) } catch { return null }
  })
  const [loading, setLoading] = useState(false)

  const login = async (email, password) => {
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { email, password })
      localStorage.setItem('tf_token', res.token)
      localStorage.setItem('tf_user', JSON.stringify(res.user))
      setUser(res.user)
      return res.user
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('tf_token')
    localStorage.removeItem('tf_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isAdmin: user?.role_name === 'admin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
