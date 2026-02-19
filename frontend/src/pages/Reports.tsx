import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useTenant } from '../components/TenantContext'

export default function Reports() {
  const { tenantId } = useTenant()
  const [reportType, setReportType] = useState<'variance' | 'summary' | 'trend'>('variance')
  const [statements, setStatements] = useState<any[]>([])
  const [projections, setProjections] = useState<any[]>([])
  const [statementId, setStatementId] = useState('')
  const [projectionId, setProjectionId] = useState('')
  const [periodNumber, setPeriodNumber] = useState('1')
  const [startDate, setStartDate] = useState('2026-01-01')
  const [endDate, setEndDate] = useState('2026-12-31')
  const [lineCode, setLineCode] = useState('')
  const [lineCodes, setLineCodes] = useState<Array<{code: string, name: string}>>([])
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(()=>{
    if (!tenantId) { setStatements([]); setProjections([]); setLineCodes([]); return }
    let mounted = true
    async function loadLists(){
      try{
        const s = await api.get('/financial/statements')
        const p = await api.get('/projections/list')
        if(!mounted) return
        setStatements(s.data || [])
        setProjections(p.data || [])
        
        // Extract unique line codes from statements
        const stmtIds = s.data.map((stmt: any) => stmt.id)
        if (stmtIds.length > 0) {
          try {
            const lineCodesMap = new Map<string, string>()
            for (const stmt of s.data.slice(0, 5)) { // Check first 5 statements
              const items = await api.get(`/financial/statements/${stmt.id}`)
              if (items.data?.lineItems) {
                items.data.lineItems.forEach((item: any) => {
                  if (item.line_code && !lineCodesMap.has(item.line_code)) {
                    lineCodesMap.set(item.line_code, item.line_name || item.line_code)
                  }
                })
              }
            }
            const codes = Array.from(lineCodesMap.entries()).map(([code, name]) => ({ code, name }))
            setLineCodes(codes)
          } catch (e) {
            console.error('Failed to load line codes', e)
          }
        }
      }catch(e){ 
        console.error('Failed to load lists', e)
      }
    }
    loadLists()
    return ()=>{ mounted = false }
  },[tenantId])

  async function generateReport(e?: React.FormEvent) {
    if (e) e.preventDefault()
    setError(null)
    setLoading(true)
    setResult(null)

    try {
      if (reportType === 'variance') {
        if (!statementId || !projectionId || !periodNumber) throw new Error('Select statement, projection and period')
        const res = await api.get('/reports/variance', { params: { actual_statement_id: statementId, projection_id: projectionId, period_number: periodNumber } })
        setResult(res.data)
      } else if (reportType === 'summary') {
        const res = await api.get('/reports/summary', { params: { type: 'PL', start_date: startDate, end_date: endDate } })
        setResult(res.data)
      } else if (reportType === 'trend') {
        if (!lineCode) throw new Error('Please select a line code for trend analysis')
        const res = await api.get('/reports/trend', { params: { line_code: lineCode, start_date: startDate, end_date: endDate } })
        setResult(res.data)
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Report generation failed')
    } finally {
      setLoading(false)
    }
  }

  async function downloadVarianceCSV(){
    if (!statementId || !projectionId || !periodNumber) return
    try{
      const res = await api.get('/reports/export/variance', { params: { actual_statement_id: statementId, projection_id: projectionId, period_number: periodNumber, format: 'csv' } })
      const body = res.data
      const csv = body?.data || ''
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `variance_${projectionId}_${periodNumber}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    }catch(err:any){
      setError(err.response?.data?.message || err.message || 'Export failed')
    }
  }

  return (
    <>
      {/* Page Header */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-file-earmark-text me-2"></i>
            Reports & Analysis
          </h3>
          <div className="card-tools">
            <Link to="/reports/budget-vs-actual" className="btn btn-primary btn-sm">
              <i className="bi bi-bar-chart me-1"></i>
              Budget vs Actual
            </Link>
          </div>
        </div>
      </div>

      {/* Generate Report Form */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-gear me-2"></i>
            Generate Report
          </h3>
        </div>
        <form onSubmit={generateReport}>
          <div className="card-body">
            {error && (
              <div className="alert alert-danger alert-dismissible fade show" role="alert">
                <i className="bi bi-exclamation-triangle me-2"></i>
                {error}
                <button type="button" className="btn-close" onClick={() => setError(null)}></button>
              </div>
            )}

            <div className="mb-3">
              <label className="form-label">Report Type</label>
              <select 
                className="form-select" 
                value={reportType} 
                onChange={e => setReportType(e.target.value as any)}
              >
                <option value="variance">Variance Analysis</option>
                <option value="summary">Summary Report</option>
                <option value="trend">Trend Analysis</option>
              </select>
            </div>

            {reportType === 'variance' && (
              <>
                <div className="row">
                  <div className="col-md-4 mb-3">
                    <label className="form-label">Actual Statement</label>
                    <select className="form-select" value={statementId} onChange={e=>setStatementId(e.target.value)} required>
                      <option value="">-- Select Statement --</option>
                      {statements.map(s=> (
                        <option key={s.id} value={s.id}>
                          {s.statement_type} {new Date(s.period_start).toLocaleDateString()} {s.scenario || ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-4 mb-3">
                    <label className="form-label">Projection</label>
                    <select className="form-select" value={projectionId} onChange={e=>setProjectionId(e.target.value)} required>
                      <option value="">-- Select Projection --</option>
                      {projections.map(p=> (
                        <option key={p.id} value={p.id}>
                          {p.id} ({p.projection_periods} periods)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-4 mb-3">
                    <label className="form-label">Period Number</label>
                    <input 
                      type="number" 
                      min={1} 
                      className="form-control" 
                      value={periodNumber} 
                      onChange={e=>setPeriodNumber(e.target.value)} 
                    />
                  </div>
                </div>
              </>
            )}

            {reportType === 'summary' && (
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Start Date</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={startDate} 
                    onChange={e=>setStartDate(e.target.value)} 
                  />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label">End Date</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={endDate} 
                    onChange={e=>setEndDate(e.target.value)} 
                  />
                </div>
              </div>
            )}

            {reportType === 'trend' && (
              <div className="row">
                <div className="col-md-4 mb-3">
                  <label className="form-label">Line Code <span className="text-danger">*</span></label>
                  <select 
                    className="form-select" 
                    value={lineCode} 
                    onChange={e=>setLineCode(e.target.value)}
                    required
                  >
                    <option value="">-- Select Line Code --</option>
                    {lineCodes.map(lc => (
                      <option key={lc.code} value={lc.code}>
                        {lc.code} - {lc.name}
                      </option>
                    ))}
                  </select>
                  <div className="form-text">Select the account line to analyze trends</div>
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label">Start Date</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={startDate} 
                    onChange={e=>setStartDate(e.target.value)} 
                  />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label">End Date</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={endDate} 
                    onChange={e=>setEndDate(e.target.value)} 
                  />
                </div>
              </div>
            )}
          </div>

          <div className="card-footer">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <i className="bi bi-play-circle me-1"></i>
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
            {reportType === 'variance' && (
              <button type="button" className="btn btn-secondary ms-2" onClick={downloadVarianceCSV}>
                <i className="bi bi-download me-1"></i>
                Export CSV
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Results Section */}
      {result && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <i className="bi bi-clipboard-data me-2"></i>
              Report Results
            </h3>
          </div>
          <div className="card-body">
            {reportType === 'variance' && result && result.line_items && (
              <>
                <div className="row mb-3">
                  <div className="col-md-4">
                    <div className="info-box">
                      <span className="info-box-icon text-bg-info">
                        <i className="bi bi-cash"></i>
                      </span>
                      <div className="info-box-content">
                        <span className="info-box-text">Total Actual</span>
                        <span className="info-box-number">
                          {new Intl.NumberFormat().format(result.summary?.total_actual || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="info-box">
                      <span className="info-box-icon text-bg-warning">
                        <i className="bi bi-graph-up"></i>
                      </span>
                      <div className="info-box-content">
                        <span className="info-box-text">Total Projected</span>
                        <span className="info-box-number">
                          {new Intl.NumberFormat().format(result.summary?.total_projected || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="info-box">
                      <span className="info-box-icon text-bg-success">
                        <i className="bi bi-bar-chart-line"></i>
                      </span>
                      <div className="info-box-content">
                        <span className="info-box-text">Total Variance</span>
                        <span className="info-box-number">
                          {new Intl.NumberFormat().format(result.summary?.total_variance || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="table table-hover table-striped">
                    <thead className="table-light">
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th className="text-end">Actual</th>
                        <th className="text-end">Projected</th>
                        <th className="text-end">Variance</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.line_items.map((li:any)=> (
                        <tr key={li.line_code}>
                          <td><code>{li.line_code}</code></td>
                          <td>{li.line_name}</td>
                          <td className="text-end">{new Intl.NumberFormat().format(li.actual_amount)}</td>
                          <td className="text-end">{new Intl.NumberFormat().format(li.projected_amount)}</td>
                          <td className="text-end">{new Intl.NumberFormat().format(li.variance_amount)}</td>
                          <td>
                            <span className={`badge ${li.status === 'favorable' ? 'text-bg-success' : 'text-bg-warning'}`}>
                              {li.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {reportType === 'summary' && Array.isArray(result) && (
              <div className="table-responsive">
                <table className="table table-hover table-striped">
                  <thead className="table-light">
                    <tr>
                      <th>Period Start</th>
                      <th>Period End</th>
                      <th>Scenario</th>
                      <th>Line Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.map((r:any)=> (
                      <tr key={r.id}>
                        <td>{new Date(r.period_start).toLocaleDateString()}</td>
                        <td>{new Date(r.period_end).toLocaleDateString()}</td>
                        <td><span className="badge text-bg-primary">{r.scenario}</span></td>
                        <td>{(r.line_items||[]).length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reportType === 'trend' && result && (
              <div>
                <div className="mb-3">
                  <h5>{result.line_name} ({result.line_code})</h5>
                  <div className="row">
                    <div className="col-md-4">
                      <span className="badge text-bg-info me-2">Trend: {result.trend_direction}</span>
                    </div>
                    <div className="col-md-4">
                      <span className="badge text-bg-success me-2">Avg Growth: {result.average_growth_rate}%</span>
                    </div>
                    <div className="col-md-4">
                      <span className="badge text-bg-warning">Volatility: {result.volatility}</span>
                    </div>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="table table-hover table-striped">
                    <thead className="table-light">
                      <tr>
                        <th>Period</th>
                        <th className="text-end">Actual</th>
                        <th className="text-end">Growth %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.periods.map((p:any, idx:number)=> (
                        <tr key={idx}>
                          <td>{p.period}</td>
                          <td className="text-end">{new Intl.NumberFormat().format(p.actual)}</td>
                          <td className="text-end">
                            <span className={`badge ${(p.growth_rate||0) >= 0 ? 'text-bg-success' : 'text-bg-danger'}`}>
                              {(p.growth_rate||0).toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="card-footer">
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `report-${reportType}-${Date.now()}.json`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <i className="bi bi-file-earmark-code me-1"></i>
              Download JSON
            </button>
            {reportType === 'variance' && (
              <button className="btn btn-secondary ms-2" onClick={downloadVarianceCSV}>
                <i className="bi bi-file-earmark-spreadsheet me-1"></i>
                Download CSV
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
