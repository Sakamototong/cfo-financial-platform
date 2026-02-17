import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

interface TenantOverview {
  id: string
  name: string
  user_count: number
  active_user_count: number
  created_at: string
}

interface SystemOverview {
  total_tenants: number
  active_tenants: number
  total_users: number
  active_users: number
  super_admins: number
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState<TenantOverview[]>([])
  const [overview, setOverview] = useState<SystemOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const [tenantsRes, overviewRes] = await Promise.all([
        api.get('/super-admin/tenants'),
        api.get('/super-admin/analytics/overview')
      ])
      
      setTenants(tenantsRes.data)
      setOverview(overviewRes.data)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load data')
      console.error('Failed to load super admin data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTenant = () => {
    navigate('/super-admin/tenants/new')
  }

  const handleViewTenant = (tenantId: string) => {
    navigate(`/super-admin/tenants/${tenantId}`)
  }

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Super Admin Dashboard</h1>
        <p>Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Super Admin Dashboard</h1>
        <div style={{ color: 'red', padding: 20, background: '#fee', borderRadius: 4 }}>
          {error}
        </div>
        <p>You need to be a super admin to access this page.</p>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Super Admin Dashboard</h1>
        <button onClick={handleCreateTenant} className="btn primary">
          + New Tenant
        </button>
      </div>

      {/* System Overview Cards */}
      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 30 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 36, margin: '10px 0', color: '#2563eb' }}>{overview.total_tenants}</h3>
            <p style={{ color: '#666', margin: 0 }}>Total Tenants</p>
          </div>
          
          <div className="card" style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 36, margin: '10px 0', color: '#10b981' }}>{overview.active_tenants}</h3>
            <p style={{ color: '#666', margin: 0 }}>Active Tenants</p>
          </div>
          
          <div className="card" style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 36, margin: '10px 0', color: '#8b5cf6' }}>{overview.total_users}</h3>
            <p style={{ color: '#666', margin: 0 }}>Total Users</p>
          </div>
          
          <div className="card" style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 36, margin: '10px 0', color: '#f59e0b' }}>{overview.super_admins}</h3>
            <p style={{ color: '#666', margin: 0 }}>Super Admins</p>
          </div>
        </div>
      )}

      {/* Tenants List */}
      <div className="card">
        <h2>All Tenants</h2>
        
        {tenants.length === 0 ? (
          <p style={{ color: '#666', textAlign: 'center', padding: 40 }}>
            No tenants found. Create your first tenant to get started.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: 12 }}>Tenant Name</th>
                <th style={{ padding: 12 }}>Tenant ID</th>
                <th style={{ padding: 12, textAlign: 'center' }}>Users</th>
                <th style={{ padding: 12, textAlign: 'center' }}>Active Users</th>
                <th style={{ padding: 12 }}>Created</th>
                <th style={{ padding: 12 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(tenant => (
                <tr key={tenant.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 12, fontWeight: 500 }}>{tenant.name}</td>
                  <td style={{ padding: 12, fontFamily: 'monospace', fontSize: 13, color: '#666' }}>
                    {tenant.id}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>{tenant.user_count}</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <span style={{ 
                      background: '#10b981', 
                      color: 'white', 
                      padding: '2px 8px', 
                      borderRadius: 12,
                      fontSize: 13
                    }}>
                      {tenant.active_user_count}
                    </span>
                  </td>
                  <td style={{ padding: 12, color: '#666', fontSize: 14 }}>
                    {new Date(tenant.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: 12 }}>
                    <button 
                      onClick={() => handleViewTenant(tenant.id)}
                      className="btn ghost"
                      style={{ fontSize: 13 }}
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
