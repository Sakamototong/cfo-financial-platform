import React, { useState, useEffect } from 'react'
import api from '../api/client'
import RequireRole from '../components/RequireRole'

interface Tenant {
  id: string
  name: string
  database_name?: string
  created_at?: string
}

export default function Tenants() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingTenants, setLoadingTenants] = useState(true)

  async function createTenant(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await api.post('/tenant', { name })
      setTenants([...tenants, res.data])
      setName('')
      setShowForm(false)
      // Show success message
      const successAlert = document.createElement('div')
      successAlert.className = 'alert alert-success alert-dismissible fade show'
      successAlert.innerHTML = `
        <i class="bi bi-check-circle me-2"></i>
        Tenant created successfully!
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      `
      document.querySelector('.app-content')?.prepend(successAlert)
      setTimeout(() => successAlert.remove(), 5000)
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to create tenant')
    } finally {
      setLoading(false)
    }
  }

  async function fetchTenant(id: string) {
    try {
      const res = await api.get(`/tenant/${id}`)
      alert(JSON.stringify(res.data, null, 2))
    } catch (err: any) {
      alert('Error: ' + (err.response?.data?.message || err.message))
    }
  }

  async function loadTenants() {
    setLoadingTenants(true)
    try {
      const res = await api.get('/tenants')
      setTenants(res.data || [])
    } catch (err: any) {
      console.error('Failed to load tenants:', err)
    } finally {
      setLoadingTenants(false)
    }
  }

  useEffect(() => {
    loadTenants()
  }, [])

  return (
    <div className="row">
      <div className="col-12">
        {/* Page Header */}
        <div className="card mb-3">
          <div className="card-header">
            <h3 className="card-title">
              <i className="bi bi-building me-2"></i>
              Tenant Management
            </h3>
            <div className="card-tools">
              <RequireRole role="admin">
                <button 
                  onClick={() => setShowForm(!showForm)} 
                  className="btn btn-primary btn-sm"
                >
                  <i className={`bi bi-${showForm ? 'x' : 'plus'}-circle me-1`}></i>
                  {showForm ? 'Cancel' : 'New Tenant'}
                </button>
              </RequireRole>
            </div>
          </div>
          <div className="card-body">
            <p className="text-muted mb-0">
              <i className="bi bi-info-circle me-1"></i>
              Create and manage multi-tenant databases for your organization
            </p>
          </div>
        </div>

        {/* Create Form */}
        {showForm && (
          <RequireRole role="admin">
            <div className="card card-primary card-outline mb-3">
              <div className="card-header">
                <h3 className="card-title">
                  <i className="bi bi-plus-square me-2"></i>
                  Create New Tenant
                </h3>
              </div>
              <form onSubmit={createTenant}>
                <div className="card-body">
                  {error && (
                    <div className="alert alert-danger alert-dismissible fade show" role="alert">
                      <i className="bi bi-exclamation-triangle me-2"></i>
                      {error}
                      <button 
                        type="button" 
                        className="btn-close" 
                        onClick={() => setError(null)}
                      ></button>
                    </div>
                  )}
                  
                  <div className="mb-3">
                    <label htmlFor="tenantName" className="form-label">
                      Tenant Name <span className="text-danger">*</span>
                    </label>
                    <input 
                      type="text"
                      className="form-control"
                      id="tenantName"
                      value={name} 
                      onChange={e => setName(e.target.value)} 
                      placeholder="e.g., acme, techcorp"
                      required
                    />
                    <div className="form-text">
                      <i className="bi bi-lightbulb me-1"></i>
                      Use lowercase letters and hyphens only
                    </div>
                  </div>
                </div>
                <div className="card-footer">
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Creating...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-check-circle me-2"></i>
                        Create Tenant
                      </>
                    )}
                  </button>
                  <button 
                    type="button"
                    className="btn btn-secondary ms-2"
                    onClick={() => {
                      setShowForm(false)
                      setError(null)
                      setName('')
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </RequireRole>
        )}

        {/* Tenants List */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <i className="bi bi-list me-2"></i>
              Existing Tenants
            </h3>
            <div className="card-tools">
              <button 
                className="btn btn-tool" 
                onClick={loadTenants}
                disabled={loadingTenants}
              >
                <i className={`bi bi-arrow-clockwise ${loadingTenants ? 'spin' : ''}`}></i>
              </button>
            </div>
          </div>
          <div className="card-body p-0">
            {loadingTenants ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <p className="mt-2 text-muted">Loading tenants...</p>
              </div>
            ) : tenants.length === 0 ? (
              <div className="text-center py-5">
                <i className="bi bi-inbox" style={{fontSize: '4rem', color: '#dee2e6'}}></i>
                <p className="text-muted mt-3">
                  No tenants created yet. Create one to get started.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover table-striped mb-0">
                  <thead className="table-light">
                    <tr>
                      <th style={{width: '50px'}}>
                        <i className="bi bi-hash"></i>
                      </th>
                      <th>Tenant Name</th>
                      <th>Tenant ID</th>
                      <th>Database</th>
                      <th style={{width: '200px'}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t, index) => (
                      <tr key={t.id}>
                        <td className="text-center">{index + 1}</td>
                        <td>
                          <strong>
                            <i className="bi bi-building me-2"></i>
                            {t.name}
                          </strong>
                        </td>
                        <td>
                          <code className="text-sm">{t.id}</code>
                        </td>
                        <td>
                          {t.database_name ? (
                            <span className="badge bg-info">
                              <i className="bi bi-database me-1"></i>
                              {t.database_name}
                            </span>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td>
                          <RequireRole role="admin">
                            <div className="btn-group btn-group-sm" role="group">
                              <button 
                                onClick={() => fetchTenant(t.id)} 
                                className="btn btn-outline-primary"
                                title="View Details"
                              >
                                <i className="bi bi-eye"></i>
                                <span className="d-none d-md-inline ms-1">View</span>
                              </button>
                              <button 
                                className="btn btn-outline-secondary"
                                title="Edit Tenant"
                              >
                                <i className="bi bi-pencil"></i>
                                <span className="d-none d-md-inline ms-1">Edit</span>
                              </button>
                            </div>
                          </RequireRole>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {tenants.length > 0 && (
            <div className="card-footer clearfix">
              <small className="text-muted">
                <i className="bi bi-info-circle me-1"></i>
                Total tenants: <strong>{tenants.length}</strong>
              </small>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
