export function getAuthHeaders(): Record<string,string> {
  const headers: Record<string,string> = {}
  try {
    const token = localStorage.getItem('access_token')
    const tenant = localStorage.getItem('tenant_id')
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (tenant) headers['x-tenant-id'] = tenant
  } catch (e) {}
  return headers
}
