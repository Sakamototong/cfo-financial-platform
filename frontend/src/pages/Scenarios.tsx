import React, { useEffect, useState } from 'react'
import api from '../api/client'
import { useTenant } from '../components/TenantContext'
import EmptyState from '../components/EmptyState'

export default function Scenarios(){
  const { tenantId } = useTenant()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  async function load(){
    if (!tenantId) { setItems([]); setLoading(false); return }
    setLoading(true)
    try{
      const r = await api.get('/scenarios')
      setItems(r.data || [])
    }catch(e){ 
      console.error('Failed to load scenarios', e)
    }
    setLoading(false)
  }

  useEffect(()=>{ load() },[tenantId])

  async function createScenario(e: React.FormEvent){
    e.preventDefault()
    if(!name) return
    setCreating(true)
    try{
      const payload = {
        name,
        description: `${name} created from frontend`,
        baseline_period: '2026-01',
        projection_months: 12,
        assumptions: [{ category: 'Revenue', growth_rate: 10, growth_type: 'percentage' }]
      }
      const r = await api.post('/scenarios', payload)
      const created = r.data?.scenario || r.data
      setItems(prev => [created, ...prev])
      setName('')
    }catch(err: any){
      console.error(err)
      alert('Failed to create scenario: ' + (err?.response?.data?.message || err?.message || 'Unknown'))
    }finally{ setCreating(false) }
  }

  return (
    <>
      {/* Page Header */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-diagram-3 me-2"></i>
            Financial Scenarios
          </h3>
          <div className="card-tools">
            <button className="btn btn-secondary btn-sm" onClick={() => load()}>
              <i className="bi bi-arrow-clockwise me-1"></i>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Stats Info Box */}
      <div className="row mb-3">
        <div className="col-12 col-sm-6 col-md-4">
          <div className="info-box">
            <span className="info-box-icon text-bg-primary shadow-sm">
              <i className="bi bi-diagram-3-fill"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">Total Scenarios</span>
              <span className="info-box-number">{items.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scenarios Table */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-list-ul me-2"></i>
            All Scenarios
          </h3>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-3 text-muted">Loading scenarios...</p>
            </div>
          ) : items.length > 0 ? (
            <div className="table-responsive">
              <table className="table table-hover table-striped mb-0">
                <thead className="table-light">
                  <tr>
                    <th>#</th>
                    <th>Scenario Name</th>
                    <th>Baseline Period</th>
                    <th>Projection</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.id}>
                      <td>{idx + 1}</td>
                      <td>
                        <div className="fw-semibold">
                          {item.scenario_name || item.name || 'Unnamed'}
                        </div>
                        {item.description && (
                          <small className="text-muted">{item.description}</small>
                        )}
                      </td>
                      <td>{item.baseline_period || 'N/A'}</td>
                      <td>
                        {item.projection_months ? (
                          <span className="badge text-bg-info">
                            {item.projection_months} months
                          </span>
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td>
                        {item.created_at 
                          ? new Date(item.created_at).toLocaleDateString() 
                          : 'N/A'
                        }
                      </td>
                      <td>
                        <button 
                          className="btn btn-outline-danger btn-sm"
                          onClick={async () => {
                            if(confirm(`Delete scenario "${item.scenario_name || item.name}"?`)) {
                              try {
                                await api.delete(`/scenarios/${item.id}`)
                                setItems(prev => prev.filter(s => s.id !== item.id))
                              } catch(e: any) {
                                alert('Failed to delete: ' + (e?.response?.data?.message || e?.message || 'Unknown'))
                              }
                            }
                          }}
                          title="Delete Scenario"
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-5">
              <i className="bi bi-diagram-3" style={{ fontSize: '48px', color: '#6c757d' }}></i>
              <h5 className="mt-3">No Scenarios Yet</h5>
              <p className="text-muted">
                Create scenarios like 'Actual', 'Budget', or 'Forecast' to organize your financial projections.
              </p>
              <button 
                className="btn btn-primary mt-2"
                onClick={() => {
                  const formSection = document.querySelector('.create-scenario-card')
                  formSection?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                Create Your First Scenario
              </button>
            </div>
          )}
        </div>
        {items.length > 0 && (
          <div className="card-footer">
            <small className="text-muted">
              Showing {items.length} scenario{items.length !== 1 ? 's' : ''}
            </small>
          </div>
        )}
      </div>

      {/* Create Scenario Form */}
      <div className="card card-primary card-outline create-scenario-card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-plus-circle me-2"></i>
            Create New Scenario
          </h3>
        </div>
        
        <form onSubmit={createScenario}>
          <div className="card-body">
            <div className="mb-3">
              <label className="form-label">Scenario Name</label>
              <input 
                type="text"
                placeholder="e.g., Budget 2026, Optimistic Forecast" 
                value={name} 
                onChange={e=>setName(e.target.value)}
                className="form-control"
                required
              />
              <div className="form-text">
                Choose a descriptive name for your scenario
              </div>
            </div>
          </div>

          <div className="card-footer">
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={creating || !name}
            >
              <i className="bi bi-check-circle me-1"></i>
              {creating ? 'Creating...' : 'Create Scenario'}
            </button>
            <button 
              type="button" 
              className="btn btn-secondary ms-2"
              onClick={() => setName('')}
            >
              Clear
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
