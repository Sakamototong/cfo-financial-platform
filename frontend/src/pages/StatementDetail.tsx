import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import TransactionDrillDown from '../components/TransactionDrillDown'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { useUser } from '../components/UserContext'
import { hasMinRole } from '../components/RequireRole'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function StatementDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { role } = useUser()
  const isAdmin = hasMinRole(role, 'admin')

  const [loading, setLoading] = useState(true)
  const [statement, setStatement] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [drillDownLine, setDrillDownLine] = useState<{ code: string; name: string } | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (!id) return
    loadStatement()
  }, [id])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(t)
    }
  }, [toast])

  async function loadStatement() {
    setLoading(true)
    setError(null)
    try {
      const r = await api.get(`/financial/statements/${id}`)
      const d = r.data
      if (d?.statement && (d.lineItems || d.line_items)) {
        setStatement({ ...d.statement, line_items: d.lineItems ?? d.line_items ?? [] })
      } else if (d?.statement) {
        setStatement({ ...d.statement, line_items: d.statement.line_items ?? [] })
      } else {
        setStatement({ ...d, line_items: d.line_items ?? [] })
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to load statement')
    } finally {
      setLoading(false)
    }
  }

  function parseAmount(v: any) {
    if (v === null || v === undefined) return 0
    const n = Number(String(v).replace(/,/g, ''))
    return Number.isFinite(n) ? n : 0
  }

  function fmtDate(v: any) {
    if (!v) return '—'
    const d = new Date(v)
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  function fmtNumber(n: number) {
    return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  }

  const lines: any[] = statement?.line_items ?? []
  const revenueLines = lines.filter(li => parseAmount(li.amount) > 0)
  const expenseLines = lines.filter(li => parseAmount(li.amount) < 0)
  const totalRevenue = revenueLines.reduce((s, li) => s + parseAmount(li.amount), 0)
  const totalExpenses = expenseLines.reduce((s, li) => s + Math.abs(parseAmount(li.amount)), 0)
  const netIncome = totalRevenue - totalExpenses

  async function updateStatus(newStatus: string) {
    if (!id) return
    setUpdatingStatus(true)
    try {
      console.log('[updateStatus] PUT /financial/statements/' + id + '/status', { status: newStatus })
      const res = await api.put(`/financial/statements/${id}/status`, { status: newStatus })
      console.log('[updateStatus] success', res.status, res.data)
      setToast({ type: 'success', message: `Status updated to ${newStatus}` })
      await loadStatement()
    } catch (err: any) {
      console.error('[updateStatus] error', err?.response?.status, err?.response?.data, err?.message, err)
      const msg = err?.response?.status === 403 ? 'ไม่มีสิทธิ์เปลี่ยนสถานะ — เฉพาะ Admin' : err?.response?.data?.message ?? err?.message ?? 'Failed to update status'
      setToast({ type: 'error', message: msg })
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    setDeleting(true)
    try {
      await api.delete(`/financial/statements/${id}`)
      navigate('/financials')
    } catch (err: any) {
      const msg = err?.response?.status === 403 ? 'ไม่มีสิทธิ์ลบ — เฉพาะ Admin' : err?.response?.data?.message ?? err?.message ?? 'Failed to delete'
      setToast({ type: 'error', message: msg })
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const statusBadgeClass = (s: string) =>
    s === 'approved' ? 'text-bg-success' : s === 'locked' ? 'text-bg-dark' : 'text-bg-warning'

  const typeBadgeClass = (t: string) =>
    t === 'PL' ? 'text-bg-info' : t === 'BS' ? 'text-bg-primary' : 'text-bg-secondary'

  if (loading) return (
    <div className="card">
      <div className="card-body text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <p className="mt-3 text-muted">Loading statement...</p>
      </div>
    </div>
  )

  if (error || !statement) return (
    <div className="card">
      <div className="card-body">
        <div className="alert alert-danger"><i className="bi bi-x-circle me-2"></i>{error ?? 'Statement not found'}</div>
        <button className="btn btn-secondary" onClick={() => navigate('/financials')}>
          <i className="bi bi-arrow-left me-1"></i>Back
        </button>
      </div>
    </div>
  )

  // Chart data
  const chartData = {
    labels: lines.map(li => li.line_name !== li.line_code ? `${li.line_name} (${li.line_code})` : li.line_code),
    datasets: [{
      label: 'Amount (THB)',
      data: lines.map(li => parseAmount(li.amount)),
      backgroundColor: lines.map(li => parseAmount(li.amount) >= 0 ? 'rgba(25,135,84,0.75)' : 'rgba(220,53,69,0.75)'),
      borderColor: lines.map(li => parseAmount(li.amount) >= 0 ? '#198754' : '#dc3545'),
      borderWidth: 1,
      borderRadius: 4,
    }]
  }
  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx: any) => `฿${fmtNumber(ctx.parsed.y)}` } }
    },
    scales: {
      y: { ticks: { callback: (v: any) => `฿${new Intl.NumberFormat('th-TH', { notation: 'compact' }).format(Number(v))}` } }
    }
  }

  return (
    <>
      {/* Page Header */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-file-earmark-bar-graph me-2"></i>
            Financial Statement Detail
          </h3>
          <div className="card-tools d-flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/financials')}>
              <i className="bi bi-arrow-left me-1"></i>Back
            </button>
            {isAdmin && (
              <button className="btn btn-primary btn-sm" onClick={() => navigate(`/financials/${id}/edit`)}>
                <i className="bi bi-pencil me-1"></i>Edit
              </button>
            )}
            {isAdmin && statement.status === 'draft' && (
              <button className="btn btn-success btn-sm" onClick={() => updateStatus('approved')} disabled={updatingStatus}>
                {updatingStatus ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-check-circle me-1"></i>}
                Approve
              </button>
            )}
            {isAdmin && statement.status === 'approved' && (
              <button className="btn btn-dark btn-sm" onClick={() => updateStatus('locked')} disabled={updatingStatus}>
                <i className="bi bi-lock me-1"></i>Lock
              </button>
            )}
            {isAdmin && (
              <button className="btn btn-outline-danger btn-sm" onClick={() => setShowDeleteConfirm(true)} disabled={deleting}>
                <i className="bi bi-trash me-1"></i>Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Statement Info Card */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title"><i className="bi bi-info-circle me-2"></i>Statement Information</h3>
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3">
              <label className="text-muted small d-block">Type</label>
              <span className={`badge fs-6 ${typeBadgeClass(statement.statement_type)}`}>
                {statement.statement_type === 'PL' ? 'Profit & Loss' : statement.statement_type === 'BS' ? 'Balance Sheet' : 'Cash Flow'}
              </span>
            </div>
            <div className="col-md-3">
              <label className="text-muted small d-block">Status</label>
              <span className={`badge fs-6 ${statusBadgeClass(statement.status)}`}>
                <i className={`bi bi-${statement.status === 'approved' ? 'check-circle' : statement.status === 'locked' ? 'lock' : 'pencil'} me-1`}></i>
                {statement.status}
              </span>
            </div>
            <div className="col-md-3">
              <label className="text-muted small d-block">Scenario</label>
              <strong>{statement.scenario}</strong>
            </div>
            <div className="col-md-3">
              <label className="text-muted small d-block">Period Type</label>
              <span className="text-capitalize">{statement.period_type}</span>
            </div>
            <div className="col-md-3">
              <label className="text-muted small d-block">Period Start</label>
              <strong>{fmtDate(statement.period_start)}</strong>
            </div>
            <div className="col-md-3">
              <label className="text-muted small d-block">Period End</label>
              <strong>{fmtDate(statement.period_end)}</strong>
            </div>
            <div className="col-md-3">
              <label className="text-muted small d-block">Created By</label>
              <span>{statement.created_by ?? '—'}</span>
            </div>
            <div className="col-md-3">
              <label className="text-muted small d-block">Created At</label>
              <span>{fmtDate(statement.created_at)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="row mb-3">
        <div className="col-md-4">
          <div className="info-box">
            <span className="info-box-icon text-bg-success shadow-sm"><i className="bi bi-graph-up-arrow"></i></span>
            <div className="info-box-content">
              <span className="info-box-text">Total Revenue</span>
              <span className="info-box-number">฿{fmtNumber(totalRevenue)}</span>
              <div className="progress mt-1"><div className="progress-bar bg-success" style={{ width: '100%' }}></div></div>
              <span className="progress-description">{revenueLines.length} line item(s)</span>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="info-box">
            <span className="info-box-icon text-bg-danger shadow-sm"><i className="bi bi-graph-down-arrow"></i></span>
            <div className="info-box-content">
              <span className="info-box-text">Total Expenses</span>
              <span className="info-box-number">฿{fmtNumber(totalExpenses)}</span>
              <div className="progress mt-1"><div className="progress-bar bg-danger" style={{ width: '100%' }}></div></div>
              <span className="progress-description">{expenseLines.length} line item(s)</span>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="info-box">
            <span className={`info-box-icon shadow-sm ${netIncome >= 0 ? 'text-bg-primary' : 'text-bg-warning'}`}>
              <i className={`bi bi-${netIncome >= 0 ? 'cash-coin' : 'exclamation-triangle'}`}></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">Net Income</span>
              <span className={`info-box-number ${netIncome >= 0 ? 'text-success' : 'text-danger'}`}>
                {netIncome >= 0 ? '+' : ''}฿{fmtNumber(netIncome)}
              </span>
              <div className="progress mt-1">
                <div className={`progress-bar ${netIncome >= 0 ? 'bg-primary' : 'bg-warning'}`} style={{ width: `${Math.min(Math.abs(netIncome / (totalRevenue || 1)) * 100, 100)}%` }}></div>
              </div>
              <span className="progress-description">{netIncome >= 0 ? 'Profitable' : 'Loss'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      {lines.length > 0 && (
        <div className="card mb-3">
          <div className="card-header">
            <h3 className="card-title"><i className="bi bi-bar-chart me-2"></i>Line Items Chart</h3>
          </div>
          <div className="card-body">
            <div style={{ height: 280 }}>
              <Bar data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>
      )}

      {/* P&L Table */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title"><i className="bi bi-table me-2"></i>Line Items</h3>
          <div className="card-tools">
            <small className="text-muted">Click a row to see underlying transactions</small>
          </div>
        </div>
        <div className="card-body p-0">
          {lines.length === 0 ? (
            <div className="text-center py-5 text-muted">No line items found</div>
          ) : (
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Account Code</th>
                  <th>Account Name</th>
                  <th>Notes</th>
                  <th className="text-end">Amount (THB)</th>
                  <th className="text-center">Category</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {revenueLines.length > 0 && (
                  <tr className="table-success">
                    <td colSpan={6} className="fw-bold text-success">
                      <i className="bi bi-arrow-up-circle me-2"></i>Revenue
                    </td>
                  </tr>
                )}
                {revenueLines.map(li => (
                  <tr key={li.id || li.line_code} className="cursor-pointer" onClick={() => setDrillDownLine({ code: li.line_code, name: li.line_name })} title="Click to drill down">
                    <td><code>{li.line_code}</code></td>
                    <td>{li.line_name !== li.line_code ? li.line_name : <span className="text-muted">{li.line_code}</span>}</td>
                    <td><small className="text-muted">{li.notes ?? '—'}</small></td>
                    <td className="text-end text-success fw-semibold">฿{fmtNumber(parseAmount(li.amount))}</td>
                    <td className="text-center"><span className="badge text-bg-success-subtle text-success border border-success-subtle">Revenue</span></td>
                    <td className="text-center"><i className="bi bi-search text-muted"></i></td>
                  </tr>
                ))}
                {revenueLines.length > 0 && (
                  <tr className="table-success fw-bold">
                    <td colSpan={3} className="text-end text-success">Total Revenue</td>
                    <td className="text-end text-success">฿{fmtNumber(totalRevenue)}</td>
                    <td colSpan={2}></td>
                  </tr>
                )}

                {expenseLines.length > 0 && (
                  <tr className="table-danger">
                    <td colSpan={6} className="fw-bold text-danger">
                      <i className="bi bi-arrow-down-circle me-2"></i>Expenses
                    </td>
                  </tr>
                )}
                {expenseLines.map(li => (
                  <tr key={li.id || li.line_code} className="cursor-pointer" onClick={() => setDrillDownLine({ code: li.line_code, name: li.line_name })} title="Click to drill down">
                    <td><code>{li.line_code}</code></td>
                    <td>{li.line_name !== li.line_code ? li.line_name : <span className="text-muted">{li.line_code}</span>}</td>
                    <td><small className="text-muted">{li.notes ?? '—'}</small></td>
                    <td className="text-end text-danger fw-semibold">฿{fmtNumber(parseAmount(li.amount))}</td>
                    <td className="text-center"><span className="badge text-bg-danger-subtle text-danger border border-danger-subtle">Expense</span></td>
                    <td className="text-center"><i className="bi bi-search text-muted"></i></td>
                  </tr>
                ))}
                {expenseLines.length > 0 && (
                  <tr className="table-danger fw-bold">
                    <td colSpan={3} className="text-end text-danger">Total Expenses</td>
                    <td className="text-end text-danger">(฿{fmtNumber(totalExpenses)})</td>
                    <td colSpan={2}></td>
                  </tr>
                )}

                <tr className={`fw-bold fs-6 ${netIncome >= 0 ? 'table-primary' : 'table-warning'}`}>
                  <td colSpan={3} className="text-end">Net Income</td>
                  <td className={`text-end ${netIncome >= 0 ? 'text-primary' : 'text-warning'}`}>
                    {netIncome >= 0 ? '+' : ''}฿{fmtNumber(netIncome)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        <div className="card-footer text-muted">
          <small>{lines.length} line item(s) total</small>
        </div>
      </div>

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header border-danger">
                <h5 className="modal-title text-danger"><i className="bi bi-exclamation-triangle me-2"></i>Confirm Delete</h5>
                <button className="btn-close" onClick={() => setShowDeleteConfirm(false)}></button>
              </div>
              <div className="modal-body">
                <p>คุณต้องการลบ Financial Statement นี้หรือไม่?</p>
                <ul className="text-muted">
                  <li>Line items ทั้งหมดจะถูกลบ</li>
                  <li>Transactions ที่โพสต์จะถูกย้อนกลับเป็นสถานะ <strong>Approved</strong></li>
                  <li>การลบไม่สามารถยกเลิกได้</li>
                </ul>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-trash me-1"></i>}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Drill-Down */}
      {drillDownLine && id && (
        <TransactionDrillDown
          statementId={id}
          lineCode={drillDownLine.code}
          lineName={drillDownLine.name}
          onClose={() => setDrillDownLine(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="position-fixed bottom-0 end-0 p-3" style={{ zIndex: 9999 }}>
          <div className={`toast show ${toast.type === 'success' ? 'bg-success' : 'bg-danger'} text-white`}>
            <div className="toast-body">
              <i className={`bi bi-${toast.type === 'success' ? 'check-circle' : 'x-circle'} me-2`}></i>
              {toast.message}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
