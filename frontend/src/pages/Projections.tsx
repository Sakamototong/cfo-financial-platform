import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import api from '../api/client'
import { useTenant } from '../components/TenantContext'
import { useUser } from '../components/UserContext'
import { hasMinRole } from '../components/RequireRole'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const THB = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0 })
const PCT = (v: number | null | undefined) => v == null ? '—' : `${(v * 100).toFixed(1)}%`
function fmtDate(v: any) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('th-TH', { year: 'numeric', month: 'short' })
}

const RATIO_DEFS = [
  { key: 'gross_margin',       label: 'Gross Margin',     icon: 'graph-up',        color: 'success',   pct: true },
  { key: 'operating_margin',   label: 'Oper. Margin',     icon: 'bar-chart-line',  color: 'info',      pct: true },
  { key: 'net_margin',         label: 'Net Margin',       icon: 'trophy',          color: 'primary',   pct: true },
  { key: 'roi',                label: 'ROI',              icon: 'arrow-up-circle', color: 'success',   pct: true },
  { key: 'roe',                label: 'ROE',              icon: 'people',          color: 'warning',   pct: true },
  { key: 'current_ratio',      label: 'Current Ratio',    icon: 'shield-check',    color: 'success',   pct: false },
  { key: 'debt_to_equity',     label: 'D/E Ratio',        icon: 'bank',            color: 'danger',    pct: false },
  { key: 'wacc',               label: 'WACC',             icon: 'percent',         color: 'secondary', pct: true },
]

export default function Projections() {
  const { tenantId } = useTenant()
  const { role } = useUser()
  const isAdmin = hasMinRole(role, 'admin')

  const [scenarios, setScenarios] = useState<any[]>([])
  const [statements, setStatements] = useState<any[]>([])
  const [projections, setProjections] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [listLoading, setListLoading] = useState(false)

  const [baseStatementId, setBaseStatementId] = useState('')
  const [scenarioId, setScenarioId] = useState('')
  const [periods, setPeriods] = useState(12)
  const [periodType, setPeriodType] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly')

  const [result, setResult] = useState<any>(null)
  const [activeResultTab, setActiveResultTab] = useState<'chart' | 'pl_table' | 'cashflow' | 'capex'>('chart')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailCache, setDetailCache] = useState<Record<string, any>>({})
  const [detailLoading, setDetailLoading] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null)
  const toastRef = useRef<any>(null)
  function showToast(msg: string, type: 'success' | 'danger' = 'success') {
    setToast({ msg, type })
    if (toastRef.current) clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 4000)
  }
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (tenantId) loadAll() }, [tenantId])

  async function loadAll() {
    setListLoading(true)
    try {
      const [sc, st, pr] = await Promise.all([
        api.get('/scenarios'),
        api.get('/financial/statements'),
        api.get('/projections/list'),
      ])
      setScenarios(sc.data?.scenarios || sc.data || [])
      setStatements(st.data?.statements || st.data || [])
      setProjections(Array.isArray(pr.data) ? pr.data : pr.data?.projections || [])
    } catch { }
    setListLoading(false)
  }

  async function runProjection(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setLoading(true); setResult(null)
    try {
      const res = await api.post('/projections/generate', {
        base_statement_id: baseStatementId,
        scenario_id: scenarioId,
        projection_periods: periods,
        period_type: periodType,
      })
      setResult(res.data)
      setActiveResultTab('chart')
      showToast('Projection generated successfully!')
      loadAll()
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Projection failed'
      setError(msg); showToast(msg, 'danger')
    } finally { setLoading(false) }
  }

  async function loadDetail(id: string) {
    if (detailCache[id]) { setExpandedId(id); return }
    setDetailLoading(id)
    try {
      const r = await api.get(`/projections/${id}`)
      setDetailCache(prev => ({ ...prev, [id]: r.data }))
      setExpandedId(id)
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Failed to load projection', 'danger')
    } finally { setDetailLoading(null) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this projection? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await api.delete(`/projections/${id}`)
      setProjections(prev => prev.filter(p => p.id !== id))
      if (expandedId === id) setExpandedId(null)
      showToast('Projection deleted')
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Delete failed', 'danger')
    } finally { setDeletingId(null) }
  }

  function getRevForPeriod(stmts: any[]) {
    return stmts.map(s => (s.line_items || []).filter((li: any) => Number(li.projected_amount) > 0).reduce((sum: number, li: any) => sum + Number(li.projected_amount), 0))
  }
  function getExpForPeriod(stmts: any[]) {
    return stmts.map(s => (s.line_items || []).filter((li: any) => Number(li.projected_amount) < 0).reduce((sum: number, li: any) => sum + Math.abs(Number(li.projected_amount)), 0))
  }
  function getNetForPeriod(stmts: any[]) {
    return stmts.map(s => (s.line_items || []).reduce((sum: number, li: any) => sum + Number(li.projected_amount || 0), 0))
  }

  function buildLineChart(stmts: any[]) {
    const labels = stmts.map(s => fmtDate(s.period_start))
    return {
      data: {
        labels,
        datasets: [
          { label: 'Revenue', data: getRevForPeriod(stmts), borderColor: '#2e7d32', backgroundColor: 'rgba(46,125,50,0.10)', fill: true, tension: 0.3, pointRadius: 4 },
          { label: 'Expenses', data: getExpForPeriod(stmts), borderColor: '#c62828', backgroundColor: 'rgba(198,40,40,0.08)', fill: true, tension: 0.3, pointRadius: 4 },
          { label: 'Net Income', data: getNetForPeriod(stmts), borderColor: '#1565c0', backgroundColor: 'rgba(21,101,192,0.08)', fill: true, tension: 0.3, pointRadius: 4, borderDash: [5, 3] },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' as const }, tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${THB.format(ctx.parsed.y)}` } } },
        scales: { y: { ticks: { callback: (v: any) => THB.format(v) } } },
      },
    }
  }

  function buildCFChart(cf: any[]) {
    const labels = cf.map(c => `P${c.period_number}`)
    return {
      data: {
        labels,
        datasets: [
          { label: 'Operating', data: cf.map(c => c.operating_cashflow), backgroundColor: 'rgba(46,125,50,0.75)' },
          { label: 'Investing', data: cf.map(c => c.investing_cashflow), backgroundColor: 'rgba(21,101,192,0.75)' },
          { label: 'Financing', data: cf.map(c => c.financing_cashflow), backgroundColor: 'rgba(198,40,40,0.75)' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' as const }, tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${THB.format(ctx.parsed.y)}` } } },
        scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (v: any) => THB.format(v) } } },
      },
    }
  }

  const currentScenario = scenarios.find(s => s.id === scenarioId)
  const currentStatement = statements.find(s => s.id === baseStatementId)

  return (
    <>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3 px-1">
        <div>
          <h2 className="mb-0 fw-bold" style={{ color: '#1a3c5e' }}>
            <i className="bi bi-graph-up-arrow me-2 text-primary"></i>Financial Projections
          </h2>
          <small className="text-muted">Generate scenario-based forecasts — P&amp;L, Cash Flow, CAPEX, and financial ratios</small>
        </div>
        <span className="badge bg-secondary fs-6">{projections.length} saved</span>
      </div>

      {/* KPI Strip */}
      <div className="row g-3 mb-3">
        {[
          { label: 'Saved Projections', val: projections.length, icon: 'archive', color: 'primary' },
          { label: 'Scenarios Available', val: scenarios.length, icon: 'diagram-3', color: 'info' },
          { label: 'Base Statements', val: statements.length, icon: 'file-earmark-bar-graph', color: 'success' },
          { label: 'Max Horizon', val: periodType === 'yearly' ? '60 yrs' : periodType === 'quarterly' ? '15 yrs' : '5 yrs', icon: 'calendar3', color: 'warning' },
        ].map(k => (
          <div className="col-6 col-md-3" key={k.label}>
            <div className={`card border-${k.color} h-100`}>
              <div className="card-body d-flex align-items-center gap-3 py-3">
                <div className={`text-bg-${k.color} rounded-3 d-flex align-items-center justify-content-center`} style={{ width: 46, height: 46, fontSize: 20 }}>
                  <i className={`bi bi-${k.icon}`}></i>
                </div>
                <div>
                  <div className="fw-bold fs-4 lh-1">{k.val}</div>
                  <small className="text-muted">{k.label}</small>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Run Projection Form */}
      <div className="card shadow-sm mb-3">
        <div className="card-header" style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', color: '#fff' }}>
          <div className="d-flex align-items-center gap-2">
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="bi bi-play-circle-fill text-white"></i>
            </div>
            <div>
              <div className="fw-bold">Generate New Projection</div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)' }}>Select a base statement and scenario to run the projection engine</div>
            </div>
          </div>
        </div>
        <form onSubmit={runProjection}>
          <div className="card-body">
            {error && (
              <div className="alert alert-danger d-flex align-items-center gap-2 py-2 mb-3">
                <i className="bi bi-exclamation-circle-fill"></i>
                <span>{error}</span>
                <button type="button" className="btn-close ms-auto" onClick={() => setError(null)}></button>
              </div>
            )}
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>
                  <i className="bi bi-1-circle me-1 text-primary"></i>Base Financial Statement
                </label>
                <select className="form-select" value={baseStatementId} onChange={e => setBaseStatementId(e.target.value)} required>
                  <option value="">— Select statement —</option>
                  {statements.map(s => (
                    <option key={s.id} value={s.id}>{s.statement_type} · {s.period_type} · {fmtDate(s.period_start)} · {s.scenario}</option>
                  ))}
                </select>
                {currentStatement && (
                  <div className="mt-1 d-flex gap-2 small text-muted">
                    <span className="badge bg-info">{currentStatement.statement_type}</span>
                    <span className="badge bg-light text-dark border">{currentStatement.status}</span>
                    <span>{fmtDate(currentStatement.period_start)} → {fmtDate(currentStatement.period_end)}</span>
                  </div>
                )}
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>
                  <i className="bi bi-2-circle me-1 text-primary"></i>Scenario
                </label>
                <select className="form-select" value={scenarioId} onChange={e => setScenarioId(e.target.value)} required>
                  <option value="">— Select scenario —</option>
                  {scenarios.map(s => (
                    <option key={s.id} value={s.id}>{s.scenario_name} ({s.scenario_type})</option>
                  ))}
                </select>
                {currentScenario && (
                  <div className="mt-1 d-flex gap-2 small text-muted">
                    <span className="badge bg-primary">{currentScenario.scenario_type}</span>
                    {currentScenario.is_active && <span className="badge bg-success">Active</span>}
                    {currentScenario.description && <span className="text-truncate" style={{ maxWidth: 200 }}>{currentScenario.description}</span>}
                  </div>
                )}
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>
                  <i className="bi bi-3-circle me-1 text-primary"></i>Periods: <span className="text-primary fw-bold fs-6">{periods}</span>
                </label>
                <input type="range" className="form-range" min={1} max={60} step={1} value={periods} onChange={e => setPeriods(Number(e.target.value))} />
                <div className="d-flex justify-content-between align-items-center mt-1">
                  <span className="small text-muted">1</span>
                  <div className="d-flex gap-1">
                    {[3, 6, 12, 24, 36, 60].map(n => (
                      <button key={n} type="button" style={{ fontSize: '0.7rem' }}
                        className={`btn btn-sm py-0 ${periods === n ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => setPeriods(n)}>{n}</button>
                    ))}
                  </div>
                  <span className="small text-muted">60</span>
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>
                  <i className="bi bi-4-circle me-1 text-primary"></i>Period Type
                </label>
                <div className="d-flex gap-2">
                  {(['monthly', 'quarterly', 'yearly'] as const).map(pt => (
                    <button key={pt} type="button"
                      className={`btn flex-fill ${periodType === pt ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setPeriodType(pt)}>
                      <i className={`bi bi-${pt === 'monthly' ? 'calendar-month' : pt === 'quarterly' ? 'calendar3' : 'calendar-year'} me-1`}></i>
                      {pt.charAt(0).toUpperCase() + pt.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="small text-muted mt-1">
                  {periodType === 'monthly' && `${periods} months ≈ ${(periods / 12).toFixed(1)} yrs`}
                  {periodType === 'quarterly' && `${periods} quarters ≈ ${(periods / 4).toFixed(1)} yrs`}
                  {periodType === 'yearly' && `${periods} year${periods > 1 ? 's' : ''}`}
                </div>
              </div>
            </div>
          </div>
          <div className="card-footer d-flex justify-content-between align-items-center" style={{ background: '#f8f9fa' }}>
            <div className="small text-muted">
              {baseStatementId && scenarioId
                ? <span className="text-success"><i className="bi bi-check-circle me-1"></i>Ready — {periods} {periodType} periods</span>
                : <span><i className="bi bi-info-circle me-1"></i>Select statement and scenario to proceed</span>}
            </div>
            <button type="submit" className="btn btn-primary px-4" disabled={loading || !baseStatementId || !scenarioId}>
              {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Generating...</> : <><i className="bi bi-play-fill me-2"></i>Run Projection</>}
            </button>
          </div>
        </form>
      </div>

      {/* Results Panel */}
      {result && (
        <div className="card shadow-sm mb-3 border-success">
          <div className="card-header d-flex align-items-center justify-content-between" style={{ background: 'linear-gradient(135deg,#1b5e20,#2e7d32)', color: '#fff' }}>
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-check-circle-fill fs-5"></i>
              <div>
                <div className="fw-bold">Projection Results</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)' }}>ID: {result.projection_id}</div>
              </div>
            </div>
            <div className="d-flex gap-2">
              <span className="badge bg-light text-dark">{(result.statements || []).length} periods · {periodType}</span>
              <button className="btn btn-sm btn-outline-light" onClick={() => setResult(null)}><i className="bi bi-x-lg"></i></button>
            </div>
          </div>

          {/* Financial Ratio Cards */}
          {result.ratios && Object.values(result.ratios).some(v => v != null) && (
            <div className="card-body border-bottom pb-3">
              <div className="small fw-semibold text-muted mb-2 text-uppercase" style={{ letterSpacing: '0.06em' }}>Financial Ratios</div>
              <div className="row g-2">
                {RATIO_DEFS.filter(r => result.ratios[r.key] != null).map(r => (
                  <div className="col-6 col-md-3 col-lg-2" key={r.key}>
                    <div className={`card border-${r.color} text-center h-100`} style={{ borderTop: `3px solid` }}>
                      <div className="card-body py-2 px-1">
                        <div className={`text-${r.color} mb-1`} style={{ fontSize: 20 }}><i className={`bi bi-${r.icon}`}></i></div>
                        <div className="fw-bold">{r.pct ? PCT(result.ratios[r.key]) : Number(result.ratios[r.key]).toFixed(2)}</div>
                        <div className="small text-muted" style={{ fontSize: '0.7rem' }}>{r.label}</div>
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
              {[
                { id: 'chart' as const, label: 'P&L Chart', icon: 'graph-up' },
                { id: 'pl_table' as const, label: 'Period Table', icon: 'table' },
                { id: 'cashflow' as const, label: 'Cash Flow', icon: 'cash-coin' },
                { id: 'capex' as const, label: 'CAPEX', icon: 'buildings' },
              ].map(t => (
                <li className="nav-item" key={t.id}>
                  <button className={`nav-link ${activeResultTab === t.id ? 'active' : ''}`} onClick={() => setActiveResultTab(t.id)}>
                    <i className={`bi bi-${t.icon} me-1`}></i>{t.label}
                  </button>
                </li>
              ))}
            </ul>

            {/* P&L Chart tab */}
            {activeResultTab === 'chart' && result.statements?.length > 0 && (() => {
              const { data, options } = buildLineChart(result.statements)
              const rev = getRevForPeriod(result.statements).reduce((a: number, b: number) => a + b, 0)
              const exp = getExpForPeriod(result.statements).reduce((a: number, b: number) => a + b, 0)
              const net = getNetForPeriod(result.statements).reduce((a: number, b: number) => a + b, 0)
              return (
                <div>
                  <div style={{ height: 280 }}><Line data={data} options={options} /></div>
                  <div className="row g-2 mt-2">
                    {[
                      { label: 'Total Revenue', val: rev, color: 'success' },
                      { label: 'Total Expenses', val: exp, color: 'danger' },
                      { label: 'Net Income', val: net, color: net >= 0 ? 'primary' : 'warning' },
                    ].map(s => (
                      <div className="col-md-4" key={s.label}>
                        <div className={`card border-${s.color} text-center`}>
                          <div className="card-body py-2">
                            <div className={`fw-bold text-${s.color}`}>{THB.format(s.val)}</div>
                            <small className="text-muted">{s.label} (all periods)</small>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Period Table tab */}
            {activeResultTab === 'pl_table' && (
              <div className="table-responsive" style={{ maxHeight: 420 }}>
                <table className="table table-sm table-bordered table-hover mb-0">
                  <thead className="table-dark sticky-top">
                    <tr>
                      <th style={{ minWidth: 150 }}>Line Item</th>
                      {(result.statements || []).map((s: any) => (
                        <th key={s.id} className="text-center" style={{ minWidth: 110 }}>
                          <div>{fmtDate(s.period_start)}</div>
                          <div className="fw-normal opacity-75" style={{ fontSize: '0.68rem' }}>P{s.period_number}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const allCodes = Array.from(new Set((result.statements || []).flatMap((s: any) => (s.line_items || []).map((li: any) => li.line_code)))) as string[]
                      return allCodes.map(code => {
                        const firstName = (result.statements || []).flatMap((s: any) => s.line_items || []).find((li: any) => li.line_code === code)?.line_name || code
                        return (
                          <tr key={code}>
                            <td className="small">
                              <div className="fw-semibold">{firstName}</div>
                              <code className="text-muted" style={{ fontSize: '0.65rem' }}>{code}</code>
                            </td>
                            {(result.statements || []).map((s: any) => {
                              const li = (s.line_items || []).find((l: any) => l.line_code === code)
                              const amt = li ? Number(li.projected_amount) : null
                              return (
                                <td key={s.id} className={`text-end small ${amt == null ? 'text-muted' : amt >= 0 ? 'text-success' : 'text-danger'}`}>
                                  {amt == null ? '—' : THB.format(amt)}
                                  {li?.variance_percent != null && (
                                    <div style={{ fontSize: '0.63rem' }} className={li.variance_percent >= 0 ? 'text-success' : 'text-danger'}>
                                      {li.variance_percent >= 0 ? '▲' : '▼'}{Math.abs(li.variance_percent).toFixed(1)}%
                                    </div>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                  <tfoot className="table-light">
                    <tr className="fw-bold">
                      <td>Net Total</td>
                      {(result.statements || []).map((s: any) => {
                        const net = (s.line_items || []).reduce((sum: number, li: any) => sum + Number(li.projected_amount || 0), 0)
                        return <td key={s.id} className={`text-end ${net >= 0 ? 'text-success' : 'text-danger'}`}>{THB.format(net)}</td>
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Cash Flow tab */}
            {activeResultTab === 'cashflow' && (() => {
              const cf = result.cashflow_projection || []
              if (!cf.length) return (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-cash-coin display-4"></i>
                  <p className="mt-2">No cash flow data in this projection</p>
                </div>
              )
              const { data, options } = buildCFChart(cf)
              return (
                <div>
                  <div style={{ height: 240 }}><Bar data={data} options={options as any} /></div>
                  <div className="table-responsive mt-3">
                    <table className="table table-sm table-bordered mb-0">
                      <thead className="table-light">
                        <tr><th>Period</th><th className="text-end">Operating CF</th><th className="text-end">Investing CF</th><th className="text-end">Financing CF</th><th className="text-end">Net CF</th><th className="text-end">Ending Cash</th></tr>
                      </thead>
                      <tbody>
                        {cf.map((c: any) => (
                          <tr key={c.period_number}>
                            <td><span className="badge bg-secondary">P{c.period_number}</span></td>
                            <td className={`text-end ${c.operating_cashflow >= 0 ? 'text-success' : 'text-danger'}`}>{THB.format(c.operating_cashflow)}</td>
                            <td className={`text-end ${c.investing_cashflow >= 0 ? 'text-success' : 'text-danger'}`}>{THB.format(c.investing_cashflow)}</td>
                            <td className={`text-end ${c.financing_cashflow >= 0 ? 'text-success' : 'text-danger'}`}>{THB.format(c.financing_cashflow)}</td>
                            <td className={`text-end fw-bold ${c.net_cashflow >= 0 ? 'text-success' : 'text-danger'}`}>{THB.format(c.net_cashflow)}</td>
                            <td className="text-end text-primary fw-semibold">{THB.format(c.ending_cash)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}

            {/* CAPEX tab */}
            {activeResultTab === 'capex' && (() => {
              const cx = result.capex_schedule || []
              if (!cx.length) return (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-buildings display-4"></i>
                  <p className="mt-2">No CAPEX schedule in this projection</p>
                </div>
              )
              return (
                <div className="table-responsive">
                  <table className="table table-sm table-bordered mb-0">
                    <thead className="table-light">
                      <tr><th>Period</th><th className="text-end">CAPEX</th><th className="text-end">Depreciation</th><th className="text-end">Accum. Depreciation</th><th className="text-end">Net Book Value</th></tr>
                    </thead>
                    <tbody>
                      {cx.map((c: any) => (
                        <tr key={c.period_number}>
                          <td><span className="badge bg-secondary">P{c.period_number}</span></td>
                          <td className="text-end text-primary">{THB.format(c.capex_amount)}</td>
                          <td className="text-end text-warning">{THB.format(c.depreciation_amount)}</td>
                          <td className="text-end text-danger">{THB.format(c.accumulated_depreciation)}</td>
                          <td className="text-end fw-bold text-success">{THB.format(c.net_book_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Saved Projections */}
      <div className="card shadow-sm">
        <div className="card-header d-flex justify-content-between align-items-center py-2">
          <h5 className="mb-0 fw-semibold"><i className="bi bi-archive me-2"></i>Saved Projections</h5>
          <div className="d-flex align-items-center gap-2">
            {listLoading && <span className="spinner-border spinner-border-sm text-primary"></span>}
            <span className="badge bg-secondary">{projections.length}</span>
          </div>
        </div>
        {projections.length === 0 ? (
          <div className="card-body text-center py-5">
            <i className="bi bi-graph-up-arrow display-4 text-muted"></i>
            <p className="mt-3 text-muted">No saved projections yet. Run your first projection above.</p>
          </div>
        ) : (
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Created</th>
                    <th>Scenario</th>
                    <th>Base Statement</th>
                    <th>Periods</th>
                    <th>Type</th>
                    <th>Statements</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projections.map(p => {
                    const sc = scenarios.find(s => s.id === p.scenario_id)
                    const st = statements.find(s => s.id === p.base_statement_id)
                    const isExpanded = expandedId === p.id
                    const detail = detailCache[p.id]
                    return (
                      <React.Fragment key={p.id}>
                        <tr className={isExpanded ? 'table-active' : ''}>
                          <td>
                            <div className="fw-semibold small">{new Date(p.created_at).toLocaleDateString('th-TH')}</div>
                            <div className="text-muted" style={{ fontSize: '0.7rem' }}>{new Date(p.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div>
                          </td>
                          <td>
                            {sc
                              ? <><div className="fw-semibold small">{sc.scenario_name}</div><span className="badge bg-light text-dark border">{sc.scenario_type}</span></>
                              : <code className="small text-muted">{(p.scenario_id || '').slice(0, 8)}…</code>}
                          </td>
                          <td>
                            {st
                              ? <><span className="badge bg-info me-1">{st.statement_type}</span><span className="small">{fmtDate(st.period_start)}</span></>
                              : <code className="small text-muted">{(p.base_statement_id || '').slice(0, 8)}…</code>}
                          </td>
                          <td><span className="badge bg-primary">{p.projection_periods}</span></td>
                          <td><span className="badge bg-secondary">{p.period_type}</span></td>
                          <td><span className="badge bg-light text-dark border">{p.statement_count ?? '—'}</span></td>
                          <td>
                            <div className="d-flex gap-1">
                              <button
                                className={`btn btn-sm ${isExpanded ? 'btn-primary' : 'btn-outline-primary'}`}
                                disabled={detailLoading === p.id}
                                onClick={() => isExpanded ? setExpandedId(null) : loadDetail(p.id)}
                              >
                                {detailLoading === p.id
                                  ? <span className="spinner-border spinner-border-sm"></span>
                                  : <><i className={`bi bi-${isExpanded ? 'chevron-up' : 'eye'} me-1`}></i>{isExpanded ? 'Hide' : 'View'}</>}
                              </button>
                              {isAdmin && (
                                <button className="btn btn-sm btn-outline-danger" disabled={deletingId === p.id} onClick={() => handleDelete(p.id)}>
                                  {deletingId === p.id ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-trash"></i>}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && detail && (
                          <tr>
                            <td colSpan={7} className="p-0" style={{ background: '#f0f4ff' }}>
                              <div className="p-3">
                                {detail.ratios && Object.values(detail.ratios).some((v: any) => v != null) && (
                                  <div className="row g-2 mb-3">
                                    {RATIO_DEFS.filter(r => detail.ratios[r.key] != null).map(r => (
                                      <div className="col-6 col-md-2" key={r.key}>
                                        <div className="card text-center border-0 shadow-sm h-100">
                                          <div className="card-body py-2 px-1">
                                            <div className={`text-${r.color}`}><i className={`bi bi-${r.icon}`}></i></div>
                                            <div className="fw-bold small">{r.pct ? PCT(detail.ratios[r.key]) : Number(detail.ratios[r.key]).toFixed(2)}</div>
                                            <div className="text-muted" style={{ fontSize: '0.65rem' }}>{r.label}</div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {detail.statements?.length > 0 && (() => {
                                  const { data, options } = buildLineChart(detail.statements)
                                  return <div style={{ height: 200 }} className="mb-2"><Line data={data} options={options} /></div>
                                })()}
                                <div className="small text-muted text-end mt-1">
                                  {detail.statements?.length} periods · {detail.period_type} · <code style={{ fontSize: '0.7rem' }}>{detail.projection_id || detail.id}</code>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {projections.length > 0 && (
          <div className="card-footer py-2">
            <small className="text-muted">{projections.length} projection{projections.length > 1 ? 's' : ''} saved</small>
          </div>
        )}
      </div>

      {/* CFO Guide */}
      <div className="card mt-3 border-0" style={{ background: 'linear-gradient(90deg,#f8f9fa,#e9ecef)' }}>
        <div className="card-body py-3">
          <div className="small fw-semibold text-muted mb-2"><i className="bi bi-lightbulb me-1 text-warning"></i>CFO Projection Workflow</div>
          <div className="row g-2">
            {[
              { step: '1', label: 'Base Statement', desc: 'Pick an approved P&L as the historical baseline' },
              { step: '2', label: 'Choose Scenario', desc: 'Apply growth rates from best/base/worst scenario' },
              { step: '3', label: 'Set Horizon', desc: 'Define forecast periods (3, 6, 12, 36 months)' },
              { step: '4', label: 'Review Results', desc: 'Analyse ratios, P&L chart, cash flow & CAPEX' },
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

      {/* Toast */}
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

