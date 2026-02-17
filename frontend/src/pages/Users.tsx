import React, { useEffect, useState } from 'react'
import api from '../api/client'
import RequireRole from '../components/RequireRole'
import { useTenant } from '../components/TenantContext'
import { useUser } from '../components/UserContext'
import TransferOwnership from '../components/TransferOwnership'

type User = { id: string; username: string; email?: string; roles?: string[] }

export default function Users() {
  const { tenantId } = useTenant()
  const { user: currentUser } = useUser()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')

  useEffect(()=>{ load() }, [tenantId])

  async function load(){
    if (!tenantId) { setUsers([]); setLoading(false); return }
    setLoading(true)
    try{
      const r = await api.get('/users')
      setUsers(r.data || [])
    }catch(e:any){ setError(e.response?.data?.message || e.message || 'Failed to load users') }
    setLoading(false)
  }

  async function invite(e: React.FormEvent){
    e.preventDefault()
    if(!inviteEmail) return alert('Enter email')
    try{
      // default invited role to 'analyst' for demo
      await api.post('/users/invite', { email: inviteEmail, role: 'analyst' })
      setInviteEmail('')
      await load()
      alert('Invite sent (stub)')
    }catch(e:any){ alert('Invite failed: ' + (e.response?.data?.message || e.message)) }
  }

  return (
    <>
      {/* Page Header */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-people me-2"></i>
            User Management
          </h3>
          <RequireRole role="admin">
            <div className="card-tools">
              <button 
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const formSection = document.querySelector('.invite-user-card')
                  formSection?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                <i className="bi bi-plus-circle me-1"></i>
                Invite User
              </button>
            </div>
          </RequireRole>
        </div>
      </div>

      {/* Stats Info Boxes */}
      <div className="row mb-3">
        <div className="col-12 col-sm-6 col-md-4">
          <div className="info-box">
            <span className="info-box-icon text-bg-primary shadow-sm">
              <i className="bi bi-people-fill"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">Total Users</span>
              <span className="info-box-number">{users.length}</span>
            </div>
          </div>
        </div>
        
        <div className="col-12 col-sm-6 col-md-4">
          <div className="info-box">
            <span className="info-box-icon text-bg-danger shadow-sm">
              <i className="bi bi-shield-fill-check"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">Admins</span>
              <span className="info-box-number">
                {users.filter(u => u.roles?.includes('admin')).length}
              </span>
            </div>
          </div>
        </div>
        
        <div className="col-12 col-sm-6 col-md-4">
          <div className="info-box">
            <span className="info-box-icon text-bg-success shadow-sm">
              <i className="bi bi-check-circle-fill"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">Active Users</span>
              <span className="info-box-number">{users.length}</span>
            </div>
          </div>
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

      {/* Users Table */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-list-ul me-2"></i>
            All Users
          </h3>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-3 text-muted">Loading users...</p>
            </div>
          ) : users.length > 0 ? (
            <div className="table-responsive">
              <table className="table table-hover table-striped mb-0">
                <thead className="table-light">
                  <tr>
                    <th>#</th>
                    <th>User</th>
                    <th>Roles</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, idx) => (
                    <tr key={user.id}>
                      <td>{idx + 1}</td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <div 
                            className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center"
                            style={{ width: '32px', height: '32px', fontSize: '14px', fontWeight: 'bold' }}
                          >
                            {(user.username || user.email)?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="fw-semibold">
                              {user.username || user.id}
                            </div>
                            {user.email && (
                              <small className="text-muted">{user.email}</small>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="d-flex gap-1 flex-wrap">
                          {(user.roles || []).map((role, i) => (
                            <span 
                              key={i}
                              className={`badge ${
                                role === 'admin' ? 'text-bg-danger' : 
                                role === 'analyst' ? 'text-bg-info' : 
                                'text-bg-secondary'
                              }`}
                            >
                              {role}
                            </span>
                          ))}
                          {(!user.roles || user.roles.length === 0) && (
                            <span className="badge text-bg-secondary">user</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <RequireRole role="admin">
                          <div className="btn-group btn-group-sm" role="group">
                            <button 
                              className="btn btn-outline-primary"
                              onClick={async () => { 
                                const newRole = prompt('Enter new role (admin, analyst, user):')
                                if (!newRole) return
                                try { 
                                  await api.put(`/users/${user.id}/role`, { role: newRole })
                                  alert('Role updated')
                                  load()
                                } catch (e: any) { 
                                  alert('Update failed: ' + (e?.response?.data?.message || e?.message)) 
                                }
                              }}
                              title="Change Role"
                            >
                              <i className="bi bi-pencil"></i>
                            </button>
                            <button 
                              className="btn btn-outline-danger"
                              onClick={async () => { 
                                if (!confirm(`Deactivate user "${user.username || user.email}"?`)) return
                                try { 
                                  await api.put(`/users/${user.id}/deactivate`)
                                  load()
                                } catch (e: any) { 
                                  alert('Deactivate failed: ' + (e?.response?.data?.message || e?.message))
                                }
                              }}
                              title="Deactivate User"
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          </div>
                        </RequireRole>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-5">
              <i className="bi bi-people" style={{ fontSize: '48px', color: '#6c757d' }}></i>
              <h5 className="mt-3">No Users Found</h5>
              <p className="text-muted">Invite team members to collaborate on financials.</p>
            </div>
          )}
        </div>
        {users.length > 0 && (
          <div className="card-footer">
            <small className="text-muted">
              Showing {users.length} user{users.length !== 1 ? 's' : ''}
            </small>
          </div>
        )}
      </div>

      {/* Invite User Form */}
      <RequireRole role="admin">
        <div className="card card-primary card-outline invite-user-card mb-3">
          <div className="card-header">
            <h3 className="card-title">
              <i className="bi bi-envelope-plus me-2"></i>
              Invite New User
            </h3>
          </div>
          <form onSubmit={invite}>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label">Email Address</label>
                <input 
                  type="email"
                  placeholder="user@example.com" 
                  value={inviteEmail} 
                  onChange={e => setInviteEmail(e.target.value)}
                  className="form-control"
                  required
                />
                <div className="form-text">
                  User will receive an invitation email to join this tenant
                </div>
              </div>
            </div>
            <div className="card-footer">
              <button type="submit" className="btn btn-primary">
                <i className="bi bi-send me-1"></i>
                Send Invitation
              </button>
              <button 
                type="button" 
                className="btn btn-secondary ms-2"
                onClick={() => setInviteEmail('')}
              >
                Clear
              </button>
            </div>
          </form>
        </div>
      </RequireRole>

      {/* Transfer Ownership Section */}
      <RequireRole role="admin">
        {currentUser?.email && (
          <TransferOwnership 
            currentUserEmail={currentUser.email}
            onTransferInitiated={() => load()}
          />
        )}
      </RequireRole>
    </>
  )
}
