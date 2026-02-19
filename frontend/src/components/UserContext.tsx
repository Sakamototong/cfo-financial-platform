import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import api from '../api/client'

type Role = 'super_admin' | 'admin' | 'analyst' | 'viewer' | undefined

type User = {
  email?: string
  role?: Role
  username?: string
}

type UserContextType = {
  role: Role
  email?: string
  user?: User
  loading: boolean
  refresh: () => Promise<void>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRole] = useState<Role>(undefined)
  const [email, setEmail] = useState<string | undefined>(undefined)
  const [user, setUser] = useState<User | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const retryCount = useRef(0)

  const refresh = async () => {
    setLoading(true)
    try {
      const res = await api.get('/auth/me')
      const responseData = res.data?.data || res.data || {}

      if (responseData.role) {
        setRole(responseData.role)
        localStorage.setItem('user_role', responseData.role)
      }

      if (responseData.email) {
        setEmail(responseData.email)
        localStorage.setItem('user_email', responseData.email)
      }

      const userData = {
        email: responseData.email,
        role: responseData.role,
        username: responseData.username || responseData.email,
      }
      setUser(userData)
      localStorage.setItem('user_data', JSON.stringify(userData))
      retryCount.current = 0
    } catch (err) {
      // Retry up to 2 times with 500ms delay
      if (retryCount.current < 2) {
        retryCount.current += 1
        await new Promise((r) => setTimeout(r, 500))
        return refresh()
      }
      // fallback to demo token parsing
      try {
        const token = localStorage.getItem('access_token') || ''
        if (token.startsWith('demo-token-')) {
          setRole('admin')
          localStorage.setItem('user_role', 'admin')
          setEmail('admin')
          localStorage.setItem('user_email', 'admin')
          const userData = { email: 'admin', role: 'admin' as Role, username: 'admin' }
          setUser(userData)
          localStorage.setItem('user_data', JSON.stringify(userData))
        }
      } catch (_) {}
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  return (
    <UserContext.Provider value={{ role, email, user, loading, refresh }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}
