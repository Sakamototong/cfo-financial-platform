import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'

interface TenantUser {
  user_id: string
  email: string
  full_name: string
  tenant_role: string
  is_active: boolean
  joined_at: string
}

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState<any>(null)
  const [users, setUsers] = useState<TenantUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadTenant()
  }, [id])

  const loadTenant = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const [tenantRes, usersRes] = await Promise.all([
        api.get(`/super-admin/tenants/${id}`),
        api.get(`/super-admin/tenants/${id}/users`)
      ])
      
      setTenant(tenantRes.data)
      setUsers(usersRes.data)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load tenant')
      console.error('Failed to load tenant:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    navigate('/super-admin')
  }

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Tenant Details</h1>
        <p>Loading...</p>
      </div>
    )
  }

  if (error || !tenant) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Tenant Details</h1>
        <div style={{ color: 'red', padding: 20, background: '#fee', borderRadius: 4 }}>
          {error || 'Tenant not found'}
        </div>
        <button onClick={handleBack} className="btn" style={{ marginTop: 20 }}>
          ← Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="page-container">
      <button onClick={handleBack} className="btn ghost" style={{ marginBottom: 20 }}>
        ← Back to Dashboard
      </button>

      <div className="page-header">
        <div>
          <h1>{tenant.name}</h1>
          <p style={{ color: '#666', marginTop: 5, fontFamily: 'monospace' }}>
            ID: {tenant.id}
          </p>
        </div>
      </div>

      {/* Tenant Info Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Tenant Information</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
          <div>
            <label style={{ fontWeight: 500, color: '#666', fontSize: 14 }}>Database Name</label>
            <p style={{ margin: '5px 0 0', fontFamily: 'monospace', fontSize: 14 }}>
              {tenant.db_name || 'N/A'}
            </p>
          </div>
          
          <div>
            <label style={{ fontWeight: 500, color: '#666', fontSize: 14 }}>Created</label>
            <p style={{ margin: '5px 0 0' }}>
              {tenant.created_at ? new Date(tenant.created_at).toLocaleString() : 'N/A'}
            </p>
          </div>
          
          <div>
            <label style={{ fontWeight: 500, color: '#666', fontSize: 14 }}>Total Users</label>
            <p style={{ margin: '5px 0 0', fontSize: 20, fontWeight: 500, color: '#2563eb' }}>
              {users.length}
            </p>
          </div>
          
          <div>
            <label style={{ fontWeight: 500, color: '#666', fontSize: 14 }}>Active Users</label>
            <p style={{ margin: '5px 0 0', fontSize: 20, fontWeight: 500, color: '#10b981' }}>
              {users.filter(u => u.is_active).length}
            </p>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>Users</h2>
          <button className="btn primary" style={{ fontSize: 14 }}>
            + Add User
          </button>
        </div>

        {users.length === 0 ? (
          <p style={{ color: '#666', textAlign: 'center', padding: 40 }}>
            No users in this tenant yet.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: 12 }}>Email</th>
                <th style={{ padding: 12 }}>Full Name</th>
                <th style={{ padding: 12 }}>Role</th>
                <th style={{ padding: 12 }}>Status</th>
                <th style={{ padding: 12 }}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.user_id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 12, fontFamily: 'monospace', fontSize: 13 }}>
                    {user.email}
                  </td>
                  <td style={{ padding: 12 }}>{user.full_name}</td>
                  <td style={{ padding: 12 }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: 12,
                      fontSize: 13,
                      fontWeight: 500,
                      background: user.tenant_role === 'admin' ? '#dbeafe' : 
                                 user.tenant_role === 'analyst' ? '#fef3c7' : '#f3f4f6',
                      color: user.tenant_role === 'admin' ? '#1e40af' : 
                             user.tenant_role === 'analyst' ? '#92400e' : '#374151'
                    }}>
                      {user.tenant_role}
                    </span>
                  </td>
                  <td style={{ padding: 12 }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: 12,
                      fontSize: 13,
                      background: user.is_active ? '#d1fae5' : '#fee2e2',
                      color: user.is_active ? '#065f46' : '#991b1b'
                    }}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: 12, color: '#666', fontSize: 14 }}>
                    {new Date(user.joined_at).toLocaleDateString()}
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
