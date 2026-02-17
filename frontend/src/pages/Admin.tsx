import React, { useState } from 'react'
import api from '../api/client'
import RequireRole from '../components/RequireRole'
import { useTenant } from '../components/TenantContext'

export default function Admin() {
  const { tenantId: currentTenant } = useTenant()
  const [action, setAction] = useState<'etl-params' | 'approve' | 'reject' | 'audit'>('etl-params')
  const [tenantId, setTenantId] = useState('')
  const [params, setParams] = useState('{}')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function executeAction(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setLoading(true); setResult(null)
    try {
      let res
      switch (action) {
        case 'etl-params':
          res = await api.post('/admin/etl-params', { tenant_id: tenantId, params: JSON.parse(params) }); break
        case 'approve':
          res = await api.put(`/admin/approvals/${tenantId}/approve`); break
        case 'reject':
          res = await api.put(`/admin/approvals/${tenantId}/reject`); break
        case 'audit':
          res = await api.get('/admin/audit'); break
      }
      setResult(res.data)
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Action failed')
    } finally { setLoading(false) }
  }

  async function createAuditLog() {
    setError(null); setLoading(true)
    try {
      const res = await api.post('/admin/audit', { entity_type: 'test', entity_id: '123', action: 'manual_test', changes: { test: true } })
      setResult(res.data)
    } catch (err: any) { setError(err.response?.data?.message || err.message) }
    finally { setLoading(false) }
  }

  return (
    <>
      {/* Header */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title"><i className="bi bi-gear me-2"></i>System Administration</h3>
        </div>
        <div className="card-body py-2">
          <small className="text-muted">Manage ETL parameters, approvals, and audit logs</small>
        </div>
      </div>

      <RequireRole role="admin">
        {/* Admin Actions */}
        <div className="card mb-3">
          <div className="card-header"><h3 className="card-title"><i className="bi bi-lightning me-2"></i>Admin Actions</h3></div>
          <div className="card-body">
            {error && <div className="alert alert-danger alert-dismissible"><button className="btn-close" onClick={() => setError(null)}></button>{error}</div>}

            <form onSubmit={executeAction}>
              <div className="mb-3">
                <label className="form-label">Action Type</label>
                <select className="form-select" value={action} onChange={e => setAction(e.target.value as any)}>
                  <option value="etl-params">Set ETL Parameters</option>
                  <option value="approve">Approve Tenant</option>
                  <option value="reject">Reject Tenant</option>
                  <option value="audit">View Audit Logs</option>
                </select>
              </div>

              {action !== 'audit' && (
                <div className="mb-3">
                  <label className="form-label">Tenant ID</label>
                  <input className="form-control" value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="Enter tenant UUID" required />
                </div>
              )}

              {action === 'etl-params' && (
                <div className="mb-3">
                  <label className="form-label">ETL Parameters (JSON)</label>
                  <textarea className="form-control font-monospace" value={params} onChange={e => setParams(e.target.value)}
                    placeholder='{"max_file_size": 10485760, "allowed_formats": ["xlsx", "csv"]}' rows={6} required />
                </div>
              )}

              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <><span className="spinner-border spinner-border-sm me-1"></span>Processing...</> : <><i className="bi bi-play-fill me-1"></i>Execute</>}
                </button>
                <button type="button" className="btn btn-outline-secondary" onClick={createAuditLog} disabled={loading}>
                  <i className="bi bi-journal-plus me-1"></i>Create Test Audit Log
                </button>
              </div>
            </form>
          </div>
        </div>
      </RequireRole>

      {/* Result */}
      {result && (
        <div className="card">
          <div className="card-header"><h3 className="card-title"><i className="bi bi-terminal me-2"></i>Result</h3></div>
          <div className="card-body">
            <pre className="bg-light p-3 rounded" style={{ maxHeight: '400px', overflow: 'auto', fontSize: '0.85rem' }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  )
}
