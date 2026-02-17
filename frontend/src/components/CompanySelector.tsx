import React, { useEffect, useState } from 'react'
import { useTenant } from './TenantContext'
import api from '../api/client'

export default function CompanySelector() {
  const { tenantId, setTenantId, refreshCompanyProfile } = useTenant()
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    // Use /my-tenants to get only tenants the user has access to
    api.get('/my-tenants')
      .then((res) => {
        if (!mounted) return
        const data = res.data
        let list: { id: string; name: string }[] = []
        if (Array.isArray(data) && data.length > 0) {
          list = data.map((t: any) => ({ id: t.id, name: t.name }))
        } else {
          list = [{ id: 'admin', name: 'Default (admin)' }]
        }
        if (!mounted) return
        // If a tenant is already selected but not present in the list,
        // include it so the selector doesn't lose the selection.
        if (tenantId && !list.find(t => t.id === tenantId)) {
          list = [{ id: tenantId, name: tenantId }, ...list]
        }
        setTenants(list)
        // If no tenant selected yet, default to the first one and refresh profile
        if (!tenantId && list.length > 0) {
          const defaultId = list[0].id
          setTenantId(defaultId)
          // fire-and-forget; refreshCompanyProfile will also be triggered by the
          // tenantId effect, but call explicitly to reduce race conditions
          refreshCompanyProfile(defaultId).catch(() => {})
        }
      })
      .catch((err) => {
        if (!mounted) return
        // Silently fallback - no visible error message
        // keep any existing tenant selection, otherwise default to admin
        setTenants(prev => (prev.length ? prev : [{ id: 'admin', name: 'Default (admin)' }]))
        console.warn('CompanySelector: tenant list load failed, using fallback', err)
      })
      .finally(() => setLoading(false))

    return () => { mounted = false }
  }, [])

  // refresh company profile when tenantId changes (on mount or selection)
  useEffect(() => {
    if (!tenantId) return
    refreshCompanyProfile(tenantId)
  }, [tenantId, refreshCompanyProfile])

  return (
    <div style={{ display: 'inline-block', marginRight: 12 }}>
      {/* Hide selector if user has only one tenant */}
      {tenants.length > 1 ? (
        <>
          <label style={{ marginRight: 8 }}>Company:</label>
          <select
            value={tenantId || ''}
            onChange={async (e) => {
              const id = e.target.value || undefined
              setTenantId(id)
              try {
                await refreshCompanyProfile(id)
              } catch (err) {}
            }}
          >
            <option value="">(none)</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {loading && <span style={{ marginLeft: 8 }}>loading...</span>}
        </>
      ) : (
        <span style={{ fontWeight: 500 }}>
          {tenants.length === 1 ? tenants[0].name : 'No tenant'}
        </span>
      )}
    </div>
  )
}
