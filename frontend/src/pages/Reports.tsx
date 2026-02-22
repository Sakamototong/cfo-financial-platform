import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useTenant } from '../components/TenantContext'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const THB = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0 })
const PCT = (v: number | null | undefined) => v == null ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`
function fmtDateShort(v: any) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('th-TH', { year: 'numeric', month: 'short' })
}

type ReportType = 'variance' | 'summary' | 'trend'

const REPORT_TYPES: { id: ReportType; label: string; icon: string; desc: string; color: string }[] = [
  { id: 'variance',  label: 'Variance Analysis',  icon: 'bar-chart-line',   desc: 'Actual vs Projected comparison per period', color: 'primary' },
  { id: 'summary',   label: 'Multi-Period Summary', icon: 'table',           desc: 'P&L / B/S / CF summary across date range',   color: 'info'    },
  { id: 'trend',     label: 'Trend Analysis',       icon: 'graph-up',        desc: 'Historical trend for a specific line item',  color: 'success' },
]

export default function Reports() {
  const { tenantId } = useTenant()

  const [reportType, setReportType] = useState<ReportType>('variance')
  const [statements, setStatements] = useState<any[]>([])
  const [projections, setProjections] = useState<any[]>([])
  const [lineCodes, setLineCodes] = useState<{ code: string; name: string }[]>([])
  const [loadingInit, setLoadingInit] = useState(false)

  // Variance params
  const [statementId, setStatementId] = useState('')
  const [projectionId, setProjectionId] = useState('')
  const [periodNumber, setPeriodNumber] = useState('1')

  // Summary params
  const [summaryType, setSummaryType] = useState<'PL' | 'BS' | 'CF'>('PL')
  const [startDate, setStartDate] = useState('2026-01-01')
  const [endDate, setEndDate] = useState('2026-12-31')

  // Trend params
  const [trendLineCode, setTrendLineCode] = useState('')

  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeResultTab, setActiveResultTab] = useState<'table' | 'chart'>('table')

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null)
  const toastTimer = useRef<any>(null)
  function showToast(msg: string, type: 'success' | 'danger' = 'success') {
    setToast({ msg, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    if (tenantId) loadInit()
  }, [tenantId])

  async function loadInit() {
    setLoadingInit(true)
    try {
      const [s, p] = await Promise.all([
        api.get('/financial/statements'),
        api.get('/projections/list'),
      ])
      const stmts = s.data?.statements || s.data || []
      const projs = p.data?.projections || p.data || []
      setStatements(Array.isArray(stmts) ? stmts : [])
      setProjections(Array.isArray(projs) ? projs : [])

      // Try loading line codes from first statement
      const allStmts = Array.isArray(stmts) ? stmts : []
      const codeMap = new Map<string, string>()
      for (const stmt of allStmts.slice(0, 5)) {
        try {
          const r = await api.get(`/financial/statements/${stmt.id}`)
          const items: any[] = r.data?.lineItems || r.data?.line_items || []
          items.forEach((li: any) => {
            if (li.line_code && !codeMap.has(li.line_code)) codeMap.set(li.line_code, li.line_name || li.line_code)
          })
        } catch { }
      }
      setLineCodes(Array.from(codeMap.entries()).map(([code, name]) => ({ code, name })))
    } catch { }
    setLoadingInit(false)
  }

  async function generateReport(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setLoading(true); setResult(null)
    try {
      if (reportType === 'variance') {
        if (!statementId || !projectionId || !periodNumber) throw new Error('Select statement, projection and period')
        const res = await api.get('/reports/variance', { params: { actual_statement_id: statementId, projection_id: projectionId, period_number: periodNumber } })
        setResult(res.data)
      } else if (reportType === 'summary') {
        const res = await api.get('/reports/summary', { params: { type: summaryType, start_date: startDate, end_date: endDate } })
        setResult(res.data)
      } else if (reportType === 'trend') {
        if (!trendLineCode) throw new Error('Select a line code to analyse')
        const res = await api.get('/reports/trend', { params: { line_code: trendLineCode, start_date: startDate, end_date: endDate } })
        setResult(res.data)
      }
      setActiveResultTab('table')
      showToast('Report generated successfully')
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Report generation failed'
      setError(msg); showToast(msg, 'danger')
    } finally { setLoading(false) }
  }

  async function downloadVarianceCSV() {
    if (!statementId || !projectionId || !periodNumber) return
    try {
      const res = await api.get('/reports/export/variance', { params: { actual_statement_id: statementId, projection_id: projectionId, period_number: periodNumber, format: 'csv' } })
      const csv = res.data?.data || ''
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `variance_${projectionId.slice(0,8)}_P${periodNumber}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      showToast('CSV downloaded')
    } catch (err: any) { showToast(err?.response?.data?.message || 'Export failed', 'danger') }
  }

  function downloadJSON() {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `report_${reportType}_${Date.now()}.json`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
    showToast('JSON downloaded')
  }

  // Chart builders
  function buildVarianceChart() {
    const items: any[] = result?.line_items || []
    const labels = items.map(li => li.line_name || li.line_code)
    return {
      data: {
        labels,
        datasets: [
          { label: 'Actual', data: items.map(li => li.actual_amount), backgroundColor: 'rgba(21,101,192,0.75)', borderRadius: 4 },
          { label: 'Projected', data: items.map(li => li.projected_amount), backgroundColor: 'rgba(46,125,50,0.55)', borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' as const }, tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${THB.format(ctx.parsed.y)}` } } },
        scales: { y: { ticks: { callback: (v: any) => THB.format(v) } } },
      },
    }
  }

  function buildTrendChart() {
    const periods: any[] = result?.periods || []
    return {
      data: {
        labels: periods.map(p => p.period),
        datasets: [
          { label: 'Actual', data: periods.map(p => p.actual), borderColor: '#1565c0', backgroundColor: 'rgba(21,101,192,0.1)', fill: true, tension: 0.3, pointRadius: 5 },
          ...(periods[0]?.projected != null ? [{ label: 'Projected', data: periods.map(p => p.projected), borderColor: '#2e7d32', backgroundColor: 'transparent', tension: 0.3, borderDash: [5, 3], pointRadius: 3 }] : []),
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' as const }, tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${THB.format(ctx.parsed.y)}` } } },
        scales: { y: { ticks: { callback: (v: any) => THB.format(v) } } },
      },
    }
  }

  const selStmt = statements.find(s => s.id === statementId)
  const selProj = projections.find(p => p.id === projectionId)
  const varSummary = result?.summary || result?.variance_report?.summary

  return (
    <>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3 px-1">
        <div>
          <h2 className="mb-0 fw-bold" style={{ color: '#1a3c5e' }}>
            <i className="bi bi-file-earmark-text me-2 text-primary"></i>Reports &amp; Analysis
          </h2>
          <small className="text-muted">Variance, Summary, and Trend reports for CFO decision-making</small>
        </div>
        <Link to="/reports/budget-vs-actual" className="btn btn-primary btn-sm">
          <i className="bi bi-bar-chart me-1"></i>Budget vs Actual
        </Link>
      </div>

      {/* KPI strip */}
      <div className="row g-3 mb-3">
        {[
          { label: 'Statements',  val: statements.length,  icon: 'file-earmark-bar-graph', color: 'primary'   },
          { label: 'Projections', val: projections.length, icon: 'graph-up-arrow',          color: 'info'      },
          { label: 'Line Codes',  val: lineCodes.length,   icon: 'list-columns',            color: 'success'   },
          { label: 'Report Types',val: 3,                  icon: 'collection',              color: 'secondary' },
        ].map(k => (
          <div className="col-6 col-md-3" key={k.label}>
            <div className={`card border-${k.color} h-100`}>
              <div className="card-body d-flex align-items-center gap-3 py-3">
                <div className={`text-bg-${k.color} rounded-3 d-flex align-items-center justify-content-center`} style={{ width: 46, height: 46, fontSize: 20 }}>
                  <i className={`bi bi-${k.icon}`}></i>
                </div>
                <div>
                  <div className="fw-bold fs-4 lh-1">{loadingInit ? <span className="spinner-border spinner-border-sm"></span> : k.val}</div>
                  <small className="text-muted">{k.label}</small>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Report type selector */}
      <div className="row g-3 mb-3">
        {REPORT_TYPES.map(rt => (
          <div className="col-md-4" key={rt.id}>
            <div
              className={`card h-100 cursor-pointer ${reportType === rt.id ? `border-${rt.color} shadow` : 'border'}`}
              style={{ cursor: 'pointer', transition: 'all .15s', borderWidth: reportType === rt.id ? 2 : 1 }}
              onClick={() => { setReportType(rt.id); setResult(null); setError(null) }}
            >
              <div className="card-body d-flex align-items-start gap-3 py-3">
                <div className={`text-bg-${rt.color} rounded-3 d-flex align-items-center justify-content-center flex-shrink-0`} style={{ width: 42, height: 42, fontSize: 19 }}>
                  <i className={`bi bi-${rt.icon}`}></i>
                </div>
                <div>
                  <div className="fw-bold">{rt.label}</div>
                  <small className="text-muted">{rt.desc}</small>
                </div>
                {reportType === rt.id && <i className={`bi bi-check-circle-fill ms-auto text-${rt.color}`}></i>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Report Form */}
      <form onSubmit={generateReport}>
        <div className="card shadow-sm mb-3">
          <div className="card-header" style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', color: '#fff' }}>
            <div className="d-flex align-items-center gap-2">
              <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`bi bi-${REPORT_TYPES.find(r => r.id === reportType)?.icon || 'file-earmark-text'} text-white`}></i>
              </div>
              <div>
                <div className="fw-bold">{REPORT_TYPES.find(r => r.id === reportType)?.label}</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)' }}>{REPORT_TYPES.find(r => r.id === reportType)?.desc}</div>
              </div>
            </div>
          </div>
          <div className="card-body">
            {error && (
              <div className="alert alert-danger d-flex align-items-center gap-2 py-2 mb-3">
                <i className="bi bi-exclamation-circle-fill"></i>
                <span>{error}</span>
                <button type="button" className="btn-close ms-auto" onClick={() => setError(null)}></button>
              </div>
            )}

            {reportType === 'variance' && (
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>Actual Statement</label>
                  <select className="form-select" value={statementId} onChange={e => setStatementId(e.target.value)} required>
                    <option value="">— Select statement —</option>
                    {statements.map(s => (
                      <option key={s.id} value={s.id}>{s.statement_type} · {fmtDateShort(s.period_start)} · {s.status}</option>
                    ))}
                  </select>
                  {selStmt && <div className="small text-muted mt-1"><span className="badge bg-info">{selStmt.statement_type}</span> <span className="badge bg-secondary">{selStmt.status}</span></div>}
                  {statements.length === 0 && <div className="small text-warning mt-1"><i className="bi bi-exclamation-triangle me-1"></i>No statements — create one in Financials</div>}
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>Projection</label>
                  <select className="form-select" value={projectionId} onChange={e => setProjectionId(e.target.value)} required>
                    <option value="">— Select projection —</option>
                    {projections.map(p => (
                      <option key={p.id} value={p.id}>{p.id?.slice(0, 12)}… · {p.projection_periods} periods ({p.period_type})</option>
                    ))}
                  </select>
                  {selProj && <div className="small text-muted mt-1"><span className="badge bg-primary">{selProj.period_type}</span> <span className="badge bg-secondary">{selProj.projection_periods} periods</span></div>}
                  {projections.length === 0 && <div className="small text-warning mt-1"><i className="bi bi-exclamation-triangle me-1"></i>No projections — create one in Projections</div>}
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>Period Number</label>
                  <input type="number" min={1} max={selProj?.projection_periods || 60} className="form-control" value={periodNumber}
                    onChange={e => setPeriodNumber(e.target.value)} />
                  {selProj && <div className="small text-muted mt-1">Max: {selProj.projection_periods}</div>}
                </div>
              </div>
            )}

            {reportType === 'summary' && (
              <div className="row g-3">
                <div className="col-12 col-md-4">
                  <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>Statement Type</label>
                  <div className="d-flex gap-2">
                    {(['PL', 'BS', 'CF'] as const).map(t => (
                      <button key={t} type="button"
                        className={`btn flex-fill ${summaryType === t ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => setSummaryType(t)}>{t}</button>
                    ))}
                  </div>
                  <small className="text-muted mt-1 d-block">{{ PL: 'Profit & Loss', BS: 'Balance Sheet', CF: 'Cash Flow' }[summaryType]}</small>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>Start Date</label>
                  <input type="date" className="form-control" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>End Date</label>
                  <input type="date" className="form-control" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>
            )}

            {reportType === 'trend' && (
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>Line Code <span className="text-danger">*</span></label>
                  <select className="form-select" value={trendLineCode} onChange={e => setTrendLineCode(e.target.value)} required>
                    <option value="">— Select line code —</option>
                    {lineCodes.map(lc => <option key={lc.code} value={lc.code}>{lc.code} — {lc.name}</option>)}
                  </select>
                  {lineCodes.length === 0 && <div className="small text-warning mt-1"><i className="bi bi-exclamation-triangle me-1"></i>No line codes found — data may be empty</div>}
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>Start Date</label>
                  <input type="date" className="form-control" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>End Date</label>
                  <input type="date" className="form-control" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>
            )}
          </div>
          <div className="card-footer d-flex justify-content-between align-items-center" style={{ background: '#f8f9fa' }}>
            <small className="text-muted">
              {reportType === 'variance' && statementId && projectionId
                ? <span className="text-success"><i className="bi bi-check-circle me-1"></i>Ready to run</span>
                : reportType === 'trend' && trendLineCode
                ? <span className="text-success"><i className="bi bi-check-circle me-1"></i>Ready to run</span>
                : <span>Fill in the parameters above</span>}
            </small>
            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary px-4" disabled={loading}>
                {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Generating…</> : <><i className="bi bi-play-fill me-2"></i>Generate Report</>}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Results */}
      {result && (
        <div className="card shadow-sm border-success mb-3">
          <div className="card-header d-flex align-items-center justify-content-between" style={{ background: 'linear-gradient(135deg,#1b5e20,#2e7d32)', color: '#fff' }}>
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-check-circle-fill fs-5"></i>
              <div>
                <div className="fw-bold">Report Results</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)' }}>
                  {reportType === 'variance' && `Period ${periodNumber} · ${result?.line_items?.length || result?.variance_report?.line_items?.length || 0} line items`}
                  {reportType === 'summary' && `${summaryType} · ${Array.isArray(result) ? result.length : 0} periods`}
                  {reportType === 'trend' && `${result.line_name || result.line_code} · ${result.periods?.length || 0} periods`}
                </div>
              </div>
            </div>
            <div className="d-flex gap-2">
              {reportType === 'variance' && (
                <button className="btn btn-sm btn-outline-light" onClick={downloadVarianceCSV}>
                  <i className="bi bi-file-earmark-spreadsheet me-1"></i>CSV
                </button>
              )}
              <button className="btn btn-sm btn-outline-light" onClick={downloadJSON}>
                <i className="bi bi-file-earmark-code me-1"></i>JSON
              </button>
              <button className="btn btn-sm btn-outline-light" onClick={() => setResult(null)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
          </div>

          {/* Variance result */}
          {reportType === 'variance' && (
            <>
              {/* KPI cards */}
              {varSummary && (
                <div className="card-body border-bottom pb-3">
                  <div className="row g-2">
                    {[
                      { label: 'Total Actual',     val: varSummary.total_actual,     color: 'primary', icon: 'cash' },
                      { label: 'Total Projected',  val: varSummary.total_projected,  color: 'info',    icon: 'graph-up' },
                      { label: 'Total Variance',   val: varSummary.total_variance,   color: varSummary.total_variance >= 0 ? 'success' : 'danger', icon: 'bar-chart-line' },
                      { label: 'Accuracy Score',   val: null, score: varSummary.accuracy_score, color: 'warning', icon: 'bullseye' },
                      { label: 'Favorable',        val: null, count: varSummary.favorable_count, color: 'success', icon: 'check-circle' },
                      { label: 'Unfavorable',      val: null, count: varSummary.unfavorable_count, color: 'danger', icon: 'x-circle' },
                    ].map(k => (
                      <div className="col-6 col-md-4 col-xl-2" key={k.label}>
                        <div className={`card border-${k.color} text-center h-100`} style={{ borderTop: '3px solid' }}>
                          <div className="card-body py-2 px-1">
                            <div className={`text-${k.color} mb-1`}><i className={`bi bi-${k.icon}`}></i></div>
                            <div className={`fw-bold small text-${k.color}`}>
                              {k.val != null ? THB.format(k.val) : k.score != null ? `${k.score?.toFixed(0)}%` : k.count}
                            </div>
                            <div className="text-muted" style={{ fontSize: '0.68rem' }}>{k.label}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="card-body">
                <ul className="nav nav-tabs mb-3">
                  {[{ id: 'table' as const, label: 'Table', icon: 'table' }, { id: 'chart' as const, label: 'Chart', icon: 'bar-chart' }].map(t => (
                    <li className="nav-item" key={t.id}>
                      <button className={`nav-link ${activeResultTab === t.id ? 'active' : ''}`} onClick={() => setActiveResultTab(t.id)}>
                        <i className={`bi bi-${t.icon} me-1`}></i>{t.label}
                      </button>
                    </li>
                  ))}
                </ul>

                {activeResultTab === 'table' && (
                  <div className="table-responsive" style={{ maxHeight: 400 }}>
                    <table className="table table-sm table-hover table-bordered mb-0">
                      <thead className="table-dark sticky-top">
                        <tr>
                          <th>Code</th><th>Line Item</th>
                          <th className="text-end">Actual</th><th className="text-end">Projected</th>
                          <th className="text-end">Variance</th><th className="text-end">%</th><th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(result?.line_items || result?.variance_report?.line_items || []).map((li: any) => (
                          <tr key={li.line_code}>
                            <td><code className="small">{li.line_code}</code></td>
                            <td className="small">{li.line_name}</td>
                            <td className="text-end small text-primary fw-semibold">{THB.format(li.actual_amount)}</td>
                            <td className="text-end small text-info">{THB.format(li.projected_amount)}</td>
                            <td className={`text-end small fw-bold ${li.variance_amount >= 0 ? 'text-success' : 'text-danger'}`}>{THB.format(li.variance_amount)}</td>
                            <td className={`text-end small ${(li.variance_percent || 0) >= 0 ? 'text-success' : 'text-danger'}`}>{PCT(li.variance_percent)}</td>
                            <td>
                              <span className={`badge ${li.status === 'favorable' ? 'bg-success' : li.status === 'unfavorable' ? 'bg-danger' : 'bg-secondary'}`}>
                                {li.status === 'favorable' ? '✓' : li.status === 'unfavorable' ? '✗' : '○'} {li.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {varSummary && (
                        <tfoot className="table-light">
                          <tr className="fw-bold">
                            <td colSpan={2}>Total</td>
                            <td className="text-end text-primary">{THB.format(varSummary.total_actual)}</td>
                            <td className="text-end text-info">{THB.format(varSummary.total_projected)}</td>
                            <td className={`text-end ${varSummary.total_variance >= 0 ? 'text-success' : 'text-danger'}`}>{THB.format(varSummary.total_variance)}</td>
                            <td className={`text-end ${(varSummary.total_variance_percent || 0) >= 0 ? 'text-success' : 'text-danger'}`}>{PCT(varSummary.total_variance_percent)}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}

                {activeResultTab === 'chart' && (result?.line_items || []).length > 0 && (
                  <div style={{ height: 320 }}><Bar {...buildVarianceChart()} /></div>
                )}
              </div>
            </>
          )}

          {/* Summary result */}
          {reportType === 'summary' && Array.isArray(result) && (
            <div className="card-body">
              {result.length === 0 ? (
                <div className="text-center py-4 text-muted"><i className="bi bi-inbox d-block mb-2" style={{ fontSize: 40 }}></i>No statements found in this date range</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm table-hover table-bordered mb-0">
                    <thead className="table-dark">
                      <tr><th>Period Start</th><th>Period End</th><th>Scenario</th><th>Type</th><th>Status</th><th>Line Items</th></tr>
                    </thead>
                    <tbody>
                      {result.map((r: any) => (
                        <tr key={r.id}>
                          <td className="small">{fmtDateShort(r.period_start)}</td>
                          <td className="small">{fmtDateShort(r.period_end)}</td>
                          <td><span className="badge bg-primary">{r.scenario}</span></td>
                          <td><span className="badge bg-info">{r.statement_type}</span></td>
                          <td><span className="badge bg-secondary">{r.status}</span></td>
                          <td><span className="badge bg-light text-dark border">{(r.line_items || r.lineItems || []).length}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Trend result */}
          {reportType === 'trend' && result && (
            <>
              <div className="card-body border-bottom pb-3">
                <div className="row g-2">
                  {[
                    { label: 'Trend Direction', val: result.trend_direction, badge: result.trend_direction === 'increasing' ? 'success' : result.trend_direction === 'decreasing' ? 'danger' : 'secondary' },
                    { label: 'Avg Growth Rate',  val: `${(result.average_growth_rate || 0).toFixed(2)}%`, badge: (result.average_growth_rate || 0) >= 0 ? 'success' : 'danger' },
                    { label: 'Volatility (σ)',   val: (result.volatility || 0).toFixed(2), badge: 'info' },
                    { label: 'Periods Analysed', val: result.periods?.length || 0, badge: 'primary' },
                  ].map(k => (
                    <div className="col-6 col-md-3" key={k.label}>
                      <div className="card border-0 shadow-sm text-center h-100">
                        <div className="card-body py-2">
                          <span className={`badge bg-${k.badge} fs-6 mb-1`}>{k.val}</span>
                          <div className="small text-muted">{k.label}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card-body">
                <ul className="nav nav-tabs mb-3">
                  {[{ id: 'table' as const, label: 'Table', icon: 'table' }, { id: 'chart' as const, label: 'Chart', icon: 'graph-up' }].map(t => (
                    <li className="nav-item" key={t.id}>
                      <button className={`nav-link ${activeResultTab === t.id ? 'active' : ''}`} onClick={() => setActiveResultTab(t.id)}>
                        <i className={`bi bi-${t.icon} me-1`}></i>{t.label}
                      </button>
                    </li>
                  ))}
                </ul>

                {activeResultTab === 'table' && (
                  <div className="table-responsive" style={{ maxHeight: 360 }}>
                    <table className="table table-sm table-hover table-bordered mb-0">
                      <thead className="table-dark sticky-top">
                        <tr><th>Period</th><th className="text-end">Actual</th>{result.periods?.[0]?.projected != null && <th className="text-end">Projected</th>}<th className="text-end">Growth %</th></tr>
                      </thead>
                      <tbody>
                        {(result.periods || []).map((p: any, i: number) => (
                          <tr key={i}>
                            <td className="small fw-semibold">{p.period}</td>
                            <td className="text-end small text-primary">{THB.format(p.actual)}</td>
                            {p.projected != null && <td className="text-end small text-info">{THB.format(p.projected)}</td>}
                            <td className="text-end small">
                              {p.growth_rate != null
                                ? <span className={`badge ${p.growth_rate >= 0 ? 'bg-success' : 'bg-danger'}`}>{PCT(p.growth_rate)}</span>
                                : <span className="text-muted">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeResultTab === 'chart' && (result.periods || []).length > 0 && (
                  <div style={{ height: 300 }}><Line {...buildTrendChart()} /></div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* CFO Guide */}
      <div className="card mt-3 border-0" style={{ background: 'linear-gradient(90deg,#f8f9fa,#e9ecef)' }}>
        <div className="card-body py-3">
          <div className="small fw-semibold text-muted mb-2"><i className="bi bi-lightbulb me-1 text-warning"></i>CFO Reporting Workflow</div>
          <div className="row g-2">
            {[
              { step: '1', label: 'Variance Analysis',    desc: 'Compare actual P&L with projected period — spot over/under performance' },
              { step: '2', label: 'Budget vs Actual',     desc: 'Compare against approved budget — measure execution accuracy' },
              { step: '3', label: 'Trend Analysis',       desc: 'Track line item movement over multiple periods' },
              { step: '4', label: 'Export & Present',     desc: 'Download CSV/JSON for board packs and management review' },
            ].map(s => (
              <div className="col-6 col-md-3" key={s.step}>
                <div className="d-flex align-items-start gap-2">
                  <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0" style={{ width: 26, height: 26, fontSize: '0.8rem' }}>{s.step}</div>
                  <div>
                    <div className="fw-semibold small">{s.label}</div>
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>{s.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {toast && ReactDOM.createPortal(
        <div className="position-fixed top-0 end-0 p-3" style={{ zIndex: 9999 }}>
          <div className={`toast show align-items-center text-bg-${toast.type} border-0`}>
            <div className="d-flex">
              <div className="toast-body d-flex align-items-center gap-2">
                <i className={`bi bi-${toast.type === 'success' ? 'check-circle-fill' : 'x-circle-fill'} fs-5`}></i>
                {toast.msg}
              </div>
              <button type="button" className="btn-close btn-close-white me-2 m-auto" onClick={() => setToast(null)}></button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
