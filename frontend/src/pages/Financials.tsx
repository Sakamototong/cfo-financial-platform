import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useTenant } from '../components/TenantContext'
import EmptyState from '../components/EmptyState'

type LineItem = {
  line_code: string
  line_name: string
  line_order?: number
  amount: number
  currency: string
}

export default function Financials() {
  const { tenantId } = useTenant()
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [scenarios, setScenarios] = useState<any[]>([])
  
  const [statementType, setStatementType] = useState('PL')
  const [periodType, setPeriodType] = useState('monthly')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null)
  const [scenario, setScenario] = useState('actual')
  const [status, setStatus] = useState('draft')
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { line_code: 'REV001', line_name: 'Revenue', line_order: 1, amount: 100000, currency: 'THB' },
    { line_code: 'EXP001', line_name: 'Expenses', line_order: 2, amount: 40000, currency: 'THB' }
  ])
  
  const [showNewScenario, setShowNewScenario] = useState(false)
  const [newScenarioName, setNewScenarioName] = useState('')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [toast, setToast] = useState<{type: 'success'|'error', message: string} | null>(null)

  useEffect(() => {
    if (tenantId) {
      load()
      loadScenarios()
    }
  }, [tenantId])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  async function load() {
    if (!tenantId) return
    setLoading(true)
    try {
      const res = await api.get(`/financial/statements`)
      setList(res.data?.statements || res.data || [])
    } catch (err: any) {
      console.error('Failed to load statements:', err)
      setList([])
    } finally {
      setLoading(false)
    }
  }

  async function loadScenarios() {
    if (!tenantId) return
    try {
      const res = await api.get(`/scenarios`)
      setScenarios(res.data?.scenarios || res.data || [])
    } catch (err) {
      console.error('Failed to load scenarios:', err)
      setScenarios([])
    }
  }

  function updateLine(idx: number, field: keyof LineItem, value: any) {
    const updated = [...lineItems]
    updated[idx] = { ...updated[idx], [field]: value }
    setLineItems(updated)
  }

  function addLine() {
    setLineItems([...lineItems, { 
      line_code: '', 
      line_name: '', 
      line_order: lineItems.length + 1, 
      amount: 0, 
      currency: 'THB' 
    }])
  }

  function removeLine(idx: number) {
    setLineItems(lineItems.filter((_, i) => i !== idx))
  }

  async function createStatement(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantId) return
    
    setApiError(null)
    const errors: Record<string, string> = {}
    
    if (!periodStart || !periodEnd) {
      errors['period'] = 'Period start and end are required'
    } else if (new Date(periodStart) >= new Date(periodEnd)) {
      errors['period'] = 'Period start must be before period end'
    }
    
    if (lineItems.length === 0) {
      errors['lines'] = 'At least one line item is required'
    } else {
      lineItems.forEach((li, i) => {
        if (!li.line_code || !li.line_name || li.amount == null) {
          errors[`line-${i}`] = 'Code, name, and amount are required'
        }
      })
    }
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }
    
    setFormErrors({})
    setCreating(true)
    
    try {
      const payload = {
        statement_type: statementType,
        period_type: periodType,
        period_start: periodStart,
        period_end: periodEnd,
        scenario: selectedScenario || scenario,
        status: status,
        line_items: lineItems
      }
      
      await api.post(`/financial/statements`, payload)
      setToast({ type: 'success', message: 'Statement created successfully' })
      await load()
      
      // Reset form
      setLineItems([
        { line_code: 'REV001', line_name: 'Revenue', line_order: 1, amount: 100000, currency: 'THB' },
        { line_code: 'EXP001', line_name: 'Expenses', line_order: 2, amount: 40000, currency: 'THB' }
      ])
      setPeriodStart('')
      setPeriodEnd('')
      setStatus('draft')
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Failed to create statement'
      setApiError(errMsg)
      setToast({ type: 'error', message: errMsg })
    } finally {
      setCreating(false)
    }
  }

  function validateForm() {
    const errors: Record<string, string> = {}
    if (!periodStart || !periodEnd) {
      errors['period'] = 'Period start and end are required'
    } else if (new Date(periodStart) >= new Date(periodEnd)) {
      errors['period'] = 'Period start must be before period end'
    }
    if (lineItems.length === 0) {
      errors['lines'] = 'At least one line item is required'
    } else {
      lineItems.forEach((li, i) => {
        if (!li.line_code || !li.line_name || li.amount == null) {
          errors[`line-${i}`] = 'Code, name, and amount are required'
        }
      })
    }
    return errors
  }

  return (
    <>
      {/* Page Header */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-file-earmark-bar-graph me-2"></i>
            Financial Statements
          </h3>
          <div className="card-tools">
            <button className="btn btn-secondary btn-sm me-2">
              <i className="bi bi-printer me-1"></i>
              Print
            </button>
            <button 
              className="btn btn-primary btn-sm"
              onClick={() => {
                const formSection = document.querySelector('.create-statement-card')
                formSection?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              <i className="bi bi-plus-lg me-1"></i>
              Create Statement
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="row mb-3">
        <div className="col-md-4">
          <div className="info-box">
            <span className="info-box-icon text-bg-primary shadow-sm">
              <i className="bi bi-file-earmark-bar-graph"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">Total Statements</span>
              <span className="info-box-number">{list.length}</span>
            </div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="info-box">
            <span className="info-box-icon text-bg-warning shadow-sm">
              <i className="bi bi-pencil-square"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">Draft</span>
              <span className="info-box-number">{list.filter(s=>s.status==='draft').length}</span>
            </div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="info-box">
            <span className="info-box-icon text-bg-success shadow-sm">
              <i className="bi bi-check-circle-fill"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">Approved</span>
              <span className="info-box-number">{list.filter(s=>s.status==='approved').length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Statements Table */}
      {loading ? (
        <div className="card mb-3">
          <div className="card-body text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="mt-3 mb-0 text-muted">Loading statements...</p>
          </div>
        </div>
      ) : list.length > 0 ? (
        <div className="card mb-3">
          <div className="card-header">
            <h3 className="card-title">
              <i className="bi bi-table me-2"></i>
              All Statements
            </h3>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover table-striped mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Type</th>
                    <th>Period Start</th>
                    <th>Period End</th>
                    <th>Scenario</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(statement => (
                    <tr key={statement.id}>
                      <td>
                        <span className={`badge ${statement.statement_type === 'PL' ? 'text-bg-info' : statement.statement_type === 'BS' ? 'text-bg-primary' : 'text-bg-secondary'}`}>
                          {statement.statement_type === 'PL' ? 'P&L' : statement.statement_type}
                        </span>
                      </td>
                      <td>{new Date(statement.period_start).toLocaleDateString()}</td>
                      <td>{new Date(statement.period_end).toLocaleDateString()}</td>
                      <td><span className="fw-semibold">{statement.scenario}</span></td>
                      <td>
                        <span className={`badge ${statement.status === 'approved' ? 'text-bg-success' : 'text-bg-warning'}`}>
                          <i className={`bi bi-${statement.status === 'approved' ? 'check-circle' : 'pencil'} me-1`}></i>
                          {statement.status}
                        </span>
                      </td>
                      <td>
                        <div className="btn-group">
                          <Link to={`/financials/${statement.id}`} className="btn btn-sm btn-outline-primary">
                            <i className="bi bi-eye me-1"></i>
                            View
                          </Link>
                          <Link to={`/financials/${statement.id}/edit`} className="btn btn-sm btn-primary">
                            <i className="bi bi-pencil me-1"></i>
                            Edit
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card-footer">
            <small className="text-muted">Showing {list.length} statement(s)</small>
          </div>
        </div>
      ) : (
        <div className="card mb-3">
          <div className="card-body">
            <EmptyState
              icon="💰"
              title="No Financial Statements"
              description="Create your first statement (P&L, Balance Sheet, or Cash Flow) to start tracking your financials."
              action={{
                label: "Create Your First Statement",
                onClick: () => {
                  const formSection = document.querySelector('.create-statement-card')
                  formSection?.scrollIntoView({ behavior: 'smooth' })
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Create Statement Form */}
      <div className="card card-primary card-outline create-statement-card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-plus-circle me-2"></i>
            Create New Statement
          </h3>
        </div>
        
        <form onSubmit={createStatement}>
          <div className="card-body">
            {apiError && (
              <div className="alert alert-danger alert-dismissible fade show" role="alert">
                <i className="bi bi-x-circle me-2"></i>
                {apiError}
                <button type="button" className="btn-close" onClick={() => setApiError(null)}></button>
              </div>
            )}
            
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Statement Type</label>
                <select 
                  value={statementType} 
                  onChange={e=>setStatementType(e.target.value)}
                  className="form-select"
                >
                  <option value="PL">Profit & Loss (P&L)</option>
                  <option value="BS">Balance Sheet</option>
                  <option value="CF">Cash Flow</option>
                </select>
                <div className="form-text">The type of financial statement to create</div>
              </div>

              <div className="col-md-6 mb-3">
                <label className="form-label">Period Type</label>
                <select 
                  value={periodType} 
                  onChange={e=>setPeriodType(e.target.value)}
                  className="form-select"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
                <div className="form-text">Reporting frequency</div>
              </div>
            </div>

            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Period Start</label>
                <input 
                  type="date" 
                  value={periodStart} 
                  onChange={e=>setPeriodStart(e.target.value)}
                  className={`form-control ${formErrors['period'] ? 'is-invalid' : ''}`}
                />
              </div>
              
              <div className="col-md-6 mb-3">
                <label className="form-label">Period End</label>
                <input 
                  type="date" 
                  value={periodEnd} 
                  onChange={e=>setPeriodEnd(e.target.value)}
                  className={`form-control ${formErrors['period'] ? 'is-invalid' : ''}`}
                />
              </div>
            </div>
            {formErrors['period'] && (
              <div className="alert alert-danger mb-3">
                <i className="bi bi-exclamation-triangle me-2"></i>
                {formErrors['period']}
              </div>
            )}

            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Scenario</label>
                <div className="input-group">
                  <select 
                    value={selectedScenario || scenario} 
                    onChange={e=>setSelectedScenario(e.target.value)}
                    className="form-select"
                  >
                    <option value="">-- Select Scenario --</option>
                    <option value="actual">Actual</option>
                    {scenarios.map(s=> (
                      <option key={s.id || s.scenario_name || s.name} value={s.scenario_name || s.name || s.id}>
                        {s.scenario_name || s.name || s.id}
                      </option>
                    ))}
                  </select>
                  <button 
                    type="button" 
                    className="btn btn-outline-secondary" 
                    onClick={()=>setShowNewScenario(v=>!v)}
                  >
                    <i className="bi bi-plus-lg"></i>
                  </button>
                </div>
                <div className="form-text">Budget, forecast or actual scenario</div>
                
                {showNewScenario && (
                  <div className="input-group mt-2">
                    <input 
                      placeholder="Scenario name" 
                      value={newScenarioName} 
                      onChange={e=>setNewScenarioName(e.target.value)}
                      className="form-control"
                    />
                    <button 
                      type="button" 
                      className="btn btn-primary" 
                      onClick={async ()=>{
                        if(!newScenarioName) return alert('Enter scenario name')
                        try{
                          const payload = { 
                            name: newScenarioName, 
                            description: `Created from financials`, 
                            baseline_period: '2026-01', 
                            projection_months: 12, 
                            assumptions: [] 
                          }
                          const res = await api.post('/scenarios', payload)
                          const created = res.data?.scenario || res.data
                          await loadScenarios()
                          setSelectedScenario(created?.scenario_name || created?.name || created?.id)
                          setNewScenarioName('')
                          setShowNewScenario(false)
                          setToast({ type: 'success', message: 'Scenario created' })
                        }catch(err:any){
                          alert('Failed to create scenario: ' + (err?.response?.data?.message || err?.message || 'Unknown'))
                        }
                      }}
                    >
                      <i className="bi bi-check-lg"></i>
                    </button>
                  </div>
                )}
              </div>

              <div className="col-md-6 mb-3">
                <label className="form-label">Status</label>
                <select 
                  value={status} 
                  onChange={e=>setStatus(e.target.value)}
                  className="form-select"
                >
                  <option value="draft">Draft</option>
                  <option value="approved">Approved</option>
                </select>
                <div className="form-text">Approval status</div>
              </div>
            </div>

            <div className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <label className="form-label mb-0">
                  <i className="bi bi-list-ul me-2"></i>
                  Line Items
                </label>
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={addLine}>
                  <i className="bi bi-plus-lg me-1"></i>
                  Add Line
                </button>
              </div>
              
              {formErrors['lines'] && (
                <div className="alert alert-danger mb-2">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  {formErrors['lines']}
                </div>
              )}
              
              <div className="table-responsive">
                <table className="table table-bordered table-sm">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: '120px' }}>Code</th>
                      <th>Name</th>
                      <th style={{ width: '140px' }}>Amount</th>
                      <th style={{ width: '100px' }}>Currency</th>
                      <th style={{ width: '80px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((li, i) => (
                      <tr key={i}>
                        <td>
                          <input 
                            value={li.line_code} 
                            onChange={e=>updateLine(i, 'line_code', e.target.value)}
                            className={`form-control form-control-sm ${formErrors[`line-${i}`] ? 'is-invalid' : ''}`}
                            placeholder="Code"
                          />
                        </td>
                        <td>
                          <input 
                            value={li.line_name} 
                            onChange={e=>updateLine(i, 'line_name', e.target.value)}
                            className={`form-control form-control-sm ${formErrors[`line-${i}`] ? 'is-invalid' : ''}`}
                            placeholder="Line name"
                          />
                        </td>
                        <td>
                          <input 
                            type="number" 
                            value={li.amount} 
                            onChange={e=>updateLine(i, 'amount', Number(e.target.value))}
                            className={`form-control form-control-sm ${formErrors[`line-${i}`] ? 'is-invalid' : ''}`}
                            placeholder="0.00"
                          />
                        </td>
                        <td>
                          <input 
                            value={li.currency} 
                            onChange={e=>updateLine(i, 'currency', e.target.value)}
                            className={`form-control form-control-sm ${formErrors[`line-${i}`] ? 'is-invalid' : ''}`}
                            placeholder="THB"
                          />
                        </td>
                        <td>
                          <button 
                            type="button" 
                            className="btn btn-sm btn-outline-danger" 
                            onClick={()=>removeLine(i)}
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {lineItems.map((li, i) => formErrors[`line-${i}`] && (
                <div key={i} className="alert alert-danger mt-2">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  Line {i+1}: {formErrors[`line-${i}`]}
                </div>
              ))}
            </div>
          </div>

          <div className="card-footer">
            <button 
              type="submit" 
              className="btn btn-primary me-2" 
              disabled={creating}
            >
              {creating ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1"></span>
                  Creating...
                </>
              ) : (
                <>
                  <i className="bi bi-check-circle me-1"></i>
                  Create Statement
                </>
              )}
            </button>
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={() => {
                setLineItems([
                  { line_code: 'REV001', line_name: 'Revenue', line_order: 1, amount: 100000, currency: 'THB' },
                  { line_code: 'EXP001', line_name: 'Expenses', line_order: 2, amount: 40000, currency: 'THB' }
                ])
                setFormErrors({})
                setApiError(null)
                setPeriodStart('')
                setPeriodEnd('')
              }}
            >
              <i className="bi bi-arrow-clockwise me-1"></i>
              Reset
            </button>
          </div>
        </form>
      </div>

      {toast && (
        <div 
          className={`position-fixed bottom-0 end-0 p-3`} 
          style={{ zIndex: 11 }}
        >
          <div className={`toast show ${toast.type === 'success' ? 'bg-success' : 'bg-danger'} text-white`}>
            <div className="toast-body">
              <i className={`bi bi-${toast.type === 'success' ? 'check-circle' : 'x-circle'} me-2`}></i>
              {toast.message}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
