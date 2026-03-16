import React, { createContext, useContext, useState, useEffect } from 'react'
import * as SecureStore from 'expo-secure-store'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync('tf_user')
        if (stored) setUser(JSON.parse(stored))
      } catch {}
      setLoading(false)
    })()
  }, [])

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    await SecureStore.setItemAsync('tf_token', res.token)
    await SecureStore.setItemAsync('tf_user', JSON.stringify(res.user))
    setUser(res.user)
    return res.user
  }

  const logout = async () => {
    await SecureStore.deleteItemAsync('tf_token')
    await SecureStore.deleteItemAsync('tf_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
