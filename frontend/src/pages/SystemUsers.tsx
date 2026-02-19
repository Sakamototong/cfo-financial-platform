import React, { useEffect, useState } from 'react'
import api from '../api/client'

interface SystemUser {
  id: string
  email: string
  full_name: string
  role: 'super_admin' | 'system_user'
  is_active: boolean
  created_at: string
  last_login_at?: string
}

interface TenantMembership {
  tenant_id: string
  tenant_name: string
  tenant_role: string
  joined_at: string
}

export default function SystemUsers() {
  const [users, setUsers] = useState<SystemUser[]>([])
  const [memberships, setMemberships] = useState<Record<string, TenantMembership[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  
  // Create form state
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'system_user' as 'super_admin' | 'system_user',
    password: ''
  })

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await api.get('/super-admin/system-users')
      setUsers(response.data.users || [])
      setMemberships(response.data.memberships || {})
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load system users')
      console.error('Failed to load system users:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      await api.post('/super-admin/system-users', formData)
      setShowCreateForm(false)
      setFormData({ email: '', full_name: '', role: 'system_user', password: '' })
      await loadUsers()
      alert('User created successfully')
    } catch (err: any) {
      alert('Failed to create user: ' + (err.response?.data?.message || err.message))
    }
  }

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      await api.put(`/super-admin/system-users/${userId}/status`, { 
        is_active: !currentActive 
      })
      await loadUsers()
    } catch (err: any) {
      alert('Failed to update status: ' + (err.response?.data?.message || err.message))
    }
  }

  const handleChangeRole = async (userId: string, currentRole: string) => {
    const newRole = prompt(
      'Enter new role (super_admin or system_user):',
      currentRole
    )
    
    if (!newRole || (newRole !== 'super_admin' && newRole !== 'system_user')) {
      return
    }
    
    try {
      await api.put(`/super-admin/system-users/${userId}/role`, { role: newRole })
      await loadUsers()
    } catch (err: any) {
      alert('Failed to update role: ' + (err.response?.data?.message || err.message))
    }
  }

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to delete user "${userEmail}"?`)) {
      return
    }
    
    try {
      await api.delete(`/super-admin/system-users/${userId}`)
      await loadUsers()
    } catch (err: any) {
      alert('Failed to delete user: ' + (err.response?.data?.message || err.message))
    }
  }

  if (loading) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="d-flex justify-content-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
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
            System Users Management
          </h3>
          <div className="card-tools">
            <button 
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="btn btn-primary btn-sm"
            >
              <i className="bi bi-plus-circle me-1"></i>
              Create User
            </button>
          </div>
        </div>
        <div className="card-body">
          <p className="text-muted mb-0">
            Manage system-level users (super admins and system users)
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert alert-danger alert-dismissible fade show mb-3" role="alert">
          <i className="bi bi-exclamation-triangle me-2"></i>
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)}></button>
        </div>
      )}

      {/* Create User Form */}
      {showCreateForm && (
        <div className="card mb-3">
          <div className="card-header">
            <h3 className="card-title">
              <i className="bi bi-person-plus me-2"></i>
              Create New System User
            </h3>
          </div>
          <form onSubmit={handleCreateUser}>
            <div className="card-body">
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Email *</label>
                  <input 
                    type="email"
                    className="form-control"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    required
                  />
                </div>
                
                <div className="col-md-6 mb-3">
                  <label className="form-label">Full Name *</label>
                  <input 
                    type="text"
                    className="form-control"
                    value={formData.full_name}
                    onChange={e => setFormData({...formData, full_name: e.target.value})}
                    required
                  />
                </div>
                
                <div className="col-md-6 mb-3">
                  <label className="form-label">Role *</label>
                  <select 
                    className="form-select"
                    value={formData.role}
                    onChange={e => setFormData({...formData, role: e.target.value as any})}
                    required
                  >
                    <option value="system_user">System User</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                  <div className="form-text">
                    Super admins can manage all tenants and system users
                  </div>
                </div>
                
                <div className="col-md-6 mb-3">
                  <label className="form-label">Password *</label>
                  <input 
                    type="password"
                    className="form-control"
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    required
                    minLength={8}
                  />
                  <div className="form-text">
                    Minimum 8 characters
                  </div>
                </div>
              </div>
            </div>
            <div className="card-footer">
              <button type="submit" className="btn btn-primary">
                <i className="bi bi-check-circle me-1"></i>
                Create User
              </button>
              <button 
                type="button"
                className="btn btn-secondary ms-2"
                onClick={() => {
                  setShowCreateForm(false)
                  setFormData({ email: '', full_name: '', role: 'system_user', password: '' })
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stats Info Boxes */}
      <div className="row mb-3">
        <div className="col-md-3">
          <div className="info-box">
            <span className="info-box-icon text-bg-primary">
              <i className="bi bi-people-fill"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">Total Users</span>
              <span className="info-box-number">{users.length}</span>
            </div>
          </div>
        </div>
        
        <div className="col-md-3">
          <div className="info-box">
            <span className="info-box-icon text-bg-danger">
              <i className="bi bi-shield-fill-check"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">Super Admins</span>
              <span className="info-box-number">
                {users.filter(u => u.role === 'super_admin').length}
              </span>
            </div>
          </div>
        </div>
        
        <div className="col-md-3">
          <div className="info-box">
            <span className="info-box-icon text-bg-info">
              <i className="bi bi-person-badge"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">System Users</span>
              <span className="info-box-number">
                {users.filter(u => u.role === 'system_user').length}
              </span>
            </div>
          </div>
        </div>
        
        <div className="col-md-3">
          <div className="info-box">
            <span className="info-box-icon text-bg-success">
              <i className="bi bi-check-circle-fill"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">Active Users</span>
              <span className="info-box-number">
                {users.filter(u => u.is_active).length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-list-ul me-2"></i>
            All System Users
          </h3>
        </div>
        <div className="card-body p-0">
          {users.length > 0 ? (
            <div className="table-responsive">
              <table className="table table-hover table-striped mb-0">
                <thead className="table-light">
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Tenant Memberships</th>
                    <th>Last Login</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <div 
                            className="rounded-circle text-white d-flex align-items-center justify-content-center"
                            style={{ 
                              width: '36px', 
                              height: '36px', 
                              fontSize: '14px', 
                              fontWeight: 'bold',
                              backgroundColor: user.role === 'super_admin' ? '#dc3545' : '#0d6efd'
                            }}
                          >
                            {user.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="fw-semibold">{user.full_name}</div>
                            <small className="text-muted">{user.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${
                          user.role === 'super_admin' ? 'text-bg-danger' : 'text-bg-info'
                        }`}>
                          {user.role === 'super_admin' ? 'Super Admin' : 'System User'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${
                          user.is_active ? 'text-bg-success' : 'text-bg-secondary'
                        }`}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        {memberships[user.id]?.length > 0 ? (
                          <div className="d-flex gap-1 flex-wrap">
                            {memberships[user.id].map((m, idx) => (
                              <span key={idx} className="badge text-bg-secondary" title={`${m.tenant_role} in ${m.tenant_name}`}>
                                {m.tenant_name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted">None</span>
                        )}
                      </td>
                      <td>
                        <small className="text-muted">
                          {user.last_login_at 
                            ? new Date(user.last_login_at).toLocaleDateString()
                            : 'Never'}
                        </small>
                      </td>
                      <td>
                        <div className="btn-group btn-group-sm" role="group">
                          <button 
                            className="btn btn-outline-primary"
                            onClick={() => handleChangeRole(user.id, user.role)}
                            title="Change Role"
                          >
                            <i className="bi bi-pencil"></i>
                          </button>
                          <button 
                            className={`btn btn-outline-${user.is_active ? 'warning' : 'success'}`}
                            onClick={() => handleToggleActive(user.id, user.is_active)}
                            title={user.is_active ? 'Deactivate' : 'Activate'}
                          >
                            <i className={`bi bi-${user.is_active ? 'pause' : 'play'}-fill`}></i>
                          </button>
                          <button 
                            className="btn btn-outline-danger"
                            onClick={() => handleDeleteUser(user.id, user.email)}
                            title="Delete User"
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-5">
              <i className="bi bi-people" style={{ fontSize: '48px', color: '#6c757d' }}></i>
              <h5 className="mt-3">No System Users Found</h5>
              <p className="text-muted">Create your first system user to get started.</p>
            </div>
          )}
        </div>
        {users.length > 0 && (
          <div className="card-footer">
            <small className="text-muted">
              Showing {users.length} system user{users.length !== 1 ? 's' : ''}
            </small>
          </div>
        )}
      </div>
    </>
  )
}
