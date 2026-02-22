import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom'
import api from '../api/client'
import { useTenant } from '../components/TenantContext'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler)

// ─── Formatters ───────────────────────────────────────────────────────────────
const THB = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0 })
const THB2 = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2 })
const SIGNED = (v: number) => `${v >= 0 ? '+' : ''}${THB.format(v)}`
function shortDate(d: string) { return d ? new Date(d).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' }) : '—' }

// ─── Types ────────────────────────────────────────────────────────────────────
interface Forecast { id: string; forecast_name: string; start_date: string; weeks: number; beginning_cash: number; status: 'draft' | 'active' | 'archived'; created_at: string; notes?: string }
interface LineItem { id: string; week_number: number; week_start_date: string; week_end_date: string; operating_cash_inflow: number; operating_cash_outflow: number; investing_cash_inflow: number; investing_cash_outflow: number; financing_cash_inflow: number; financing_cash_outflow: number; net_change_in_cash: number; beginning_cash: number; ending_cash: number; notes?: string }
interface ForecastSummary { forecast_id: string; forecast_name: string; start_date: string; weeks: number; beginning_cash: number; ending_cash: number; total_operating_inflow: number; total_operating_outflow: number; total_investing_inflow: number; total_investing_outflow: number; total_financing_inflow: number; total_financing_outflow: number; net_change: number; lowest_cash_balance: number; lowest_cash_week: number }

const STATUS_COLOR: Record<string, string> = { draft: 'warning', active: 'success', archived: 'secondary' }

export default function CashFlowForecast() {
  const { tenantId } = useTenant()

  const [forecasts, setForecasts] = useState<Forecast[]>([])
  const [selected, setSelected] = useState<Forecast | null>(null)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [summary, setSummary] = useState<ForecastSummary | null>(null)

  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [savingWeek, setSavingWeek] = useState<number | null>(null)

  const [activeTab, setActiveTab] = useState<'overview' | 'table' | 'chart'>('overview')

  // ── Create modal state ──
  const [showCreate, setShowCreate] = useState(false)
  const [cForm, setCForm] = useState({ forecast_name: '', start_date: new Date().toISOString().split('T')[0], weeks: 13, beginning_cash: 0, notes: '' })
  const [creating, setCreating] = useState(false)
  const [cError, setCError] = useState<string | null>(null)

  // ── Edit forecast modal ──
  const [showEdit, setShowEdit] = useState(false)
  const [eForm, setEForm] = useState<Partial<Forecast>>({})
  const [editing, setEditing] = useState(false)

  // ── Inline line item editing ──
  const [editRow, setEditRow] = useState<Partial<LineItem> | null>(null)
  const [editingWeek, setEditingWeek] = useState<number | null>(null)

  // ── Toast  ──
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' | 'warning' } | null>(null)
  const toastTimer = useRef<any>(null)
  function showToast(msg: string, type: 'success' | 'danger' | 'warning' = 'success') {
    setToast({ msg, type }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 4500)
  }

  // ─── Data loading ──────────────────────────────────────────────────────────
  const loadForecasts = useCallback(async () => {
    setLoadingList(true)
    try { const r = await api.get('/cashflow/forecasts'); setForecasts(r.data || []) }
    catch (e: any) { showToast(e?.response?.data?.message || 'Failed to load forecasts', 'danger') }
    setLoadingList(false)
  }, [])

  useEffect(() => { if (tenantId) loadForecasts() }, [tenantId])

  useEffect(() => {
    if (selected) loadDetail(selected.id)
    else { setLineItems([]); setSummary(null) }
  }, [selected])

  async function loadDetail(id: string) {
    setLoadingDetail(true)
    try {
      const [iRes, sRes] = await Promise.all([api.get(`/cashflow/forecasts/${id}/line-items`), api.get(`/cashflow/forecasts/${id}/summary`)])
      setLineItems(iRes.data || [])
      setSummary(sRes.data || null)
    } catch (e: any) { showToast(e?.response?.data?.message || 'Failed to load details', 'danger') }
    setLoadingDetail(false)
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────
  async function createForecast(e: React.FormEvent) {
    e.preventDefault(); setCError(null); setCreating(true)
    try {
      await api.post('/cashflow/forecasts', cForm)
      showToast(`Forecast "${cForm.forecast_name}" created`)
      setShowCreate(false)
      setCForm({ forecast_name: '', start_date: new Date().toISOString().split('T')[0], weeks: 13, beginning_cash: 0, notes: '' })
      await loadForecasts()
    } catch (e: any) { setCError(e?.response?.data?.message || 'Failed to create') }
    setCreating(false)
  }

  async function updateForecast(e: React.FormEvent) {
    e.preventDefault(); setEditing(true)
    try {
      const upd = await api.put(`/cashflow/forecasts/${selected!.id}`, eForm)
      setSelected(upd.data)
      setForecasts(prev => prev.map(f => f.id === upd.data.id ? upd.data : f))
      showToast('Forecast updated')
      setShowEdit(false)
    } catch (e: any) { showToast(e?.response?.data?.message || 'Failed to update', 'danger') }
    setEditing(false)
  }

  async function deleteForecast(id: string) {
    if (!confirm('Delete this forecast? This cannot be undone.')) return
    try {
      await api.delete(`/cashflow/forecasts/${id}`)
      showToast('Forecast deleted', 'warning')
      if (selected?.id === id) setSelected(null)
      setForecasts(prev => prev.filter(f => f.id !== id))
    } catch (e: any) { showToast(e?.response?.data?.message || 'Failed to delete', 'danger') }
  }

  async function saveWeek(item: LineItem) {
    if (!selected || !editRow) return
    setSavingWeek(item.week_number)
    try {
      const { operating_cash_inflow, operating_cash_outflow, investing_cash_inflow, investing_cash_outflow, financing_cash_inflow, financing_cash_outflow, notes } = editRow as any
      await api.put(`/cashflow/forecasts/${selected.id}/line-items/${item.week_number}`, {
        operating_cash_inflow, operating_cash_outflow, investing_cash_inflow, investing_cash_outflow, financing_cash_inflow, financing_cash_outflow, notes
      })
      await loadDetail(selected.id)
      setEditingWeek(null); setEditRow(null)
      showToast(`Week ${item.week_number} saved`)
    } catch (e: any) { showToast(e?.response?.data?.message || 'Save failed', 'danger') }
    setSavingWeek(null)
  }

  function startEditRow(item: LineItem) { setEditingWeek(item.week_number); setEditRow({ ...item }) }
  function cancelEditRow() { setEditingWeek(null); setEditRow(null) }

  // ─── CSV Export ────────────────────────────────────────────────────────────
  function downloadCSV() {
    if (!lineItems.length || !selected) return
    const header = ['Week', 'Period', 'Op_Inflow', 'Op_Outflow', 'Inv_Inflow', 'Inv_Outflow', 'Fin_Inflow', 'Fin_Outflow', 'Net_Change', 'Ending_Cash']
    const rows = lineItems.map(li => [
      li.week_number, `${shortDate(li.week_start_date)}-${shortDate(li.week_end_date)}`,
      li.operating_cash_inflow, li.operating_cash_outflow, li.investing_cash_inflow,
      li.investing_cash_outflow, li.financing_cash_inflow, li.financing_cash_outflow,
      li.net_change_in_cash, li.ending_cash
    ].join(','))
    const csv = '\uFEFF' + [header.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `cashflow_${selected.forecast_name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    showToast('CSV downloaded')
  }

  // ─── Chart helpers ─────────────────────────────────────────────────────────
  function buildCashTrajectoryChart() {
    const labels = lineItems.map(li => `W${li.week_number}`)
    return {
      data: {
        labels,
        datasets: [
          { label: 'Ending Cash', data: lineItems.map(li => Number(li.ending_cash)), borderColor: '#1565c0', backgroundColor: 'rgba(21,101,192,0.12)', fill: true, tension: 0.35, pointRadius: 5, pointHoverRadius: 7 },
          { label: 'Net Change', data: lineItems.map(li => Number(li.net_change_in_cash)), borderColor: '#2e7d32', backgroundColor: 'rgba(46,125,50,0.1)', fill: true, tension: 0.35, pointRadius: 3 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' as const }, tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${THB.format(ctx.parsed.y)}` } } },
        scales: { y: { ticks: { callback: (v: any) => THB.format(v) } } },
      },
    }
  }

  function buildCashFlowByTypeChart() {
    const labels = lineItems.map(li => `W${li.week_number}`)
    return {
      data: {
        labels,
        datasets: [
          { label: 'Op. Inflow',  data: lineItems.map(li => Number(li.operating_cash_inflow)),  backgroundColor: 'rgba(21,101,192,0.75)', stack: 'in' },
          { label: 'Inv. Inflow', data: lineItems.map(li => Number(li.investing_cash_inflow)), backgroundColor: 'rgba(46,125,50,0.75)',  stack: 'in' },
          { label: 'Fin. Inflow', data: lineItems.map(li => Number(li.financing_cash_inflow)), backgroundColor: 'rgba(103,58,183,0.75)', stack: 'in' },
          { label: 'Op. Outflow',  data: lineItems.map(li => -Number(li.operating_cash_outflow)),  backgroundColor: 'rgba(198,40,40,0.75)',  stack: 'out' },
          { label: 'Inv. Outflow', data: lineItems.map(li => -Number(li.investing_cash_outflow)), backgroundColor: 'rgba(230,81,0,0.75)',   stack: 'out' },
          { label: 'Fin. Outflow', data: lineItems.map(li => -Number(li.financing_cash_outflow)), backgroundColor: 'rgba(109,0,95,0.75)',   stack: 'out' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' as const }, tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${THB.format(Math.abs(ctx.parsed.y))}` } } },
        scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (v: any) => THB.format(v) } } },
      },
    }
  }

  // ─── Computed totals ───────────────────────────────────────────────────────
  const totalOpNet  = lineItems.reduce((s, li) => s + Number(li.operating_cash_inflow)  - Number(li.operating_cash_outflow),  0)
  const totalInvNet = lineItems.reduce((s, li) => s + Number(li.investing_cash_inflow)  - Number(li.investing_cash_outflow),  0)
  const totalFinNet = lineItems.reduce((s, li) => s + Number(li.financing_cash_inflow)  - Number(li.financing_cash_outflow),  0)
  const cashAdequacy = summary && summary.ending_cash > 0 && summary.beginning_cash > 0 ? (summary.ending_cash / summary.beginning_cash) * 100 - 100 : 0

  const NFld = ({ field, readOnly }: { field: keyof LineItem; readOnly?: boolean }) => {
    if (readOnly) return <span className="small">{THB.format(Number((editRow as any)?.[field] ?? 0))}</span>
    return (
      <input type="number" className="form-control form-control-sm" step="1" min="0"
        value={Number((editRow as any)?.[field] ?? 0)}
        onChange={e => setEditRow(prev => ({ ...prev, [field]: parseFloat(e.target.value) || 0 }))}
        style={{ width: 100 }} />
    )
  }

  return (
    <>
      {/* ─── Page header ────────────────────────────────────────── */}
      <div className="d-flex justify-content-between align-items-center mb-3 px-1">
        <div>
          <h2 className="mb-0 fw-bold" style={{ color: '#1a3c5e' }}>
            <i className="bi bi-cash-stack me-2 text-primary"></i>Cash Flow Forecasting
          </h2>
          <small className="text-muted">13-week rolling cash flow forecast — track operating, investing &amp; financing activities</small>
        </div>
        <button className="btn btn-primary btn-sm px-3" onClick={() => setShowCreate(true)}>
          <i className="bi bi-plus-lg me-1"></i>New Forecast
        </button>
      </div>

      {/* ─── KPI bar (aggregate across all forecasts) ──────────── */}
      <div className="row g-3 mb-3">
        {[
          { label: 'Total Forecasts',  val: forecasts.length,                        icon: 'files',            color: 'primary'   },
          { label: 'Active',           val: forecasts.filter(f => f.status === 'active').length,  icon: 'check-circle',  color: 'success'   },
          { label: 'Draft',            val: forecasts.filter(f => f.status === 'draft').length,   icon: 'pencil-square', color: 'warning'   },
          { label: 'Archived',         val: forecasts.filter(f => f.status === 'archived').length,icon: 'archive',       color: 'secondary' },
        ].map(k => (
          <div className="col-6 col-md-3" key={k.label}>
            <div className={`card border-${k.color} h-100`}>
              <div className="card-body d-flex align-items-center gap-3 py-3">
                <div className={`text-bg-${k.color} rounded-3 d-flex align-items-center justify-content-center`} style={{ width: 46, height: 46, fontSize: 20 }}>
                  <i className={`bi bi-${k.icon}`}></i>
                </div>
                <div>
                  <div className="fw-bold fs-4 lh-1">{loadingList ? <span className="spinner-border spinner-border-sm"></span> : k.val}</div>
                  <small className="text-muted">{k.label}</small>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Main layout ─────────────────────────────────────────── */}
      <div className="row g-3">

        {/* Sidebar: forecast list */}
        <div className="col-md-3">
          <div className="card shadow-sm h-100">
            <div className="card-header" style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', color: '#fff' }}>
              <div className="d-flex align-items-center justify-content-between">
                <span className="fw-bold small"><i className="bi bi-list-ul me-1"></i>Forecasts</span>
                <span className="badge bg-light text-dark">{forecasts.length}</span>
              </div>
            </div>
            <div className="card-body p-0" style={{ overflowY: 'auto', maxHeight: 640 }}>
              {loadingList && <div className="text-center py-4"><span className="spinner-border spinner-border-sm text-primary"></span></div>}
              {!loadingList && forecasts.length === 0 && (
                <div className="text-center py-5 px-3">
                  <i className="bi bi-inbox display-5 text-muted opacity-25"></i>
                  <p className="small text-muted mt-2">No forecasts yet</p>
                  <button className="btn btn-sm btn-outline-primary" onClick={() => setShowCreate(true)}>Create first forecast</button>
                </div>
              )}
              {forecasts.map(f => (
                <div key={f.id}
                  className={`p-3 border-bottom position-relative ${selected?.id === f.id ? 'bg-primary bg-opacity-10 border-start border-3 border-primary' : 'cursor-pointer'}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => { setSelected(f); setActiveTab('overview') }}>
                  <div className="d-flex justify-content-between align-items-start">
                    <div className="fw-semibold small text-truncate pe-2" style={{ maxWidth: 140 }}>{f.forecast_name}</div>
                    <span className={`badge bg-${STATUS_COLOR[f.status]}`} style={{ fontSize: '0.62rem' }}>{f.status}</span>
                  </div>
                  <div className="small text-muted mt-1">
                    <i className="bi bi-calendar3 me-1"></i>{shortDate(f.start_date)} · {f.weeks}w
                  </div>
                  <div className="small text-muted">{THB.format(Number(f.beginning_cash))} start</div>
                  <div className="d-flex gap-1 mt-2">
                    <button className="btn btn-xs btn-outline-secondary py-0 px-1" style={{ fontSize: '0.65rem' }}
                      onClick={e => { e.stopPropagation(); setSelected(f); setEForm({ forecast_name: f.forecast_name, beginning_cash: f.beginning_cash, status: f.status, notes: f.notes || '' }); setShowEdit(true) }}>
                      <i className="bi bi-pencil"></i>
                    </button>
                    <button className="btn btn-xs btn-outline-danger py-0 px-1" style={{ fontSize: '0.65rem' }}
                      onClick={e => { e.stopPropagation(); deleteForecast(f.id) }}>
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detail panel */}
        <div className="col-md-9">
          {/* Empty state */}
          {!selected && (
            <div className="card shadow-sm">
              <div className="card-body text-center py-5">
                <i className="bi bi-bar-chart-line display-2 text-muted opacity-15"></i>
                <h5 className="mt-3 text-muted fw-normal">Select a forecast</h5>
                <p className="text-muted">Pick a forecast from the sidebar or create a new one to start planning.</p>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                  <i className="bi bi-plus-lg me-1"></i>Create New Forecast
                </button>
              </div>
            </div>
          )}

          {selected && (
            <div className="card shadow-sm border-primary">
              {/* Detail header */}
              <div className="card-header d-flex align-items-center justify-content-between" style={{ background: 'linear-gradient(135deg,#1565c0,#0d47a1)', color: '#fff' }}>
                <div className="d-flex align-items-center gap-2">
                  <i className="bi bi-cash-coin fs-5"></i>
                  <div>
                    <div className="fw-bold">{selected.forecast_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)' }}>
                      {shortDate(selected.start_date)} · {selected.weeks} weeks · <span className={`badge bg-${STATUS_COLOR[selected.status]}`}>{selected.status}</span>
                    </div>
                  </div>
                </div>
                <div className="d-flex gap-2">
                  <button className="btn btn-sm btn-outline-light" onClick={() => { setEForm({ forecast_name: selected.forecast_name, beginning_cash: selected.beginning_cash, status: selected.status, notes: selected.notes || '' }); setShowEdit(true) }}>
                    <i className="bi bi-pencil me-1"></i>Edit
                  </button>
                  <button className="btn btn-sm btn-outline-light" onClick={downloadCSV}>
                    <i className="bi bi-file-earmark-spreadsheet me-1"></i>CSV
                  </button>
                  <button className="btn btn-sm btn-outline-light" onClick={() => window.print()}>
                    <i className="bi bi-printer me-1"></i>Print
                  </button>
                </div>
              </div>

              {loadingDetail && (
                <div className="card-body text-center py-5">
                  <div className="spinner-border text-primary"></div>
                  <p className="text-muted mt-2">Loading forecast details…</p>
                </div>
              )}

              {!loadingDetail && (
                <div className="card-body">
                  {/* Summary KPI cards */}
                  {summary && (
                    <div className="row g-2 mb-3">
                      {[
                        { label: 'Beginning Cash', val: summary.beginning_cash,      color: 'info',    icon: 'wallet2',     signed: false },
                        { label: 'Ending Cash',    val: summary.ending_cash,         color: summary.ending_cash >= summary.beginning_cash ? 'success' : 'danger', icon: 'cash-coin',   signed: false },
                        { label: 'Net Change',     val: summary.net_change,          color: summary.net_change >= 0 ? 'success' : 'danger', icon: summary.net_change >= 0 ? 'graph-up-arrow' : 'graph-down-arrow', signed: true },
                        { label: 'Lowest Balance', val: summary.lowest_cash_balance, color: summary.lowest_cash_balance < 0 ? 'danger' : 'warning', icon: 'exclamation-circle', signed: false, sub: `Week ${summary.lowest_cash_week}` },
                      ].map(k => (
                        <div className="col-6 col-xl-3" key={k.label}>
                          <div className={`card border-${k.color} text-center h-100`} style={{ borderTop: `3px solid` }}>
                            <div className="card-body py-2 px-2">
                              <div className={`text-${k.color} mb-1`}><i className={`bi bi-${k.icon}`}></i></div>
                              <div className={`fw-bold text-${k.color} small`}>{k.signed ? SIGNED(k.val) : THB.format(k.val)}</div>
                              <div className="text-muted" style={{ fontSize: '0.68rem' }}>{k.label}</div>
                              {k.sub && <div className="text-muted" style={{ fontSize: '0.65rem' }}>{k.sub}</div>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Activity breakdown */}
                  {summary && (
                    <div className="row g-2 mb-3">
                      {[
                        { label: 'Operating',  inflow: summary.total_operating_inflow,  outflow: summary.total_operating_outflow,  net: totalOpNet,  color: 'primary' },
                        { label: 'Investing',  inflow: summary.total_investing_inflow,  outflow: summary.total_investing_outflow,  net: totalInvNet, color: 'info'    },
                        { label: 'Financing',  inflow: summary.total_financing_inflow,  outflow: summary.total_financing_outflow,  net: totalFinNet, color: 'purple'  },
                        { label: 'Cash Change', inflow: null, outflow: null, net: summary.net_change, color: summary.net_change >= 0 ? 'success' : 'danger', custom: true, pct: cashAdequacy },
                      ].map(k => (
                        <div className="col-6 col-md-3" key={k.label}>
                          <div className={`card border-${k.color === 'purple' ? 'secondary' : k.color} h-100`}>
                            <div className={`card-header py-2 text-bg-${k.color === 'purple' ? 'secondary' : k.color}`} style={{ fontSize: '0.72rem' }}>
                              <i className="bi bi-activity me-1"></i>{k.label}
                            </div>
                            <div className="card-body py-2 px-2">
                              {!k.custom ? (
                                <>
                                  <div className="d-flex justify-content-between small text-muted mb-1">
                                    <span>In:</span><span className="text-success fw-semibold">{THB.format(k.inflow!)}</span>
                                  </div>
                                  <div className="d-flex justify-content-between small text-muted mb-1">
                                    <span>Out:</span><span className="text-danger fw-semibold">{THB.format(k.outflow!)}</span>
                                  </div>
                                  <div className={`d-flex justify-content-between small fw-bold border-top pt-1 ${k.net >= 0 ? 'text-success' : 'text-danger'}`}>
                                    <span>Net:</span><span>{SIGNED(k.net)}</span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className={`fw-bold text-${k.color} mb-1`}>{SIGNED(k.net)}</div>
                                  <div className="small text-muted">{k.pct! >= 0 ? '+' : ''}{k.pct!.toFixed(1)}% vs start</div>
                                  <div className="progress mt-2" style={{ height: 6 }}>
                                    <div className={`progress-bar bg-${k.color}`} style={{ width: `${Math.min(100, Math.abs(k.pct!))}%` }}></div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tabs */}
                  <ul className="nav nav-tabs mb-3">
                    {[
                      { id: 'overview', label: 'Overview',    icon: 'speedometer2' },
                      { id: 'table',    label: 'Weekly Table', icon: 'table'        },
                      { id: 'chart',    label: 'Charts',       icon: 'bar-chart'    },
                    ].map(t => (
                      <li className="nav-item" key={t.id}>
                        <button className={`nav-link ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id as any)}>
                          <i className={`bi bi-${t.icon} me-1`}></i>{t.label}
                        </button>
                      </li>
                    ))}
                  </ul>

                  {/* ── Tab: Overview ─────────────────────────────── */}
                  {activeTab === 'overview' && summary && lineItems.length > 0 && (
                    <div>
                      {/* Mini cash trajectory sparkline */}
                      <div className="mb-3" style={{ height: 200 }}>
                        <div className="small fw-semibold text-muted mb-1"><i className="bi bi-graph-up me-1"></i>Cash Balance Trajectory (Ending Cash per Week)</div>
                        <Line {...buildCashTrajectoryChart()} />
                      </div>

                      {/* Risk flags */}
                      {lineItems.some(li => Number(li.ending_cash) < 0) && (
                        <div className="alert alert-danger py-2 mb-2 d-flex align-items-center gap-2">
                          <i className="bi bi-exclamation-triangle-fill fs-5"></i>
                          <div>
                            <strong>Negative cash balance detected</strong> in {lineItems.filter(li => Number(li.ending_cash) < 0).length} week(s) — action required.
                            <div className="small">{lineItems.filter(li => Number(li.ending_cash) < 0).map(li => `Week ${li.week_number}: ${THB.format(Number(li.ending_cash))}`).join(' | ')}</div>
                          </div>
                        </div>
                      )}
                      {summary.lowest_cash_balance < summary.beginning_cash * 0.2 && summary.lowest_cash_balance >= 0 && (
                        <div className="alert alert-warning py-2 mb-2 d-flex align-items-center gap-2">
                          <i className="bi bi-exclamation-circle-fill"></i>
                          <span><strong>Low cash warning:</strong> balance drops to {THB.format(summary.lowest_cash_balance)} at week {summary.lowest_cash_week} (&lt;20% of opening balance)</span>
                        </div>
                      )}

                      {/* Period summary table */}
                      <div className="small fw-semibold text-muted mb-2"><i className="bi bi-table me-1"></i>Monthly Summary</div>
                      <div className="table-responsive">
                        <table className="table table-sm table-bordered mb-0">
                          <thead className="table-light">
                            <tr><th>Week</th><th>Period</th><th className="text-end">Net Change</th><th className="text-end">Ending Cash</th><th>Trend</th></tr>
                          </thead>
                          <tbody>
                            {lineItems.map(li => {
                              const net = Number(li.net_change_in_cash)
                              const end = Number(li.ending_cash)
                              return (
                                <tr key={li.week_number} className={end < 0 ? 'table-danger' : ''}>
                                  <td className="fw-bold small">W{li.week_number}</td>
                                  <td className="small text-nowrap">{shortDate(li.week_start_date)}–{shortDate(li.week_end_date)}</td>
                                  <td className={`text-end small fw-semibold ${net >= 0 ? 'text-success' : 'text-danger'}`}>{SIGNED(net)}</td>
                                  <td className={`text-end small fw-bold ${end < 0 ? 'text-danger' : end < (summary?.beginning_cash || 0) * 0.2 ? 'text-warning' : 'text-success'}`}>{THB.format(end)}</td>
                                  <td><div className="progress" style={{ height: 6, minWidth: 60 }}><div className={`progress-bar bg-${net >= 0 ? 'success' : 'danger'}`} style={{ width: `${Math.min(100, Math.abs(net / (summary?.beginning_cash || 1)) * 100)}%` }}></div></div></td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ── Tab: Weekly Table (editable) ─────────────── */}
                  {activeTab === 'table' && (
                    <div>
                      <div className="small text-muted mb-2"><i className="bi bi-info-circle me-1"></i>Click <strong>Edit</strong> on a row to modify figures. Changes auto-recalculate ending cash via server trigger.</div>
                      <div className="table-responsive" style={{ maxHeight: 480 }}>
                        <table className="table table-sm table-bordered table-hover mb-0">
                          <thead className="table-dark sticky-top">
                            <tr>
                              <th style={{ minWidth: 50 }}>Wk</th>
                              <th style={{ minWidth: 110 }}>Period</th>
                              <th className="text-center small" colSpan={2} style={{ background: '#1565c0' }}>Operating</th>
                              <th className="text-center small" colSpan={2} style={{ background: '#2e7d32' }}>Investing</th>
                              <th className="text-center small" colSpan={2} style={{ background: '#6a1b9a' }}>Financing</th>
                              <th className="text-end">Net</th>
                              <th className="text-end">Ending</th>
                              <th></th>
                            </tr>
                            <tr className="table-secondary" style={{ fontSize: '0.65rem' }}>
                              <th></th><th></th>
                              <th className="text-end text-primary">In</th><th className="text-end text-danger">Out</th>
                              <th className="text-end text-success">In</th><th className="text-end text-danger">Out</th>
                              <th className="text-end text-info">In</th><th className="text-end text-danger">Out</th>
                              <th></th><th></th><th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {lineItems.map(li => {
                              const isEditing = editingWeek === li.week_number
                              const net = Number(li.net_change_in_cash)
                              const end = Number(li.ending_cash)
                              return (
                                <tr key={li.week_number} className={end < 0 ? 'table-danger' : isEditing ? 'table-warning table-active' : ''}>
                                  <td className="fw-bold small align-middle">W{li.week_number}</td>
                                  <td className="small text-nowrap align-middle">{shortDate(li.week_start_date)}<br /><span className="text-muted">–{shortDate(li.week_end_date)}</span></td>
                                  {/* Operating */}
                                  <td className="text-end align-middle" style={{ minWidth: 100 }}>{isEditing ? <NFld field="operating_cash_inflow" /> : <span className="small text-primary">{THB.format(Number(li.operating_cash_inflow))}</span>}</td>
                                  <td className="text-end align-middle" style={{ minWidth: 100 }}>{isEditing ? <NFld field="operating_cash_outflow" /> : <span className="small text-danger">{THB.format(Number(li.operating_cash_outflow))}</span>}</td>
                                  {/* Investing */}
                                  <td className="text-end align-middle" style={{ minWidth: 100 }}>{isEditing ? <NFld field="investing_cash_inflow" /> : <span className="small text-success">{THB.format(Number(li.investing_cash_inflow))}</span>}</td>
                                  <td className="text-end align-middle" style={{ minWidth: 100 }}>{isEditing ? <NFld field="investing_cash_outflow" /> : <span className="small text-danger">{THB.format(Number(li.investing_cash_outflow))}</span>}</td>
                                  {/* Financing */}
                                  <td className="text-end align-middle" style={{ minWidth: 100 }}>{isEditing ? <NFld field="financing_cash_inflow" /> : <span className="small text-info">{THB.format(Number(li.financing_cash_inflow))}</span>}</td>
                                  <td className="text-end align-middle" style={{ minWidth: 100 }}>{isEditing ? <NFld field="financing_cash_outflow" /> : <span className="small text-danger">{THB.format(Number(li.financing_cash_outflow))}</span>}</td>
                                  <td className={`text-end fw-bold align-middle small ${net >= 0 ? 'text-success' : 'text-danger'}`}>{SIGNED(net)}</td>
                                  <td className={`text-end fw-bold align-middle small ${end < 0 ? 'text-danger' : 'text-dark'}`}>{THB.format(end)}</td>
                                  <td className="align-middle text-center" style={{ minWidth: 80 }}>
                                    {isEditing ? (
                                      <div className="d-flex gap-1 justify-content-center">
                                        <button className="btn btn-sm btn-success py-0 px-2" onClick={() => saveWeek(li)} disabled={savingWeek === li.week_number}>
                                          {savingWeek === li.week_number ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-check-lg"></i>}
                                        </button>
                                        <button className="btn btn-sm btn-secondary py-0 px-2" onClick={cancelEditRow}><i className="bi bi-x-lg"></i></button>
                                      </div>
                                    ) : (
                                      <button className="btn btn-sm btn-outline-primary py-0 px-2" onClick={() => startEditRow(li)} style={{ fontSize: '0.7rem' }}>
                                        <i className="bi bi-pencil"></i>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          {lineItems.length > 0 && (
                            <tfoot className="table-light">
                              <tr className="fw-bold small">
                                <td colSpan={2}>Totals</td>
                                <td className="text-end text-primary">{THB.format(lineItems.reduce((s, li) => s + Number(li.operating_cash_inflow), 0))}</td>
                                <td className="text-end text-danger">{THB.format(lineItems.reduce((s, li) => s + Number(li.operating_cash_outflow), 0))}</td>
                                <td className="text-end text-success">{THB.format(lineItems.reduce((s, li) => s + Number(li.investing_cash_inflow), 0))}</td>
                                <td className="text-end text-danger">{THB.format(lineItems.reduce((s, li) => s + Number(li.investing_cash_outflow), 0))}</td>
                                <td className="text-end text-info">{THB.format(lineItems.reduce((s, li) => s + Number(li.financing_cash_inflow), 0))}</td>
                                <td className="text-end text-danger">{THB.format(lineItems.reduce((s, li) => s + Number(li.financing_cash_outflow), 0))}</td>
                                <td className={`text-end ${(summary?.net_change || 0) >= 0 ? 'text-success' : 'text-danger'}`}>{SIGNED(summary?.net_change || 0)}</td>
                                <td className="text-end">{THB.format(summary?.ending_cash || 0)}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      {lineItems.length === 0 && (
                        <div className="text-center py-4 text-muted">
                          <i className="bi bi-calendar-x fs-2 d-block mb-2"></i>No line items found for this forecast.
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Tab: Charts ──────────────────────────────── */}
                  {activeTab === 'chart' && lineItems.length > 0 && (
                    <div className="row g-3">
                      <div className="col-12">
                        <div className="small fw-semibold text-muted mb-2"><i className="bi bi-graph-up me-1"></i>Cash Balance Trajectory</div>
                        <div style={{ height: 250 }}><Line {...buildCashTrajectoryChart()} /></div>
                      </div>
                      <div className="col-12">
                        <div className="small fw-semibold text-muted mb-2"><i className="bi bi-bar-chart me-1"></i>Cash Flow by Activity (stacked — outflows shown as negative)</div>
                        <div style={{ height: 280 }}><Bar {...buildCashFlowByTypeChart()} /></div>
                      </div>
                      {/* Net activity breakdown */}
                      <div className="col-12">
                        <table className="table table-sm table-bordered mb-0">
                          <thead className="table-light"><tr><th>Activity</th><th className="text-end">Total Inflow</th><th className="text-end">Total Outflow</th><th className="text-end">Net</th><th style={{ width: 150 }}>Net Visual</th></tr></thead>
                          <tbody>
                            {[
                              { label: 'Operating',  inflow: summary?.total_operating_inflow||0,  outflow: summary?.total_operating_outflow||0,  net: totalOpNet,  color: 'primary' },
                              { label: 'Investing',  inflow: summary?.total_investing_inflow||0,  outflow: summary?.total_investing_outflow||0,  net: totalInvNet, color: 'success' },
                              { label: 'Financing',  inflow: summary?.total_financing_inflow||0,  outflow: summary?.total_financing_outflow||0,  net: totalFinNet, color: 'info'    },
                            ].map(r => (
                              <tr key={r.label}>
                                <td className="fw-semibold small">{r.label}</td>
                                <td className="text-end small text-success">{THB.format(r.inflow)}</td>
                                <td className="text-end small text-danger">{THB.format(r.outflow)}</td>
                                <td className={`text-end small fw-bold ${r.net >= 0 ? 'text-success' : 'text-danger'}`}>{SIGNED(r.net)}</td>
                                <td>
                                  <div className="progress" style={{ height: 10 }}>
                                    <div className={`progress-bar bg-${r.net >= 0 ? 'success' : 'danger'}`} style={{ width: `${Math.min(100, Math.abs(r.net / (Math.max(r.inflow, r.outflow) || 1)) * 100)}%` }}></div>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {activeTab === 'chart' && lineItems.length === 0 && (
                    <div className="text-center py-4 text-muted">No data to chart yet — add line item values first.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── CFO Guide ────────────────────────────────────────────── */}
      <div className="card mt-3 border-0" style={{ background: 'linear-gradient(90deg,#f8f9fa,#e9ecef)' }}>
        <div className="card-body py-3">
          <div className="small fw-semibold text-muted mb-2"><i className="bi bi-lightbulb me-1 text-warning"></i>CFO Cash Flow Management Workflow</div>
          <div className="row g-2">
            {[
              { step: '1', label: 'Create Forecast',  desc: 'Set opening cash, # weeks and start date' },
              { step: '2', label: 'Enter Actuals',    desc: 'Input weekly operating / investing / financing flows' },
              { step: '3', label: 'Monitor Risks',    desc: 'Watch for negative balances and low-cash weeks' },
              { step: '4', label: 'Plan Actions',     desc: 'Arrange credit lines, defer capex, accelerate collections' },
            ].map(s => (
              <div className="col-6 col-md-3" key={s.step}>
                <div className="d-flex align-items-start gap-2">
                  <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0" style={{ width: 26, height: 26, fontSize: '0.8rem' }}>{s.step}</div>
                  <div><div className="fw-semibold small">{s.label}</div><div className="text-muted" style={{ fontSize: '0.72rem' }}>{s.desc}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Create Forecast Modal ─────────────────────────────────── */}
      {showCreate && ReactDOM.createPortal(
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 9999 }} onClick={() => setShowCreate(false)}>
          <div className="card shadow-lg" style={{ width: 480, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div className="card-header" style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', color: '#fff' }}>
              <div className="d-flex justify-content-between align-items-center">
                <span className="fw-bold"><i className="bi bi-plus-circle me-2"></i>Create New Forecast</span>
                <button className="btn-close btn-close-white" onClick={() => setShowCreate(false)}></button>
              </div>
            </div>
            <div className="card-body">
              {cError && <div className="alert alert-danger py-2 small">{cError}</div>}
              <form onSubmit={createForecast}>
                <div className="mb-3">
                  <label className="form-label fw-semibold small">Forecast Name *</label>
                  <input className="form-control" placeholder="e.g. Q2 2026 Rolling Forecast" required value={cForm.forecast_name} onChange={e => setCForm(c => ({ ...c, forecast_name: e.target.value }))} />
                </div>
                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label fw-semibold small">Start Date *</label>
                    <input type="date" className="form-control" required value={cForm.start_date} onChange={e => setCForm(c => ({ ...c, start_date: e.target.value }))} />
                  </div>
                  <div className="col-6">
                    <label className="form-label fw-semibold small">Weeks</label>
                    <input type="number" className="form-control" min={1} max={52} value={cForm.weeks} onChange={e => setCForm(c => ({ ...c, weeks: parseInt(e.target.value) || 13 }))} />
                    <div className="form-text">Standard CFO: 13 weeks (1 quarter)</div>
                  </div>
                </div>
                <div className="mb-3 mt-2">
                  <label className="form-label fw-semibold small">Opening Cash Balance (THB)</label>
                  <input type="number" className="form-control" step="1" value={cForm.beginning_cash} onChange={e => setCForm(c => ({ ...c, beginning_cash: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold small">Notes</label>
                  <textarea className="form-control" rows={2} value={cForm.notes} onChange={e => setCForm(c => ({ ...c, notes: e.target.value }))} placeholder="Optional notes…" />
                </div>
                <div className="d-flex justify-content-end gap-2">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={creating}>
                    {creating ? <><span className="spinner-border spinner-border-sm me-1"></span>Creating…</> : <><i className="bi bi-check-lg me-1"></i>Create</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ─── Edit Forecast Modal ───────────────────────────────────── */}
      {showEdit && selected && ReactDOM.createPortal(
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 9999 }} onClick={() => setShowEdit(false)}>
          <div className="card shadow-lg" style={{ width: 440, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div className="card-header" style={{ background: 'linear-gradient(135deg,#e65100,#bf360c)', color: '#fff' }}>
              <div className="d-flex justify-content-between align-items-center">
                <span className="fw-bold"><i className="bi bi-pencil me-2"></i>Edit Forecast</span>
                <button className="btn-close btn-close-white" onClick={() => setShowEdit(false)}></button>
              </div>
            </div>
            <div className="card-body">
              <form onSubmit={updateForecast}>
                <div className="mb-3">
                  <label className="form-label fw-semibold small">Forecast Name</label>
                  <input className="form-control" value={eForm.forecast_name || ''} onChange={e => setEForm(f => ({ ...f, forecast_name: e.target.value }))} />
                </div>
                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label fw-semibold small">Opening Cash (THB)</label>
                    <input type="number" className="form-control" step="1" value={eForm.beginning_cash ?? 0} onChange={e => setEForm(f => ({ ...f, beginning_cash: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div className="col-6">
                    <label className="form-label fw-semibold small">Status</label>
                    <select className="form-select" value={eForm.status || 'draft'} onChange={e => setEForm(f => ({ ...f, status: e.target.value as any }))}>
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
                <div className="mb-3 mt-2">
                  <label className="form-label fw-semibold small">Notes</label>
                  <textarea className="form-control" rows={2} value={eForm.notes || ''} onChange={e => setEForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <div className="d-flex justify-content-end gap-2">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowEdit(false)}>Cancel</button>
                  <button type="submit" className="btn btn-warning" disabled={editing}>
                    {editing ? <><span className="spinner-border spinner-border-sm me-1"></span>Saving…</> : <><i className="bi bi-check-lg me-1"></i>Save</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ─── Toast ────────────────────────────────────────────────── */}
      {toast && ReactDOM.createPortal(
        <div className="position-fixed top-0 end-0 p-3" style={{ zIndex: 10000 }}>
          <div className={`toast show align-items-center text-bg-${toast.type} border-0`}>
            <div className="d-flex">
              <div className="toast-body d-flex align-items-center gap-2">
                <i className={`bi bi-${toast.type === 'success' ? 'check-circle-fill' : toast.type === 'warning' ? 'exclamation-circle-fill' : 'x-circle-fill'} fs-5`}></i>
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
