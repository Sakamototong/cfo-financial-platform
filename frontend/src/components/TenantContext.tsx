import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react'
import api from '../api/client'

type CompanyProfile = {
  id?: string
  name?: string
  [key: string]: any
}

type TenantContextType = {
  tenantId?: string
  tenant?: string  // alias for tenantId (backward compat)
  company?: CompanyProfile
  setTenantId: (id?: string) => void
  refreshCompanyProfile: (id?: string) => Promise<void>
}

const TenantContext = createContext<TenantContextType | undefined>(undefined)

export const TenantProvider = ({ children }: { children: ReactNode }) => {
  const devDefault = (import.meta.env as any).VITE_DEV_DEFAULT_TENANT as string | undefined
  const [tenantId, setTenantIdState] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem('tenant_id') || devDefault || undefined
    } catch (e) {
      return devDefault || undefined
    }
  })
  const [company, setCompany] = useState<CompanyProfile | undefined>(undefined)

  const persistTenant = (id?: string) => {
    setTenantIdState(id)
    try {
      if (id) localStorage.setItem('tenant_id', id)
      else localStorage.removeItem('tenant_id')
    } catch (e) {}
  }

  const refreshCompanyProfile = useCallback(async (id?: string) => {
    const t = id || tenantId
    if (!t) {
      setCompany(undefined)
      return
    }
    try {
      // Try tenant-specific profile endpoint first
      const res = await api.get('/tenant/profile')
      setCompany({ id: t, ...(res.data || {}) })
      return
    } catch (err) {
      // fallback to listing tenants and matching by id
    }
    try {
      const list = await api.get('/tenants')
      if (Array.isArray(list.data)) {
        const found = list.data.find((x: any) => x.id === t)
        if (found) {
          setCompany({ id: t, ...found })
          return
        }
      }
      setCompany(undefined)
    } catch (err) {
      setCompany(undefined)
    }
  }, [tenantId])

  return (
    <TenantContext.Provider value={{ tenantId, tenant: tenantId, company, setTenantId: persistTenant, refreshCompanyProfile }}>
      {children}
    </TenantContext.Provider>
  )
}

export const useTenant = () => {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used within TenantProvider')
  return ctx
}
