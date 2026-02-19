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
  const [showAddUser, setShowAddUser] = useState(false)
  const [availableUsers, setAvailableUsers] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState('')
  const [selectedRole, setSelectedRole] = useState('analyst')

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

  const loadAvailableUsers = async () => {
    try {
      const response = await api.get('/super-admin/system-users')
      const allUsers = response.data.users || []
      
      // Filter out users already in this tenant
      const currentUserIds = users.map(u => u.user_id)
      const available = allUsers.filter((u: any) => !currentUserIds.includes(u.id))
      
      setAvailableUsers(available)
    } catch (err: any) {
      console.error('Failed to load available users:', err)
    }
  }

  const handleAddUser = async () => {
    if (!selectedUser) {
      alert('Please select a user')
      return
    }

    try {
      await api.post(`/super-admin/users/${selectedUser}/tenants/${id}`, {
        role: selectedRole
      })
      
      setShowAddUser(false)
      setSelectedUser('')
      setSelectedRole('analyst')
      await loadTenant()
      alert('User added successfully')
    } catch (err: any) {
      alert('Failed to add user: ' + (err.response?.data?.message || err.message))
    }
  }

  const handleShowAddUser = async () => {
    setShowAddUser(true)
    await loadAvailableUsers()
  }

  const handleBack = () => {
    navigate('/super-admin')
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

  if (error || !tenant) {
    return (
      <>
        <div className="card mb-3">
          <div className="card-header">
            <h3 className="card-title">
              <i className="bi bi-building me-2"></i>
              Tenant Details
            </h3>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="alert alert-danger">
              <i className="bi bi-exclamation-triangle me-2"></i>
              {error || 'Tenant not found'}
            </div>
            <button onClick={handleBack} className="btn btn-secondary">
              <i className="bi bi-arrow-left me-1"></i>
              Back to Dashboard
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Page Header */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-building me-2"></i>
            {tenant.name}
          </h3>
          <div className="card-tools">
            <button onClick={handleBack} className="btn btn-secondary btn-sm">
              <i className="bi bi-arrow-left me-1"></i>
              Back to Dashboard
            </button>
          </div>
        </div>
        <div className="card-body">
          <p className="text-muted mb-0">
            <strong>ID:</strong> <code>{tenant.id}</code>
          </p>
        </div>
      </div>

      {/* Tenant Info Card */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-info-circle me-2"></i>
            Tenant Information
          </h3>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label fw-bold text-muted">Database Name</label>
              <p className="mb-0"><code>{tenant.db_name || 'N/A'}</code></p>
            </div>
            
            <div className="col-md-6 mb-3">
              <label className="form-label fw-bold text-muted">Created</label>
              <p className="mb-0">
                {tenant.created_at ? new Date(tenant.created_at).toLocaleString() : 'N/A'}
              </p>
            </div>
            
            <div className="col-md-6">
              <label className="form-label fw-bold text-muted">Total Users</label>
              <p className="mb-0 fs-4 text-primary fw-bold">
                {users.length}
              </p>
            </div>
            
            <div className="col-md-6">
              <label className="form-label fw-bold text-muted">Active Users</label>
              <p className="mb-0 fs-4 text-success fw-bold">
                {users.filter(u => u.is_active).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-people me-2"></i>
            Users
          </h3>
          <div className="card-tools">
            <button 
              className="btn btn-primary btn-sm"
              onClick={handleShowAddUser}
            >
              <i className="bi bi-plus-circle me-1"></i>
              Add User
            </button>
          </div>
        </div>
        
        {/* Add User Form */}
        {showAddUser && (
          <div className="card-body border-bottom">
            <h5 className="mb-3">Add User to Tenant</h5>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Select User</label>
                <select 
                  className="form-select"
                  value={selectedUser}
                  onChange={e => setSelectedUser(e.target.value)}
                >
                  <option value="">-- Choose a user --</option>
                  {availableUsers.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="col-md-6">
                <label className="form-label">Role</label>
                <select 
                  className="form-select"
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value)}
                >
                  <option value="admin">Admin</option>
                  <option value="analyst">Analyst</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              
              <div className="col-12">
                <button 
                  className="btn btn-primary btn-sm me-2"
                  onClick={handleAddUser}
                >
                  <i className="bi bi-check-circle me-1"></i>
                  Add User
                </button>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setShowAddUser(false)
                    setSelectedUser('')
                    setSelectedRole('analyst')
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        
        <div className="card-body">
          {users.length === 0 ? (
            <div className="text-center text-muted py-5">
              <i className="bi bi-inbox" style={{ fontSize: '3rem' }}></i>
              <p className="mt-3">No users in this tenant yet.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-striped table-hover">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Full Name</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.user_id}>
                      <td><code>{user.email}</code></td>
                      <td>{user.full_name}</td>
                      <td>
                        <span className={`badge ${
                          user.tenant_role === 'admin' ? 'bg-primary' : 
                          user.tenant_role === 'analyst' ? 'bg-info' : 'bg-secondary'
                        }`}>
                          {user.tenant_role}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${
                          user.is_active ? 'bg-success' : 'bg-danger'
                        }`}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="text-muted">
                        {new Date(user.joined_at).toLocaleDateString()}
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
