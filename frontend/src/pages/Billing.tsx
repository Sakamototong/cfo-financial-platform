import React, { useState, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useTenant } from '../components/TenantContext'
import api from '../api/client'
import { useAbortController, isAbortError } from '../hooks/useApi'

// ============ Interfaces ============
interface BillingPlan {
  id: string; plan_code: string; plan_name: string; description: string
  price_monthly: number; price_annual: number; currency: string
  max_users: number | null; max_storage_gb: number | null; max_api_calls_day: number | null
  features: string[]; is_active: boolean
}
interface TenantSubscription {
  id: string; tenant_id: string; plan_code: string; plan_name: string
  billing_cycle: 'monthly' | 'annual'; status: string
  trial_ends_at: string | null; current_period_start: string
  current_period_end: string; next_billing_date: string | null
  amount: number; currency: string; cancelled_at: string | null
  cancel_reason: string | null; created_at: string
}
interface BillingInvoice {
  id: string; invoice_number: string; period_start: string; period_end: string
  due_date: string; status: string; subtotal: number; tax_rate: number
  tax_amount: number; total_amount: number; currency: string
  notes: string | null; paid_at: string | null; paid_by: string | null
  created_by: string; created_at: string
}
interface BillingPayment {
  id: string; invoice_id: string | null; invoice_number?: string
  payment_date: string; amount: number; currency: string
  payment_method: string; reference_number: string | null
  status: string; notes: string | null; created_by: string; created_at: string
}
interface BillingUsage {
  period_year: number; period_month: number; users_count: number
  storage_used_gb: number; api_calls_count: number; reports_generated: number
  etl_imports: number; scenarios_created: number
}
interface BillingSummary {
  subscription: TenantSubscription | null; invoiceStats: Record<string, { cnt: number; total: number }>
  totalInvoices: number; outstandingAmount: number; totalPaidYtd: number
  overdueCount: number; latestUsage: BillingUsage | null
}

// ============ Toast ============
interface Toast { id: number; msg: string; type: 'success' | 'danger' | 'warning' | 'info' }
function useToast() {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const add = useCallback((msg: string, type: Toast['type'] = 'success') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000)
  }, [])
  return { toasts, add }
}
function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, minWidth: 280 }}>
      {toasts.map(t => (
        <div key={t.id} className={`alert alert-${t.type} shadow-sm mb-2 py-2`} style={{ fontSize: '0.85rem' }}>
          {t.type === 'success' && <i className="bi bi-check-circle me-2" />}
          {t.type === 'danger' && <i className="bi bi-x-circle me-2" />}
          {t.type === 'warning' && <i className="bi bi-exclamation-triangle me-2" />}
          {t.type === 'info' && <i className="bi bi-info-circle me-2" />}
          {t.msg}
        </div>
      ))}
    </div>,
    document.body
  )
}

// ============ Helpers ============
function fmtDate(s?: string | null) {
  if (!s) return '-'
  return new Date(s).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}
function fmtMoney(n?: number | null, currency = 'THB') {
  if (n == null) return '-'
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n)
}
function daysUntil(s?: string | null): number {
  if (!s) return 0
  return Math.max(0, Math.ceil((new Date(s).getTime() - Date.now()) / 86400000))
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'success', trial: 'info', cancelled: 'secondary',
    suspended: 'danger', inactive: 'secondary',
    paid: 'success', pending: 'warning', overdue: 'danger', draft: 'secondary',
    completed: 'success', failed: 'danger', refunded: 'info'
  }
  const color = map[status] || 'secondary'
  const labels: Record<string, string> = {
    active: 'Active', trial: 'Trial', cancelled: 'Cancelled', suspended: 'Suspended',
    paid: 'Paid', pending: 'Pending', overdue: 'Overdue', draft: 'Draft',
    completed: 'Completed', failed: 'Failed', refunded: 'Refunded'
  }
  return <span className={`badge bg-${color}`}>{labels[status] || status}</span>
}
function PlanBadge({ code }: { code: string }) {
  const map: Record<string, [string, string]> = {
    free_trial: ['secondary', 'Free Trial'],
    starter: ['primary', 'Starter'],
    professional: ['purple', 'Professional'],
    enterprise: ['warning', 'Enterprise'],
  }
  const [color, label] = map[code] || ['secondary', code]
  return <span className={`badge bg-${color}`} style={color === 'purple' ? { backgroundColor: '#6f42c1' } : {}}>{label}</span>
}

// ============ Main Component ============
export default function Billing() {
  const { tenantId } = useTenant()
  const { toasts, add: toast } = useToast()
  const { getSignal } = useAbortController()

  const [tab, setTab] = useState<'overview' | 'invoices' | 'payments' | 'usage'>('overview')
  const [loading, setLoading] = useState(true)

  // Data
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [invoices, setInvoices] = useState<BillingInvoice[]>([])
  const [invoiceFilter, setInvoiceFilter] = useState('')
  const [payments, setPayments] = useState<BillingPayment[]>([])
  const [usage, setUsage] = useState<BillingUsage | null>(null)
  const [subscription, setSubscription] = useState<TenantSubscription | null>(null)

  // Invoice detail modal
  const [selectedInvoice, setSelectedInvoice] = useState<{ invoice: BillingInvoice; items: any[] } | null>(null)

  // Modals
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showInvoiceDetailModal, setShowInvoiceDetailModal] = useState(false)

  // Upgrade form
  const [upgradePlanCode, setUpgradePlanCode] = useState('')
  const [upgradeCycle, setUpgradeCycle] = useState<'monthly' | 'annual'>('monthly')
  const [upgradeSubmitting, setUpgradeSubmitting] = useState(false)

  // Cancel form
  const [cancelReason, setCancelReason] = useState('')

  // Create invoice form
  const [invPeriodStart, setInvPeriodStart] = useState('')
  const [invPeriodEnd, setInvPeriodEnd] = useState('')
  const [invDueDate, setInvDueDate] = useState('')
  const [invTaxRate, setInvTaxRate] = useState('7')
  const [invNotes, setInvNotes] = useState('')
  const [invItems, setInvItems] = useState([{ description: '', quantity: 1, unit_price: 0 }])
  const [invSubmitting, setInvSubmitting] = useState(false)

  // Payment form
  const [payInvoiceId, setPayInvoiceId] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('bank_transfer')
  const [payRef, setPayRef] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [paySubmitting, setPaySubmitting] = useState(false)

  // ============ Data Loaders ============
  const initBilling = useCallback(async () => {
    if (!tenantId) return
    try { await api.post('/billing/init', {}) } catch { /* already exists */ }
  }, [tenantId])

  const loadSummary = useCallback(async (signal?: AbortSignal) => {
    if (!tenantId) return
    try {
      const r = await api.get('/billing/summary', { signal })
      setSummary(r.data)
      setSubscription(r.data.subscription)
    } catch (e: any) { if (!isAbortError(e)) toast(e.response?.data?.message || 'Failed to load billing summary', 'danger') }
  }, [tenantId])

  const loadPlans = useCallback(async (signal?: AbortSignal) => {
    if (!tenantId) return
    try {
      const r = await api.get('/billing/plans', { signal })
      setPlans(r.data)
    } catch (e) { if (!isAbortError(e)) { /* non-critical */ } }
  }, [tenantId])

  const loadInvoices = useCallback(async (status?: string, signal?: AbortSignal) => {
    if (!tenantId) return
    try {
      const r = await api.get('/billing/invoices', { params: status ? { status } : {}, signal })
      setInvoices(r.data)
    } catch (e: any) { if (!isAbortError(e)) toast(e.response?.data?.message || 'Failed to load invoices', 'danger') }
  }, [tenantId])

  const loadPayments = useCallback(async (signal?: AbortSignal) => {
    if (!tenantId) return
    try {
      const r = await api.get('/billing/payments', { signal })
      setPayments(r.data)
    } catch (e: any) { if (!isAbortError(e)) toast(e.response?.data?.message || 'Failed to load payments', 'danger') }
  }, [tenantId])

  const loadUsage = useCallback(async (signal?: AbortSignal) => {
    if (!tenantId) return
    try {
      const r = await api.get('/billing/usage', { signal })
      setUsage(r.data)
    } catch (e) { if (!isAbortError(e)) { /* non-critical */ } }
  }, [tenantId])

  useEffect(() => {
    if (!tenantId) return
    const sig = getSignal()
    setLoading(true)
    initBilling().then(() =>
      Promise.all([loadSummary(sig), loadPlans(sig), loadInvoices(undefined, sig), loadPayments(sig), loadUsage(sig)])
    ).finally(() => setLoading(false))
  }, [tenantId])

  // ============ Actions ============
  const handleUpgrade = async () => {
    if (!upgradePlanCode) { toast('Please select a plan', 'warning'); return }
    setUpgradeSubmitting(true)
    try {
      await api.post('/billing/subscription', { plan_code: upgradePlanCode, billing_cycle: upgradeCycle })
      toast('Subscription updated successfully', 'success')
      setShowUpgradeModal(false)
      await Promise.all([loadSummary(), loadInvoices()])
    } catch (e: any) { toast(e.response?.data?.message || 'Failed to update subscription', 'danger') }
    finally { setUpgradeSubmitting(false) }
  }

  const handleCancel = async () => {
    if (!cancelReason.trim()) { toast('Please provide a cancellation reason', 'warning'); return }
    try {
      await api.put('/billing/subscription/cancel', { reason: cancelReason })
      toast('Subscription cancelled', 'info')
      setShowCancelModal(false)
      setCancelReason('')
      await loadSummary()
    } catch (e: any) { toast(e.response?.data?.message || 'Failed to cancel', 'danger') }
  }

  const handlePayInvoice = async (invoiceId: string) => {
    try {
      await api.put(`/billing/invoices/${invoiceId}/pay`, {})
      toast('Invoice marked as paid', 'success')
      await Promise.all([loadSummary(), loadInvoices()])
    } catch (e: any) { toast(e.response?.data?.message || 'Failed to pay invoice', 'danger') }
  }

  const handleViewInvoice = async (invoiceId: string) => {
    try {
      const r = await api.get(`/billing/invoices/${invoiceId}`)
      setSelectedInvoice(r.data)
      setShowInvoiceDetailModal(true)
    } catch (e: any) { toast('Failed to load invoice details', 'danger') }
  }

  const handleCreateInvoice = async () => {
    if (!invPeriodStart || !invPeriodEnd || !invDueDate) { toast('Please fill in all required fields', 'warning'); return }
    if (invItems.some(i => !i.description || i.unit_price <= 0)) { toast('Fill in all line items', 'warning'); return }
    setInvSubmitting(true)
    try {
      await api.post('/billing/invoices', {
        period_start: invPeriodStart, period_end: invPeriodEnd, due_date: invDueDate,
        tax_rate: parseFloat(invTaxRate) || 7, notes: invNotes || undefined,
        items: invItems
      })
      toast('Invoice created successfully', 'success')
      setShowCreateInvoiceModal(false)
      setInvItems([{ description: '', quantity: 1, unit_price: 0 }])
      setInvNotes(''); setInvPeriodStart(''); setInvPeriodEnd(''); setInvDueDate('')
      await Promise.all([loadSummary(), loadInvoices()])
    } catch (e: any) { toast(e.response?.data?.message || 'Failed to create invoice', 'danger') }
    finally { setInvSubmitting(false) }
  }

  const handleRecordPayment = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) { toast('Please enter a valid amount', 'warning'); return }
    setPaySubmitting(true)
    try {
      await api.post('/billing/payments', {
        invoice_id: payInvoiceId || undefined,
        payment_date: payDate, amount: parseFloat(payAmount),
        payment_method: payMethod,
        reference_number: payRef || undefined,
        notes: payNotes || undefined
      })
      toast('Payment recorded successfully', 'success')
      setShowPaymentModal(false)
      setPayAmount(''); setPayRef(''); setPayNotes(''); setPayInvoiceId('')
      await Promise.all([loadSummary(), loadPayments(), loadInvoices()])
    } catch (e: any) { toast(e.response?.data?.message || 'Failed to record payment', 'danger') }
    finally { setPaySubmitting(false) }
  }

  // ============ Computed ============
  const filteredInvoices = invoiceFilter ? invoices.filter(i => i.status === invoiceFilter) : invoices
  const currentPlan = plans.find(p => p.plan_code === subscription?.plan_code)
  const subDays = daysUntil(subscription?.trial_ends_at || subscription?.next_billing_date)
  const invSubtotal = invItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const invTax = invSubtotal * (parseFloat(invTaxRate) || 7) / 100

  return (
    <>
      <ToastContainer toasts={toasts} />

      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h3 className="mb-0 fw-bold text-primary">
            <i className="bi bi-credit-card-2-front me-2" />Billing & Subscription
          </h3>
          <small className="text-muted">Manage your subscription plan, invoices, and payment history</small>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary btn-sm" onClick={() =>
            Promise.all([loadSummary(), loadInvoices(), loadPayments(), loadUsage()])
          }>
            <i className="bi bi-arrow-clockwise me-1" />Refresh
          </button>
          {subscription?.status !== 'cancelled' && (
            <button className="btn btn-outline-danger btn-sm" onClick={() => setShowCancelModal(true)}>
              <i className="bi bi-x-circle me-1" />Cancel Plan
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => { setShowUpgradeModal(true); setUpgradePlanCode(subscription?.plan_code || '') }}>
            <i className="bi bi-arrow-up-circle me-1" />Change Plan
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="row g-3 mb-3">
        {[
          {
            label: 'Current Plan', icon: 'bi-star-fill', color: 'info',
            value: subscription ? <PlanBadge code={subscription.plan_code} /> : <span className="text-muted">—</span>,
            sub: subscription ? <StatusBadge status={subscription.status} /> : '',
            tab: 'overview' as const
          },
          {
            label: subscription?.status === 'trial' ? 'Trial Days Left' : 'Days Until Renewal',
            icon: 'bi-calendar3', color: subDays < 7 ? 'danger' : 'warning',
            value: subDays > 0 ? subDays : '—',
            sub: fmtDate(subscription?.trial_ends_at || subscription?.next_billing_date),
            tab: 'overview' as const
          },
          {
            label: 'Outstanding Balance', icon: 'bi-exclamation-circle', color: (summary?.outstandingAmount || 0) > 0 ? 'danger' : 'success',
            value: fmtMoney(summary?.outstandingAmount || 0),
            sub: `${summary?.overdueCount || 0} overdue`,
            tab: 'invoices' as const
          },
          {
            label: 'Paid YTD', icon: 'bi-check-circle', color: 'success',
            value: fmtMoney(summary?.totalPaidYtd || 0),
            sub: `${new Date().getFullYear()}`,
            tab: 'payments' as const
          },
          {
            label: 'Total Invoices', icon: 'bi-receipt', color: 'primary',
            value: summary?.totalInvoices ?? 0,
            sub: `${summary?.invoiceStats?.['pending']?.cnt || 0} pending`,
            tab: 'invoices' as const
          },
          {
            label: 'Monthly Fee', icon: 'bi-cash-coin', color: 'purple',
            value: fmtMoney(subscription?.amount),
            sub: subscription?.billing_cycle === 'annual' ? 'Annual billing' : 'Monthly billing',
            tab: 'overview' as const,
          },
        ].map((k, i) => (
          <div key={i} className="col-6 col-md-4 col-lg-2" style={{ cursor: 'pointer' }} onClick={() => setTab(k.tab)}>
            <div className="card h-100 border-0 shadow-sm" style={k.color === 'purple' ? { borderTop: '3px solid #6f42c1' } : { borderTop: `3px solid var(--bs-${k.color})` }}>
              <div className="card-body p-3">
                <div className="d-flex justify-content-between align-items-start mb-1">
                  <small className="text-muted text-uppercase fw-semibold" style={{ fontSize: '0.65rem', letterSpacing: 1 }}>{k.label}</small>
                  <i className={`bi ${k.icon} text-${k.color === 'purple' ? '' : k.color}`}
                    style={k.color === 'purple' ? { color: '#6f42c1', fontSize: '1rem' } : { fontSize: '1rem' }} />
                </div>
                <div className="fw-bold" style={{ fontSize: '1.1rem' }}>{loading ? <span className="placeholder col-6" /> : k.value}</div>
                <small className="text-muted">{k.sub}</small>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        {[
          { key: 'overview', label: 'Overview', icon: 'bi-house' },
          { key: 'invoices', label: 'Invoices', icon: 'bi-receipt' },
          { key: 'payments', label: 'Payment History', icon: 'bi-wallet2' },
          { key: 'usage', label: 'Usage & Limits', icon: 'bi-bar-chart' },
        ].map(t => (
          <li key={t.key} className="nav-item">
            <button className={`nav-link ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key as any)}>
              <i className={`bi ${t.icon} me-1`} />{t.label}
              {t.key === 'invoices' && (summary?.overdueCount || 0) > 0 && (
                <span className="badge bg-danger ms-1">{summary?.overdueCount}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {/* ====== OVERVIEW TAB ====== */}
      {tab === 'overview' && (
        <div className="row g-3">
          {/* Current Plan Card */}
          <div className="col-lg-5">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-header bg-transparent fw-semibold">
                <i className="bi bi-star me-2" />Current Subscription
              </div>
              <div className="card-body">
                {!subscription ? (
                  <div className="text-center text-muted py-4">
                    <i className="bi bi-credit-card d-block mb-2" style={{ fontSize: '2rem' }} />
                    <p>No active subscription</p>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowUpgradeModal(true)}>
                      <i className="bi bi-plus me-1" />Subscribe Now
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="d-flex align-items-center gap-3 mb-3">
                      <div className="display-6">
                        {subscription.plan_code === 'free_trial' && '🆓'}
                        {subscription.plan_code === 'starter' && '🚀'}
                        {subscription.plan_code === 'professional' && '💼'}
                        {subscription.plan_code === 'enterprise' && '🏢'}
                      </div>
                      <div>
                        <h5 className="mb-0">{subscription.plan_name} <PlanBadge code={subscription.plan_code} /></h5>
                        <div><StatusBadge status={subscription.status} /></div>
                      </div>
                      <div className="ms-auto text-end">
                        <div className="fw-bold fs-5 text-primary">{fmtMoney(subscription.amount)}</div>
                        <small className="text-muted">/{subscription.billing_cycle === 'annual' ? 'yr' : 'mo'}</small>
                      </div>
                    </div>
                    <table className="table table-sm table-borderless mb-0">
                      <tbody>
                        <tr><td className="text-muted ps-0">Billing Cycle</td><td className="fw-medium text-capitalize">{subscription.billing_cycle}</td></tr>
                        <tr><td className="text-muted ps-0">Period Start</td><td className="fw-medium">{fmtDate(subscription.current_period_start)}</td></tr>
                        <tr><td className="text-muted ps-0">Period End</td><td className="fw-medium">{fmtDate(subscription.current_period_end)}</td></tr>
                        {subscription.trial_ends_at && (
                          <tr><td className="text-muted ps-0">Trial Ends</td>
                            <td className="fw-medium text-warning">{fmtDate(subscription.trial_ends_at)} ({subDays}d left)</td></tr>
                        )}
                        {subscription.next_billing_date && (
                          <tr><td className="text-muted ps-0">Next Billing</td><td className="fw-medium">{fmtDate(subscription.next_billing_date)}</td></tr>
                        )}
                        {subscription.cancelled_at && (
                          <tr><td className="text-muted ps-0">Cancelled</td><td className="text-danger">{fmtDate(subscription.cancelled_at)}</td></tr>
                        )}
                        {subscription.cancel_reason && (
                          <tr><td className="text-muted ps-0">Reason</td><td className="text-muted small">{subscription.cancel_reason}</td></tr>
                        )}
                      </tbody>
                    </table>
                    {currentPlan && (
                      <>
                        <hr className="my-2" />
                        <p className="small text-muted mb-1 fw-semibold">Plan Includes:</p>
                        <ul className="list-unstyled mb-0 small">
                          {(Array.isArray(currentPlan.features) ? currentPlan.features : []).map((f, i) => (
                            <li key={i}><i className="bi bi-check-circle-fill text-success me-1" style={{ fontSize: '0.75rem' }} />{f}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Plan Comparison */}
          <div className="col-lg-7">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-header bg-transparent fw-semibold d-flex justify-content-between align-items-center">
                <span><i className="bi bi-grid me-2" />Available Plans</span>
              </div>
              <div className="card-body p-2">
                <div className="row g-2">
                  {plans.map(plan => {
                    const isCurrent = subscription?.plan_code === plan.plan_code
                    const colorMap: Record<string, string> = {
                      free_trial: '#6c757d', starter: '#0d6efd',
                      professional: '#6f42c1', enterprise: '#fd7e14'
                    }
                    const clr = colorMap[plan.plan_code] || '#0d6efd'
                    return (
                      <div key={plan.plan_code} className="col-6">
                        <div className={`card h-100 ${isCurrent ? 'border-primary' : 'border-0'} shadow-sm`}
                          style={{ borderTop: `3px solid ${clr}` }}>
                          <div className="card-body p-2">
                            <div className="d-flex justify-content-between align-items-start mb-1">
                              <div>
                                <div className="fw-semibold small">{plan.plan_name}</div>
                                {isCurrent && <span className="badge" style={{ fontSize: '0.6rem', backgroundColor: clr }}>Current</span>}
                              </div>
                              <div className="text-end">
                                <div className="fw-bold small" style={{ color: clr }}>
                                  {plan.price_monthly === 0 ? 'Free' : `฿${plan.price_monthly.toLocaleString()}/mo`}
                                </div>
                                {plan.price_annual > 0 && (
                                  <div style={{ fontSize: '0.6rem', color: '#888' }}>฿{plan.price_annual.toLocaleString()}/yr</div>
                                )}
                              </div>
                            </div>
                            <p className="text-muted mb-1" style={{ fontSize: '0.7rem' }}>{plan.description}</p>
                            <div style={{ fontSize: '0.7rem' }} className="text-muted">
                              <span><i className="bi bi-people me-1" />{plan.max_users ?? '∞'} users</span>
                              <span className="ms-2"><i className="bi bi-hdd me-1" />{plan.max_storage_gb ?? '∞'} GB</span>
                            </div>
                            {!isCurrent && (
                              <button className="btn btn-sm w-100 mt-2" style={{ backgroundColor: clr, color: '#fff', fontSize: '0.7rem' }}
                                onClick={() => { setUpgradePlanCode(plan.plan_code); setShowUpgradeModal(true) }}>
                                {subscription?.amount != null && plan.price_monthly > subscription.amount ? 'Upgrade' : 'Switch'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="col-12">
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold">
                <i className="bi bi-lightning me-2" />Quick Actions
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-3">
                    <button className="btn btn-outline-primary w-100" onClick={() => { setTab('invoices'); setShowCreateInvoiceModal(true) }}>
                      <i className="bi bi-plus-circle d-block mb-1" style={{ fontSize: '1.5rem' }} />
                      <span className="small">Create Invoice</span>
                    </button>
                  </div>
                  <div className="col-md-3">
                    <button className="btn btn-outline-success w-100" onClick={() => { setTab('payments'); setShowPaymentModal(true) }}>
                      <i className="bi bi-wallet-fill d-block mb-1" style={{ fontSize: '1.5rem' }} />
                      <span className="small">Record Payment</span>
                    </button>
                  </div>
                  <div className="col-md-3">
                    <button className="btn btn-outline-info w-100" onClick={() => setTab('usage')}>
                      <i className="bi bi-graph-up d-block mb-1" style={{ fontSize: '1.5rem' }} />
                      <span className="small">View Usage</span>
                    </button>
                  </div>
                  <div className="col-md-3">
                    <button className="btn btn-outline-warning w-100" onClick={() => { setShowUpgradeModal(true) }}>
                      <i className="bi bi-arrow-up-circle d-block mb-1" style={{ fontSize: '1.5rem' }} />
                      <span className="small">Upgrade Plan</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== INVOICES TAB ====== */}
      {tab === 'invoices' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-transparent d-flex justify-content-between align-items-center">
            <span className="fw-semibold"><i className="bi bi-receipt me-2" />Invoices</span>
            <div className="d-flex gap-2">
              <select className="form-select form-select-sm" style={{ width: 140 }}
                value={invoiceFilter} onChange={e => setInvoiceFilter(e.target.value)}>
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="draft">Draft</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={() => setShowCreateInvoiceModal(true)}>
                <i className="bi bi-plus me-1" />New Invoice
              </button>
            </div>
          </div>
          <div className="card-body p-0">
            {filteredInvoices.length === 0 ? (
              <div className="text-center text-muted py-5">
                <i className="bi bi-receipt d-block mb-2" style={{ fontSize: '2.5rem' }} />
                <p className="mb-1">No invoices found</p>
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreateInvoiceModal(true)}>
                  <i className="bi bi-plus me-1" />Create First Invoice
                </button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Invoice #</th>
                      <th>Period</th>
                      <th>Due Date</th>
                      <th className="text-end">Subtotal</th>
                      <th className="text-end">VAT 7%</th>
                      <th className="text-end">Total</th>
                      <th>Status</th>
                      <th>Paid Date</th>
                      <th className="text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map(inv => (
                      <tr key={inv.id} className={inv.status === 'overdue' ? 'table-danger' : ''}>
                        <td>
                          <button className="btn btn-link btn-sm p-0 text-primary" onClick={() => handleViewInvoice(inv.id)}>
                            {inv.invoice_number}
                          </button>
                        </td>
                        <td className="small">{fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}</td>
                        <td className={`small ${inv.status === 'overdue' ? 'text-danger fw-semibold' : ''}`}>{fmtDate(inv.due_date)}</td>
                        <td className="text-end small">{fmtMoney(inv.subtotal)}</td>
                        <td className="text-end small">{fmtMoney(inv.tax_amount)}</td>
                        <td className="text-end fw-semibold">{fmtMoney(inv.total_amount)}</td>
                        <td><StatusBadge status={inv.status} /></td>
                        <td className="small text-muted">{fmtDate(inv.paid_at)}</td>
                        <td className="text-center">
                          <div className="d-flex gap-1 justify-content-center">
                            <button className="btn btn-outline-secondary btn-sm py-0 px-1" title="View" onClick={() => handleViewInvoice(inv.id)}>
                              <i className="bi bi-eye" />
                            </button>
                            {(inv.status === 'pending' || inv.status === 'overdue') && (
                              <>
                                <button className="btn btn-success btn-sm py-0 px-1" title="Mark Paid" onClick={() => handlePayInvoice(inv.id)}>
                                  <i className="bi bi-check-lg" />
                                </button>
                                <button className="btn btn-outline-primary btn-sm py-0 px-1" title="Record Payment"
                                  onClick={() => { setPayInvoiceId(inv.id); setPayAmount(String(inv.total_amount)); setShowPaymentModal(true) }}>
                                  <i className="bi bi-wallet2" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="table-light">
                    <tr>
                      <td colSpan={5} className="text-end fw-semibold">Total Outstanding:</td>
                      <td className="text-end fw-bold text-danger">
                        {fmtMoney(filteredInvoices.filter(i => i.status === 'pending' || i.status === 'overdue').reduce((s, i) => s + i.total_amount, 0))}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====== PAYMENTS TAB ====== */}
      {tab === 'payments' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-transparent d-flex justify-content-between align-items-center">
            <span className="fw-semibold"><i className="bi bi-wallet2 me-2" />Payment History</span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowPaymentModal(true)}>
              <i className="bi bi-plus me-1" />Record Payment
            </button>
          </div>
          <div className="card-body p-0">
            {payments.length === 0 ? (
              <div className="text-center text-muted py-5">
                <i className="bi bi-wallet d-block mb-2" style={{ fontSize: '2.5rem' }} />
                <p className="mb-1">No payment records yet</p>
                <button className="btn btn-primary btn-sm" onClick={() => setShowPaymentModal(true)}>
                  <i className="bi bi-plus me-1" />Record First Payment
                </button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Date</th>
                      <th>Invoice</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th className="text-end">Amount</th>
                      <th>Status</th>
                      <th>Recorded By</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id}>
                        <td className="small">{fmtDate(p.payment_date)}</td>
                        <td className="small text-muted">{p.invoice_number || '-'}</td>
                        <td>
                          <span className="badge bg-light text-dark border">
                            {{
                              bank_transfer: '🏦 Bank Transfer',
                              credit_card: '💳 Credit Card',
                              cash: '💵 Cash',
                              cheque: '📝 Cheque',
                              promptpay: '📱 PromptPay',
                            }[p.payment_method] || p.payment_method}
                          </span>
                        </td>
                        <td className="small font-monospace text-muted">{p.reference_number || '-'}</td>
                        <td className="text-end fw-semibold">{fmtMoney(p.amount)}</td>
                        <td><StatusBadge status={p.status} /></td>
                        <td className="small text-muted">{p.created_by}</td>
                        <td className="small text-muted">{p.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="table-light">
                    <tr>
                      <td colSpan={4} className="text-end fw-semibold">Total Paid (YTD):</td>
                      <td className="text-end fw-bold text-success">
                        {fmtMoney(payments.filter(p => p.status === 'completed' &&
                          new Date(p.payment_date).getFullYear() === new Date().getFullYear()
                        ).reduce((s, p) => s + p.amount, 0))}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====== USAGE & LIMITS TAB ====== */}
      {tab === 'usage' && (
        <div className="row g-3">
          <div className="col-lg-8">
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold d-flex justify-content-between align-items-center">
                <span><i className="bi bi-bar-chart me-2" />Current Month Usage</span>
                <small className="text-muted">
                  {usage ? `${usage.period_year}/${String(usage.period_month).padStart(2, '0')}` : new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })}
                </small>
              </div>
              <div className="card-body">
                {[
                  {
                    label: 'Users', icon: 'bi-people', used: usage?.users_count ?? 0,
                    max: currentPlan?.max_users ?? null, unit: 'users', color: 'primary'
                  },
                  {
                    label: 'Storage', icon: 'bi-hdd', used: usage?.storage_used_gb ?? 0,
                    max: currentPlan?.max_storage_gb ?? null, unit: 'GB', color: 'info'
                  },
                  {
                    label: 'API Calls Today', icon: 'bi-arrow-repeat', used: usage?.api_calls_count ?? 0,
                    max: currentPlan?.max_api_calls_day ?? null, unit: 'calls', color: 'success'
                  },
                  {
                    label: 'Reports Generated', icon: 'bi-file-earmark-bar-graph', used: usage?.reports_generated ?? 0,
                    max: null, unit: 'reports', color: 'warning'
                  },
                  {
                    label: 'ETL Imports', icon: 'bi-cloud-upload', used: usage?.etl_imports ?? 0,
                    max: null, unit: 'imports', color: 'secondary'
                  },
                  {
                    label: 'Scenarios Created', icon: 'bi-diagram-3', used: usage?.scenarios_created ?? 0,
                    max: null, unit: 'scenarios', color: 'purple'
                  },
                ].map((item, i) => {
                  const pct = item.max ? Math.min(100, Math.round((item.used / item.max) * 100)) : null
                  const barColor = pct != null ? (pct > 90 ? 'danger' : pct > 70 ? 'warning' : item.color) : item.color
                  return (
                    <div key={i} className="mb-3">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="small fw-medium">
                          <i className={`bi ${item.icon} me-1`} style={item.color === 'purple' ? { color: '#6f42c1' } : {}} />
                          {item.label}
                        </span>
                        <div className="text-end">
                          <span className="fw-semibold">{item.used.toLocaleString()} {item.unit}</span>
                          {item.max != null && <span className="text-muted small"> / {item.max.toLocaleString()} {item.unit}</span>}
                          {item.max == null && <span className="badge bg-light text-success border ms-2 small"><i className="bi bi-infinity me-1" />Unlimited</span>}
                        </div>
                      </div>
                      {item.max != null && pct != null ? (
                        <div className="progress" style={{ height: 8 }}>
                          <div className={`progress-bar bg-${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                      ) : (
                        <div className="progress bg-light" style={{ height: 8 }}>
                          <div className="progress-bar" style={{ width: '100%', backgroundColor: item.color === 'purple' ? '#6f42c1' : undefined }} />
                        </div>
                      )}
                      {pct != null && pct > 80 && (
                        <small className="text-danger"><i className="bi bi-exclamation-triangle me-1" />{pct}% used — consider upgrading your plan</small>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="col-lg-4">
            <div className="card border-0 shadow-sm mb-3">
              <div className="card-header bg-transparent fw-semibold"><i className="bi bi-shield-check me-2" />Plan Limits</div>
              <div className="card-body p-0">
                <table className="table table-sm mb-0">
                  <tbody>
                    {[
                      ['Users', currentPlan?.max_users != null ? currentPlan.max_users : '∞'],
                      ['Storage', currentPlan?.max_storage_gb != null ? `${currentPlan.max_storage_gb} GB` : '∞'],
                      ['API Calls/Day', currentPlan?.max_api_calls_day != null ? currentPlan.max_api_calls_day.toLocaleString() : '∞'],
                      ['Scenarios', '∞'],
                      ['Reports', '∞'],
                      ['ETL Imports', '∞'],
                    ].map(([label, val], i) => (
                      <tr key={i}>
                        <td className="text-muted small ps-3">{label}</td>
                        <td className="fw-medium small text-end pe-3">
                          {val === '∞' ? <span className="text-success"><i className="bi bi-infinity" /></span> : val}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold"><i className="bi bi-clock-history me-2" />Usage History</div>
              <div className="card-body">
                <p className="text-muted small">Peak usage this period:</p>
                <div className="d-flex justify-content-between small">
                  <span className="text-muted"><i className="bi bi-people me-1" />Active Users</span>
                  <span className="fw-bold">{usage?.users_count ?? 0}</span>
                </div>
                <div className="d-flex justify-content-between small mt-1">
                  <span className="text-muted"><i className="bi bi-file-earmark me-1" />Reports</span>
                  <span className="fw-bold">{usage?.reports_generated ?? 0}</span>
                </div>
                <div className="d-flex justify-content-between small mt-1">
                  <span className="text-muted"><i className="bi bi-cloud-upload me-1" />ETL Imports</span>
                  <span className="fw-bold">{usage?.etl_imports ?? 0}</span>
                </div>
                <div className="d-flex justify-content-between small mt-1">
                  <span className="text-muted"><i className="bi bi-diagram-3 me-1" />Scenarios</span>
                  <span className="fw-bold">{usage?.scenarios_created ?? 0}</span>
                </div>
                {subscription?.status === 'trial' && (
                  <div className="alert alert-warning p-2 mt-2 mb-0 small">
                    <i className="bi bi-exclamation-triangle me-1" />
                    Trial ends in <strong>{subDays}</strong> days. Upgrade to continue using all features.
                    <button className="btn btn-warning btn-sm d-block w-100 mt-1" onClick={() => setShowUpgradeModal(true)}>Upgrade Now</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== MODALS ====== */}

      {/* Upgrade/Change Plan Modal */}
      {showUpgradeModal && ReactDOM.createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={e => { if (e.target === e.currentTarget) setShowUpgradeModal(false) }}>
          <div style={{ width: '100%', maxWidth: 800, maxHeight: '92vh', display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
            <div style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div className="d-flex align-items-center gap-2">
                <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  <i className="bi bi-arrow-up-circle text-white" />
                </div>
                <div>
                  <div className="fw-bold text-white" style={{ fontSize: '1rem', lineHeight: 1.2 }}>Change Subscription Plan</div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem' }}>Select a plan and billing cycle</div>
                </div>
              </div>
              <button className="btn-close btn-close-white" onClick={() => setShowUpgradeModal(false)} />
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, padding: '1.5rem' }}>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Select Plan</label>
                  <div className="row g-2">
                    {plans.map(plan => {
                      const colorMap: Record<string, string> = {
                        free_trial: '#6c757d', starter: '#0d6efd', professional: '#6f42c1', enterprise: '#fd7e14'
                      }
                      const clr = colorMap[plan.plan_code] || '#0d6efd'
                      const isSelected = upgradePlanCode === plan.plan_code
                      return (
                        <div key={plan.plan_code} className="col-6 col-md-3">
                          <div className={`card h-100 cursor-pointer ${isSelected ? 'border-2' : 'border-1'}`}
                            style={{ borderColor: isSelected ? clr : '#dee2e6', cursor: 'pointer', borderTop: `3px solid ${clr}` }}
                            onClick={() => setUpgradePlanCode(plan.plan_code)}>
                            <div className="card-body p-2 text-center">
                              <div style={{ fontSize: '1.5rem' }}>
                                {plan.plan_code === 'free_trial' && '🆓'}
                                {plan.plan_code === 'starter' && '🚀'}
                                {plan.plan_code === 'professional' && '💼'}
                                {plan.plan_code === 'enterprise' && '🏢'}
                              </div>
                              <div className="fw-semibold small">{plan.plan_name}</div>
                              <div className="fw-bold" style={{ color: clr, fontSize: '0.85rem' }}>
                                {plan.price_monthly === 0 ? 'Free' : `฿${plan.price_monthly.toLocaleString()}/mo`}
                              </div>
                              {isSelected && <i className="bi bi-check-circle-fill text-success mt-1 d-block" />}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Billing Cycle</label>
                  <div className="d-flex gap-3">
                    {(['monthly', 'annual'] as const).map(cycle => {
                      const selectedPlan = plans.find(p => p.plan_code === upgradePlanCode)
                      const price = cycle === 'annual' ? selectedPlan?.price_annual : selectedPlan?.price_monthly
                      return (
                        <div key={cycle} className={`card flex-fill cursor-pointer ${upgradeCycle === cycle ? 'border-primary border-2' : ''}`}
                          style={{ cursor: 'pointer' }} onClick={() => setUpgradeCycle(cycle)}>
                          <div className="card-body p-2 text-center">
                            <div className="fw-semibold text-capitalize small">{cycle}</div>
                            <div className="fw-bold">{price != null ? fmtMoney(price) : '-'}</div>
                            {cycle === 'annual' && <span className="badge bg-success small">Save ~17%</span>}
                            {upgradeCycle === cycle && <i className="bi bi-check-circle-fill text-primary d-block mt-1" />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                {upgradePlanCode && (
                  <div className="alert alert-info py-2">
                    <i className="bi bi-info-circle me-2" />
                    Switching to <strong>{plans.find(p => p.plan_code === upgradePlanCode)?.plan_name}</strong>
                    {' '}({upgradeCycle}) for <strong>{fmtMoney(upgradeCycle === 'annual'
                      ? plans.find(p => p.plan_code === upgradePlanCode)?.price_annual
                      : plans.find(p => p.plan_code === upgradePlanCode)?.price_monthly)}</strong>
                  </div>
                )}
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid #e9ecef', background: '#f8f9fa', padding: '0.875rem 1.5rem' }}>
                <button className="btn btn-outline-secondary" onClick={() => setShowUpgradeModal(false)}><i className="bi bi-x-lg me-1" />Cancel</button>
                <button className="btn btn-primary" onClick={handleUpgrade} disabled={upgradeSubmitting || !upgradePlanCode}>
                  {upgradeSubmitting ? <><span className="spinner-border spinner-border-sm me-1" />Processing…</> : <><i className="bi bi-check-circle me-1" />Confirm Change</>}
                </button>
              </div>
            </div>
        </div>, document.body
      )}

      {/* Cancel Subscription Modal */}
      {showCancelModal && ReactDOM.createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={e => { if (e.target === e.currentTarget) setShowCancelModal(false) }}>
          <div style={{ width: '100%', maxWidth: 540, maxHeight: '92vh', display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
            <div style={{ background: 'linear-gradient(135deg,#dc3545,#a71d2a)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div className="d-flex align-items-center gap-2">
                <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  <i className="bi bi-x-circle text-white" />
                </div>
                <div>
                  <div className="fw-bold text-white" style={{ fontSize: '1rem', lineHeight: 1.2 }}>Cancel Subscription</div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem' }}>Your access continues until the end of current period</div>
                </div>
              </div>
              <button className="btn-close btn-close-white" onClick={() => setShowCancelModal(false)} />
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, padding: '1.5rem' }}>
                <div className="alert alert-warning"><i className="bi bi-exclamation-triangle me-2" />
                  This will cancel your current subscription. You will retain access until the end of the current period.
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Reason for cancellation <span className="text-danger">*</span></label>
                  <textarea className="form-control" rows={3} placeholder="Please tell us why you're cancelling…"
                    value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid #e9ecef', background: '#f8f9fa', padding: '0.875rem 1.5rem' }}>
                <button className="btn btn-outline-secondary" onClick={() => setShowCancelModal(false)}>Keep Subscription</button>
                <button className="btn btn-danger" onClick={handleCancel} disabled={!cancelReason.trim()}>
                  <i className="bi bi-x-circle me-1" />Confirm Cancellation
                </button>
              </div>
            </div>
        </div>, document.body
      )}

      {/* Create Invoice Modal */}
      {showCreateInvoiceModal && ReactDOM.createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={e => { if (e.target === e.currentTarget) setShowCreateInvoiceModal(false) }}>
          <div style={{ width: '100%', maxWidth: 800, maxHeight: '92vh', display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
            <div style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div className="d-flex align-items-center gap-2">
                <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  <i className="bi bi-receipt text-white" />
                </div>
                <div>
                  <div className="fw-bold text-white" style={{ fontSize: '1rem', lineHeight: 1.2 }}>Create Invoice</div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem' }}>Set billing period, line items and tax rate</div>
                </div>
              </div>
              <button className="btn-close btn-close-white" onClick={() => setShowCreateInvoiceModal(false)} />
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, padding: '1.5rem' }}>
                <div className="row g-3 mb-3">
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">Period Start <span className="text-danger">*</span></label>
                    <input type="date" className="form-control" value={invPeriodStart} onChange={e => setInvPeriodStart(e.target.value)} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">Period End <span className="text-danger">*</span></label>
                    <input type="date" className="form-control" value={invPeriodEnd} onChange={e => setInvPeriodEnd(e.target.value)} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">Due Date <span className="text-danger">*</span></label>
                    <input type="date" className="form-control" value={invDueDate} onChange={e => setInvDueDate(e.target.value)} />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Line Items</label>
                  {invItems.map((item, idx) => (
                    <div key={idx} className="row g-2 mb-2 align-items-end">
                      <div className="col-md-5">
                        <input className="form-control form-control-sm" placeholder="Description" value={item.description}
                          onChange={e => { const n = [...invItems]; n[idx].description = e.target.value; setInvItems(n) }} />
                      </div>
                      <div className="col-md-2">
                        <input type="number" min="0.01" step="0.01" className="form-control form-control-sm" placeholder="Qty" value={item.quantity}
                          onChange={e => { const n = [...invItems]; n[idx].quantity = parseFloat(e.target.value) || 1; setInvItems(n) }} />
                      </div>
                      <div className="col-md-3">
                        <input type="number" min="0" className="form-control form-control-sm" placeholder="Unit Price (THB)" value={item.unit_price}
                          onChange={e => { const n = [...invItems]; n[idx].unit_price = parseFloat(e.target.value) || 0; setInvItems(n) }} />
                      </div>
                      <div className="col-md-1 text-end">
                        <small className="fw-semibold">{fmtMoney(item.quantity * item.unit_price)}</small>
                      </div>
                      <div className="col-md-1">
                        {invItems.length > 1 && (
                          <button className="btn btn-outline-danger btn-sm" onClick={() => setInvItems(invItems.filter((_, i) => i !== idx))}>
                            <i className="bi bi-trash" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setInvItems([...invItems, { description: '', quantity: 1, unit_price: 0 }])}>
                    <i className="bi bi-plus me-1" />Add Line Item
                  </button>
                </div>
                <div className="row g-3">
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">VAT Rate (%)</label>
                    <input type="number" min="0" max="100" className="form-control" value={invTaxRate} onChange={e => setInvTaxRate(e.target.value)} />
                  </div>
                  <div className="col-md-8">
                    <label className="form-label fw-semibold">Notes</label>
                    <input className="form-control" placeholder="Optional notes" value={invNotes} onChange={e => setInvNotes(e.target.value)} />
                  </div>
                </div>
                <div className="card bg-light mt-3">
                  <div className="card-body py-2">
                    <div className="d-flex justify-content-between">
                      <span>Subtotal:</span><span className="fw-semibold">{fmtMoney(invSubtotal)}</span>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span>VAT {invTaxRate}%:</span><span>{fmtMoney(invTax)}</span>
                    </div>
                    <hr className="my-1" />
                    <div className="d-flex justify-content-between fw-bold">
                      <span>Total:</span><span className="text-primary">{fmtMoney(invSubtotal + invTax)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid #e9ecef', background: '#f8f9fa', padding: '0.875rem 1.5rem' }}>
                <button className="btn btn-outline-secondary" onClick={() => setShowCreateInvoiceModal(false)}><i className="bi bi-x-lg me-1" />Cancel</button>
                <button className="btn btn-primary" onClick={handleCreateInvoice} disabled={invSubmitting}>
                  {invSubmitting ? <><span className="spinner-border spinner-border-sm me-1" />Creating…</> : <><i className="bi bi-save me-1" />Create Invoice</>}
                </button>
              </div>
            </div>
        </div>, document.body
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && ReactDOM.createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={e => { if (e.target === e.currentTarget) setShowPaymentModal(false) }}>
          <div style={{ width: '100%', maxWidth: 540, maxHeight: '92vh', display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
            <div style={{ background: 'linear-gradient(135deg,#198754,#0f5132)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div className="d-flex align-items-center gap-2">
                <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  <i className="bi bi-wallet2 text-white" />
                </div>
                <div>
                  <div className="fw-bold text-white" style={{ fontSize: '1rem', lineHeight: 1.2 }}>Record Payment</div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem' }}>Log a payment against an invoice</div>
                </div>
              </div>
              <button className="btn-close btn-close-white" onClick={() => setShowPaymentModal(false)} />
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, padding: '1.5rem' }}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Invoice (Optional)</label>
                    <select className="form-select" value={payInvoiceId} onChange={e => {
                      setPayInvoiceId(e.target.value)
                      const inv = invoices.find(i => i.id === e.target.value)
                      if (inv) setPayAmount(String(inv.total_amount))
                    }}>
                      <option value="">— No Invoice —</option>
                      {invoices.filter(i => i.status === 'pending' || i.status === 'overdue').map(i => (
                        <option key={i.id} value={i.id}>{i.invoice_number} – {fmtMoney(i.total_amount)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Payment Date <span className="text-danger">*</span></label>
                    <input type="date" className="form-control" value={payDate} onChange={e => setPayDate(e.target.value)} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Amount (THB) <span className="text-danger">*</span></label>
                    <input type="number" min="0" className="form-control" placeholder="0.00" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Payment Method</label>
                    <select className="form-select" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                      <option value="bank_transfer">🏦 Bank Transfer</option>
                      <option value="credit_card">💳 Credit Card</option>
                      <option value="cash">💵 Cash</option>
                      <option value="cheque">📝 Cheque</option>
                      <option value="promptpay">📱 PromptPay</option>
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-semibold">Reference Number</label>
                    <input className="form-control" placeholder="Transaction ID / Cheque No. / etc." value={payRef} onChange={e => setPayRef(e.target.value)} />
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-semibold">Notes</label>
                    <textarea className="form-control" rows={2} placeholder="Optional notes" value={payNotes} onChange={e => setPayNotes(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid #e9ecef', background: '#f8f9fa', padding: '0.875rem 1.5rem' }}>
                <button className="btn btn-outline-secondary" onClick={() => setShowPaymentModal(false)}><i className="bi bi-x-lg me-1" />Cancel</button>
                <button className="btn btn-success" onClick={handleRecordPayment} disabled={paySubmitting}>
                  {paySubmitting ? <><span className="spinner-border spinner-border-sm me-1" />Recording…</> : <><i className="bi bi-save me-1" />Record Payment</>}
                </button>
              </div>
            </div>
        </div>, document.body
      )}

      {/* Invoice Detail Modal */}
      {showInvoiceDetailModal && selectedInvoice && ReactDOM.createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={e => { if (e.target === e.currentTarget) setShowInvoiceDetailModal(false) }}>
          <div style={{ width: '100%', maxWidth: 800, maxHeight: '92vh', display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
            <div style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div className="d-flex align-items-center gap-2">
                <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  <i className="bi bi-file-text text-white" />
                </div>
                <div>
                  <div className="fw-bold text-white" style={{ fontSize: '1rem', lineHeight: 1.2 }}>Invoice {selectedInvoice.invoice.invoice_number}</div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem' }}>Invoice details and line items</div>
                </div>
              </div>
              <button className="btn-close btn-close-white" onClick={() => setShowInvoiceDetailModal(false)} />
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, padding: '1.5rem' }}>
                <div className="row mb-3">
                  <div className="col-md-6">
                    <table className="table table-sm table-borderless mb-0">
                      <tbody>
                        <tr><td className="text-muted ps-0">Period</td><td>{fmtDate(selectedInvoice.invoice.period_start)} – {fmtDate(selectedInvoice.invoice.period_end)}</td></tr>
                        <tr><td className="text-muted ps-0">Due Date</td><td>{fmtDate(selectedInvoice.invoice.due_date)}</td></tr>
                        <tr><td className="text-muted ps-0">Status</td><td><StatusBadge status={selectedInvoice.invoice.status} /></td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="col-md-6 text-md-end">
                    {selectedInvoice.invoice.paid_at && (
                      <div className="text-success small"><i className="bi bi-check-circle me-1" />Paid on {fmtDate(selectedInvoice.invoice.paid_at)}</div>
                    )}
                  </div>
                </div>
                <table className="table table-bordered">
                  <thead className="table-light">
                    <tr><th>Description</th><th className="text-center">Qty</th><th className="text-end">Unit Price</th><th className="text-end">Amount</th></tr>
                  </thead>
                  <tbody>
                    {selectedInvoice.items.map((item: any) => (
                      <tr key={item.id}>
                        <td>{item.description}</td>
                        <td className="text-center">{item.quantity}</td>
                        <td className="text-end">{fmtMoney(item.unit_price)}</td>
                        <td className="text-end fw-semibold">{fmtMoney(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={3} className="text-end">Subtotal</td><td className="text-end">{fmtMoney(selectedInvoice.invoice.subtotal)}</td></tr>
                    <tr><td colSpan={3} className="text-end">VAT {selectedInvoice.invoice.tax_rate}%</td><td className="text-end">{fmtMoney(selectedInvoice.invoice.tax_amount)}</td></tr>
                    <tr className="table-primary"><td colSpan={3} className="text-end fw-bold">Total</td><td className="text-end fw-bold">{fmtMoney(selectedInvoice.invoice.total_amount)}</td></tr>
                  </tfoot>
                </table>
                {selectedInvoice.invoice.notes && (
                  <div className="alert alert-light py-2"><small><i className="bi bi-info-circle me-1" />{selectedInvoice.invoice.notes}</small></div>
                )}
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid #e9ecef', background: '#f8f9fa', padding: '0.875rem 1.5rem' }}>
                <button className="btn btn-outline-secondary" onClick={() => setShowInvoiceDetailModal(false)}>Close</button>
                {(selectedInvoice.invoice.status === 'pending' || selectedInvoice.invoice.status === 'overdue') && (
                  <button className="btn btn-success" onClick={() => { handlePayInvoice(selectedInvoice.invoice.id); setShowInvoiceDetailModal(false) }}>
                    <i className="bi bi-check-lg me-1" />Mark as Paid
                  </button>
                )}
              </div>
            </div>
        </div>, document.body
      )}
    </>
  )
}
