import React, { useState, useEffect } from 'react'
import api from '../api/client'
import { useTenant } from '../components/TenantContext'

interface ApprovalChain {
  id: string
  chain_name: string
  description?: string
  created_at: string
}

interface ApprovalRequest {
  id: string
  entity_type: string
  entity_id: string
  status: string
  current_step: number
  created_at: string
}

export default function Workflow() {
  const { tenantId } = useTenant()
  const [tab, setTab] = useState<'chains' | 'requests'>('chains')
  const [chains, setChains] = useState<ApprovalChain[]>([])
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [showChainForm, setShowChainForm] = useState(false)
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [chainName, setChainName] = useState('')
  const [chainSteps, setChainSteps] = useState('[]')
  const [entityType, setEntityType] = useState('')
  const [entityId, setEntityId] = useState('')
  const [chainId, setChainId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId) { setChains([]); setRequests([]); return }
    loadChains()
    loadRequests()
  }, [tenantId])

  async function loadChains() {
    if (!tenantId) { setChains([]); return }
    try {
      const res = await api.get('/workflow/chains')
      setChains(res.data)
    } catch (err: any) {
      console.error('Failed to load chains:', err)
    }
  }

  async function loadRequests() {
    if (!tenantId) { setRequests([]); return }
    try {
      const res = await api.get('/workflow/requests')
      setRequests(res.data)
    } catch (err: any) {
      console.error('Failed to load requests:', err)
    }
  }

  async function createChain(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const steps = JSON.parse(chainSteps)
      const res = await api.post('/workflow/chains', {
        chain_name: chainName,
        steps
      })
      setChains([...chains, res.data])
      setChainName('')
      setChainSteps('[]')
      setShowChainForm(false)
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to create chain')
    } finally {
      setLoading(false)
    }
  }

  async function createRequest(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await api.post('/workflow/requests', {
        entity_type: entityType,
        entity_id: entityId,
        chain_id: chainId,
        requested_by: 'current_user'
      })
      setRequests([...requests, res.data])
      setEntityType('')
      setEntityId('')
      setChainId('')
      setShowRequestForm(false)
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to create request')
    } finally {
      setLoading(false)
    }
  }

  async function performAction(requestId: string, action: 'approve' | 'reject') {
    try {
      await api.post(`/workflow/requests/${requestId}/actions`, {
        action,
        actor: 'current_user',
        comments: `${action} via UI`
      })
      loadRequests()
    } catch (err: any) {
      alert('Action failed: ' + (err.response?.data?.message || err.message))
    }
  }

  async function cancelRequest(requestId: string) {
    if (!confirm('Cancel this request?')) return
    try {
      await api.put(`/workflow/requests/${requestId}/cancel`)
      loadRequests()
    } catch (err: any) {
      alert('Cancel failed: ' + (err.response?.data?.message || err.message))
    }
  }

  return (
    <>
      {/* Page Header */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-diagram-2 me-2"></i>
            Approval Workflow
          </h3>
          <div className="card-tools">
            <div className="btn-group" role="group">
              <button 
                type="button"
                className={`btn btn-sm ${tab === 'chains' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setTab('chains')}
              >
                <i className="bi bi-link me-1"></i>
                Chains
              </button>
              <button 
                type="button"
                className={`btn btn-sm ${tab === 'requests' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setTab('requests')}
              >
                <i className="bi bi-file-earmark-check me-1"></i>
                Requests
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Approval Chains Tab */}
      {tab === 'chains' && (
        <>
          {/* Create Chain Form */}
          {showChainForm && (
            <div className="card card-primary card-outline mb-3">
              <div className="card-header">
                <h3 className="card-title">
                  <i className="bi bi-plus-circle me-2"></i>
                  Create Approval Chain
                </h3>
                <div className="card-tools">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowChainForm(false)}>
                    <i className="bi bi-x-lg"></i>
                  </button>
                </div>
              </div>
              <form onSubmit={createChain}>
                <div className="card-body">
                  {error && (
                    <div className="alert alert-danger alert-dismissible fade show" role="alert">
                      <i className="bi bi-exclamation-triangle me-2"></i>
                      {error}
                      <button type="button" className="btn-close" onClick={() => setError(null)}></button>
                    </div>
                  )}

                  <div className="mb-3">
                    <label className="form-label">Chain Name</label>
                    <input 
                      type="text"
                      className="form-control"
                      value={chainName} 
                      onChange={e => setChainName(e.target.value)}
                      placeholder="e.g., Financial Statement Approval"
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Steps (JSON Array)</label>
                    <textarea 
                      className="form-control"
                      value={chainSteps} 
                      onChange={e => setChainSteps(e.target.value)}
                      placeholder='[{"step": 1, "approver": "manager"}, {"step": 2, "approver": "cfo"}]'
                      rows={6}
                      style={{ fontFamily: 'monospace', fontSize: '13px' }}
                      required
                    />
                    <div className="form-text">Enter valid JSON array with approval steps</div>
                  </div>
                </div>

                <div className="card-footer">
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    <i className="bi bi-check-circle me-1"></i>
                    {loading ? 'Creating...' : 'Create Chain'}
                  </button>
                  <button type="button" className="btn btn-secondary ms-2" onClick={() => setShowChainForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Chains List */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <i className="bi bi-link me-2"></i>
                Approval Chains
              </h3>
              <div className="card-tools">
                {!showChainForm && (
                  <button className="btn btn-primary btn-sm" onClick={() => setShowChainForm(true)}>
                    <i className="bi bi-plus-lg me-1"></i>
                    New Chain
                  </button>
                )}
              </div>
            </div>
            <div className="card-body">
              {chains.length === 0 ? (
                <div className="text-center py-5">
                  <i className="bi bi-inbox" style={{ fontSize: '3rem', color: '#ccc' }}></i>
                  <p className="mt-2 text-muted">No approval chains yet</p>
                  {!showChainForm && (
                    <button className="btn btn-primary btn-sm mt-2" onClick={() => setShowChainForm(true)}>
                      <i className="bi bi-plus-lg me-1"></i>
                      Create First Chain
                    </button>
                  )}
                </div>
              ) : (
                <div className="row g-3">
                  {chains.map(c => (
                    <div key={c.id} className="col-md-6">
                      <div className="card card-outline card-info">
                        <div className="card-body">
                          <h5 className="card-title mb-2">
                            <i className="bi bi-link-45deg me-1"></i>
                            {c.chain_name}
                          </h5>
                          {c.description && (
                            <p className="card-text text-muted small mb-2">
                              {c.description}
                            </p>
                          )}
                          <small className="text-muted">
                            <i className="bi bi-key me-1"></i>
                            <code style={{ fontSize: '11px' }}>{c.id}</code>
                          </small>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {chains.length > 0 && (
              <div className="card-footer">
                <small className="text-muted">Showing {chains.length} chain(s)</small>
              </div>
            )}
          </div>
        </>
      )}

      {/* Approval Requests Tab */}
      {tab === 'requests' && (
        <>
          {/* Create Request Form */}
          {showRequestForm && (
            <div className="card card-primary card-outline mb-3">
              <div className="card-header">
                <h3 className="card-title">
                  <i className="bi bi-plus-circle me-2"></i>
                  Create Approval Request
                </h3>
                <div className="card-tools">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowRequestForm(false)}>
                    <i className="bi bi-x-lg"></i>
                  </button>
                </div>
              </div>
              <form onSubmit={createRequest}>
                <div className="card-body">
                  {error && (
                    <div className="alert alert-danger alert-dismissible fade show" role="alert">
                      <i className="bi bi-exclamation-triangle me-2"></i>
                      {error}
                      <button type="button" className="btn-close" onClick={() => setError(null)}></button>
                    </div>
                  )}

                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Entity Type</label>
                      <input 
                        type="text"
                        className="form-control"
                        value={entityType} 
                        onChange={e => setEntityType(e.target.value)}
                        placeholder="e.g., financial_statement"
                        required
                      />
                    </div>

                    <div className="col-md-6 mb-3">
                      <label className="form-label">Entity ID</label>
                      <input 
                        type="text"
                        className="form-control"
                        value={entityId} 
                        onChange={e => setEntityId(e.target.value)}
                        placeholder="UUID of the entity"
                        required
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Approval Chain</label>
                    {chains.length > 0 ? (
                      <select className="form-select" value={chainId} onChange={e => setChainId(e.target.value)} required>
                        <option value="">-- Select Chain --</option>
                        {chains.map(c => (
                          <option key={c.id} value={c.id}>{c.chain_name}</option>
                        ))}
                      </select>
                    ) : (
                      <input 
                        type="text"
                        className="form-control"
                        value={chainId} 
                        onChange={e => setChainId(e.target.value)}
                        placeholder="UUID of approval chain"
                        required
                      />
                    )}
                  </div>
                </div>

                <div className="card-footer">
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    <i className="bi bi-check-circle me-1"></i>
                    {loading ? 'Creating...' : 'Create Request'}
                  </button>
                  <button type="button" className="btn btn-secondary ms-2" onClick={() => setShowRequestForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Requests List */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <i className="bi bi-file-earmark-check me-2"></i>
                Approval Requests
              </h3>
              <div className="card-tools">
                {!showRequestForm && (
                  <button className="btn btn-primary btn-sm" onClick={() => setShowRequestForm(true)}>
                    <i className="bi bi-plus-lg me-1"></i>
                    New Request
                  </button>
                )}
              </div>
            </div>
            <div className="card-body">
              {requests.length === 0 ? (
                <div className="text-center py-5">
                  <i className="bi bi-inbox" style={{ fontSize: '3rem', color: '#ccc' }}></i>
                  <p className="mt-2 text-muted">No approval requests yet</p>
                  {!showRequestForm && (
                    <button className="btn btn-primary btn-sm mt-2" onClick={() => setShowRequestForm(true)}>
                      <i className="bi bi-plus-lg me-1"></i>
                      Create First Request
                    </button>
                  )}
                </div>
              ) : (
                <div className="row g-3">
                  {requests.map(r => {
                    const statusConfig = {
                      approved: { class: 'text-bg-success', icon: 'check-circle' },
                      rejected: { class: 'text-bg-danger', icon: 'x-circle' },
                      pending: { class: 'text-bg-warning', icon: 'clock' },
                      cancelled: { class: 'text-bg-secondary', icon: 'dash-circle' }
                    }
                    const status = statusConfig[r.status as keyof typeof statusConfig] || statusConfig.pending

                    return (
                      <div key={r.id} className="col-md-6">
                        <div className="card">
                          <div className="card-body">
                            <div className="d-flex justify-content-between align-items-start mb-2">
                              <div className="flex-grow-1">
                                <h5 className="card-title mb-1">
                                  <i className="bi bi-file-earmark me-1"></i>
                                  {r.entity_type}
                                </h5>
                                <small className="text-muted">
                                  <code style={{ fontSize: '11px' }}>{r.entity_id}</code>
                                </small>
                              </div>
                              <span className={`badge ${status.class}`}>
                                <i className={`bi bi-${status.icon} me-1`}></i>
                                {r.status}
                              </span>
                            </div>

                            <div className="mb-2">
                              <small className="text-muted">
                                <i className="bi bi-ladder me-1"></i>
                                Step: <strong>{r.current_step}</strong>
                              </small>
                            </div>

                            <div className="d-flex gap-2 mt-3">
                              {r.status === 'pending' && (
                                <>
                                  <button 
                                    onClick={() => performAction(r.id, 'approve')} 
                                    className="btn btn-sm btn-success"
                                  >
                                    <i className="bi bi-check-lg me-1"></i>
                                    Approve
                                  </button>
                                  <button 
                                    onClick={() => performAction(r.id, 'reject')} 
                                    className="btn btn-sm btn-danger"
                                  >
                                    <i className="bi bi-x-lg me-1"></i>
                                    Reject
                                  </button>
                                </>
                              )}
                              <button 
                                onClick={() => cancelRequest(r.id)} 
                                className="btn btn-sm btn-outline-secondary"
                              >
                                <i className="bi bi-dash-circle me-1"></i>
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {requests.length > 0 && (
              <div className="card-footer">
                <small className="text-muted">Showing {requests.length} request(s)</small>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
