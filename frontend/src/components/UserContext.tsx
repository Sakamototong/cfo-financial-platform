import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
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
  refresh: () => Promise<void>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRole] = useState<Role>(() => {
    try { return (localStorage.getItem('user_role') as Role) || undefined } catch (e) { return undefined }
  })
  const [email, setEmail] = useState<string | undefined>(() => {
    try { return localStorage.getItem('user_email') || undefined } catch (e) { return undefined }
  })
  const [user, setUser] = useState<User | undefined>(() => {
    try {
      const stored = localStorage.getItem('user_data')
      return stored ? JSON.parse(stored) : undefined
    } catch (e) {
      return undefined
    }
  })

  const refresh = async () => {
    try {
      const res = await api.get('/auth/me')
      console.log('[UserContext] Full API response:', res)
      console.log('[UserContext] res.data:', res.data)
      console.log('[UserContext] res.data.data:', res.data?.data)
      const responseData = res.data?.data || res.data || {}
      console.log('[UserContext] Parsed responseData:', responseData)
      console.log('[UserContext] Role from responseData:', responseData.role)
      
      if (responseData.role) {
        console.log('[UserContext] Setting role to:', responseData.role)
        setRole(responseData.role)
        localStorage.setItem('user_role', responseData.role)
      }
      
      if (responseData.email) {
        setEmail(responseData.email)
        localStorage.setItem('user_email', responseData.email)
      }
      
      // Set full user object
      const userData = {
        email: responseData.email,
        role: responseData.role,
        username: responseData.username || responseData.email
      }
      setUser(userData)
      localStorage.setItem('user_data', JSON.stringify(userData))
      
    } catch (err) {
      // fallback to demo token parsing
      try {
        const token = localStorage.getItem('access_token') || ''
        if (token.startsWith('demo-token-')) {
          setRole('admin')
          localStorage.setItem('user_role','admin')
          setEmail('admin')
          localStorage.setItem('user_email','admin')
          const userData = { email: 'admin', role: 'admin' as Role, username: 'admin' }
          setUser(userData)
          localStorage.setItem('user_data', JSON.stringify(userData))
        }
      } catch (e) {}
    }
  }

  useEffect(() => { refresh() }, [])

  return (
    <UserContext.Provider value={{ role, email, user, refresh }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}
