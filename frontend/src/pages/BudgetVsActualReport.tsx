import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useTenant } from '../components/TenantContext'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Title, Tooltip, Legend,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Title, Tooltip, Legend)

const THB = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0 })
const PCT_SIGNED = (v: number) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`
function fmtDateShort(v: any) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('th-TH', { year: 'numeric', month: 'short' })
}

interface Budget { id: string; budget_name: string; fiscal_year: number; budget_type: string; status: string; total_amount?: number }
interface Statement { id: string; statement_type: string; period_start: string; period_end: string; status: string; scenario: string }
interface BVALineItem { account_code: string; account_name: string; department?: string; budget_amount: number; actual_amount: number; variance_amount: number; variance_percent: number; status: 'favorable' | 'unfavorable' | 'neutral' }
interface BVASummary { total_budget: number; total_actual: number; total_variance: number; total_variance_percent: number; favorable_count: number; unfavorable_count: number; on_budget_count: number }
interface BVAReport { period: string; budget_id: string; budget_name: string; statement_id: string; statement_type: string; line_items: BVALineItem[]; summary: BVASummary }

export default function BudgetVsActualReport() {
  const { tenantId } = useTenant()

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [statements, setStatements] = useState<Statement[]>([])
  const [loadingInit, setLoadingInit] = useState(false)

  const [selectedBudgetId, setSelectedBudgetId] = useState('')
  const [selectedStatementId, setSelectedStatementId] = useState('')
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'favorable' | 'unfavorable' | 'neutral'>('ALL')
  const [filterDept, setFilterDept] = useState('ALL')
  const [searchQ, setSearchQ] = useState('')

  const [report, setReport] = useState<BVAReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'table' | 'chart' | 'utilization'>('table')

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null)
  const toastTimer = useRef<any>(null)
  function showToast(msg: string, type: 'success' | 'danger' = 'success') {
    setToast({ msg, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => { if (tenantId) loadInit() }, [tenantId])

  async function loadInit() {
    setLoadingInit(true)
    try {
      const [b, s] = await Promise.all([api.get('/budgets'), api.get('/financial/statements')])
      setBudgets(b.data?.budgets || b.data || [])
      const stmts = s.data?.statements || s.data || []
      setStatements(Array.isArray(stmts) ? stmts : [])
    } catch { }
    setLoadingInit(false)
  }

  async function generateReport() {
    if (!selectedBudgetId || !selectedStatementId) { setError('Select both a budget and an actual statement'); return }
    setLoading(true); setError(null); setReport(null)
    try {
      const res = await api.get('/reports/budget-vs-actual', { params: { budget_id: selectedBudgetId, statement_id: selectedStatementId } })
      setReport(res.data)
      setActiveTab('table')
      showToast('Report generated successfully')
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to generate report'
      setError(msg); showToast(msg, 'danger')
    } finally { setLoading(false) }
  }

  function downloadCSV() {
    if (!report) return
    const header = ['account_code', 'account_name', 'department', 'budget_amount', 'actual_amount', 'variance_amount', 'variance_percent', 'status']
    const rows = report.line_items.map(li =>
      `"${li.account_code}","${(li.account_name || '').replace(/"/g, '""')}","${li.department || ''}",${li.budget_amount},${li.actual_amount},${li.variance_amount},${li.variance_percent},"${li.status}"`
    )
    const csv = '\uFEFF' + [header.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `budget_vs_actual_${report.budget_name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
    showToast('CSV downloaded')
  }

  function downloadJSON() {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `budget_vs_actual_${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
    showToast('JSON downloaded')
  }

  const selBudget = budgets.find(b => b.id === selectedBudgetId)
  const selStmt = statements.find(s => s.id === selectedStatementId)

  // Derived data
  const allDepts = report ? Array.from(new Set(report.line_items.map(li => li.department || 'General').filter(Boolean))) : []
  const filteredItems = report?.line_items.filter(li => {
    if (filterStatus !== 'ALL' && li.status !== filterStatus) return false
    if (filterDept !== 'ALL' && (li.department || 'General') !== filterDept) return false
    if (searchQ) {
      const q = searchQ.toLowerCase()
      if (!((li.account_name || '').toLowerCase().includes(q) || (li.account_code || '').toLowerCase().includes(q))) return false
    }
    return true
  }) || []

  const s = report?.summary
  const utilizationPct = s && s.total_budget > 0 ? (s.total_actual / s.total_budget) * 100 : 0

  function buildBarChart() {
    const items = filteredItems.slice(0, 20)
    return {
      data: {
        labels: items.map(li => li.account_name || li.account_code),
        datasets: [
          { label: 'Budget', data: items.map(li => li.budget_amount), backgroundColor: 'rgba(21,101,192,0.7)', borderRadius: 4 },
          { label: 'Actual', data: items.map(li => li.actual_amount), backgroundColor: items.map(li => li.status === 'favorable' ? 'rgba(46,125,50,0.75)' : li.status === 'unfavorable' ? 'rgba(198,40,40,0.75)' : 'rgba(117,117,117,0.6)'), borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' as const }, tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${THB.format(ctx.parsed.y)}` } } },
        scales: { y: { ticks: { callback: (v: any) => THB.format(v) } } },
      },
    }
  }

  function buildDoughnut() {
    const fav  = s?.favorable_count  || 0
    const unf  = s?.unfavorable_count || 0
    const neu  = s?.on_budget_count  || 0
    return {
      data: {
        labels: ['Favorable', 'On Budget', 'Unfavorable'],
        datasets: [{ data: [fav, neu, unf], backgroundColor: ['#2e7d32', '#757575', '#c62828'], borderWidth: 2 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right' as const },
          tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.label}: ${ctx.parsed} items` } },
        },
      },
    }
  }

  const statusBadgeMap: Record<string, string> = { draft: 'secondary', approved: 'success', locked: 'danger', active: 'success', pending: 'warning' }

  return (
    <>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3 px-1">
        <div>
          <h2 className="mb-0 fw-bold" style={{ color: '#1a3c5e' }}>
            <i className="bi bi-bar-chart-line me-2 text-primary"></i>Budget vs Actual Report
          </h2>
          <small className="text-muted">Compare budgeted amounts against actual financial results — track execution accuracy</small>
        </div>
        <Link to="/reports" className="btn btn-outline-secondary btn-sm">
          <i className="bi bi-arrow-left me-1"></i>Back to Reports
        </Link>
      </div>

      {/* KPI strip */}
      <div className="row g-3 mb-3">
        {[
          { label: 'Budgets Available',   val: budgets.length,    icon: 'wallet2',            color: 'primary'   },
          { label: 'Statements Available',val: statements.length, icon: 'file-earmark-bar-graph', color: 'info'  },
          { label: 'Budget Utilization',  val: report ? `${utilizationPct.toFixed(1)}%` : '—', icon: 'percent',  color: utilizationPct > 100 ? 'danger' : 'success' },
          { label: 'Favorable Items',     val: report ? s?.favorable_count : '—', icon: 'check-circle', color: 'success' },
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

      {/* Selection form */}
      <div className="card shadow-sm mb-3">
        <div className="card-header" style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', color: '#fff' }}>
          <div className="d-flex align-items-center gap-2">
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="bi bi-bar-chart text-white"></i>
            </div>
            <div>
              <div className="fw-bold">Configure Report</div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)' }}>Select a budget and an actual financial statement</div>
            </div>
          </div>
        </div>
        <div className="card-body">
          {error && (
            <div className="alert alert-danger d-flex align-items-center gap-2 py-2 mb-3">
              <i className="bi bi-exclamation-circle-fill flex-shrink-0"></i>
              <span>{error}</span>
              <button type="button" className="btn-close ms-auto" onClick={() => setError(null)}></button>
            </div>
          )}
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>
                <i className="bi bi-1-circle me-1 text-primary"></i>Budget
              </label>
              <select className="form-select" value={selectedBudgetId} onChange={e => setSelectedBudgetId(e.target.value)}>
                <option value="">— Select budget —</option>
                {budgets.map(b => <option key={b.id} value={b.id}>{b.budget_name} · FY{b.fiscal_year} · {b.budget_type}</option>)}
              </select>
              {selBudget && (
                <div className="small text-muted mt-1 d-flex gap-1">
                  <span className="badge bg-primary">{selBudget.budget_type}</span>
                  <span className={`badge bg-${statusBadgeMap[selBudget.status] || 'secondary'}`}>{selBudget.status}</span>
                  <span>FY{selBudget.fiscal_year}</span>
                </div>
              )}
              {budgets.length === 0 && !loadingInit && (
                <div className="small text-warning mt-1"><i className="bi bi-exclamation-triangle me-1"></i>No budgets found — create one in the Budgets module</div>
              )}
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>
                <i className="bi bi-2-circle me-1 text-primary"></i>Actual Statement
              </label>
              <select className="form-select" value={selectedStatementId} onChange={e => setSelectedStatementId(e.target.value)}>
                <option value="">— Select statement —</option>
                {statements.map(s => <option key={s.id} value={s.id}>{s.statement_type} · {fmtDateShort(s.period_start)} · {s.status}</option>)}
              </select>
              {selStmt && (
                <div className="small text-muted mt-1 d-flex gap-1">
                  <span className="badge bg-info">{selStmt.statement_type}</span>
                  <span className={`badge bg-${statusBadgeMap[selStmt.status] || 'secondary'}`}>{selStmt.status}</span>
                  <span>{fmtDateShort(selStmt.period_start)} → {fmtDateShort(selStmt.period_end)}</span>
                </div>
              )}
              {statements.length === 0 && !loadingInit && (
                <div className="small text-warning mt-1"><i className="bi bi-exclamation-triangle me-1"></i>No statements — create one in Financials</div>
              )}
            </div>
          </div>
        </div>
        <div className="card-footer d-flex justify-content-between align-items-center" style={{ background: '#f8f9fa' }}>
          <small className="text-muted">
            {selectedBudgetId && selectedStatementId
              ? <span className="text-success"><i className="bi bi-check-circle me-1"></i>Ready — click Generate Report</span>
              : <span>Select budget and statement to proceed</span>}
          </small>
          <button className="btn btn-primary px-4" onClick={generateReport} disabled={loading || !selectedBudgetId || !selectedStatementId}>
            {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Generating…</> : <><i className="bi bi-play-fill me-2"></i>Generate Report</>}
          </button>
        </div>
      </div>

      {/* No data empty state */}
      {!report && !loading && (budgets.length === 0 || statements.length === 0) && (
        <div className="card shadow-sm mb-3">
          <div className="card-body text-center py-5">
            <i className="bi bi-bar-chart-line display-1 text-muted opacity-25"></i>
            <h5 className="mt-3 text-muted fw-normal">No data to compare</h5>
            <p className="text-muted">You need both a <strong>Budget</strong> and a <strong>Financial Statement</strong> to run this report.</p>
            <div className="d-flex justify-content-center gap-3 mt-3">
              <Link to="/budgets" className="btn btn-outline-primary"><i className="bi bi-wallet2 me-1"></i>Create Budget</Link>
              <Link to="/financials" className="btn btn-outline-info"><i className="bi bi-file-earmark-bar-graph me-1"></i>Create Statement</Link>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {report && (
        <div className="card shadow-sm border-success">
          <div className="card-header d-flex align-items-center justify-content-between" style={{ background: 'linear-gradient(135deg,#1b5e20,#2e7d32)', color: '#fff' }}>
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-check-circle-fill fs-5"></i>
              <div>
                <div className="fw-bold">{report.budget_name}</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)' }}>
                  Period: {report.period} · {report.statement_type} · {report.line_items.length} line items
                </div>
              </div>
            </div>
            <div className="d-flex gap-2 flex-wrap">
              <button className="btn btn-sm btn-outline-light" onClick={downloadCSV}>
                <i className="bi bi-file-earmark-spreadsheet me-1"></i>CSV
              </button>
              <button className="btn btn-sm btn-outline-light" onClick={downloadJSON}>
                <i className="bi bi-file-earmark-code me-1"></i>JSON
              </button>
              <button className="btn btn-sm btn-outline-light" onClick={() => window.print()}>
                <i className="bi bi-printer me-1"></i>Print
              </button>
              <button className="btn btn-sm btn-outline-light" onClick={() => setReport(null)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
          </div>

          {/* Summary KPI cards */}
          {s && (
            <div className="card-body border-bottom pb-3">
              <div className="row g-2">
                {[
                  { label: 'Total Budget',   val: s.total_budget,  color: 'primary', icon: 'wallet2'     },
                  { label: 'Total Actual',   val: s.total_actual,  color: 'info',    icon: 'cash'        },
                  { label: 'Total Variance', val: s.total_variance, color: s.total_variance >= 0 ? 'success' : 'danger', icon: 'bar-chart-line' },
                  { label: 'Var %',          val: null, pct: s.total_variance_percent, color: s.total_variance_percent >= 0 ? 'success' : 'danger', icon: 'percent' },
                ].map(k => (
                  <div className="col-6 col-md-3" key={k.label}>
                    <div className={`card border-${k.color} text-center h-100`} style={{ borderTop: '3px solid' }}>
                      <div className="card-body py-2 px-2">
                        <div className={`text-${k.color} mb-1`}><i className={`bi bi-${k.icon}`}></i></div>
                        <div className={`fw-bold small text-${k.color}`}>
                          {k.val != null ? THB.format(k.val) : PCT_SIGNED(k.pct!)}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.68rem' }}>{k.label}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Status breakdown + utilization bar */}
              <div className="row g-2 mt-2 align-items-center">
                <div className="col-md-6">
                  <div className="d-flex gap-3 flex-wrap">
                    {[
                      { label: 'Favorable',   val: s.favorable_count,   color: 'success', icon: 'check-circle-fill' },
                      { label: 'On Budget',   val: s.on_budget_count,   color: 'secondary', icon: 'dash-circle-fill' },
                      { label: 'Unfavorable', val: s.unfavorable_count, color: 'danger',  icon: 'x-circle-fill'    },
                    ].map(b => (
                      <div key={b.label} className="text-center">
                        <div className={`text-${b.color} fw-bold fs-5`}>
                          <i className={`bi bi-${b.icon} me-1`}></i>{b.val}
                        </div>
                        <div className="small text-muted">{b.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="d-flex justify-content-between small mb-1">
                    <span className="text-muted">Budget Utilization</span>
                    <span className={`fw-bold ${utilizationPct > 100 ? 'text-danger' : utilizationPct > 90 ? 'text-warning' : 'text-success'}`}>
                      {utilizationPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="progress" style={{ height: 12, borderRadius: 6 }}>
                    <div
                      className={`progress-bar ${utilizationPct > 100 ? 'bg-danger' : utilizationPct > 90 ? 'bg-warning' : 'bg-success'}`}
                      style={{ width: `${Math.min(100, utilizationPct)}%`, borderRadius: 6 }}
                    ></div>
                  </div>
                  <div className="d-flex justify-content-between small text-muted mt-1">
                    <span>{THB.format(s.total_actual)} actual</span>
                    <span>{THB.format(s.total_budget)} budget</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filters + Tabs */}
          <div className="card-body">
            {/* Filter bar */}
            <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
              <input type="search" className="form-control form-control-sm" style={{ maxWidth: 200 }}
                placeholder="🔍 Search accounts…" value={searchQ} onChange={e => setSearchQ(e.target.value)} />
              <div className="d-flex gap-1 flex-wrap">
                {(['ALL', 'favorable', 'unfavorable', 'neutral'] as const).map(f => (
                  <button key={f} type="button"
                    className={`btn btn-sm py-0 ${filterStatus === f ? (f === 'favorable' ? 'btn-success' : f === 'unfavorable' ? 'btn-danger' : 'btn-secondary') : 'btn-outline-secondary'}`}
                    style={{ fontSize: '0.72rem' }} onClick={() => setFilterStatus(f)}>
                    {f === 'ALL' ? 'All' : f === 'favorable' ? '✓ Favorable' : f === 'unfavorable' ? '✗ Unfavorable' : '○ On Budget'}
                  </button>
                ))}
              </div>
              {allDepts.length > 1 && (
                <select className="form-select form-select-sm" style={{ maxWidth: 160 }} value={filterDept} onChange={e => setFilterDept(e.target.value)}>
                  <option value="ALL">All Departments</option>
                  {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
              <span className="ms-auto small text-muted">{filteredItems.length} of {report.line_items.length} items</span>
            </div>

            {/* Tabs */}
            <ul className="nav nav-tabs mb-3">
              {[
                { id: 'table' as const,       label: 'Detail Table',  icon: 'table'          },
                { id: 'chart' as const,        label: 'Charts',        icon: 'bar-chart'      },
                { id: 'utilization' as const,  label: 'Utilization',   icon: 'graph-up-arrow' },
              ].map(t => (
                <li className="nav-item" key={t.id}>
                  <button className={`nav-link ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
                    <i className={`bi bi-${t.icon} me-1`}></i>{t.label}
                  </button>
                </li>
              ))}
            </ul>

            {/* Detail table */}
            {activeTab === 'table' && (
              <div className="table-responsive" style={{ maxHeight: 480 }}>
                <table className="table table-sm table-hover table-bordered mb-0">
                  <thead className="table-dark sticky-top">
                    <tr>
                      <th>Account</th><th>Name</th><th>Dept</th>
                      <th className="text-end">Budget</th><th className="text-end">Actual</th>
                      <th className="text-end">Variance</th><th className="text-end">%</th>
                      <th>Status</th><th>Utilization</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((li, idx) => {
                      const util = li.budget_amount > 0 ? (li.actual_amount / li.budget_amount) * 100 : 0
                      return (
                        <tr key={idx} className={li.status === 'favorable' ? 'table-success' : li.status === 'unfavorable' ? 'table-danger' : ''}>
                          <td><code className="small">{li.account_code}</code></td>
                          <td className="small fw-semibold">{li.account_name}</td>
                          <td><span className="badge bg-light text-dark border" style={{ fontSize: '0.65rem' }}>{li.department || 'General'}</span></td>
                          <td className="text-end small text-primary">{THB.format(li.budget_amount)}</td>
                          <td className="text-end small text-info">{THB.format(li.actual_amount)}</td>
                          <td className={`text-end small fw-bold ${li.variance_amount >= 0 ? 'text-success' : 'text-danger'}`}>
                            {li.variance_amount >= 0 ? '+' : ''}{THB.format(li.variance_amount)}
                          </td>
                          <td className={`text-end small ${li.variance_percent >= 0 ? 'text-success' : 'text-danger'}`}>
                            {PCT_SIGNED(li.variance_percent)}
                          </td>
                          <td>
                            <span className={`badge ${li.status === 'favorable' ? 'bg-success' : li.status === 'unfavorable' ? 'bg-danger' : 'bg-secondary'}`}>
                              {li.status === 'favorable' ? '✓' : li.status === 'unfavorable' ? '✗' : '○'} {li.status}
                            </span>
                          </td>
                          <td style={{ minWidth: 80 }}>
                            <div className="progress" style={{ height: 6 }}>
                              <div className={`progress-bar ${util > 100 ? 'bg-danger' : util > 90 ? 'bg-warning' : 'bg-success'}`}
                                style={{ width: `${Math.min(100, Math.abs(util))}%` }}></div>
                            </div>
                            <div style={{ fontSize: '0.62rem' }} className="text-muted text-center">{util.toFixed(0)}%</div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {s && (
                    <tfoot className="table-light">
                      <tr className="fw-bold">
                        <td colSpan={3}>Total</td>
                        <td className="text-end text-primary">{THB.format(s.total_budget)}</td>
                        <td className="text-end text-info">{THB.format(s.total_actual)}</td>
                        <td className={`text-end ${s.total_variance >= 0 ? 'text-success' : 'text-danger'}`}>{s.total_variance >= 0 ? '+' : ''}{THB.format(s.total_variance)}</td>
                        <td className={`text-end ${s.total_variance_percent >= 0 ? 'text-success' : 'text-danger'}`}>{PCT_SIGNED(s.total_variance_percent)}</td>
                        <td></td><td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* Charts */}
            {activeTab === 'chart' && (
              <div className="row g-3">
                <div className="col-12">
                  <div className="small fw-semibold text-muted mb-2">Budget vs Actual by Account (top 20)</div>
                  <div style={{ height: 300 }}><Bar {...buildBarChart()} /></div>
                </div>
                <div className="col-md-5">
                  <div className="small fw-semibold text-muted mb-2">Status Distribution</div>
                  <div style={{ height: 200 }}><Doughnut {...buildDoughnut()} /></div>
                </div>
                <div className="col-md-7">
                  <div className="small fw-semibold text-muted mb-2">Variance Waterfall</div>
                  <table className="table table-sm mb-0">
                    <tbody>
                      {filteredItems.slice(0, 10).map((li, i) => (
                        <tr key={i}>
                          <td className="small">{li.account_name || li.account_code}</td>
                          <td className={`text-end small fw-semibold ${li.variance_amount >= 0 ? 'text-success' : 'text-danger'}`}>{li.variance_amount >= 0 ? '+' : ''}{THB.format(li.variance_amount)}</td>
                          <td style={{ width: 100 }}>
                            <div className="progress" style={{ height: 8 }}>
                              <div className={`progress-bar ${li.status === 'favorable' ? 'bg-success' : li.status === 'unfavorable' ? 'bg-danger' : 'bg-secondary'}`}
                                style={{ width: `${Math.min(100, Math.abs(li.variance_percent))}%` }}></div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Utilization view */}
            {activeTab === 'utilization' && (
              <div>
                <div className="small fw-semibold text-muted mb-3">Budget Utilization per Account — progress bar shows actual/budget ratio</div>
                <div className="row g-2">
                  {filteredItems.map((li, i) => {
                    const util = li.budget_amount > 0 ? (li.actual_amount / li.budget_amount) * 100 : 0
                    return (
                      <div className="col-12 col-md-6" key={i}>
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <div>
                            <code className="text-muted me-1" style={{ fontSize: '0.65rem' }}>{li.account_code}</code>
                            <span className="small fw-semibold">{li.account_name}</span>
                          </div>
                          <div className="text-end small">
                            <span className={util > 100 ? 'text-danger fw-bold' : util > 90 ? 'text-warning' : 'text-success'}>{util.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="progress mb-1" style={{ height: 10, borderRadius: 5 }}>
                          <div
                            className={`progress-bar ${util > 100 ? 'bg-danger' : util > 90 ? 'bg-warning' : 'bg-success'}`}
                            style={{ width: `${Math.min(100, util)}%`, borderRadius: 5 }}
                          ></div>
                        </div>
                        <div className="d-flex justify-content-between small text-muted">
                          <span>{THB.format(li.actual_amount)}</span>
                          <span>of {THB.format(li.budget_amount)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footnote */}
          <div className="card-footer py-2 d-flex justify-content-between align-items-center">
            <small className="text-muted">
              <i className="bi bi-info-circle me-1"></i>
              <strong>Favorable</strong> = actual better than budget (lower expense or higher revenue).
              <strong className="ms-2">Unfavorable</strong> = actual worse than budget.
            </small>
            <small className="text-muted">Budget: <strong>{report.budget_name}</strong></small>
          </div>
        </div>
      )}

      {/* CFO Guide */}
      <div className="card mt-3 border-0" style={{ background: 'linear-gradient(90deg,#f8f9fa,#e9ecef)' }}>
        <div className="card-body py-3">
          <div className="small fw-semibold text-muted mb-2"><i className="bi bi-lightbulb me-1 text-warning"></i>CFO Budget vs Actual Workflow</div>
          <div className="row g-2">
            {[
              { step: '1', label: 'Set Budget',      desc: 'Create annual or quarterly budgets in the Budgets module' },
              { step: '2', label: 'Post Actuals',    desc: 'Import actual results via ETL or create statements in Financials' },
              { step: '3', label: 'Generate Report', desc: 'Select budget + statement to run side-by-side comparison' },
              { step: '4', label: 'Review & Act',    desc: 'Investigate unfavorable variances and adjust forecasts' },
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
