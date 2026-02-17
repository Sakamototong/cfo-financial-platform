import { useTenant } from '../components/TenantContext'

export function apiFetchFactory(tenantId?: string) {
  return function apiFetch(input: RequestInfo, init?: RequestInit) {
    const headers = new Headers(init?.headers || {})
    if (tenantId) headers.set('x-tenant-id', tenantId)
    // forward Authorization from localStorage if available
    const token = localStorage.getItem('access_token')
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(input, { ...init, headers })
  }
}

export function useApiFetch() {
  const { tenantId } = useTenant()
  return apiFetchFactory(tenantId)
}
