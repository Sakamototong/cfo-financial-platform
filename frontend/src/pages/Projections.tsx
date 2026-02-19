import React, { useState, useEffect } from 'react'
import api from '../api/client'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)
import { useTenant } from '../components/TenantContext'

export default function Projections() {
  const { tenantId } = useTenant()
  const [scenarioId, setScenarioId] = useState('')
  const [scenarios, setScenarios] = useState<any[]>([])
  const [statements, setStatements] = useState<any[]>([])
  const [projections, setProjections] = useState<any[]>([])
  const [periods, setPeriods] = useState('12')
  const [result, setResult] = useState<any>(null)
  const [projectionDetail, setProjectionDetail] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [baseStatementId, setBaseStatementId] = useState('')
  const [periodType, setPeriodType] = useState<'monthly'|'quarterly'|'yearly'>('monthly')

  async function runProjection(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setResult(null)

    try {
      const payload = {
        base_statement_id: baseStatementId,
        scenario_id: scenarioId,
        projection_periods: parseInt(periods, 10),
        period_type: periodType,
      }
      const res = await api.post('/projections/generate', payload)
      setResult(res.data)
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Projection failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{
    if (!tenantId) { setScenarios([]); setStatements([]); setProjections([]); return }
    let mounted = true
    async function load() {
      try {
        const s = await api.get('/scenarios')
        const st = await api.get('/financial/statements')
        const p = await api.get('/projections/list')
        if (!mounted) return
        setScenarios(s.data || [])
        setStatements(st.data || [])
        setProjections(p.data || [])
      } catch (e) {
        // ignore load errors for now
      }
    }
    load()
    return ()=>{ mounted = false }
  }, [tenantId])

  return (
    <>
      {/* Page Header */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-graph-up me-2"></i>
            Financial Projections
          </h3>
          <div className="card-tools">
            <span className="badge text-bg-info me-2">{projections.length} Saved</span>
          </div>
        </div>
      </div>

      {/* Run Projection Form */}
      <div className="card card-primary card-outline mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-play-circle me-2"></i>
            Run Projection
          </h3>
        </div>
        <form onSubmit={runProjection}>
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
                <label className="form-label">Base Statement</label>
                <select className="form-select" value={baseStatementId} onChange={e=>setBaseStatementId(e.target.value)} required>
                  <option value="">-- Choose base statement --</option>
                  {statements.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.statement_type} {new Date(s.period_start).toISOString().slice(0,10)} - {s.scenario || s.scenario_id || ''}
                    </option>
                  ))}
                </select>
                <div className="form-text">The financial statement to use as projection basis</div>
              </div>

              <div className="col-md-6 mb-3">
                <label className="form-label">Scenario</label>
                <select className="form-select" value={scenarioId} onChange={e=>setScenarioId(e.target.value)} required>
                  <option value="">-- Choose scenario --</option>
                  {scenarios.map(s => (
                    <option key={s.id} value={s.id}>{s.scenario_name || s.name || `Scenario ${s.id}`}</option>
                  ))}
                </select>
                <div className="form-text">Applied growth rates and assumptions</div>
              </div>
            </div>

            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Number of Periods</label>
                <input 
                  type="number" 
                  className="form-control"
                  value={periods} 
                  onChange={e => setPeriods(e.target.value)}
                  min="1"
                  max="60"
                  required
                />
                <div className="form-text">1 to 60 periods</div>
              </div>

              <div className="col-md-6 mb-3">
                <label className="form-label">Period Type</label>
                <select className="form-select" value={periodType} onChange={e=>setPeriodType(e.target.value as any)}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card-footer">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <i className="bi bi-play-fill me-1"></i>
              {loading ? 'Running Projection...' : 'Run Projection'}
            </button>
          </div>
        </form>
      </div>

      {/* Results Section */}
      {result && (
        <div className="card card-success mb-3">
          <div className="card-header">
            <h3 className="card-title">
              <i className="bi bi-check-circle me-2"></i>
              Projection Results
            </h3>
            <div className="card-tools">
              <button className="btn btn-secondary btn-sm" onClick={() => setResult(null)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
          <div className="card-body">
            <div className="alert alert-info">
              <i className="bi bi-info-circle me-2"></i>
              Projection generated successfully. View details in the Saved Projections section below.
            </div>
            <pre style={{ 
              background: '#f8f9fa', 
              padding: '16px', 
              borderRadius: '4px', 
              overflow: 'auto',
              maxHeight: '400px',
              fontSize: '12px'
            }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Saved Projections */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-archive me-2"></i>
            Saved Projections
          </h3>
          <div className="card-tools">
            <span className="badge text-bg-primary">{projections.length}</span>
          </div>
        </div>
        <div className="card-body p-0">
          {projections.length === 0 ? (
            <div className="text-center py-5">
              <i className="bi bi-inbox" style={{ fontSize: '3rem', color: '#ccc' }}></i>
              <p className="mt-2 text-muted">No saved projections yet</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover table-striped mb-0">
                <thead className="table-light">
                  <tr>
                    <th>ID</th>
                    <th>Created</th>
                    <th>Base Statement</th>
                    <th>Scenario</th>
                    <th>Periods</th>
                    <th>Type</th>
                    <th>Count</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projections.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <code>{p.id}</code>
                      </td>
                      <td>{new Date(p.created_at).toISOString().slice(0,10)}</td>
                      <td style={{ fontSize:12 }}><code>{p.base_statement_id || '-'}</code></td>
                      <td style={{ fontSize:12 }}>{p.scenario_id || '-'}</td>
                      <td><span className="badge text-bg-info">{p.projection_periods || '-'}</span></td>
                      <td><span className="badge text-bg-secondary">{p.period_type || '-'}</span></td>
                      <td>{p.statement_count || 0}</td>
                      <td>
                        <button 
                          className="btn btn-sm btn-primary" 
                          onClick={async ()=>{
                            try{
                              const r = await api.get(`/projections/${p.id}`)
                              setProjectionDetail(r.data)
                            }catch(e:any){ setError(e.response?.data?.message||e.message) }
                          }}
                        >
                          <i className="bi bi-eye me-1"></i>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {projections.length > 0 && (
          <div className="card-footer">
            <small className="text-muted">Showing {projections.length} projection(s)</small>
          </div>
        )}
      </div>

      {/* Projection Detail */}
      {projectionDetail && (
        <div className="card mt-3">
          <div className="card-header">
            <h3 className="card-title">
              <i className="bi bi-bar-chart me-2"></i>
              Projection: <code>{projectionDetail.id}</code>
            </h3>
            <div className="card-tools">
              <button className="btn btn-secondary btn-sm" onClick={() => setProjectionDetail(null)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
          <div className="card-body">
            <div className="row">
              {/* Metadata Column */}
              <div className="col-md-4">
                <div className="card card-info card-outline">
                  <div className="card-header">
                    <h3 className="card-title">Metadata</h3>
                  </div>
                  <div className="card-body p-0">
                    <table className="table table-sm mb-0">
                      <tbody>
                        <tr><td className="fw-semibold">Base Statement</td><td><code style={{fontSize:11}}>{projectionDetail.base_statement_id || '-'}</code></td></tr>
                        <tr><td className="fw-semibold">Scenario</td><td>{projectionDetail.scenario_id || '-'}</td></tr>
                        <tr><td className="fw-semibold">Periods</td><td><span className="badge text-bg-info">{projectionDetail.projection_periods || '-'}</span></td></tr>
                        <tr><td className="fw-semibold">Period Type</td><td><span className="badge text-bg-secondary">{projectionDetail.period_type || '-'}</span></td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Statements & Chart Column */}
              <div className="col-md-8">
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">Statements Summary</h3>
                  </div>
                  <div className="card-body p-0">
                    <div className="table-responsive">
                      <table className="table table-sm table-hover mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Period #</th>
                            <th>Start</th>
                            <th>End</th>
                            <th>Type</th>
                            <th>Line Items</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectionDetail.statements.map((s:any)=> (
                            <tr key={s.id}>
                              <td><span className="badge text-bg-primary">{s.period_number}</span></td>
                              <td>{new Date(s.period_start).toISOString().slice(0,10)}</td>
                              <td>{new Date(s.period_end).toISOString().slice(0,10)}</td>
                              <td>{s.statement_type}</td>
                              <td><span className="badge text-bg-secondary">{(s.line_items||[]).length}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Chart Card */}
                <div className="card mt-3">
                  <div className="card-header">
                    <h3 className="card-title">
                      <i className="bi bi-graph-up me-2"></i>
                      Projection Chart
                    </h3>
                  </div>
                  <div className="card-body" style={{ height: 280 }}>
                    {projectionDetail && (
                      (() => {
                        const labels = projectionDetail.statements.map((s:any)=> new Date(s.period_start).toISOString().slice(0,10))

                        const revenue = projectionDetail.statements.map((s:any)=> (s.line_items||[]).reduce((sum:any, li:any)=> (li.line_code||'').toUpperCase().startsWith('REV') ? sum + Number(li.projected_amount || li.projected_amount) : sum, 0))
                        const expense = projectionDetail.statements.map((s:any)=> (s.line_items||[]).reduce((sum:any, li:any)=> {
                          const code = (li.line_code||'').toUpperCase();
                          return (code.startsWith('EXP') || code.startsWith('OPEX') || code.startsWith('COGS')) ? sum + Number(li.projected_amount || li.projected_amount) : sum
                        }, 0))

                        const gross = revenue.map((r:number, i:number)=> Math.round((r - (expense[i]||0)) * 100) / 100)

                        const variance = projectionDetail.statements.map((s:any)=> {
                          const projectedTotal = (s.line_items||[]).reduce((sum:any, li:any)=> sum + Number(li.projected_amount || li.projected_amount), 0)
                          const baseTotal = (s.line_items||[]).reduce((sum:any, li:any)=> sum + Number(li.base_amount || 0), 0)
                          return Math.round((projectedTotal - baseTotal) * 100) / 100
                        })

                        const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

                        const data = {
                          labels,
                          datasets: [
                            { label: 'Revenue', data: revenue, borderColor: '#1976d2', backgroundColor: 'rgba(25,118,210,0.12)', tension: 0.2, yAxisID: 'y' },
                            { label: 'Expenses', data: expense, borderColor: '#d32f2f', backgroundColor: 'rgba(211,47,47,0.12)', tension: 0.2, yAxisID: 'y' },
                            { label: 'Gross Profit', data: gross, borderColor: '#388e3c', backgroundColor: 'rgba(56,142,60,0.12)', tension: 0.2, yAxisID: 'y' },
                            { label: 'Variance', data: variance, borderColor: '#ffa000', backgroundColor: 'rgba(255,160,0,0.12)', tension: 0.2, yAxisID: 'y1', borderDash: [6,4] },
                          ],
                        }

                        const options:any = {
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { position: 'top' },
                            tooltip: {
                              callbacks: {
                                label: function(context:any) {
                                  const label = context.dataset.label || ''
                                  const value = (context.parsed && context.parsed.y !== undefined) ? context.parsed.y : (context.parsed || 0)
                                  if (label === 'Variance') {
                                    const idx = context.dataIndex
                                    const base = (revenue[idx] || 0)
                                    return `${label}: ${currency.format(value)} (${base ? (Math.round((value/base)*10000)/100)+'%' : '0%'})`
                                  }
                                  return `${label}: ${currency.format(value)}`
                                }
                              }
                            }
                          },
                          scales: {
                            y: { beginAtZero: true, title: { display: true, text: 'Amount' } },
                            y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Variance' } }
                          }
                        }

                        return <Line data={data} options={options} />
                      })()
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
