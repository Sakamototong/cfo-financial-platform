import React, { useEffect, useState, useRef } from 'react'
import ReactDOM from 'react-dom'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useTenant } from '../components/TenantContext'
import { useUser } from '../components/UserContext'
import { hasMinRole } from '../components/RequireRole'

type LineItem = {
  line_code: string
  line_name: string
  line_order?: number
  amount: number
  currency: string
  notes?: string
}

const THB = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0 })

function fmtDate(v: any) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

const STATUS_META: Record<string, { color: string; icon: string; next?: string; nextLabel?: string }> = {
  draft:    { color: 'warning', icon: 'pencil-fill',        next: 'approved', nextLabel: 'Approve' },
  approved: { color: 'success', icon: 'check-circle-fill',  next: 'locked',   nextLabel: 'Lock' },
  locked:   { color: 'dark',    icon: 'lock-fill' },
}

const TYPE_META: Record<string, { label: string; color: string; icon: string; desc: string }> = {
  PL: { label: 'P&L',           color: 'info',    icon: 'graph-up-arrow',      desc: 'Profit & Loss Statement' },
  BS: { label: 'Balance Sheet', color: 'primary', icon: 'bank',                desc: 'Balance Sheet' },
  CF: { label: 'Cash Flow',     color: 'success', icon: 'cash-coin',           desc: 'Cash Flow Statement' },
}

const PL_TEMPLATES: LineItem[] = [
  { line_code: '4000', line_name: 'Sales Revenue',          line_order: 1,  amount: 0, currency: 'THB' },
  { line_code: '4100', line_name: 'Service Revenue',         line_order: 2,  amount: 0, currency: 'THB' },
  { line_code: '4200', line_name: 'Other Revenue',           line_order: 3,  amount: 0, currency: 'THB' },
  { line_code: '5100', line_name: 'Cost of Goods Sold',      line_order: 4,  amount: 0, currency: 'THB' },
  { line_code: '5200', line_name: 'Salaries & Wages',        line_order: 5,  amount: 0, currency: 'THB' },
  { line_code: '5300', line_name: 'Rent Expense',            line_order: 6,  amount: 0, currency: 'THB' },
  { line_code: '5400', line_name: 'Utilities',               line_order: 7,  amount: 0, currency: 'THB' },
  { line_code: '5500', line_name: 'Depreciation',            line_order: 8,  amount: 0, currency: 'THB' },
]
const BS_TEMPLATES: LineItem[] = [
  { line_code: '1000', line_name: 'Cash & Equivalents',      line_order: 1,  amount: 0, currency: 'THB' },
  { line_code: '1100', line_name: 'Accounts Receivable',     line_order: 2,  amount: 0, currency: 'THB' },
  { line_code: '1200', line_name: 'Inventory',               line_order: 3,  amount: 0, currency: 'THB' },
  { line_code: '1500', line_name: 'Fixed Assets',            line_order: 4,  amount: 0, currency: 'THB' },
  { line_code: '2000', line_name: 'Accounts Payable',        line_order: 5,  amount: 0, currency: 'THB' },
  { line_code: '2100', line_name: 'Short-term Loans',        line_order: 6,  amount: 0, currency: 'THB' },
  { line_code: '3000', line_name: "Owner's Equity",          line_order: 7,  amount: 0, currency: 'THB' },
]
const CF_TEMPLATES: LineItem[] = [
  { line_code: 'CF01', line_name: 'Cash from Operations',    line_order: 1,  amount: 0, currency: 'THB' },
  { line_code: 'CF02', line_name: 'Cash from Investing',     line_order: 2,  amount: 0, currency: 'THB' },
  { line_code: 'CF03', line_name: 'Cash from Financing',     line_order: 3,  amount: 0, currency: 'THB' },
]
const TEMPLATES: Record<string, LineItem[]> = { PL: PL_TEMPLATES, BS: BS_TEMPLATES, CF: CF_TEMPLATES }

export default function Financials() {
  const { tenantId } = useTenant()
  const { role } = useUser()
  const isAdmin = hasMinRole(role, 'admin')

  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [detailCache, setDetailCache] = useState<Record<string, any>>({})
  const [scenarios, setScenarios] = useState<any[]>([])

  // Filters
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  // Create modal
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [statementType, setStatementType] = useState('PL')
  const [periodType, setPeriodType] = useState('monthly')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [scenarioVal, setScenarioVal] = useState('actual')
  const [statusVal, setStatusVal] = useState('draft')
  const [lineItems, setLineItems] = useState<LineItem[]>(PL_TEMPLATES.map(l => ({ ...l })))
  const [showNewScenario, setShowNewScenario] = useState(false)
  const [newScenarioName, setNewScenarioName] = useState('')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // Status change
  const [statusChanging, setStatusChanging] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null)
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function showToast(msg: string, type: 'success' | 'danger' = 'success') {
    setToast({ msg, type })
    if (toastRef.current) clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    if (tenantId) { load(); loadScenarios() }
  }, [tenantId])

  async function load() {
    setLoading(true)
    try {
      const res = await api.get('/financial/statements')
      const stmts = res.data?.statements || res.data || []
      setList(stmts)
      // Pre-fetch details for each statement to compute P&L totals
      stmts.forEach((s: any) => loadDetail(s.id))
    } catch { setList([]) }
    setLoading(false)
  }

  async function loadDetail(id: string) {
    if (detailCache[id]) return
    try {
      const r = await api.get(`/financial/statements/${id}`)
      setDetailCache(prev => ({ ...prev, [id]: r.data }))
    } catch {}
  }

  async function loadScenarios() {
    try {
      const res = await api.get('/scenarios')
      setScenarios(res.data?.scenarios || res.data || [])
    } catch {}
  }

  // ── Status change ──
  async function changeStatus(statement: any, newStatus: string) {
    setStatusChanging(statement.id)
    try {
      await api.put(`/financial/statements/${statement.id}/status`, { status: newStatus })
      setList(prev => prev.map(s => s.id === statement.id ? { ...s, status: newStatus } : s))
      showToast(`Statement ${newStatus === 'approved' ? 'approved' : 'locked'} successfully`)
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Failed to update status', 'danger')
    } finally { setStatusChanging(null) }
  }

  // ── Delete ──
  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete statement "${name}"?\nPosted transactions will be reset to Approved status.`)) return
    setDeletingId(id)
    try {
      await api.delete(`/financial/statements/${id}`)
      setList(prev => prev.filter(s => s.id !== id))
      setDetailCache(prev => { const n = { ...prev }; delete n[id]; return n })
      showToast('Statement deleted')
    } catch (e: any) {
      showToast(e?.response?.status === 403 ? 'Admin only: not authorized to delete' : e?.response?.data?.message || 'Delete failed', 'danger')
    } finally { setDeletingId(null) }
  }

  // ── Create ──
  function applyTemplate(type: string) {
    setStatementType(type)
    setLineItems((TEMPLATES[type] || []).map(l => ({ ...l })))
  }

  function updateLine(idx: number, field: keyof LineItem, value: any) {
    setLineItems(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const errors: Record<string, string> = {}
    if (!periodStart || !periodEnd) errors['period'] = 'Period start and end are required'
    else if (new Date(periodStart) >= new Date(periodEnd)) errors['period'] = 'Period start must be before end'
    if (lineItems.length === 0) errors['lines'] = 'At least one line item is required'
    else lineItems.forEach((li, i) => { if (!li.line_code || !li.line_name) errors[`line-${i}`] = 'Code and name required' })
    if (Object.keys(errors).length) { setFormErrors(errors); return }
    setFormErrors({})
    setCreating(true)
    try {
      const payload = { statement_type: statementType, period_type: periodType, period_start: periodStart, period_end: periodEnd, scenario: scenarioVal, status: statusVal, line_items: lineItems }
      await api.post('/financial/statements', payload)
      showToast('Statement created successfully!')
      setShowModal(false)
      setPeriodStart(''); setPeriodEnd(''); setScenarioVal('actual'); setStatusVal('draft')
      setLineItems(PL_TEMPLATES.map(l => ({ ...l })))
      await load()
    } catch (err: any) {
      showToast(err?.response?.data?.message || err?.message || 'Failed to create', 'danger')
    } finally { setCreating(false) }
  }

  // ── Derived ──
  const filtered = list.filter(s => {
    const typeOk = filterType === 'all' || s.statement_type === filterType
    const statusOk = filterStatus === 'all' || s.status === filterStatus
    return typeOk && statusOk
  })

  function getNetIncome(id: string) {
    const d = detailCache[id]
    if (!d?.lineItems) return null
    const rev = d.lineItems.filter((li: any) => Number(li.amount) > 0).reduce((s: number, li: any) => s + Number(li.amount), 0)
    const exp = d.lineItems.filter((li: any) => Number(li.amount) < 0).reduce((s: number, li: any) => s + Math.abs(Number(li.amount)), 0)
    return { rev, exp, net: rev - exp, margin: rev > 0 ? ((rev - exp) / rev) * 100 : 0, count: d.lineItems.length }
  }

  const totalRevenue = list.reduce((sum, s) => {
    const d = detailCache[s.id]
    if (!d?.lineItems) return sum
    return sum + d.lineItems.filter((li: any) => Number(li.amount) > 0).reduce((a: number, li: any) => a + Number(li.amount), 0)
  }, 0)
  const totalExpenses = list.reduce((sum, s) => {
    const d = detailCache[s.id]
    if (!d?.lineItems) return sum
    return sum + d.lineItems.filter((li: any) => Number(li.amount) < 0).reduce((a: number, li: any) => a + Math.abs(Number(li.amount)), 0)
  }, 0)
  const netIncome = totalRevenue - totalExpenses

  // ── Quick period fill ──
  function fillPeriodQ(q: number, year: number) {
    const starts = ['01-01','04-01','07-01','10-01']
    const ends   = ['03-31','06-30','09-30','12-31']
    setPeriodStart(`${year}-${starts[q-1]}`); setPeriodEnd(`${year}-${ends[q-1]}`)
    setPeriodType('quarterly')
  }
  function fillPeriodM(m: number, year: number) {
    const days = [31,28,31,30,31,30,31,31,30,31,30,31]
    const mm = String(m).padStart(2,'0'); const dd = String(days[m-1]).padStart(2,'0')
    setPeriodStart(`${year}-${mm}-01`); setPeriodEnd(`${year}-${mm}-${dd}`)
    setPeriodType('monthly')
  }
  const CY = new Date().getFullYear()

  return (
    <>
      {/* ── Header ── */}
      <div className="d-flex justify-content-between align-items-center mb-3 px-1">
        <div>
          <h2 className="mb-0 fw-bold" style={{ color: '#1a3c5e' }}>
            <i className="bi bi-file-earmark-bar-graph me-2 text-primary"></i>
            Financial Statements
          </h2>
          <small className="text-muted">Manage P&amp;L, Balance Sheet, and Cash Flow — approve, lock, and drill down</small>
        </div>
        <button className="btn btn-primary" onClick={() => {
          setStatementType('PL'); setLineItems(PL_TEMPLATES.map(l=>({...l}))); setShowModal(true)
        }}>
          <i className="bi bi-plus-lg me-2"></i>New Statement
        </button>
      </div>

      {/* ── KPI Strip ── */}
      <div className="row g-3 mb-3">
        {[
          { label:'Total', val: list.length, color:'primary', icon:'file-earmark-bar-graph' },
          { label:'Draft', val: list.filter(s=>s.status==='draft').length, color:'warning', icon:'pencil-fill' },
          { label:'Approved', val: list.filter(s=>s.status==='approved').length, color:'success', icon:'check-circle-fill' },
          { label:'Locked', val: list.filter(s=>s.status==='locked').length, color:'dark', icon:'lock-fill' },
        ].map(k => (
          <div className="col-6 col-md-3" key={k.label}>
            <div className={`card border-${k.color} h-100`} style={{ borderLeft:`4px solid` }}>
              <div className="card-body d-flex align-items-center gap-3 py-3">
                <div className={`text-bg-${k.color} rounded-3 d-flex align-items-center justify-content-center`} style={{ width:46,height:46,fontSize:20 }}>
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

      {/* ── Financial Totals ── */}
      <div className="row g-3 mb-3">
        <div className="col-md-4">
          <div className="card border-0 shadow-sm h-100" style={{ background:'linear-gradient(135deg,#d4edda,#c3e6cb)' }}>
            <div className="card-body py-3">
              <div className="small text-success fw-semibold mb-1"><i className="bi bi-graph-up-arrow me-1"></i>Total Revenue</div>
              <div className="fw-bold fs-5 text-success">{THB.format(totalRevenue)}</div>
              <div className="small text-muted mt-1">across all statements</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm h-100" style={{ background:'linear-gradient(135deg,#f8d7da,#f5c6cb)' }}>
            <div className="card-body py-3">
              <div className="small text-danger fw-semibold mb-1"><i className="bi bi-arrow-down-circle me-1"></i>Total Expenses</div>
              <div className="fw-bold fs-5 text-danger">{THB.format(totalExpenses)}</div>
              <div className="small text-muted mt-1">across all statements</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className={`card border-0 shadow-sm h-100`} style={{ background: netIncome >= 0 ? 'linear-gradient(135deg,#d1ecf1,#bee5eb)' : 'linear-gradient(135deg,#fff3cd,#ffeeba)' }}>
            <div className="card-body py-3">
              <div className={`small fw-semibold mb-1 ${netIncome >= 0 ? 'text-info' : 'text-warning'}`}><i className={`bi bi-${netIncome>=0?'trophy':'exclamation-circle'} me-1`}></i>Net Income</div>
              <div className={`fw-bold fs-5 ${netIncome >= 0 ? 'text-info' : 'text-warning'}`}>{THB.format(netIncome)}</div>
              <div className="small text-muted mt-1">{totalRevenue > 0 ? `${((netIncome/totalRevenue)*100).toFixed(1)}% margin` : 'no revenue'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="card mb-3">
        <div className="card-body py-2">
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <span className="text-muted small me-1"><i className="bi bi-funnel me-1"></i>Filter:</span>
            {['all','PL','BS','CF'].map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                className={`btn btn-sm ${filterType===t?'btn-primary':'btn-outline-secondary'}`}>
                {t==='all'?'All Types':TYPE_META[t]?.label||t}
              </button>
            ))}
            <span className="vr mx-1"></span>
            {['all','draft','approved','locked'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`btn btn-sm ${filterStatus===s?`btn-${s==='all'?'secondary':STATUS_META[s]?.color||'secondary'}`:`btn-outline-${s==='all'?'secondary':STATUS_META[s]?.color||'secondary'}`}`}>
                {s==='all'?'All Status':s.charAt(0).toUpperCase()+s.slice(1)}
              </button>
            ))}
            <span className="ms-auto small text-muted">{filtered.length}/{list.length} shown</span>
          </div>
        </div>
      </div>

      {/* ── Statements Table ── */}
      {loading ? (
        <div className="card"><div className="card-body text-center py-5">
          <div className="spinner-border text-primary"></div>
          <p className="mt-3 text-muted mb-0">Loading financial statements...</p>
        </div></div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="card-body text-center py-5">
          <i className="bi bi-file-earmark-bar-graph display-4 text-muted"></i>
          <p className="mt-3 text-muted">No statements found. {list.length > 0 ? 'Adjust filters or' : ''} create your first statement.</p>
          <button className="btn btn-primary" onClick={() => { setStatementType('PL'); setLineItems(PL_TEMPLATES.map(l=>({...l}))); setShowModal(true) }}>
            <i className="bi bi-plus-lg me-2"></i>Create Statement
          </button>
        </div></div>
      ) : (
        <div className="card shadow-sm">
          <div className="card-header d-flex justify-content-between align-items-center py-2">
            <h5 className="mb-0 fw-semibold"><i className="bi bi-table me-2"></i>All Statements</h5>
            <span className="badge bg-secondary">{filtered.length}</span>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Type</th>
                    <th>Period</th>
                    <th>Scenario</th>
                    <th>Revenue</th>
                    <th>Expenses</th>
                    <th>Net Income</th>
                    <th>Lines</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => {
                    const meta = TYPE_META[s.statement_type] || { label: s.statement_type, color: 'secondary', icon: 'file', desc: '' }
                    const sm = STATUS_META[s.status] || { color: 'secondary', icon: 'circle' }
                    const ni = getNetIncome(s.id)
                    const loading2 = !detailCache[s.id]
                    return (
                      <tr key={s.id}>
                        <td>
                          <span className={`badge text-bg-${meta.color}`}>
                            <i className={`bi bi-${meta.icon} me-1`}></i>{meta.label}
                          </span>
                          <div className="small text-muted">{s.period_type}</div>
                        </td>
                        <td>
                          <div className="fw-semibold small">{fmtDate(s.period_start)}</div>
                          <div className="text-muted small">→ {fmtDate(s.period_end)}</div>
                        </td>
                        <td><span className="badge bg-light text-dark border">{s.scenario}</span></td>
                        <td>
                          {loading2 ? <span className="spinner-border spinner-border-sm text-muted"></span>
                            : ni ? <span className="text-success fw-semibold">{THB.format(ni.rev)}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          {loading2 ? <span className="spinner-border spinner-border-sm text-muted"></span>
                            : ni ? <span className="text-danger">{THB.format(ni.exp)}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          {loading2 ? <span className="spinner-border spinner-border-sm text-muted"></span>
                            : ni ? (
                              <div>
                                <span className={`fw-bold ${ni.net >= 0 ? 'text-success' : 'text-danger'}`}>{THB.format(ni.net)}</span>
                                {ni.rev > 0 && <div className="small text-muted">{ni.margin.toFixed(1)}% margin</div>}
                              </div>
                            ) : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          {loading2 ? <span className="spinner-border spinner-border-sm text-muted"></span>
                            : ni ? <span className="badge bg-light text-dark border">{ni.count}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          <span className={`badge text-bg-${sm.color} d-inline-flex align-items-center gap-1`}>
                            <i className={`bi bi-${sm.icon}`}></i>
                            {s.status}
                          </span>
                        </td>
                        <td>
                          <div className="d-flex gap-1 flex-wrap">
                            <Link to={`/financials/${s.id}`} className="btn btn-sm btn-outline-primary">
                              <i className="bi bi-eye me-1"></i>View
                            </Link>
                            {isAdmin && sm.next && (
                              <button
                                className={`btn btn-sm btn-outline-${STATUS_META[sm.next]?.color || 'success'}`}
                                disabled={statusChanging === s.id}
                                onClick={() => changeStatus(s, sm.next!)}
                                title={`Change status to ${sm.next}`}
                              >
                                {statusChanging === s.id
                                  ? <span className="spinner-border spinner-border-sm"></span>
                                  : <><i className="bi bi-arrow-right-circle me-1"></i>{sm.nextLabel}</>}
                              </button>
                            )}
                            {isAdmin && (
                              <button className="btn btn-sm btn-outline-danger" disabled={deletingId === s.id}
                                onClick={() => handleDelete(s.id, `${meta.label} ${fmtDate(s.period_start)}`)}>
                                {deletingId === s.id
                                  ? <span className="spinner-border spinner-border-sm"></span>
                                  : <i className="bi bi-trash"></i>}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card-footer py-2">
            <small className="text-muted">
              Showing {filtered.length} of {list.length} statements
              {isAdmin && <span className="ms-3 text-info"><i className="bi bi-shield-lock me-1"></i>Admin: Approve & Lock actions available</span>}
            </small>
          </div>
        </div>
      )}

      {/* ── Status Workflow Guide ── */}
      <div className="card mt-3 border-0" style={{ background:'linear-gradient(90deg,#f8f9fa,#e9ecef)' }}>
        <div className="card-body py-3">
          <div className="small fw-semibold text-muted mb-2"><i className="bi bi-info-circle me-1"></i>Status Workflow</div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {['draft','approved','locked'].map((st, i) => {
              const sm = STATUS_META[st]
              return (
                <React.Fragment key={st}>
                  <span className={`badge text-bg-${sm.color} d-inline-flex align-items-center gap-1`} style={{ fontSize:'0.85rem',padding:'0.4em 0.8em' }}>
                    <i className={`bi bi-${sm.icon}`}></i>{st.charAt(0).toUpperCase()+st.slice(1)}
                  </span>
                  {i < 2 && <i className="bi bi-arrow-right text-muted"></i>}
                </React.Fragment>
              )
            })}
            <span className="text-muted small ms-2">— Admin only. Locked statements cannot be changed.</span>
          </div>
        </div>
      </div>

      {/* ── Create Modal ── */}
      {showModal && ReactDOM.createPortal(
        <div style={{ background:'rgba(0,0,0,0.55)', zIndex: 9999, position:'fixed', top:0, left:0, width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem', opacity:1 }} onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{ width:'100%', maxWidth:1100, maxHeight:'92vh', display:'flex', flexDirection:'column', borderRadius:12, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.35)', background:'#fff' }}>
              <div style={{ background:'linear-gradient(135deg,#1a6fc7,#0d47a1)', padding:'1rem 1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                <div className="d-flex align-items-center gap-2">
                  <div style={{ background:'rgba(255,255,255,0.2)', borderRadius:8, width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
                    <i className="bi bi-file-earmark-bar-graph text-white"></i>
                  </div>
                  <div>
                    <div className="fw-bold text-white" style={{ fontSize:'1rem', lineHeight:1.2 }}>Create New Financial Statement</div>
                    <div style={{ color:'rgba(255,255,255,0.75)', fontSize:'0.78rem' }}>Fill in the details below to add a new statement</div>
                  </div>
                </div>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowModal(false)}></button>
              </div>
              <form onSubmit={handleCreate} style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
                <div className="modal-body" style={{ overflowY:'auto', flex:1, padding:'1.5rem' }}>

                  {/* Type + Template */}
                  <div className="mb-4">
                    <div className="small fw-semibold text-uppercase text-muted mb-2" style={{ letterSpacing:'0.07em' }}>
                      <i className="bi bi-1-circle me-1 text-primary"></i>Statement Type
                    </div>
                    <div className="row g-2">
                      {(['PL','BS','CF'] as const).map(t => {
                        const tm = TYPE_META[t]
                        return (
                          <div className="col-md-4" key={t}>
                            <div
                              className={`card h-100 ${statementType===t?`border-${tm.color}`:'border-light'}`}
                              style={{ cursor:'pointer', transition:'all 0.15s', transform: statementType===t ? 'translateY(-2px)' : 'none', boxShadow: statementType===t ? '0 4px 14px rgba(0,0,0,0.12)' : '0 1px 4px rgba(0,0,0,0.06)', borderWidth:2 }}
                              onClick={() => applyTemplate(t)}
                            >
                              <div className="card-body py-3 text-center">
                                <div className={`text-${tm.color} fs-4 mb-1`}><i className={`bi bi-${tm.icon}`}></i></div>
                                <div className="fw-bold">{tm.label}</div>
                                <small className="text-muted">{tm.desc}</small>
                                {statementType===t && <div className={`badge text-bg-${tm.color} mt-2`}>Selected</div>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Period */}
                  <div className="mb-3">
                    <div className="small fw-semibold text-uppercase text-muted mb-2" style={{ letterSpacing:'0.07em' }}>
                      <i className="bi bi-2-circle me-1 text-primary"></i>Period
                    </div>
                    <div className="row g-2 mb-2">
                      <div className="col-md-4">
                        <select className="form-select" value={periodType} onChange={e=>setPeriodType(e.target.value)}>
                          <option value="monthly">Monthly</option>
                          <option value="quarterly">Quarterly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                      </div>
                      <div className="col-md-4">
                        <input type="date" className={`form-control ${formErrors['period']?'is-invalid':''}`} value={periodStart} onChange={e=>setPeriodStart(e.target.value)} placeholder="Start date" />
                      </div>
                      <div className="col-md-4">
                        <input type="date" className={`form-control ${formErrors['period']?'is-invalid':''}`} value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)} placeholder="End date" />
                      </div>
                    </div>
                    {formErrors['period'] && <div className="text-danger small"><i className="bi bi-exclamation-circle me-1"></i>{formErrors['period']}</div>}
                    <div className="d-flex flex-wrap gap-1 mt-1">
                      <span className="small text-muted me-1">Quick fill:</span>
                      {[1,2,3,4].map(q => (
                        <button key={q} type="button" className="btn btn-xs btn-outline-secondary btn-sm py-0" onClick={() => fillPeriodQ(q, CY)}>Q{q}/{CY}</button>
                      ))}
                      {[1,2,3,4,5,6].map(m => (
                        <button key={m} type="button" className="btn btn-xs btn-outline-secondary btn-sm py-0" onClick={() => fillPeriodM(m, CY)}>
                          {new Date(CY,m-1,1).toLocaleString('en',{month:'short'})}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Scenario + Status */}
                  <div className="row g-3 mb-3">
                    <div className="col-md-6">
                      <div className="small fw-semibold text-uppercase text-muted mb-2" style={{ letterSpacing:'0.07em' }}>
                        <i className="bi bi-3-circle me-1 text-primary"></i>Scenario
                      </div>
                      <div className="input-group">
                        <select className="form-select" value={scenarioVal} onChange={e=>setScenarioVal(e.target.value)}>
                          <option value="actual">Actual</option>
                          <option value="budget">Budget</option>
                          <option value="forecast">Forecast</option>
                          {scenarios.map(sc => {
                            const name = sc.scenario_name || sc.name || sc.id
                            return <option key={sc.id} value={name}>{name}</option>
                          })}
                        </select>
                        <button type="button" className="btn btn-outline-secondary" onClick={() => setShowNewScenario(v=>!v)} title="Create new scenario">
                          <i className="bi bi-plus-lg"></i>
                        </button>
                      </div>
                      {showNewScenario && (
                        <div className="input-group mt-2">
                          <input className="form-control form-control-sm" placeholder="New scenario name" value={newScenarioName} onChange={e=>setNewScenarioName(e.target.value)} />
                          <button type="button" className="btn btn-sm btn-primary" onClick={async () => {
                            if (!newScenarioName) return
                            try {
                              await api.post('/scenarios', { name: newScenarioName, description: 'Created from Financials', baseline_period: `${CY}-01`, projection_months: 12, assumptions: [] })
                              await loadScenarios()
                              setScenarioVal(newScenarioName)
                              setNewScenarioName(''); setShowNewScenario(false)
                              showToast('Scenario created')
                            } catch (err: any) { showToast(err?.response?.data?.message || 'Failed', 'danger') }
                          }}>Create</button>
                        </div>
                      )}
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold small text-uppercase text-muted" style={{ letterSpacing:'0.07em' }}>Initial Status</label>
                      <select className="form-select" value={statusVal} onChange={e=>setStatusVal(e.target.value)}>
                        <option value="draft">Draft</option>
                        <option value="approved">Approved</option>
                      </select>
                    </div>
                  </div>

                  {/* Line Items */}
                  <div style={{ background:'#f8f9fa', borderRadius:8, padding:'1rem', border:'1px solid #e9ecef' }}>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div className="small fw-semibold text-uppercase text-muted" style={{ letterSpacing:'0.07em' }}>
                        <i className="bi bi-4-circle me-1 text-primary"></i>Line Items
                        <span className="badge bg-primary ms-2">{lineItems.length}</span>
                      </div>
                      <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setLineItems(prev => [...prev, { line_code:'', line_name:'', line_order: prev.length+1, amount:0, currency:'THB' }])}>
                        <i className="bi bi-plus-lg me-1"></i>Add Line
                      </button>
                    </div>
                    {formErrors['lines'] && <div className="alert alert-danger py-2 small">{formErrors['lines']}</div>}
                    <div className="table-responsive" style={{ maxHeight: 320 }}>
                      <table className="table table-sm table-bordered table-hover mb-0">
                        <thead className="table-light sticky-top">
                          <tr>
                            <th style={{width:90}}>Code</th>
                            <th>Name</th>
                            <th style={{width:140}}>Amount (THB)</th>
                            <th style={{width:50}}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {lineItems.map((li, i) => (
                            <tr key={i} className={formErrors[`line-${i}`] ? 'table-danger' : ''}>
                              <td>
                                <input value={li.line_code} onChange={e=>updateLine(i,'line_code',e.target.value)}
                                  className="form-control form-control-sm" placeholder="4000" />
                              </td>
                              <td>
                                <input value={li.line_name} onChange={e=>updateLine(i,'line_name',e.target.value)}
                                  className="form-control form-control-sm" placeholder="Revenue / Expense name" />
                              </td>
                              <td>
                                <input type="number" value={li.amount} onChange={e=>updateLine(i,'amount',Number(e.target.value))}
                                  className={`form-control form-control-sm text-end ${li.amount >= 0 ? 'text-success' : 'text-danger'}`}
                                  step="100" />
                              </td>
                              <td className="text-center">
                                <button type="button" className="btn btn-sm btn-outline-danger py-0 px-1"
                                  onClick={() => setLineItems(prev => prev.filter((_,j)=>j!==i))}>
                                  <i className="bi bi-x-lg"></i>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="table-light">
                          <tr>
                            <td colSpan={2} className="text-end fw-semibold small">
                              Revenue: <span className="text-success">{THB.format(lineItems.filter(l=>l.amount>0).reduce((a,l)=>a+Number(l.amount),0))}</span>
                              &nbsp;|&nbsp;
                              Expenses: <span className="text-danger">{THB.format(Math.abs(lineItems.filter(l=>l.amount<0).reduce((a,l)=>a+Number(l.amount),0)))}</span>
                            </td>
                            <td className="text-end fw-bold">
                              {(() => { const n = lineItems.reduce((a,l)=>a+Number(l.amount),0); return <span className={n>=0?'text-success':'text-danger'}>{THB.format(n)}</span> })()}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <div className="mt-2 small text-muted"><i className="bi bi-info-circle me-1"></i>Positive = Revenue, Negative = Expense</div>
                  </div>
                </div>
                <div className="modal-footer" style={{ borderTop:'1px solid #e9ecef', background:'#f8f9fa', padding:'0.875rem 1.5rem' }}>
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setShowModal(false)}>
                    <i className="bi bi-x-lg me-1"></i>Cancel
                  </button>
                  <button type="submit" className="btn btn-primary px-4" disabled={creating}>
                    {creating ? <><span className="spinner-border spinner-border-sm me-2"></span>Creating...</> : <><i className="bi bi-check-circle me-2"></i>Create Statement</>}
                  </button>
                </div>
              </form>
          </div>
        </div>
      , document.body)}

      {/* ── Toast ── */}
      {toast && (
        <div className="position-fixed top-0 end-0 p-3" style={{ zIndex: 9999 }}>
          <div className={`toast show align-items-center text-bg-${toast.type} border-0`} role="alert">
            <div className="d-flex">
              <div className="toast-body d-flex align-items-center gap-2">
                <i className={`bi bi-${toast.type==='success'?'check-circle':'x-circle'}-fill fs-5`}></i>
                {toast.msg}
              </div>
              <button type="button" className="btn-close btn-close-white me-2 m-auto" onClick={()=>setToast(null)}></button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

