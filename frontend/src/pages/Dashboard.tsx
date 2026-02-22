import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAbortController, isAbortError } from '../hooks/useApi'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { useTenant } from '../components/TenantContext'
import { useUser } from '../components/UserContext'
import { hasMinRole } from '../components/RequireRole'

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement,
  Title, Tooltip, Legend, Filler
)

const THB = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0 })
const NUM = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtDate(v: any) {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function Dashboard() {
  const { tenantId } = useTenant()
  const { role } = useUser()
  const isAdmin = hasMinRole(role, 'admin')

  const [loading, setLoading] = useState(true)
  const [statements, setStatements] = useState<any[]>([])
  const [statementDetails, setStatementDetails] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [imports, setImports] = useState<any[]>([])
  const [scenarios, setScenarios] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [coa, setCoa] = useState<any[]>([])
  const { getSignal } = useAbortController()

  useEffect(() => {
    if (!tenantId) { setLoading(false); return }
    loadAll(getSignal())
  }, [tenantId])

  async function loadAll(signal?: AbortSignal) {
    setLoading(true)
    try {
      const [stmtsRes, txRes, importsRes, scenariosRes, usersRes, coaRes] = await Promise.allSettled([
        api.get('/financial/statements', { signal }),
        api.get('/etl/transactions', { signal }),
        api.get('/etl/imports', { signal }),
        api.get('/scenarios', { signal }),
        api.get('/users', { signal }),
        api.get('/coa', { signal }),
      ])

      const stmtList: any[] = stmtsRes.status === 'fulfilled' ? (stmtsRes.value.data || []) : []
      setStatements(stmtList)

      const details = await Promise.all(stmtList.map(async (s: any) => {
        try {
          const r = await api.get(`/financial/statements/${s.id}`, { signal })
          const lineItems = r.data?.lineItems || r.data?.line_items || []
          return { ...s, line_items: lineItems }
        } catch (e) { if (isAbortError(e)) throw e; return { ...s, line_items: [] } }
      }))
      setStatementDetails(details)

      if (txRes.status === 'fulfilled') {
        const raw = txRes.value.data
        setTransactions(Array.isArray(raw) ? raw : raw?.transactions || [])
      }
      if (importsRes.status === 'fulfilled') {
        const raw = importsRes.value.data
        setImports(Array.isArray(raw) ? raw.slice(0, 5) : [])
      }
      if (scenariosRes.status === 'fulfilled') {
        const raw = scenariosRes.value.data
        setScenarios(Array.isArray(raw) ? raw : raw?.scenarios || [])
      }
      if (usersRes.status === 'fulfilled') {
        const raw = usersRes.value.data
        setUsers(Array.isArray(raw) ? raw : raw?.users || [])
      }
      if (coaRes.status === 'fulfilled') {
        const raw = coaRes.value.data
        setCoa(Array.isArray(raw) ? raw : [])
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const allLineItems = statementDetails.flatMap(s => s.line_items || [])
  const totalRevenue = allLineItems.filter(li => Number(li.amount) > 0).reduce((s, li) => s + Number(li.amount), 0)
  const totalExpenses = allLineItems.filter(li => Number(li.amount) < 0).reduce((s, li) => s + Math.abs(Number(li.amount)), 0)
  const netIncome = totalRevenue - totalExpenses
  const profitMargin = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0

  const txPending = transactions.filter(t => t.status === 'pending').length
  const txApproved = transactions.filter(t => t.status === 'approved').length
  const txPosted = transactions.filter(t => t.status === 'posted').length
  const txTotal = transactions.length

  const stmtChartLabels = statementDetails.map(s => `${s.statement_type} ${s.scenario} (${fmtDate(s.period_start)})`)
  const stmtRevenues = statementDetails.map(s =>
    (s.line_items || []).filter((li: any) => Number(li.amount) > 0).reduce((sum: number, li: any) => sum + Number(li.amount), 0)
  )
  const stmtExpenses = statementDetails.map(s =>
    (s.line_items || []).filter((li: any) => Number(li.amount) < 0).reduce((sum: number, li: any) => sum + Math.abs(Number(li.amount)), 0)
  )

  const pipelineData = {
    labels: ['Posted', 'Approved (Pending Post)', 'Pending Approval'],
    datasets: [{ data: [txPosted, txApproved, txPending], backgroundColor: ['#198754', '#ffc107', '#6c757d'], borderWidth: 2 }]
  }

  const coaByType: Record<string, number> = {}
  coa.forEach(a => { if (a.account_type) coaByType[a.account_type] = (coaByType[a.account_type] || 0) + 1 })
  const coaLabels = Object.keys(coaByType)
  const coaValues = Object.values(coaByType)
  const COLORS = ['#0d6efd', '#198754', '#ffc107', '#dc3545', '#6f42c1', '#0dcaf0', '#fd7e14']

  if (loading) return (
    <div className="card">
      <div className="card-body text-center py-5">
        <div className="spinner-border text-primary" style={{ width: '3rem', height: '3rem' }} role="status"></div>
        <p className="mt-3 text-muted fs-5">Loading CFO Dashboard...</p>
      </div>
    </div>
  )

  return (
    <>
      {/* ── ROW 1: Main KPI Cards ── */}
      <div className="row g-3 mb-3">
        <div className="col-6 col-md-3">
          <div className="info-box mb-0">
            <span className="info-box-icon text-bg-success shadow-sm"><i className="bi bi-graph-up-arrow"></i></span>
            <div className="info-box-content">
              <span className="info-box-text">Total Revenue</span>
              <span className="info-box-number text-success">{THB.format(totalRevenue)}</span>
              <div className="progress mt-1"><div className="progress-bar bg-success" style={{ width: '100%' }}></div></div>
              <span className="progress-description">{allLineItems.filter(li => Number(li.amount) > 0).length} revenue lines</span>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="info-box mb-0">
            <span className="info-box-icon text-bg-danger shadow-sm"><i className="bi bi-graph-down-arrow"></i></span>
            <div className="info-box-content">
              <span className="info-box-text">Total Expenses</span>
              <span className="info-box-number text-danger">{THB.format(totalExpenses)}</span>
              <div className="progress mt-1"><div className="progress-bar bg-danger" style={{ width: '100%' }}></div></div>
              <span className="progress-description">{allLineItems.filter(li => Number(li.amount) < 0).length} expense lines</span>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="info-box mb-0">
            <span className={`info-box-icon shadow-sm ${netIncome >= 0 ? 'text-bg-primary' : 'text-bg-warning'}`}>
              <i className={`bi bi-${netIncome >= 0 ? 'cash-coin' : 'exclamation-triangle'}`}></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">Net Income</span>
              <span className={`info-box-number ${netIncome >= 0 ? 'text-primary' : 'text-danger'}`}>
                {netIncome >= 0 ? '' : '-'}{THB.format(Math.abs(netIncome))}
              </span>
              <div className="progress mt-1">
                <div className={`progress-bar ${netIncome >= 0 ? 'bg-primary' : 'bg-danger'}`} style={{ width: `${Math.min(Math.abs(profitMargin), 100)}%` }}></div>
              </div>
              <span className="progress-description">Margin {NUM.format(profitMargin)}%</span>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="info-box mb-0">
            <span className="info-box-icon text-bg-info shadow-sm"><i className="bi bi-percent"></i></span>
            <div className="info-box-content">
              <span className="info-box-text">Profit Margin</span>
              <span className={`info-box-number ${profitMargin >= 0 ? 'text-info' : 'text-danger'}`}>{NUM.format(profitMargin)}%</span>
              <div className="progress mt-1">
                <div className="progress-bar bg-info" style={{ width: `${Math.min(Math.abs(profitMargin), 100)}%` }}></div>
              </div>
              <span className="progress-description">{netIncome >= 0 ? 'Profitable' : 'Operating at a loss'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 2: Mini Stats ── */}
      <div className="row g-3 mb-3">
        {[
          { val: txTotal, label: 'Total Transactions', color: 'secondary' },
          { val: txApproved, label: 'Pending Post', color: 'warning' },
          { val: txPosted, label: 'Posted', color: 'success' },
          { val: statements.length, label: 'Statements', color: 'primary' },
          { val: scenarios.length, label: 'Scenarios', color: 'info' },
          { val: users.length, label: 'Users', color: 'dark' },
        ].map(m => (
          <div key={m.label} className="col-4 col-md-2">
            <div className={`card border-${m.color} text-center py-3 mb-0`}>
              <div className={`fs-4 fw-bold text-${m.color}`}>{m.val}</div>
              <div className="text-muted small">{m.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── ROW 3: Charts ── */}
      <div className="row g-3 mb-3">
        <div className="col-md-8">
          <div className="card h-100">
            <div className="card-header">
              <h3 className="card-title"><i className="bi bi-bar-chart-line me-2"></i>Revenue vs Expenses by Statement</h3>
              <div className="card-tools">
                <Link to="/financials" className="btn btn-sm btn-outline-primary"><i className="bi bi-plus me-1"></i>New Statement</Link>
              </div>
            </div>
            <div className="card-body">
              {statementDetails.length === 0 ? (
                <div className="text-center py-4 text-muted">
                  <i className="bi bi-bar-chart display-4 d-block mb-2"></i>
                  <p>No financial statements yet</p>
                  <Link to="/financials" className="btn btn-primary btn-sm">Create Statement</Link>
                </div>
              ) : (
                <div style={{ height: 280 }}>
                  <Bar
                    data={{
                      labels: stmtChartLabels,
                      datasets: [
                        { label: 'Revenue', data: stmtRevenues, backgroundColor: 'rgba(25,135,84,0.8)', borderColor: '#198754', borderWidth: 1, borderRadius: 4 },
                        { label: 'Expenses', data: stmtExpenses, backgroundColor: 'rgba(220,53,69,0.8)', borderColor: '#dc3545', borderWidth: 1, borderRadius: 4 },
                      ]
                    }}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'top' as const },
                        tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${THB.format(ctx.parsed.y)}` } }
                      },
                      scales: { y: { ticks: { callback: (v: any) => THB.format(Number(v)) } } }
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card h-100">
            <div className="card-header">
              <h3 className="card-title"><i className="bi bi-funnel me-2"></i>Transaction Pipeline</h3>
              <div className="card-tools">
                <Link to="/etl" className="btn btn-sm btn-outline-primary"><i className="bi bi-upload me-1"></i>Import</Link>
              </div>
            </div>
            <div className="card-body">
              {txTotal === 0 ? (
                <div className="text-center py-4 text-muted">
                  <i className="bi bi-inbox display-4 d-block mb-2"></i>
                  <p>No transactions imported yet</p>
                  <Link to="/etl" className="btn btn-primary btn-sm">Import Data</Link>
                </div>
              ) : (
                <>
                  <div style={{ height: 180, display: 'flex', justifyContent: 'center' }}>
                    <Doughnut data={pipelineData} options={{
                      responsive: true, maintainAspectRatio: false, cutout: '60%' as any,
                      plugins: {
                        legend: { position: 'bottom' as const, labels: { font: { size: 11 } } },
                        tooltip: { callbacks: { label: (ctx: any) => `${ctx.label}: ${ctx.parsed} txn` } }
                      }
                    }} />
                  </div>
                  <div className="mt-3">
                    {[
                      { label: 'Total Imported', value: txTotal, color: 'secondary', width: 100 },
                      { label: 'Approved', value: txApproved, color: 'warning', width: txTotal > 0 ? Math.round(txApproved / txTotal * 100) : 0 },
                      { label: 'Posted to Financials', value: txPosted, color: 'success', width: txTotal > 0 ? Math.round(txPosted / txTotal * 100) : 0 },
                    ].map(row => (
                      <div key={row.label} className="mb-2">
                        <div className="d-flex justify-content-between mb-1">
                          <small>{row.label}</small><small className="fw-bold">{row.value}</small>
                        </div>
                        <div className="progress" style={{ height: 6 }}>
                          <div className={`progress-bar bg-${row.color}`} style={{ width: `${row.width}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 4: Scenarios + COA ── */}
      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-header">
              <h3 className="card-title"><i className="bi bi-diagram-3 me-2"></i>Scenarios</h3>
              <div className="card-tools"><Link to="/scenarios" className="btn btn-sm btn-outline-primary">View All</Link></div>
            </div>
            <div className="card-body p-0">
              {scenarios.length === 0 ? (
                <div className="text-center py-4 text-muted">
                  <i className="bi bi-diagram-3 display-4 d-block mb-2"></i>
                  <p>No scenarios created yet</p>
                  <Link to="/scenarios" className="btn btn-primary btn-sm">Create Scenario</Link>
                </div>
              ) : (
                <ul className="list-group list-group-flush">
                  {scenarios.map((sc) => (
                    <li key={sc.id} className="list-group-item d-flex align-items-center gap-3 py-3">
                      <span className="info-box-icon text-bg-info shadow-sm rounded" style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                        <i className="bi bi-diagram-3"></i>
                      </span>
                      <div className="flex-grow-1">
                        <div className="fw-semibold">{sc.scenario_name}</div>
                        <small className="text-muted">{sc.scenario_type} · {sc.description || 'No description'}</small>
                      </div>
                      <div className="d-flex flex-column align-items-end gap-1">
                        <span className={`badge ${sc.is_active ? 'text-bg-success' : 'text-bg-secondary'}`}>{sc.is_active ? 'Active' : 'Inactive'}</span>
                        <small className="text-muted">{fmtDate(sc.created_at)}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-header">
              <h3 className="card-title"><i className="bi bi-list-columns me-2"></i>Chart of Accounts</h3>
              <div className="card-tools"><Link to="/coa" className="btn btn-sm btn-outline-primary">View COA</Link></div>
            </div>
            <div className="card-body">
              {coa.length === 0 ? (
                <div className="text-center py-4 text-muted">
                  <i className="bi bi-list-columns display-4 d-block mb-2"></i>
                  <p>No chart of accounts set up</p>
                </div>
              ) : (
                <div className="row align-items-center">
                  <div className="col-5" style={{ height: 180 }}>
                    <Doughnut
                      data={{ labels: coaLabels.map(l => l.charAt(0).toUpperCase() + l.slice(1)), datasets: [{ data: coaValues, backgroundColor: COLORS, borderWidth: 2 }] }}
                      options={{ responsive: true, maintainAspectRatio: false, cutout: '55%' as any, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => `${ctx.label}: ${ctx.parsed} accounts` } } } }}
                    />
                  </div>
                  <div className="col-7">
                    <div className="fw-bold mb-2">Total: {coa.length} accounts</div>
                    {coaLabels.map((label, i) => (
                      <div key={label} className="d-flex justify-content-between align-items-center mb-2">
                        <div className="d-flex align-items-center gap-2">
                          <div className="rounded-circle" style={{ width: 10, height: 10, background: COLORS[i % COLORS.length] }}></div>
                          <small className="text-capitalize">{label}</small>
                        </div>
                        <span className="badge text-bg-secondary">{coaValues[i]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 5: Statements + Recent Imports ── */}
      <div className="row g-3 mb-3">
        <div className="col-md-7">
          <div className="card h-100">
            <div className="card-header">
              <h3 className="card-title"><i className="bi bi-file-earmark-bar-graph me-2"></i>Financial Statements</h3>
              <div className="card-tools"><Link to="/financials" className="btn btn-sm btn-outline-primary"><i className="bi bi-plus me-1"></i>New</Link></div>
            </div>
            <div className="card-body p-0">
              {statementDetails.length === 0 ? (
                <div className="text-center py-4 text-muted">
                  <i className="bi bi-file-earmark-bar-graph display-4 d-block mb-2"></i>
                  <p>No financial statements yet</p>
                </div>
              ) : (
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr><th>Type</th><th>Scenario</th><th>Period</th><th className="text-end">Net</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {statementDetails.map(s => {
                      const rev = (s.line_items || []).filter((li: any) => Number(li.amount) > 0).reduce((sum: number, li: any) => sum + Number(li.amount), 0)
                      const exp = (s.line_items || []).filter((li: any) => Number(li.amount) < 0).reduce((sum: number, li: any) => sum + Math.abs(Number(li.amount)), 0)
                      const net = rev - exp
                      return (
                        <tr key={s.id}>
                          <td><span className={`badge ${s.statement_type === 'PL' ? 'text-bg-info' : s.statement_type === 'BS' ? 'text-bg-primary' : 'text-bg-secondary'}`}>{s.statement_type}</span></td>
                          <td className="fw-semibold">{s.scenario}</td>
                          <td><small>{fmtDate(s.period_start)}<br />{fmtDate(s.period_end)}</small></td>
                          <td className={`text-end fw-semibold ${net >= 0 ? 'text-success' : 'text-danger'}`}>{net >= 0 ? '+' : ''}{THB.format(net)}</td>
                          <td><span className={`badge ${s.status === 'approved' ? 'text-bg-success' : s.status === 'locked' ? 'text-bg-dark' : 'text-bg-warning'}`}>{s.status}</span></td>
                          <td><Link to={`/financials/${s.id}`} className="btn btn-sm btn-outline-primary py-0 px-2"><i className="bi bi-eye"></i></Link></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {statementDetails.length > 0 && (
              <div className="card-footer">
                <div className="row text-center">
                  <div className="col-4 border-end"><div className="fw-bold text-success">{THB.format(totalRevenue)}</div><small className="text-muted">Total Revenue</small></div>
                  <div className="col-4 border-end"><div className="fw-bold text-danger">{THB.format(totalExpenses)}</div><small className="text-muted">Total Expenses</small></div>
                  <div className="col-4"><div className={`fw-bold ${netIncome >= 0 ? 'text-primary' : 'text-danger'}`}>{THB.format(netIncome)}</div><small className="text-muted">Net Income</small></div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="col-md-5">
          <div className="card h-100">
            <div className="card-header">
              <h3 className="card-title"><i className="bi bi-upload me-2"></i>Recent Imports</h3>
              <div className="card-tools"><Link to="/etl" className="btn btn-sm btn-outline-primary"><i className="bi bi-plus me-1"></i>Import</Link></div>
            </div>
            <div className="card-body p-0">
              {imports.length === 0 ? (
                <div className="text-center py-4 text-muted">
                  <i className="bi bi-cloud-upload display-4 d-block mb-2"></i>
                  <p>No imports yet</p>
                  <Link to="/etl" className="btn btn-primary btn-sm">Import CSV/Excel</Link>
                </div>
              ) : (
                <ul className="list-group list-group-flush">
                  {imports.map(imp => (
                    <li key={imp.id} className="list-group-item py-2">
                      <div className="d-flex align-items-center gap-2">
                        <i className={`bi bi-${imp.status === 'completed' ? 'check-circle-fill text-success' : imp.status === 'failed' ? 'x-circle-fill text-danger' : 'hourglass-split text-warning'}`}></i>
                        <div className="flex-grow-1 min-w-0">
                          <div className="fw-semibold text-truncate" style={{ maxWidth: 180 }}>{imp.file_name || 'Unnamed'}</div>
                          <small className="text-muted">{fmtDate(imp.started_at)} · {imp.valid_rows ?? 0} rows</small>
                        </div>
                        <span className={`badge ${imp.status === 'completed' ? 'text-bg-success' : imp.status === 'failed' ? 'text-bg-danger' : 'text-bg-warning'}`}>{imp.status}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 6: Team + Quick Actions ── */}
      <div className="row g-3 mb-3">
        <div className="col-md-4">
          <div className="card h-100">
            <div className="card-header">
              <h3 className="card-title"><i className="bi bi-people me-2"></i>Team Members</h3>
              {isAdmin && <div className="card-tools"><Link to="/users" className="btn btn-sm btn-outline-primary">Manage</Link></div>}
            </div>
            <div className="card-body p-0">
              {users.length === 0 ? (
                <div className="text-center py-4 text-muted">No users found</div>
              ) : (
                <ul className="list-group list-group-flush">
                  {users.map((u: any) => {
                    const roleColor: Record<string, string> = { admin: 'danger', analyst: 'info', viewer: 'secondary', super_admin: 'dark' }
                    const roleIcon: Record<string, string> = { admin: 'shield-fill', analyst: 'graph-up', viewer: 'eye', super_admin: 'stars' }
                    const r = u.role || 'viewer'
                    return (
                      <li key={u.id || u.email} className="list-group-item d-flex align-items-center gap-3 py-3">
                        <div className={`text-bg-${roleColor[r] || 'secondary'} rounded-circle d-flex align-items-center justify-content-center shadow-sm`}
                          style={{ width: 38, height: 38, flexShrink: 0, fontSize: 16 }}>
                          <i className={`bi bi-${roleIcon[r] || 'person-fill'}`}></i>
                        </div>
                        <div className="flex-grow-1">
                          <div className="fw-semibold">{u.username || u.email?.split('@')[0] || '—'}</div>
                          <small className="text-muted">{u.email || '—'}</small>
                        </div>
                        <span className={`badge text-bg-${roleColor[r] || 'secondary'} text-capitalize`}>{r}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="col-md-8">
          <div className="card h-100">
            <div className="card-header">
              <h3 className="card-title"><i className="bi bi-lightning-fill me-2"></i>Quick Actions</h3>
            </div>
            <div className="card-body">
              <div className="row g-2">
                {[
                  { to: '/etl', icon: 'cloud-upload', label: 'Import Data', color: 'primary', desc: 'CSV / Excel transactions' },
                  { to: '/financials', icon: 'file-earmark-bar-graph', label: 'Financials', color: 'success', desc: 'P&L / BS / CF statements' },
                  { to: '/scenarios', icon: 'diagram-3', label: 'Scenarios', color: 'info', desc: 'Budget & forecast' },
                  { to: '/etl', icon: 'table', label: 'Transactions', color: 'warning', desc: 'Review & post transactions' },
                  { to: '/consolidation', icon: 'layers', label: 'Consolidation', color: 'secondary', desc: 'Multi-entity roll-up' },
                  { to: '/projections', icon: 'graph-up-arrow', label: 'Projections', color: 'dark', desc: 'Financial models' },
                  { to: '/coa', icon: 'list-columns', label: 'COA', color: 'primary', desc: `${coa.length} accounts` },
                  { to: '/dim', icon: 'building', label: 'Dimensions', color: 'secondary', desc: 'Dept & cost centers' },
                ].map(action => (
                  <div key={action.to} className="col-6 col-lg-3">
                    <Link to={action.to} className={`card border-${action.color} text-decoration-none h-100`}
                      style={{ transition: 'box-shadow .15s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,.15)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = ''}>
                      <div className="card-body text-center py-3 px-2">
                        <i className={`bi bi-${action.icon} text-${action.color} fs-3 d-block mb-1`}></i>
                        <div className="fw-semibold small">{action.label}</div>
                        <small className="text-muted">{action.desc}</small>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── CFO Workflow Guide ── */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title"><i className="bi bi-map me-2"></i>CFO Workflow</h3>
        </div>
        <div className="card-body">
          <div className="row g-3">
            {[
              { step: '1', icon: 'cloud-upload', title: 'Import Data', desc: 'Upload CSV/Excel', to: '/etl', color: 'primary', done: txTotal > 0 },
              { step: '2', icon: 'check-circle', title: 'Approve Txns', desc: 'Review & approve', to: '/etl', color: 'warning', done: txApproved > 0 || txPosted > 0 },
              { step: '3', icon: 'diagram-3', title: 'Set Scenario', desc: 'Budget / forecast', to: '/scenarios', color: 'info', done: scenarios.length > 0 },
              { step: '4', icon: 'arrow-right-square', title: 'Post to GL', desc: 'Post to statements', to: '/etl', color: 'success', done: txPosted > 0 },
              { step: '5', icon: 'file-earmark-check', title: 'Approve Stmts', desc: 'CFO sign-off', to: '/financials', color: 'success', done: statements.some(s => s.status === 'approved') },
              { step: '6', icon: 'bar-chart-line', title: 'Analysis', desc: 'Drill-down & reports', to: statements[0] ? `/financials/${statements[0].id}` : '/financials', color: 'dark', done: false },
            ].map(w => (
              <div key={w.step} className="col-4 col-md-2 text-center">
                <Link to={w.to} className="text-decoration-none d-block">
                  <div className={`rounded-circle mx-auto mb-2 d-flex align-items-center justify-content-center ${w.done ? `text-bg-${w.color}` : 'bg-body-secondary text-muted'} shadow-sm`}
                    style={{ width: 52, height: 52, fontSize: 22, position: 'relative' }}>
                    <i className={`bi bi-${w.icon}`}></i>
                    {w.done && <span className="position-absolute badge rounded-pill text-bg-light text-success border border-success" style={{ top: -4, right: -4, fontSize: 9, padding: '2px 5px' }}>✓</span>}
                  </div>
                  <div className="fw-semibold small">{w.title}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>{w.desc}</div>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

