import React, { useState, useEffect } from 'react'
import api from '../api/client'
import { useTenant } from '../components/TenantContext'

export default function Consolidation() {
  const { tenantId } = useTenant()
  const [statements, setStatements] = useState<any[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runConsolidation(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setResult(null)

    const ids = selectedIds.map(s => String(s || '').trim()).filter(Boolean)
    if (ids.length === 0) {
      setError('Please select at least one statement')
      setLoading(false)
      return
    }

    try {
      const res = await api.post('/consolidation/consolidate', {
        statement_ids: ids
      })
      setResult(res.data)
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Consolidation failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{
    if (!tenantId) { setStatements([]); return }
    let mounted = true
    async function loadStatements(){
      try{
        const r = await api.get('/financial/statements')
        if(!mounted) return
        setStatements(r.data || [])
      }catch(e){ }
    }
    loadStatements()
    return ()=>{ mounted = false }
  },[tenantId])

  function handleCsvExport() {
    if (!result?.consolidated?.line_items) return
    const rows = result.consolidated.line_items.map((li: any) => ({
      line_code: li.line_code,
      line_name: li.line_name,
      amount: Number(li.amount || 0),
      currency: li.currency || ''
    }))
    const header = ['line_code', 'line_name', 'amount', 'currency']
    const csv = [header.join(','), ...rows.map((r: any) => `${r.line_code},"${(r.line_name || '').replace(/"/g, '""')}",${r.amount},${r.currency}`)].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `consolidation_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      {/* Page header card */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title"><i className="bi bi-layers me-2"></i>Consolidation</h3>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger alert-dismissible">
          <button type="button" className="btn-close" onClick={() => setError(null)}></button>
          {error}
        </div>
      )}

      {/* Form card */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title"><i className="bi bi-check2-square me-2"></i>Consolidate Statements</h3>
        </div>
        <div className="card-body">
          <form onSubmit={runConsolidation}>
            <div className="mb-3">
              <label className="form-label">Statement Selection</label>
              <div className="border rounded p-2" style={{ maxHeight: 220, overflowY: 'auto' }}>
                {statements.length === 0 && <div className="text-muted small">No statements found</div>}
                {statements.map((s: any) => (
                  <div key={s.id} className="form-check py-1">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`stmt-${s.id}`}
                      checked={selectedIds.includes(String(s.id))}
                      onChange={e => {
                        const idStr = String(s.id)
                        setSelectedIds(prev => e.target.checked ? [...prev, idStr] : prev.filter(id => id !== idStr))
                      }}
                    />
                    <label className="form-check-label" htmlFor={`stmt-${s.id}`}>
                      <span className="fw-semibold">{s.statement_type || s.type || 'Statement'}</span>
                      <br />
                      <small className="text-secondary">
                        {new Date(s.period_start).toISOString().slice(0, 10)} &mdash; {s.scenario || s.scenario_id || ''}
                      </small>
                      <br />
                      <small className="text-muted font-monospace">{s.id}</small>
                    </label>
                  </div>
                ))}
              </div>
              <div className="mt-2 d-flex gap-2">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setSelectedIds(statements.map(s => s.id))}>
                  <i className="bi bi-check-all me-1"></i>Select All
                </button>
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setSelectedIds([])}>
                  <i className="bi bi-x-circle me-1"></i>Clear
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <i className="bi bi-layers me-1"></i>{loading ? 'Consolidating...' : 'Consolidate'}
            </button>
          </form>
        </div>
      </div>

      {/* Results card */}
      {result && (
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h3 className="card-title mb-0"><i className="bi bi-clipboard-data me-2"></i>Consolidated Results</h3>
            <div className="card-tools">
              <button className="btn btn-outline-secondary btn-sm" onClick={handleCsvExport}>
                <i className="bi bi-download me-1"></i>Download CSV
              </button>
            </div>
          </div>
          <div className="card-body">
            {result.consolidated && Array.isArray(result.consolidated.line_items) ? (
              (() => {
                const items = result.consolidated.line_items
                const revTotal = items.reduce((sum: any, li: any) => {
                  const code = (li.line_code || '').toUpperCase()
                  return (code.startsWith('REV') || (li.line_name || '').toLowerCase().includes('revenue')) ? sum + Number(li.amount || 0) : sum
                }, 0)
                const expTotal = items.reduce((sum: any, li: any) => {
                  const code = (li.line_code || '').toUpperCase()
                  return (code.startsWith('EXP') || (li.line_name || '').toLowerCase().includes('expense')) ? sum + Number(li.amount || 0) : sum
                }, 0)
                return (
                  <>
                    <div className="row mb-3">
                      <div className="col-md-6">
                        <div className="info-box">
                          <span className="info-box-icon bg-success"><i className="bi bi-graph-up-arrow"></i></span>
                          <div className="info-box-content">
                            <span className="info-box-text">Total Revenue</span>
                            <span className="info-box-number">
                              {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'THB', maximumFractionDigits: 2 }).format(revTotal)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="info-box">
                          <span className="info-box-icon bg-danger"><i className="bi bi-graph-down-arrow"></i></span>
                          <div className="info-box-content">
                            <span className="info-box-text">Total Expense</span>
                            <span className="info-box-number">
                              {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'THB', maximumFractionDigits: 2 }).format(expTotal)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="table-responsive">
                      <table className="table table-hover table-striped mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Code</th>
                            <th>Name</th>
                            <th className="text-end">Amount</th>
                            <th>Currency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((li: any) => (
                            <tr key={li.line_code + li.line_name}>
                              <td><code>{li.line_code}</code></td>
                              <td>{li.line_name}</td>
                              <td className="text-end">{new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(li.amount || 0))}</td>
                              <td>{li.currency || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              })()
            ) : (
              <pre className="bg-body-secondary p-3 rounded" style={{ overflow: 'auto', maxHeight: 400 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </>
  )
}
