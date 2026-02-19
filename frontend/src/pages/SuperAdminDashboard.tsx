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
      <div className="card">
        <div className="card-body">
          <div className="d-flex justify-content-center">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-shield-lock me-2"></i>
            Super Admin Dashboard
          </h3>
        </div>
        <div className="card-body">
          <div className="alert alert-danger">
            <i className="bi bi-exclamation-triangle me-2"></i>
            {error}
          </div>
          <p>You need to be a super admin to access this page.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Page Header */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-shield-lock me-2"></i>
            Super Admin Dashboard
          </h3>
          <div className="card-tools">
            <button onClick={handleCreateTenant} className="btn btn-primary btn-sm">
              <i className="bi bi-plus-circle me-1"></i>
              New Tenant
            </button>
          </div>
        </div>
      </div>

      {/* System Overview Cards */}
      {overview && (
        <div className="row mb-3">
          <div className="col-md-3">
            <div className="info-box">
              <span className="info-box-icon text-bg-primary">
                <i className="bi bi-building"></i>
              </span>
              <div className="info-box-content">
                <span className="info-box-text">Total Tenants</span>
                <span className="info-box-number">{overview.total_tenants}</span>
              </div>
            </div>
          </div>
          
          <div className="col-md-3">
            <div className="info-box">
              <span className="info-box-icon text-bg-success">
                <i className="bi bi-check-circle"></i>
              </span>
              <div className="info-box-content">
                <span className="info-box-text">Active Tenants</span>
                <span className="info-box-number">{overview.active_tenants}</span>
              </div>
            </div>
          </div>
          
          <div className="col-md-3">
            <div className="info-box">
              <span className="info-box-icon text-bg-info">
                <i className="bi bi-people"></i>
              </span>
              <div className="info-box-content">
                <span className="info-box-text">Total Users</span>
                <span className="info-box-number">{overview.total_users}</span>
              </div>
            </div>
          </div>
          
          <div className="col-md-3">
            <div className="info-box">
              <span className="info-box-icon text-bg-warning">
                <i className="bi bi-shield-check"></i>
              </span>
              <div className="info-box-content">
                <span className="info-box-text">Super Admins</span>
                <span className="info-box-number">{overview.super_admins}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tenants List */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-list-ul me-2"></i>
            All Tenants
          </h3>
        </div>
        <div className="card-body">
          {tenants.length === 0 ? (
            <div className="text-center text-muted py-5">
              <i className="bi bi-inbox" style={{ fontSize: '3rem' }}></i>
              <p className="mt-3">No tenants found. Create your first tenant to get started.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-striped table-hover">
                <thead>
                  <tr>
                    <th>Tenant Name</th>
                    <th>Tenant ID</th>
                    <th className="text-center">Users</th>
                    <th className="text-center">Active Users</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map(tenant => (
                    <tr key={tenant.id}>
                      <td className="fw-bold">{tenant.name}</td>
                      <td><code className="text-muted">{tenant.id}</code></td>
                      <td className="text-center">{tenant.user_count}</td>
                      <td className="text-center">
                        <span className="badge bg-success">
                          {tenant.active_user_count}
                        </span>
                      </td>
                      <td className="text-muted">
                        {new Date(tenant.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <button 
                          onClick={() => handleViewTenant(tenant.id)}
                          className="btn btn-sm btn-outline-primary"
                        >
                          <i className="bi bi-eye me-1"></i>
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
