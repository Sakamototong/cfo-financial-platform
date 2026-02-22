import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import api from '../api/client'
import { useTenant } from '../components/TenantContext'
import { useUser } from '../components/UserContext'
import { hasMinRole } from '../components/RequireRole'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const THB = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0 })
const PCT = (v: number) => isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—'
function fmtDateShort(v: any) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('th-TH', { year: 'numeric', month: 'short' })
}

type Category = 'revenue' | 'cogs' | 'gross' | 'opex' | 'ebit' | 'finance' | 'tax' | 'net' | 'asset' | 'liability' | 'equity' | 'cashflow' | 'other'

function classify(li: any): Category {
  const code = (li.line_code || '').toUpperCase()
  const name = (li.line_name || '').toLowerCase()
  if (code.startsWith('REV') || name.includes('revenue') || name.includes('sales') || name.includes('รายรับ')) return 'revenue'
  if (code.startsWith('COGS') || code.startsWith('COS') || name.includes('cost of') || name.includes('ต้นทุนขาย')) return 'cogs'
  if (code.startsWith('GROSS') || name.includes('gross profit')) return 'gross'
  if (code.startsWith('OPEX') || code.startsWith('SGA') || name.includes('operating expense') || name.includes('ค่าใช้จ่าย')) return 'opex'
  if (code.startsWith('EBIT') || code.startsWith('OPER') || name.includes('operating income') || name.includes('ebit')) return 'ebit'
  if (code.startsWith('FIN') || code.startsWith('INT') || name.includes('interest') || name.includes('financial')) return 'finance'
  if (code.startsWith('TAX') || code.startsWith('INC_TAX') || name.includes('tax')) return 'tax'
  if (code.startsWith('NET') || code.startsWith('NI') || name.includes('net income') || name.includes('net profit') || name.includes('กำไรสุทธิ')) return 'net'
  if (code.startsWith('ASSET') || code.startsWith('CA_') || code.startsWith('NCA_') || name.includes('asset') || name.includes('สินทรัพย์')) return 'asset'
  if (code.startsWith('LIAB') || code.startsWith('CL_') || name.includes('liabilit') || name.includes('หนี้สิน')) return 'liability'
  if (code.startsWith('EQ') || name.includes('equity') || name.includes('ส่วนของผู้ถือหุ้น')) return 'equity'
  if (code.startsWith('CF_') || name.includes('cash flow')) return 'cashflow'
  return 'other'
}

const CATEGORY_META: Record<Category, { label: string; color: string; bgColor: string; icon: string; order: number }> = {
  revenue:   { label: 'Revenue',           color: '#2e7d32', bgColor: 'rgba(46,125,50,0.12)',   icon: 'graph-up-arrow',  order: 1 },
  cogs:      { label: 'Cost of Sales',      color: '#c62828', bgColor: 'rgba(198,40,40,0.10)',   icon: 'box-seam',        order: 2 },
  gross:     { label: 'Gross Profit',       color: '#1565c0', bgColor: 'rgba(21,101,192,0.10)',  icon: 'calculator',      order: 3 },
  opex:      { label: 'Operating Expenses', color: '#e65100', bgColor: 'rgba(230,81,0,0.10)',    icon: 'cash-stack',      order: 4 },
  ebit:      { label: 'EBIT',               color: '#6a1b9a', bgColor: 'rgba(106,27,154,0.10)', icon: 'bar-chart-line',  order: 5 },
  finance:   { label: 'Finance Items',      color: '#0277bd', bgColor: 'rgba(2,119,189,0.10)',   icon: 'bank',            order: 6 },
  tax:       { label: 'Tax',                color: '#558b2f', bgColor: 'rgba(85,139,47,0.10)',   icon: 'receipt',         order: 7 },
  net:       { label: 'Net Income',         color: '#00695c', bgColor: 'rgba(0,105,92,0.12)',    icon: 'trophy',          order: 8 },
  asset:     { label: 'Assets',             color: '#1976d2', bgColor: 'rgba(25,118,210,0.10)', icon: 'building',        order: 9 },
  liability: { label: 'Liabilities',        color: '#d32f2f', bgColor: 'rgba(211,47,47,0.10)',  icon: 'credit-card',     order: 10 },
  equity:    { label: 'Equity',             color: '#00897b', bgColor: 'rgba(0,137,123,0.10)',  icon: 'people',          order: 11 },
  cashflow:  { label: 'Cash Flow',          color: '#5e35b1', bgColor: 'rgba(94,53,177,0.10)',  icon: 'cash-coin',       order: 12 },
  other:     { label: 'Other',              color: '#757575', bgColor: 'rgba(117,117,117,0.10)', icon: 'three-dots',     order: 13 },
}

interface HistoryEntry {
  id: string
  timestamp: string
  statementCount: number
  statementIds: string[]
  statementNames: string[]
  result: any
}

export default function Consolidation() {
  const { tenantId } = useTenant()
  const { role } = useUser()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _isAdmin = hasMinRole(role, 'admin')

  const [statements, setStatements] = useState<any[]>([])
  const [loadingStmts, setLoadingStmts] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [filterType, setFilterType] = useState<string>('ALL')
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [searchQ, setSearchQ] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'summary' | 'pl_structure' | 'per_stmt' | 'chart'>('summary')

  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [compareEntry, setCompareEntry] = useState<HistoryEntry | null>(null)

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null)
  const toastTimer = useRef<any>(null)
  function showToast(msg: string, type: 'success' | 'danger' = 'success') {
    setToast({ msg, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    try {
      const h = JSON.parse(sessionStorage.getItem('consolidation_history') || '[]')
      setHistory(h)
    } catch { }
  }, [])

  function saveHistory(entry: HistoryEntry) {
    setHistory(prev => {
      const updated = [entry, ...prev].slice(0, 10)
      try { sessionStorage.setItem('consolidation_history', JSON.stringify(updated)) } catch { }
      return updated
    })
  }

  useEffect(() => { if (tenantId) loadStatements() }, [tenantId])

  async function loadStatements() {
    setLoadingStmts(true)
    try {
      const r = await api.get('/financial/statements')
      const data = r.data?.statements || r.data || []
      setStatements(Array.isArray(data) ? data : [])
    } catch { }
    setLoadingStmts(false)
  }

  async function runConsolidation(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setLoading(true); setResult(null)
    const ids = selectedIds.filter(Boolean)
    if (ids.length === 0) { setError('Select at least one statement'); setLoading(false); return }
    try {
      const res = await api.post('/consolidation/consolidate', { statement_ids: ids })
      setResult(res.data)
      setActiveTab('summary')
      const entry: HistoryEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        statementCount: ids.length,
        statementIds: ids,
        statementNames: ids.map(id => {
          const s = statements.find(x => String(x.id) === id)
          return s ? `${s.statement_type} ${fmtDateShort(s.period_start)}` : id.slice(0, 8)
        }),
        result: res.data,
      }
      saveHistory(entry)
      showToast(`Consolidated ${ids.length} statement${ids.length > 1 ? 's' : ''} successfully`)
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Consolidation failed'
      setError(msg); showToast(msg, 'danger')
    } finally { setLoading(false) }
  }

  function handleCsvExport(src: any = result) {
    const items: any[] = src?.consolidated?.line_items || []
    if (!items.length) return
    const rows = items.map((li: any) => ({
      category: CATEGORY_META[classify(li)].label,
      line_code: li.line_code || '',
      line_name: li.line_name || '',
      parent_code: li.parent_code || '',
      amount: Number(li.amount || 0),
      currency: li.currency || 'THB',
    }))
    const header = ['category', 'line_code', 'line_name', 'parent_code', 'amount', 'currency']
    const csv = [header.join(','), ...rows.map((r: any) =>
      `"${r.category}","${r.line_code}","${(r.line_name).replace(/"/g, '""')}","${r.parent_code}",${r.amount},"${r.currency}"`
    )].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `consolidated_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
    showToast('CSV downloaded')
  }

  const stmtTypes = Array.from(new Set(statements.map(s => s.statement_type).filter(Boolean)))
  const stmtStatuses = Array.from(new Set(statements.map(s => s.status).filter(Boolean)))
  const filteredStmts = statements.filter(s => {
    if (filterType !== 'ALL' && s.statement_type !== filterType) return false
    if (filterStatus !== 'ALL' && s.status !== filterStatus) return false
    if (searchQ) {
      const q = searchQ.toLowerCase()
      if (!((s.statement_type || '').toLowerCase().includes(q) || (s.scenario || '').toLowerCase().includes(q) || (s.period_start || '').includes(q))) return false
    }
    return true
  })

  const lineItems: any[] = result?.consolidated?.line_items || []
  const stmtSources: any[] = result?.statements || []

  const grouped: Partial<Record<Category, any[]>> = {}
  for (const li of lineItems) {
    const cat = classify(li)
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat]!.push(li)
  }
  const sortedCategories = (Object.keys(grouped) as Category[]).sort((a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order)

  const revenueTotal = (grouped['revenue'] || []).reduce((s, li) => s + Number(li.amount || 0), 0)
  const cogsTotal = Math.abs((grouped['cogs'] || []).reduce((s, li) => s + Number(li.amount || 0), 0))
  const grossProfit = (grouped['gross'] || []).reduce((s, li) => s + Number(li.amount || 0), 0) || (revenueTotal - cogsTotal)
  const opexTotal = Math.abs((grouped['opex'] || []).reduce((s, li) => s + Number(li.amount || 0), 0))
  const ebit = (grouped['ebit'] || []).reduce((s, li) => s + Number(li.amount || 0), 0) || (grossProfit - opexTotal)
  const netIncome = (grouped['net'] || []).reduce((s, li) => s + Number(li.amount || 0), 0)
  const totalAssets = (grouped['asset'] || []).reduce((s, li) => s + Number(li.amount || 0), 0)
  const totalLiab = (grouped['liability'] || []).reduce((s, li) => s + Number(li.amount || 0), 0)

  function buildBarChart() {
    const cats = sortedCategories.filter(c => c !== 'other')
    const totals = cats.map(c => (grouped[c] || []).reduce((s, li) => s + Number(li.amount || 0), 0))
    return {
      data: {
        labels: cats.map(c => CATEGORY_META[c].label),
        datasets: [{
          label: 'Consolidated Amount (THB)',
          data: totals,
          backgroundColor: cats.map(c => CATEGORY_META[c].bgColor.replace('0.12', '0.7').replace('0.10', '0.7')),
          borderColor: cats.map(c => CATEGORY_META[c].color),
          borderWidth: 1.5,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: any) => THB.format(ctx.parsed.y) } },
        },
        scales: { y: { ticks: { callback: (v: any) => THB.format(v) } } },
      },
    }
  }

  function buildDoughnut() {
    const top = [...lineItems]
      .sort((a, b) => Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0)))
      .slice(0, 8)
    return {
      data: {
        labels: top.map(li => li.line_name || li.line_code),
        datasets: [{
          data: top.map(li => Math.abs(Number(li.amount || 0))),
          backgroundColor: ['#1565c0','#2e7d32','#c62828','#e65100','#6a1b9a','#0277bd','#558b2f','#9e9e9e'],
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right' as const, labels: { font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.label}: ${THB.format(ctx.parsed)}` } },
        },
      },
    }
  }

  const statusBadge = (s: string) => ({ draft: 'secondary', approved: 'success', locked: 'danger', pending: 'warning' }[s] || 'light')

  return (
    <>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3 px-1">
        <div>
          <h2 className="mb-0 fw-bold" style={{ color: '#1a3c5e' }}>
            <i className="bi bi-layers-half me-2 text-primary"></i>Financial Consolidation
          </h2>
          <small className="text-muted">Aggregate multiple financial statements — P&amp;L, Balance Sheet, or Cash Flow</small>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary btn-sm" onClick={() => setHistoryOpen(v => !v)}>
            <i className="bi bi-clock-history me-1"></i>History <span className="badge bg-secondary ms-1">{history.length}</span>
          </button>
          <button className="btn btn-outline-primary btn-sm" onClick={loadStatements} disabled={loadingStmts}>
            <i className={`bi bi-arrow-repeat me-1${loadingStmts ? ' spin' : ''}`}></i>Refresh
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="row g-3 mb-3">
        {[
          { label: 'Available Statements', val: statements.length,  icon: 'file-earmark-bar-graph', color: 'primary'   },
          { label: 'Selected',             val: selectedIds.length,  icon: 'check2-square',          color: selectedIds.length > 0 ? 'success' : 'secondary' },
          { label: 'Statement Types',      val: stmtTypes.length,    icon: 'diagram-3',              color: 'info'      },
          { label: 'Past Consolidations',  val: history.length,      icon: 'clock-history',          color: 'warning'   },
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

      {/* History panel */}
      {historyOpen && (
        <div className="card shadow-sm mb-3 border-warning">
          <div className="card-header d-flex justify-content-between align-items-center py-2" style={{ background: 'linear-gradient(135deg,#f57f17,#f9a825)', color: '#fff' }}>
            <span className="fw-bold"><i className="bi bi-clock-history me-2"></i>Consolidation History (session)</span>
            <button className="btn btn-sm btn-outline-light" onClick={() => setHistoryOpen(false)}><i className="bi bi-x-lg"></i></button>
          </div>
          {history.length === 0 ? (
            <div className="card-body text-center text-muted py-4">No history yet in this session</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-hover mb-0">
                <thead className="table-light">
                  <tr><th>Time</th><th>Statements</th><th>Line Items</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id}>
                      <td><small>{new Date(h.timestamp).toLocaleString('th-TH')}</small></td>
                      <td><div className="d-flex flex-wrap gap-1">{h.statementNames.map((n, i) => <span key={i} className="badge bg-light text-dark border">{n}</span>)}</div></td>
                      <td><span className="badge bg-primary">{h.result?.consolidated?.line_items?.length ?? 0}</span></td>
                      <td>
                        <div className="d-flex gap-1">
                          <button className="btn btn-sm btn-outline-primary py-0 px-2" style={{ fontSize: '0.75rem' }}
                            onClick={() => { setResult(h.result); setActiveTab('summary'); showToast('Loaded from history') }}>
                            <i className="bi bi-eye me-1"></i>Load
                          </button>
                          <button className="btn btn-sm btn-outline-info py-0 px-2" style={{ fontSize: '0.75rem' }}
                            onClick={() => setCompareEntry(compareEntry?.id === h.id ? null : h)}>
                            <i className={`bi bi-${compareEntry?.id === h.id ? 'x' : 'intersect'} me-1`}></i>
                            {compareEntry?.id === h.id ? 'Unpin' : 'Compare'}
                          </button>
                          <button className="btn btn-sm btn-outline-secondary py-0 px-2" style={{ fontSize: '0.75rem' }}
                            onClick={() => handleCsvExport(h.result)}>
                            <i className="bi bi-download"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="row g-3">
        {/* Left: Statement Selection */}
        <div className="col-lg-4">
          <form onSubmit={runConsolidation}>
            <div className="card shadow-sm h-100">
              <div className="card-header" style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', color: '#fff' }}>
                <div className="d-flex align-items-center gap-2">
                  <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="bi bi-check2-square text-white"></i>
                  </div>
                  <div>
                    <div className="fw-bold">Select Statements</div>
                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)' }}>Choose statements to consolidate</div>
                  </div>
                </div>
              </div>
              <div className="card-body pb-2">
                <div className="mb-2">
                  <input type="search" className="form-control form-control-sm mb-2"
                    placeholder="🔍 Search statements…" value={searchQ}
                    onChange={e => setSearchQ(e.target.value)} />
                  <div className="d-flex gap-1 flex-wrap mb-1">
                    {['ALL', ...stmtTypes].map(t => (
                      <button key={t} type="button"
                        className={`btn btn-sm py-0 ${filterType === t ? 'btn-primary' : 'btn-outline-secondary'}`}
                        style={{ fontSize: '0.7rem' }} onClick={() => setFilterType(t)}>{t}</button>
                    ))}
                  </div>
                  <div className="d-flex gap-1 flex-wrap">
                    {['ALL', ...stmtStatuses].map(s => (
                      <button key={s} type="button"
                        className={`btn btn-sm py-0 ${filterStatus === s ? 'btn-secondary' : 'btn-outline-secondary'}`}
                        style={{ fontSize: '0.7rem' }} onClick={() => setFilterStatus(s)}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="border rounded" style={{ maxHeight: 340, overflowY: 'auto' }}>
                  {loadingStmts && <div className="text-center py-4 text-muted"><span className="spinner-border spinner-border-sm me-2"></span>Loading…</div>}
                  {!loadingStmts && filteredStmts.length === 0 && (
                    <div className="text-center py-4 text-muted">
                      <i className="bi bi-inbox d-block mb-1" style={{ fontSize: 32 }}></i>No statements match
                    </div>
                  )}
                  {filteredStmts.map(s => {
                    const checked = selectedIds.includes(String(s.id))
                    return (
                      <label key={s.id} className={`d-flex align-items-start gap-2 p-2 border-bottom ${checked ? 'bg-primary bg-opacity-10' : ''}`}
                        style={{ cursor: 'pointer' }}>
                        <input type="checkbox" className="form-check-input mt-1 flex-shrink-0"
                          checked={checked}
                          onChange={e => {
                            const id = String(s.id)
                            setSelectedIds(prev => e.target.checked ? [...prev, id] : prev.filter(x => x !== id))
                          }}
                        />
                        <div className="flex-grow-1 small">
                          <div className="d-flex align-items-center gap-1 flex-wrap">
                            <span className="badge bg-info">{s.statement_type}</span>
                            <span className={`badge bg-${statusBadge(s.status)}`}>{s.status}</span>
                          </div>
                          <div className="fw-semibold mt-1">{fmtDateShort(s.period_start)}{s.period_end ? ` → ${fmtDateShort(s.period_end)}` : ''}</div>
                          <div className="text-muted" style={{ fontSize: '0.68rem' }}>{s.scenario || s.period_type} · <code style={{ fontSize: '0.65rem' }}>{(s.id || '').slice(0, 8)}</code></div>
                        </div>
                      </label>
                    )
                  })}
                </div>
                <div className="d-flex gap-2 mt-2">
                  <button type="button" className="btn btn-outline-secondary btn-sm flex-fill"
                    onClick={() => setSelectedIds(filteredStmts.map(s => String(s.id)))}>
                    <i className="bi bi-check-all me-1"></i>All ({filteredStmts.length})
                  </button>
                  <button type="button" className="btn btn-outline-secondary btn-sm flex-fill"
                    onClick={() => setSelectedIds([])}>
                    <i className="bi bi-x-circle me-1"></i>Clear
                  </button>
                </div>
              </div>
              {error && (
                <div className="mx-3 mb-2">
                  <div className="alert alert-danger d-flex align-items-center gap-2 py-2 mb-0">
                    <i className="bi bi-exclamation-circle-fill flex-shrink-0"></i>
                    <span className="small">{error}</span>
                    <button type="button" className="btn-close ms-auto" onClick={() => setError(null)}></button>
                  </div>
                </div>
              )}
              <div className="card-footer" style={{ background: '#f8f9fa' }}>
                {selectedIds.length > 0 && (
                  <div className="mb-2 d-flex flex-wrap gap-1">
                    {selectedIds.map(id => {
                      const s = statements.find(x => String(x.id) === id)
                      return (
                        <span key={id} className="badge bg-primary d-flex align-items-center gap-1">
                          {s ? `${s.statement_type} ${fmtDateShort(s.period_start)}` : id.slice(0, 8)}
                          <button type="button" className="btn-close btn-close-white ms-1 p-0" style={{ fontSize: '0.55rem' }}
                            onClick={() => setSelectedIds(prev => prev.filter(x => x !== id))}></button>
                        </span>
                      )
                    })}
                  </div>
                )}
                <button type="submit" className="btn btn-primary w-100" disabled={loading || selectedIds.length === 0}>
                  {loading
                    ? <><span className="spinner-border spinner-border-sm me-2"></span>Consolidating…</>
                    : <><i className="bi bi-layers-fill me-2"></i>Consolidate {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}</>}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Right: Results */}
        <div className="col-lg-8">
          {!result ? (
            <div className="card shadow-sm h-100">
              <div className="card-body d-flex flex-column align-items-center justify-content-center py-5 text-center">
                <i className="bi bi-layers text-muted opacity-25" style={{ fontSize: 64 }}></i>
                <h5 className="mt-3 text-muted fw-normal">No consolidation results yet</h5>
                <p className="text-muted small">Select statements on the left and click <strong>Consolidate</strong></p>
                {history.length > 0 && (
                  <button className="btn btn-outline-secondary btn-sm mt-2" onClick={() => setHistoryOpen(true)}>
                    <i className="bi bi-clock-history me-1"></i>Load from history
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="card shadow-sm border-success">
              <div className="card-header d-flex align-items-center justify-content-between" style={{ background: 'linear-gradient(135deg,#1b5e20,#2e7d32)', color: '#fff' }}>
                <div className="d-flex align-items-center gap-2">
                  <i className="bi bi-check-circle-fill fs-5"></i>
                  <div>
                    <div className="fw-bold">Consolidated Results</div>
                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)' }}>
                      {lineItems.length} line items · {stmtSources.length} source statements
                    </div>
                  </div>
                </div>
                <div className="d-flex gap-2">
                  <button className="btn btn-sm btn-outline-light" onClick={() => handleCsvExport()}>
                    <i className="bi bi-download me-1"></i>CSV
                  </button>
                  <button className="btn btn-sm btn-outline-light" onClick={() => setResult(null)}>
                    <i className="bi bi-x-lg"></i>
                  </button>
                </div>
              </div>

              {/* KPI summary */}
              <div className="card-body border-bottom pb-3">
                <div className="row g-2">
                  {[
                    { label: 'Revenue',        val: revenueTotal, color: 'success', icon: 'graph-up-arrow', pct: null },
                    { label: 'Gross Profit',   val: grossProfit,  color: 'primary', icon: 'calculator',     pct: revenueTotal ? grossProfit / revenueTotal : null },
                    { label: 'EBIT',           val: ebit,         color: 'info',    icon: 'bar-chart-line', pct: revenueTotal ? ebit / revenueTotal : null },
                    { label: 'Net Income',     val: netIncome,    color: netIncome >= 0 ? 'success' : 'danger', icon: 'trophy', pct: revenueTotal ? netIncome / revenueTotal : null },
                    ...(totalAssets > 0  ? [{ label: 'Total Assets',       val: totalAssets, color: 'primary', icon: 'building',     pct: null }] : []),
                    ...(totalLiab  > 0  ? [{ label: 'Total Liabilities',   val: totalLiab,   color: 'danger',  icon: 'credit-card',  pct: null }] : []),
                  ].map(k => (
                    <div className="col-6 col-md-4" key={k.label}>
                      <div className={`card border-${k.color} text-center h-100`} style={{ borderTop: '3px solid' }}>
                        <div className="card-body py-2 px-2">
                          <div className={`text-${k.color} mb-1`}><i className={`bi bi-${k.icon}`}></i></div>
                          <div className={`fw-bold small text-${k.color}`}>{THB.format(k.val)}</div>
                          {k.pct != null && <div style={{ fontSize: '0.7rem' }} className="text-muted">{PCT(k.pct)} margin</div>}
                          <div className="text-muted" style={{ fontSize: '0.68rem' }}>{k.label}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Source statements */}
              {stmtSources.length > 0 && (
                <div className="card-body border-bottom py-2">
                  <div className="small text-muted fw-semibold mb-1">Source Statements</div>
                  <div className="d-flex flex-wrap gap-2">
                    {stmtSources.map((s: any) => (
                      <div key={s.id} className="d-flex align-items-center gap-1 px-2 py-1 rounded border bg-light small">
                        <span className="badge bg-info">{s.statement_type}</span>
                        <span>{fmtDateShort(s.period_start)}</span>
                        <span className={`badge bg-${statusBadge(s.status)}`}>{s.status}</span>
                        <span className="text-muted" style={{ fontSize: '0.65rem' }}>{(s.lineItems || s.line_items || []).length} items</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Compare banner */}
              {compareEntry && (
                <div className="card-body border-bottom py-2 bg-info bg-opacity-10">
                  <div className="d-flex justify-content-between align-items-center">
                    <small>
                      <i className="bi bi-intersect me-1 text-info"></i>
                      <strong>Comparing with:</strong> {new Date(compareEntry.timestamp).toLocaleString('th-TH')} — {compareEntry.statementNames.join(', ')}
                    </small>
                    <button className="btn btn-sm btn-outline-secondary py-0" onClick={() => setCompareEntry(null)}><i className="bi bi-x"></i></button>
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="card-body">
                <ul className="nav nav-tabs mb-3">
                  {[
                    { id: 'summary' as const,      label: 'Summary',       icon: 'card-list'     },
                    { id: 'chart' as const,         label: 'Charts',        icon: 'bar-chart'     },
                    { id: 'pl_structure' as const,  label: 'P&L Structure', icon: 'list-nested'   },
                    { id: 'per_stmt' as const,      label: 'By Statement',  icon: 'table'         },
                  ].map(t => (
                    <li className="nav-item" key={t.id}>
                      <button className={`nav-link ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
                        <i className={`bi bi-${t.icon} me-1`}></i>{t.label}
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Summary tab */}
                {activeTab === 'summary' && (
                  <div className="table-responsive" style={{ maxHeight: 420 }}>
                    <table className="table table-sm table-hover table-bordered mb-0">
                      <thead className="table-dark sticky-top">
                        <tr>
                          <th>Category</th><th>Code</th><th>Line Item</th>
                          <th className="text-end">Amount (THB)</th><th>Currency</th>
                          {compareEntry && <th className="text-end text-info">vs. Compare</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedCategories.map(cat => {
                          const items = grouped[cat] || []
                          const meta = CATEGORY_META[cat]
                          const catTotal = items.reduce((s, li) => s + Number(li.amount || 0), 0)
                          return (
                            <React.Fragment key={cat}>
                              <tr style={{ background: meta.bgColor }}>
                                <td colSpan={compareEntry ? 5 : 4} className="fw-bold small py-1">
                                  <i className={`bi bi-${meta.icon} me-1`} style={{ color: meta.color }}></i>
                                  {meta.label}
                                  <span className="ms-2 badge" style={{ background: meta.color }}>{THB.format(catTotal)}</span>
                                </td>
                                {compareEntry && <td></td>}
                              </tr>
                              {items.map(li => {
                                const amt = Number(li.amount || 0)
                                const compareLi = compareEntry?.result?.consolidated?.line_items?.find((x: any) => x.line_code === li.line_code)
                                const compareAmt = compareLi ? Number(compareLi.amount || 0) : null
                                const diff = compareAmt != null ? amt - compareAmt : null
                                return (
                                  <tr key={li.line_code + li.line_name}>
                                    <td></td>
                                    <td><code className="small">{li.line_code || '—'}</code></td>
                                    <td className="small">{li.line_name}</td>
                                    <td className={`text-end small fw-semibold ${amt >= 0 ? 'text-success' : 'text-danger'}`}>{THB.format(amt)}</td>
                                    <td><span className="badge bg-light text-dark border">{li.currency || 'THB'}</span></td>
                                    {compareEntry && (
                                      <td className={`text-end small ${diff == null ? 'text-muted' : diff >= 0 ? 'text-success' : 'text-danger'}`}>
                                        {diff == null ? '—' : `${diff >= 0 ? '▲' : '▼'} ${THB.format(Math.abs(diff))}`}
                                      </td>
                                    )}
                                  </tr>
                                )
                              })}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                      <tfoot className="table-light">
                        <tr className="fw-bold">
                          <td colSpan={3}>Grand Total</td>
                          <td className={`text-end ${lineItems.reduce((s, li) => s + Number(li.amount || 0), 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                            {THB.format(lineItems.reduce((s, li) => s + Number(li.amount || 0), 0))}
                          </td>
                          <td></td>
                          {compareEntry && <td></td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* Charts tab */}
                {activeTab === 'chart' && lineItems.length > 0 && (
                  <div className="row g-3">
                    <div className="col-12">
                      <div className="fw-semibold text-muted small mb-2">Amounts by Category</div>
                      <div style={{ height: 260 }}>
                        <Bar {...buildBarChart()} />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="fw-semibold text-muted small mb-2">Top 8 Line Items (by absolute value)</div>
                      <div style={{ height: 220 }}>
                        <Doughnut {...buildDoughnut()} />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="fw-semibold text-muted small mb-2">P&L Waterfall</div>
                      <table className="table table-sm mb-0">
                        <tbody>
                          {[
                            { label: 'Revenue',              val: revenueTotal,  color: 'success', bold: false },
                            { label: '− Cost of Sales',      val: -cogsTotal,    color: 'danger',  bold: false },
                            { label: '= Gross Profit',       val: grossProfit,   color: 'primary', bold: true  },
                            { label: '− Operating Expenses', val: -opexTotal,    color: 'danger',  bold: false },
                            { label: '= EBIT',               val: ebit,          color: 'info',    bold: true  },
                            { label: '= Net Income',         val: netIncome,     color: netIncome >= 0 ? 'success' : 'danger', bold: true },
                          ].map(r => (
                            <tr key={r.label}>
                              <td className={`small ${r.bold ? 'fw-bold' : ''}`}>{r.label}</td>
                              <td className={`text-end small fw-semibold text-${r.color} ${r.bold ? 'border-top fw-bolder' : ''}`}>{THB.format(r.val)}</td>
                              <td style={{ width: 80 }}>
                                <div className="progress" style={{ height: 8 }}>
                                  <div className={`progress-bar bg-${r.color}`}
                                    style={{ width: revenueTotal > 0 ? `${Math.min(100, Math.abs(r.val) / revenueTotal * 100)}%` : '0%' }}></div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* P&L Structure tab */}
                {activeTab === 'pl_structure' && (
                  <div>
                    {sortedCategories.map(cat => {
                      const items = grouped[cat] || []
                      const meta = CATEGORY_META[cat]
                      const total = items.reduce((s, li) => s + Number(li.amount || 0), 0)
                      const share = revenueTotal ? total / revenueTotal : 0
                      return (
                        <div key={cat} className="mb-3">
                          <div className="d-flex justify-content-between align-items-center mb-1 px-1">
                            <div className="d-flex align-items-center gap-2">
                              <i className={`bi bi-${meta.icon}`} style={{ color: meta.color }}></i>
                              <span className="fw-semibold small">{meta.label}</span>
                              <span className="badge" style={{ background: meta.color, fontSize: '0.65rem' }}>{items.length} items</span>
                            </div>
                            <div className="text-end">
                              <span className={`fw-bold small ${total >= 0 ? 'text-success' : 'text-danger'}`}>{THB.format(total)}</span>
                              {revenueTotal > 0 && <span className="text-muted ms-2" style={{ fontSize: '0.7rem' }}>{PCT(share)}</span>}
                            </div>
                          </div>
                          <div className="progress mb-2" style={{ height: 6 }}>
                            <div className="progress-bar" style={{ width: `${Math.min(100, Math.abs(share) * 100)}%`, background: meta.color }}></div>
                          </div>
                          <div className="row g-1">
                            {items.slice(0, 12).map(li => (
                              <div className="col-12" key={li.line_code + li.line_name}>
                                <div className="d-flex justify-content-between align-items-center px-2 py-1 rounded small" style={{ background: meta.bgColor }}>
                                  <div>
                                    <code style={{ fontSize: '0.65rem' }} className="me-2 text-muted">{li.line_code}</code>
                                    <span>{li.line_name}</span>
                                  </div>
                                  <span className={`fw-semibold ${Number(li.amount) >= 0 ? 'text-success' : 'text-danger'}`}>
                                    {THB.format(Number(li.amount || 0))}
                                  </span>
                                </div>
                              </div>
                            ))}
                            {items.length > 12 && <div className="small text-muted text-center mt-1">+{items.length - 12} more items</div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Per-statement tab */}
                {activeTab === 'per_stmt' && (() => {
                  const allCodes = Array.from(new Set(lineItems.map(li => li.line_code))) as string[]
                  return (
                    <div className="table-responsive" style={{ maxHeight: 420 }}>
                      <table className="table table-sm table-bordered table-hover mb-0">
                        <thead className="table-dark sticky-top">
                          <tr>
                            <th style={{ minWidth: 150 }}>Line Item</th>
                            {stmtSources.map((s: any) => (
                              <th key={s.id} className="text-center" style={{ minWidth: 130 }}>
                                <div><span className="badge bg-info">{s.statement_type}</span></div>
                                <div style={{ fontSize: '0.65rem' }} className="fw-normal">{fmtDateShort(s.period_start)}</div>
                              </th>
                            ))}
                            <th className="text-center">Consolidated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allCodes.map(code => {
                            const masterLi = lineItems.find(li => li.line_code === code)
                            return (
                              <tr key={code}>
                                <td className="small">
                                  <div className="fw-semibold">{masterLi?.line_name || code}</div>
                                  <code className="text-muted" style={{ fontSize: '0.63rem' }}>{code}</code>
                                </td>
                                {stmtSources.map((s: any) => {
                                  const items = s.lineItems || s.line_items || []
                                  const li = items.find((l: any) => l.line_code === code)
                                  const amt = li ? Number(li.amount || 0) : null
                                  return (
                                    <td key={s.id} className={`text-end small ${amt == null ? 'text-muted' : amt >= 0 ? 'text-success' : 'text-danger'}`}>
                                      {amt == null ? '—' : THB.format(amt)}
                                    </td>
                                  )
                                })}
                                <td className={`text-end small fw-bold ${Number(masterLi?.amount || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                                  {THB.format(Number(masterLi?.amount || 0))}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot className="table-light">
                          <tr className="fw-bold">
                            <td>Total</td>
                            {stmtSources.map((s: any) => {
                              const items = s.lineItems || s.line_items || []
                              const total = items.reduce((sum: number, li: any) => sum + Number(li.amount || 0), 0)
                              return <td key={s.id} className={`text-end ${total >= 0 ? 'text-success' : 'text-danger'}`}>{THB.format(total)}</td>
                            })}
                            <td className={`text-end ${lineItems.reduce((s, li) => s + Number(li.amount || 0), 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                              {THB.format(lineItems.reduce((s, li) => s + Number(li.amount || 0), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )
                })()}
              </div>

              {/* Elimination note */}
              <div className="card-footer py-2" style={{ background: '#fffde7' }}>
                <small className="text-warning-emphasis">
                  <i className="bi bi-info-circle me-1"></i>
                  <strong>Inter-company elimination</strong> is not automatically applied. Review and manually adjust amounts for inter-company transactions.
                </small>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CFO Guide */}
      <div className="card mt-3 border-0" style={{ background: 'linear-gradient(90deg,#f8f9fa,#e9ecef)' }}>
        <div className="card-body py-3">
          <div className="small fw-semibold text-muted mb-2"><i className="bi bi-lightbulb me-1 text-warning"></i>CFO Consolidation Workflow</div>
          <div className="row g-2">
            {[
              { step: '1', label: 'Select Statements', desc: 'Choose approved P&L or B/S statements from entity or period groups' },
              { step: '2', label: 'Run Consolidation', desc: 'System aggregates line items by code across all selected statements' },
              { step: '3', label: 'Review & Adjust',   desc: 'Identify inter-company eliminations and manually adjust amounts' },
              { step: '4', label: 'Export & Report',   desc: 'Download CSV for board reporting or budget comparison' },
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

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>

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
