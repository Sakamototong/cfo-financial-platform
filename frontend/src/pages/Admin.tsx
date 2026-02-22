import React, { useState, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useTenant } from '../components/TenantContext'
import { useUser } from '../components/UserContext'
import api from '../api/client'
import { useAbortController, isAbortError } from '../hooks/useApi'

// ── Interfaces ────────────────────────────────────────────────────────────────
interface SystemConfig {
  id?: string
  tenant_id?: string
  config_key: string
  config_value: any
  description?: string
  is_system: boolean
  updated_by?: string
  created_at?: string
  updated_at?: string
}
interface EtlParameter {
  id?: string
  tenant_id?: string
  parameter_name: string
  parameter_type: 'fx_rate' | 'inflation_rate' | 'custom'
  currency_pair?: string
  value: number
  effective_date: string
  created_by?: string
  created_at?: string
}
interface TenantApproval {
  id?: string
  tenant_id: string
  tenant_name: string
  requested_by: string
  request_date: string
  status: 'pending' | 'approved' | 'rejected'
  approved_by?: string
  approval_date?: string
  rejection_reason?: string
}
interface AuditLog {
  id?: string
  tenant_id?: string
  user_email: string
  action: string
  resource_type: string
  resource_id?: string
  changes?: any
  ip_address?: string
  timestamp: string
}

// ── Toast ─────────────────────────────────────────────────────────────────────
type ToastType = 'success' | 'danger' | 'warning' | 'info'
interface ToastMsg { id: number; type: ToastType; msg: string }
let _seq = 0
function Toast({ toasts, remove }: { toasts: ToastMsg[]; remove: (id: number) => void }) {
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 280 }}>
      {toasts.map(t => (
        <div key={t.id} className={`alert alert-${t.type} d-flex align-items-center shadow mb-0`}
          style={{ borderRadius: 10, padding: '0.65rem 1rem', fontSize: '0.88rem' }}>
          <i className={`bi bi-${t.type === 'success' ? 'check-circle' : t.type === 'danger' ? 'x-circle' : t.type === 'warning' ? 'exclamation-triangle' : 'info-circle'} me-2`}></i>
          <span className="flex-grow-1">{t.msg}</span>
          <button className="btn-close btn-sm ms-2" style={{ fontSize: '0.7rem' }} onClick={() => remove(t.id)} />
        </div>
      ))}
    </div>,
    document.body
  )
}
function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const add = useCallback((msg: string, type: ToastType = 'success') => {
    const id = ++_seq; setToasts(p => [...p, { id, type, msg }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500)
  }, [])
  const remove = useCallback((id: number) => setToasts(p => p.filter(t => t.id !== id)), [])
  return { toasts, add, remove }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d?: string) => d ? new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const fmtVal = (v: any) => typeof v === 'object' ? JSON.stringify(v) : String(v)
function StatusBadge({ status }: { status: string }) {
  const m: Record<string, string> = { pending: 'bg-warning text-dark', approved: 'bg-success', rejected: 'bg-danger' }
  return <span className={`badge ${m[status] || 'bg-secondary'}`} style={{ fontSize: '0.75rem' }}>{status}</span>
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function Admin() {
  const { tenantId } = useTenant()
  const { user, role } = useUser()
  const { toasts, add: toast, remove: removeToast } = useToast()
  const isAdmin = role === 'admin' || role === 'super_admin'

  const [tab, setTab] = useState<'config' | 'etl' | 'approvals' | 'audit'>('config')
  const [loading, setLoading] = useState(false)

  // System Config state
  const [configs, setConfigs] = useState<SystemConfig[]>([])
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [cfgKey, setCfgKey] = useState('')
  const [cfgValue, setCfgValue] = useState('')
  const [cfgDesc, setCfgDesc] = useState('')
  const [cfgIsSystem, setCfgIsSystem] = useState(false)
  const [deleteConfigTarget, setDeleteConfigTarget] = useState<SystemConfig | null>(null)

  // ETL Parameters state
  const [etlParams, setEtlParams] = useState<EtlParameter[]>([])
  const [showEtlModal, setShowEtlModal] = useState(false)
  const [etlName, setEtlName] = useState('')
  const [etlType, setEtlType] = useState<'fx_rate' | 'inflation_rate' | 'custom'>('fx_rate')
  const [etlCurrencyPair, setEtlCurrencyPair] = useState('')
  const [etlValue, setEtlValue] = useState('')
  const [etlDate, setEtlDate] = useState(new Date().toISOString().slice(0, 10))
  const [etlFilterType, setEtlFilterType] = useState('')
  const [deleteEtlTarget, setDeleteEtlTarget] = useState<EtlParameter | null>(null)

  // Approvals state
  const [approvals, setApprovals] = useState<TenantApproval[]>([])
  const [approvalFilterStatus, setApprovalFilterStatus] = useState('')
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [apvTenantId, setApvTenantId] = useState('')
  const [apvTenantName, setApvTenantName] = useState('')
  const [rejectTarget, setRejectTarget] = useState<TenantApproval | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Audit Log state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditUser, setAuditUser] = useState('')
  const [auditAction, setAuditAction] = useState('')
  const [auditResource, setAuditResource] = useState('')
  const [auditStartDate, setAuditStartDate] = useState('')
  const [auditEndDate, setAuditEndDate] = useState('')
  const [auditLimit, setAuditLimit] = useState('100')
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  // ── API calls ────────────────────────────────────────────────────────────────
  const tid = tenantId || ''
  const { getSignal } = useAbortController()

  const loadConfigs = useCallback(async (signal?: AbortSignal) => {
    try { const r = await api.get('/admin/config', { signal }); setConfigs(Array.isArray(r.data) ? r.data : []) }
    catch (e: any) { if (!isAbortError(e)) toast(e.response?.data?.message || e.message, 'danger') }
  }, [tid, toast])

  const loadEtlParams = useCallback(async (type?: string, signal?: AbortSignal) => {
    try {
      const params = type ? { parameter_type: type } : {}
      const r = await api.get('/admin/etl-params', { params, signal })
      setEtlParams(Array.isArray(r.data) ? r.data : [])
    } catch (e: any) { if (!isAbortError(e)) toast(e.response?.data?.message || e.message, 'danger') }
  }, [tid, toast])

  const loadApprovals = useCallback(async (status?: string, signal?: AbortSignal) => {
    try {
      const params = status ? { status } : {}
      const r = await api.get('/admin/approvals', { params, signal })
      setApprovals(Array.isArray(r.data) ? r.data : [])
    } catch (e: any) { if (!isAbortError(e)) toast(e.response?.data?.message || e.message, 'danger') }
  }, [tid, toast])

  const loadAuditLogs = useCallback(async (signal?: AbortSignal) => {
    try {
      const params: any = { limit: parseInt(auditLimit) || 100 }
      if (auditUser) params.user_email = auditUser
      if (auditAction) params.action = auditAction
      if (auditResource) params.resource_type = auditResource
      if (auditStartDate) params.start_date = auditStartDate
      if (auditEndDate) params.end_date = auditEndDate
      const r = await api.get('/admin/audit', { params, signal })
      setAuditLogs(Array.isArray(r.data) ? r.data : [])
    } catch (e: any) { if (!isAbortError(e)) toast(e.response?.data?.message || e.message, 'danger') }
  }, [tid, auditUser, auditAction, auditResource, auditStartDate, auditEndDate, auditLimit, toast])

  const initAdminSchema = useCallback(async () => {
    try { await api.post('/admin/init', {}) } catch {}
    try { await api.post('/admin/init/tenant', {}) } catch {}
  }, [tid])

  useEffect(() => {
    const sig = getSignal()
    initAdminSchema().then(() => { loadConfigs(sig); loadEtlParams(undefined, sig); loadApprovals(undefined, sig); loadAuditLogs(sig) })
  }, [initAdminSchema, loadConfigs, loadEtlParams, loadApprovals, loadAuditLogs])

  // ── Config handlers ──────────────────────────────────────────────────────────
  const submitConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cfgKey.trim()) { toast('Config key is required', 'warning'); return }
    let parsedVal: any = cfgValue
    try { parsedVal = JSON.parse(cfgValue) } catch { /* keep as string */ }
    setLoading(true)
    try {
      await api.post('/admin/config', { config_key: cfgKey.trim(), config_value: parsedVal, description: cfgDesc || undefined, is_system: cfgIsSystem })
      toast('Config saved'); setShowConfigModal(false); setCfgKey(''); setCfgValue(''); setCfgDesc(''); setCfgIsSystem(false); loadConfigs()
    } catch (e: any) { toast(e.response?.data?.message || e.message, 'danger') }
    finally { setLoading(false) }
  }

  const confirmDeleteConfig = async () => {
    if (!deleteConfigTarget) return
    setLoading(true)
    try { await api.delete(`/admin/config/${deleteConfigTarget.config_key}`); toast('Config deleted'); setDeleteConfigTarget(null); loadConfigs() }
    catch (e: any) { toast(e.response?.data?.message || e.message, 'danger') }
    finally { setLoading(false) }
  }

  // ── ETL handlers ─────────────────────────────────────────────────────────────
  const submitEtl = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!etlName.trim()) { toast('Parameter name required', 'warning'); return }
    if (!etlValue || isNaN(Number(etlValue))) { toast('Valid numeric value required', 'warning'); return }
    setLoading(true)
    try {
      await api.post('/admin/etl-params', {
        parameter_name: etlName.trim(), parameter_type: etlType,
        currency_pair: etlType === 'fx_rate' ? etlCurrencyPair : undefined,
        value: parseFloat(etlValue), effective_date: etlDate,
      })
      toast('ETL parameter saved'); setShowEtlModal(false); setEtlName(''); setEtlValue(''); setEtlCurrencyPair(''); loadEtlParams(etlFilterType || undefined)
    } catch (e: any) { toast(e.response?.data?.message || e.message, 'danger') }
    finally { setLoading(false) }
  }

  const confirmDeleteEtl = async () => {
    if (!deleteEtlTarget?.id) return
    setLoading(true)
    try { await api.delete(`/admin/etl-params/${deleteEtlTarget.id}`); toast('ETL param deleted'); setDeleteEtlTarget(null); loadEtlParams(etlFilterType || undefined) }
    catch (e: any) { toast(e.response?.data?.message || e.message, 'danger') }
    finally { setLoading(false) }
  }

  // ── Approval handlers ────────────────────────────────────────────────────────
  const submitApproval = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apvTenantId.trim() || !apvTenantName.trim()) { toast('Tenant ID and name required', 'warning'); return }
    setLoading(true)
    try {
      await api.post('/admin/approvals', { tenant_id: apvTenantId.trim(), tenant_name: apvTenantName.trim() })
      toast('Approval request created'); setShowApprovalModal(false); setApvTenantId(''); setApvTenantName(''); loadApprovals(approvalFilterStatus || undefined)
    } catch (e: any) { toast(e.response?.data?.message || e.message, 'danger') }
    finally { setLoading(false) }
  }

  const approveTenant = async (a: TenantApproval) => {
    setLoading(true)
    try { await api.put(`/admin/approvals/${a.tenant_id}/approve`, {}); toast('Tenant approved', 'success'); loadApprovals(approvalFilterStatus || undefined) }
    catch (e: any) { toast(e.response?.data?.message || e.message, 'danger') }
    finally { setLoading(false) }
  }

  const confirmReject = async () => {
    if (!rejectTarget) return
    if (!rejectReason.trim()) { toast('Rejection reason required', 'warning'); return }
    setLoading(true)
    try {
      await api.put(`/admin/approvals/${rejectTarget.tenant_id}/reject`, { reason: rejectReason })
      toast('Tenant rejected'); setRejectTarget(null); setRejectReason(''); loadApprovals(approvalFilterStatus || undefined)
    } catch (e: any) { toast(e.response?.data?.message || e.message, 'danger') }
    finally { setLoading(false) }
  }

  // ── Computed KPIs ────────────────────────────────────────────────────────────
  const totalConfigs = configs.length
  const sysConfigs = configs.filter(c => c.is_system).length
  const totalEtl = etlParams.length
  const pendingApprovals = approvals.filter(a => a.status === 'pending').length
  const approvedCount = approvals.filter(a => a.status === 'approved').length
  const todayAudit = auditLogs.filter(l => l.timestamp && new Date(l.timestamp).toDateString() === new Date().toDateString()).length

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <Toast toasts={toasts} remove={removeToast} />

      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
        <div>
          <h3 className="mb-0 fw-bold" style={{ color: '#0d47a1' }}><i className="bi bi-shield-lock me-2"></i>System Administration</h3>
          <p className="text-muted small mb-0 mt-1">Manage system configuration, ETL parameters, tenant approvals, and audit logs</p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-outline-secondary btn-sm" onClick={() => { loadConfigs(); loadEtlParams(etlFilterType || undefined); loadApprovals(approvalFilterStatus || undefined); loadAuditLogs(); toast('Refreshed', 'info') }}>
            <i className="bi bi-arrow-clockwise me-1"></i>Refresh
          </button>
          {tab === 'config' && isAdmin && <button className="btn btn-primary btn-sm" onClick={() => setShowConfigModal(true)}><i className="bi bi-plus-lg me-1"></i>New Config</button>}
          {tab === 'etl' && isAdmin && <button className="btn btn-primary btn-sm" onClick={() => setShowEtlModal(true)}><i className="bi bi-plus-lg me-1"></i>New ETL Param</button>}
          {tab === 'approvals' && isAdmin && <button className="btn btn-success btn-sm" onClick={() => setShowApprovalModal(true)}><i className="bi bi-plus-lg me-1"></i>New Approval Request</button>}
        </div>
      </div>

      {!isAdmin && (
        <div className="alert alert-warning d-flex align-items-center" style={{ borderRadius: 10 }}>
          <i className="bi bi-lock me-2 fs-5"></i>
          <span>You need <strong>admin</strong> role to access System Administration.</span>
        </div>
      )}

      {isAdmin && (
        <>
          {/* KPI Strip */}
          <div className="row g-3 mb-4">
            {[
              { label: 'Total Configs', value: totalConfigs, icon: 'sliders', color: '#1a6fc7', bg: '#e8f0fe', target: 'config' },
              { label: 'System Configs', value: sysConfigs, icon: 'globe', color: '#0d9488', bg: '#d1fae5', target: 'config' },
              { label: 'ETL Parameters', value: totalEtl, icon: 'funnel', color: '#7c3aed', bg: '#ede9fe', target: 'etl' },
              { label: 'Pending Approvals', value: pendingApprovals, icon: 'hourglass-split', color: '#d97706', bg: '#fef3c7', target: 'approvals' },
              { label: 'Approved Tenants', value: approvedCount, icon: 'check-circle', color: '#16a34a', bg: '#dcfce7', target: 'approvals' },
              { label: "Today's Audit", value: todayAudit, icon: 'journal-text', color: '#dc2626', bg: '#fee2e2', target: 'audit' },
            ].map(k => (
              <div key={k.label} className="col-6 col-md-4 col-lg-2">
                <div style={{ background: '#fff', borderRadius: 12, padding: '0.9rem 1rem', boxShadow: '0 1px 6px rgba(0,0,0,0.08)', borderLeft: `4px solid ${k.color}`, cursor: 'pointer' }}
                  onClick={() => setTab(k.target as any)}>
                  <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: k.color, lineHeight: 1.2, marginTop: 4 }}>{k.value}</div>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
                    <i className={`bi bi-${k.icon}`} style={{ color: k.color, fontSize: '0.85rem' }}></i>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <ul className="nav nav-tabs mb-3">
            {([['config','sliders','System Config'],['etl','funnel','ETL Parameters'],['approvals','person-check','Tenant Approvals'],['audit','journal-text','Audit Log']] as [string,string,string][]).map(([key, icon, label]) => (
              <li className="nav-item" key={key}>
                <button className={`nav-link ${tab === key ? 'active' : ''}`} onClick={() => setTab(key as any)}>
                  <i className={`bi bi-${icon} me-1`}></i>{label}
                  {key === 'approvals' && pendingApprovals > 0 && <span className="badge bg-warning text-dark ms-1" style={{ fontSize: '0.7rem' }}>{pendingApprovals}</span>}
                </button>
              </li>
            ))}
          </ul>

          {/* ── System Config Tab ────────────────────────────────────────────── */}
          {tab === 'config' && (
            configs.length === 0
              ? <div className="text-center py-5" style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
                  <i className="bi bi-sliders" style={{ fontSize: '3.5rem', color: '#cbd5e1' }}></i>
                  <h5 className="mt-3 text-muted">No System Configs Yet</h5>
                  <p className="text-muted small">Store application-wide and tenant-specific configuration values</p>
                  <button className="btn btn-primary" onClick={() => setShowConfigModal(true)}><i className="bi bi-plus-lg me-1"></i>Create First Config</button>
                </div>
              : <div className="card shadow-sm" style={{ borderRadius: 12, overflow: 'hidden' }}>
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                      <thead style={{ background: '#f8fafc' }}>
                        <tr>
                          <th className="px-3 py-2 small fw-semibold text-muted">Key</th>
                          <th className="px-3 py-2 small fw-semibold text-muted">Value</th>
                          <th className="px-3 py-2 small fw-semibold text-muted">Description</th>
                          <th className="px-3 py-2 small fw-semibold text-muted">Scope</th>
                          <th className="px-3 py-2 small fw-semibold text-muted">Updated</th>
                          <th className="px-3 py-2 small fw-semibold text-muted">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {configs.map(c => (
                          <tr key={c.id || c.config_key}>
                            <td className="px-3 py-2"><code style={{ fontSize: '0.82rem', color: '#1e40af' }}>{c.config_key}</code></td>
                            <td className="px-3 py-2" style={{ maxWidth: 200 }}>
                              <div style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }} title={fmtVal(c.config_value)}>{fmtVal(c.config_value)}</div>
                            </td>
                            <td className="px-3 py-2" style={{ fontSize: '0.82rem', color: '#6b7280', maxWidth: 200 }}>{c.description || '—'}</td>
                            <td className="px-3 py-2">
                              <span className={`badge ${c.is_system ? 'bg-primary' : 'bg-secondary'}`} style={{ fontSize: '0.72rem' }}>{c.is_system ? 'System' : 'Tenant'}</span>
                            </td>
                            <td className="px-3 py-2" style={{ fontSize: '0.78rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtDate(c.updated_at)}</td>
                            <td className="px-3 py-2">
                              <button className="btn btn-xs btn-outline-danger" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }} onClick={() => setDeleteConfigTarget(c)}>
                                <i className="bi bi-trash"></i>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
          )}

          {/* ── ETL Parameters Tab ──────────────────────────────────────────── */}
          {tab === 'etl' && (
            <>
              <div className="d-flex gap-2 mb-3 flex-wrap">
                <select className="form-select form-select-sm" style={{ maxWidth: 180 }} value={etlFilterType} onChange={e => { setEtlFilterType(e.target.value); loadEtlParams(e.target.value || undefined) }}>
                  <option value="">All Types</option>
                  <option value="fx_rate">FX Rate</option>
                  <option value="inflation_rate">Inflation Rate</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              {etlParams.length === 0
                ? <div className="text-center py-5" style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
                    <i className="bi bi-funnel" style={{ fontSize: '3.5rem', color: '#cbd5e1' }}></i>
                    <h5 className="mt-3 text-muted">No ETL Parameters</h5>
                    <p className="text-muted small">Define FX rates, inflation rates, and custom ETL parameters</p>
                    <button className="btn btn-primary" onClick={() => setShowEtlModal(true)}><i className="bi bi-plus-lg me-1"></i>Add First Parameter</button>
                  </div>
                : <div className="card shadow-sm" style={{ borderRadius: 12, overflow: 'hidden' }}>
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0">
                        <thead style={{ background: '#f8fafc' }}>
                          <tr>
                            <th className="px-3 py-2 small fw-semibold text-muted">Name</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">Type</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">Currency Pair</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">Value</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">Effective Date</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">Created By</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {etlParams.map(p => (
                            <tr key={p.id}>
                              <td className="px-3 py-2" style={{ fontWeight: 600, fontSize: '0.88rem' }}>{p.parameter_name}</td>
                              <td className="px-3 py-2">
                                <span className={`badge ${p.parameter_type === 'fx_rate' ? 'bg-primary' : p.parameter_type === 'inflation_rate' ? 'bg-warning text-dark' : 'bg-secondary'}`} style={{ fontSize: '0.72rem' }}>{p.parameter_type}</span>
                              </td>
                              <td className="px-3 py-2" style={{ fontSize: '0.82rem' }}>{p.currency_pair || '—'}</td>
                              <td className="px-3 py-2" style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0d47a1' }}>{p.value}</td>
                              <td className="px-3 py-2" style={{ fontSize: '0.78rem' }}>{p.effective_date ? new Date(p.effective_date).toLocaleDateString('th-TH') : '—'}</td>
                              <td className="px-3 py-2" style={{ fontSize: '0.78rem', color: '#6b7280' }}>{p.created_by || '—'}</td>
                              <td className="px-3 py-2">
                                <button className="btn btn-xs btn-outline-danger" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }} onClick={() => setDeleteEtlTarget(p)}>
                                  <i className="bi bi-trash"></i>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
              }
            </>
          )}

          {/* ── Tenant Approvals Tab ────────────────────────────────────────── */}
          {tab === 'approvals' && (
            <>
              <div className="d-flex gap-2 mb-3 flex-wrap">
                <select className="form-select form-select-sm" style={{ maxWidth: 180 }} value={approvalFilterStatus} onChange={e => { setApprovalFilterStatus(e.target.value); loadApprovals(e.target.value || undefined) }}>
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              {approvals.length === 0
                ? <div className="text-center py-5" style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
                    <i className="bi bi-person-check" style={{ fontSize: '3.5rem', color: '#cbd5e1' }}></i>
                    <h5 className="mt-3 text-muted">No Approval Requests</h5>
                    <p className="text-muted small">Tenant onboarding approval requests will appear here</p>
                  </div>
                : <div className="card shadow-sm" style={{ borderRadius: 12, overflow: 'hidden' }}>
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0">
                        <thead style={{ background: '#f8fafc' }}>
                          <tr>
                            <th className="px-3 py-2 small fw-semibold text-muted">Tenant</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">Requested By</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">Date</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">Status</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">Processed By</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {approvals.map(a => (
                            <tr key={a.id || a.tenant_id}>
                              <td className="px-3 py-2">
                                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{a.tenant_name}</div>
                                <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{a.tenant_id}</div>
                              </td>
                              <td className="px-3 py-2" style={{ fontSize: '0.82rem' }}>{a.requested_by}</td>
                              <td className="px-3 py-2" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{fmtDate(a.request_date)}</td>
                              <td className="px-3 py-2"><StatusBadge status={a.status} /></td>
                              <td className="px-3 py-2" style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                                {a.status === 'rejected' ? <span className="text-danger">{a.approved_by}<br /><small className="text-muted">{a.rejection_reason}</small></span>
                                  : a.approved_by || '—'}
                              </td>
                              <td className="px-3 py-2">
                                {a.status === 'pending' && (
                                  <div className="d-flex gap-1">
                                    <button className="btn btn-xs btn-success" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }} disabled={loading} onClick={() => approveTenant(a)}>
                                      <i className="bi bi-check-lg me-1"></i>Approve
                                    </button>
                                    <button className="btn btn-xs btn-danger" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }} onClick={() => { setRejectTarget(a); setRejectReason('') }}>
                                      <i className="bi bi-x-lg me-1"></i>Reject
                                    </button>
                                  </div>
                                )}
                                {a.status !== 'pending' && <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
              }
            </>
          )}

          {/* ── Audit Log Tab ────────────────────────────────────────────────── */}
          {tab === 'audit' && (
            <>
              {/* Filter bar */}
              <div className="card shadow-sm mb-3" style={{ borderRadius: 12 }}>
                <div className="card-body py-2">
                  <div className="row g-2 align-items-end">
                    <div className="col-md-3">
                      <label className="form-label mb-1 small fw-semibold">User Email</label>
                      <input className="form-control form-control-sm" placeholder="Filter by email..." value={auditUser} onChange={e => setAuditUser(e.target.value)} />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label mb-1 small fw-semibold">Action</label>
                      <input className="form-control form-control-sm" placeholder="create, update..." value={auditAction} onChange={e => setAuditAction(e.target.value)} />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label mb-1 small fw-semibold">Resource Type</label>
                      <input className="form-control form-control-sm" placeholder="statement, user..." value={auditResource} onChange={e => setAuditResource(e.target.value)} />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label mb-1 small fw-semibold">From Date</label>
                      <input type="date" className="form-control form-control-sm" value={auditStartDate} onChange={e => setAuditStartDate(e.target.value)} />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label mb-1 small fw-semibold">To Date</label>
                      <input type="date" className="form-control form-control-sm" value={auditEndDate} onChange={e => setAuditEndDate(e.target.value)} />
                    </div>
                    <div className="col-md-1">
                      <label className="form-label mb-1 small fw-semibold">Limit</label>
                      <select className="form-select form-select-sm" value={auditLimit} onChange={e => setAuditLimit(e.target.value)}>
                        <option value="50">50</option>
                        <option value="100">100</option>
                        <option value="250">250</option>
                        <option value="500">500</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-2 d-flex gap-2">
                    <button className="btn btn-sm btn-primary" onClick={loadAuditLogs}><i className="bi bi-search me-1"></i>Search</button>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => { setAuditUser(''); setAuditAction(''); setAuditResource(''); setAuditStartDate(''); setAuditEndDate('') }}>
                      <i className="bi bi-x me-1"></i>Clear
                    </button>
                    <span className="ms-2 small text-muted align-self-center">{auditLogs.length} records</span>
                  </div>
                </div>
              </div>

              {auditLogs.length === 0
                ? <div className="text-center py-5" style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
                    <i className="bi bi-journal-text" style={{ fontSize: '3.5rem', color: '#cbd5e1' }}></i>
                    <h5 className="mt-3 text-muted">No Audit Logs Found</h5>
                  </div>
                : <div className="card shadow-sm" style={{ borderRadius: 12, overflow: 'hidden' }}>
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.82rem' }}>
                        <thead style={{ background: '#f8fafc' }}>
                          <tr>
                            <th className="px-3 py-2 small fw-semibold text-muted">Timestamp</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">User</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">Action</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">Resource Type</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">Resource ID</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">IP Address</th>
                            <th className="px-3 py-2 small fw-semibold text-muted">Changes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditLogs.map((l, i) => (
                            <tr key={l.id || i}>
                              <td className="px-3 py-2" style={{ whiteSpace: 'nowrap', color: '#6b7280' }}>{fmtDate(l.timestamp)}</td>
                              <td className="px-3 py-2">{l.user_email}</td>
                              <td className="px-3 py-2">
                                <span className={`badge ${l.action === 'create' ? 'bg-success' : l.action === 'delete' ? 'bg-danger' : l.action === 'update' ? 'bg-warning text-dark' : l.action === 'approve' ? 'bg-primary' : 'bg-secondary'}`} style={{ fontSize: '0.72rem' }}>{l.action}</span>
                              </td>
                              <td className="px-3 py-2">{l.resource_type}</td>
                              <td className="px-3 py-2" style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{l.resource_id || '—'}</td>
                              <td className="px-3 py-2" style={{ color: '#9ca3af' }}>{l.ip_address || '—'}</td>
                              <td className="px-3 py-2">
                                {l.changes ? (
                                  <>
                                    <button className="btn btn-xs btn-outline-secondary" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }} onClick={() => setExpandedLog(expandedLog === (l.id || String(i)) ? null : (l.id || String(i)))}>
                                      <i className={`bi bi-chevron-${expandedLog === (l.id || String(i)) ? 'up' : 'down'}`}></i>
                                    </button>
                                    {expandedLog === (l.id || String(i)) && (
                                      <pre style={{ marginTop: 6, fontSize: '0.72rem', background: '#f8fafc', borderRadius: 6, padding: '0.5rem', maxWidth: 320, overflow: 'auto', maxHeight: 150 }}>
                                        {JSON.stringify(l.changes, null, 2)}
                                      </pre>
                                    )}
                                  </>
                                ) : <span style={{ color: '#9ca3af' }}>—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
              }
            </>
          )}

          {/* ── CREATE CONFIG MODAL ─────────────────────────────────────────── */}
          {showConfigModal && ReactDOM.createPortal(
            <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
              onClick={e => { if (e.target === e.currentTarget) setShowConfigModal(false) }}>
              <div style={{ width: '100%', maxWidth: 520, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
                <div style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', padding: '1rem 1.5rem', color: '#fff' }}>
                  <h5 className="mb-0 fw-bold"><i className="bi bi-sliders me-2"></i>Create System Config</h5>
                </div>
                <form onSubmit={submitConfig}>
                  <div style={{ padding: '1.5rem' }} className="row g-3">
                    <div className="col-md-8">
                      <label className="form-label fw-semibold small">Config Key *</label>
                      <input className="form-control font-monospace" placeholder="e.g. max_upload_size" value={cfgKey} onChange={e => setCfgKey(e.target.value)} required />
                      <div className="form-text">Use snake_case for consistency</div>
                    </div>
                    <div className="col-md-4 d-flex align-items-end pb-1">
                      <div className="form-check form-switch">
                        <input className="form-check-input" type="checkbox" id="cfgSystem" checked={cfgIsSystem} onChange={e => setCfgIsSystem(e.target.checked)} />
                        <label className="form-check-label small fw-semibold" htmlFor="cfgSystem">System-wide</label>
                      </div>
                    </div>
                    <div className="col-12">
                      <label className="form-label fw-semibold small">Value * (JSON or string)</label>
                      <textarea className="form-control font-monospace" rows={3} placeholder='e.g. 10485760  or  {"key":"val"}  or  true' value={cfgValue} onChange={e => setCfgValue(e.target.value)} required />
                    </div>
                    <div className="col-12">
                      <label className="form-label fw-semibold small">Description</label>
                      <input className="form-control" placeholder="What this config controls..." value={cfgDesc} onChange={e => setCfgDesc(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid #e5e7eb', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setShowConfigModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save Config'}</button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}

          {/* ── CREATE ETL PARAM MODAL ──────────────────────────────────────── */}
          {showEtlModal && ReactDOM.createPortal(
            <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
              onClick={e => { if (e.target === e.currentTarget) setShowEtlModal(false) }}>
              <div style={{ width: '100%', maxWidth: 540, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
                <div style={{ background: 'linear-gradient(135deg,#7c3aed,#5b21b6)', padding: '1rem 1.5rem', color: '#fff' }}>
                  <h5 className="mb-0 fw-bold"><i className="bi bi-funnel-fill me-2"></i>Add ETL Parameter</h5>
                </div>
                <form onSubmit={submitEtl}>
                  <div style={{ padding: '1.5rem' }} className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label fw-semibold small">Parameter Name *</label>
                      <input className="form-control" placeholder="e.g. USD_THB_RATE" value={etlName} onChange={e => setEtlName(e.target.value)} required />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold small">Type *</label>
                      <select className="form-select" value={etlType} onChange={e => setEtlType(e.target.value as any)}>
                        <option value="fx_rate">FX Rate</option>
                        <option value="inflation_rate">Inflation Rate</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    {etlType === 'fx_rate' && (
                      <div className="col-12">
                        <label className="form-label fw-semibold small">Currency Pair</label>
                        <input className="form-control font-monospace" placeholder="e.g. USD/THB" value={etlCurrencyPair} onChange={e => setEtlCurrencyPair(e.target.value)} />
                      </div>
                    )}
                    <div className="col-md-6">
                      <label className="form-label fw-semibold small">Value *</label>
                      <input type="number" step="any" className="form-control" placeholder="e.g. 35.50" value={etlValue} onChange={e => setEtlValue(e.target.value)} required />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold small">Effective Date *</label>
                      <input type="date" className="form-control" value={etlDate} onChange={e => setEtlDate(e.target.value)} required />
                    </div>
                    <div className="col-12">
                      <div className="alert alert-info py-2 mb-0" style={{ fontSize: '0.82rem', borderRadius: 8 }}>
                        <i className="bi bi-info-circle me-1"></i>
                        {etlType === 'fx_rate' && 'FX rates are used by the ETL process to convert foreign currency transactions.'}
                        {etlType === 'inflation_rate' && 'Inflation rates are applied to projection calculations for future period estimates.'}
                        {etlType === 'custom' && 'Custom parameters can be referenced in ETL scripts and projection formulas.'}
                      </div>
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid #e5e7eb', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setShowEtlModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save Parameter'}</button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}

          {/* ── CREATE APPROVAL REQUEST MODAL ───────────────────────────────── */}
          {showApprovalModal && ReactDOM.createPortal(
            <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
              onClick={e => { if (e.target === e.currentTarget) setShowApprovalModal(false) }}>
              <div style={{ width: '100%', maxWidth: 460, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
                <div style={{ background: 'linear-gradient(135deg,#0d9488,#065f46)', padding: '1rem 1.5rem', color: '#fff' }}>
                  <h5 className="mb-0 fw-bold"><i className="bi bi-person-plus me-2"></i>New Tenant Approval Request</h5>
                </div>
                <form onSubmit={submitApproval}>
                  <div style={{ padding: '1.5rem' }} className="row g-3">
                    <div className="col-12">
                      <label className="form-label fw-semibold small">Tenant ID *</label>
                      <input className="form-control font-monospace" placeholder="e.g. acme-corp" value={apvTenantId} onChange={e => setApvTenantId(e.target.value)} required />
                    </div>
                    <div className="col-12">
                      <label className="form-label fw-semibold small">Tenant Name *</label>
                      <input className="form-control" placeholder="e.g. ACME Corporation" value={apvTenantName} onChange={e => setApvTenantName(e.target.value)} required />
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid #e5e7eb', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setShowApprovalModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-success" disabled={loading}>{loading ? 'Creating...' : 'Create Request'}</button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}

          {/* ── REJECT REASON MODAL ─────────────────────────────────────────── */}
          {rejectTarget && ReactDOM.createPortal(
            <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
              onClick={e => { if (e.target === e.currentTarget) setRejectTarget(null) }}>
              <div style={{ width: '100%', maxWidth: 440, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
                <div style={{ background: 'linear-gradient(135deg,#dc2626,#7f1d1d)', padding: '1rem 1.5rem', color: '#fff' }}>
                  <h5 className="mb-0 fw-bold"><i className="bi bi-x-circle-fill me-2"></i>Reject Tenant</h5>
                </div>
                <div style={{ padding: '1.5rem' }}>
                  <p className="mb-3">Rejecting tenant <strong>{rejectTarget.tenant_name}</strong>. This action will notify the requester.</p>
                  <label className="form-label fw-semibold small">Rejection Reason *</label>
                  <textarea className="form-control" rows={3} placeholder="Explain the reason for rejection..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} autoFocus />
                </div>
                <div style={{ borderTop: '1px solid #e5e7eb', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setRejectTarget(null)}>Cancel</button>
                  <button type="button" className="btn btn-danger" disabled={loading} onClick={confirmReject}>{loading ? 'Rejecting...' : 'Confirm Reject'}</button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* ── DELETE CONFIG CONFIRM ───────────────────────────────────────── */}
          {deleteConfigTarget && ReactDOM.createPortal(
            <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
              onClick={e => { if (e.target === e.currentTarget) setDeleteConfigTarget(null) }}>
              <div style={{ width: '100%', maxWidth: 400, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
                <div style={{ background: 'linear-gradient(135deg,#dc2626,#7f1d1d)', padding: '1rem 1.5rem', color: '#fff' }}>
                  <h5 className="mb-0 fw-bold"><i className="bi bi-trash-fill me-2"></i>Delete Config</h5>
                </div>
                <div style={{ padding: '1.5rem' }}>
                  <p>Delete config key <code>{deleteConfigTarget.config_key}</code>? This cannot be undone.</p>
                </div>
                <div style={{ borderTop: '1px solid #e5e7eb', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-outline-secondary" onClick={() => setDeleteConfigTarget(null)}>Cancel</button>
                  <button className="btn btn-danger" disabled={loading} onClick={confirmDeleteConfig}>{loading ? 'Deleting...' : 'Delete'}</button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* ── DELETE ETL CONFIRM ──────────────────────────────────────────── */}
          {deleteEtlTarget && ReactDOM.createPortal(
            <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
              onClick={e => { if (e.target === e.currentTarget) setDeleteEtlTarget(null) }}>
              <div style={{ width: '100%', maxWidth: 400, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
                <div style={{ background: 'linear-gradient(135deg,#dc2626,#7f1d1d)', padding: '1rem 1.5rem', color: '#fff' }}>
                  <h5 className="mb-0 fw-bold"><i className="bi bi-trash-fill me-2"></i>Delete ETL Parameter</h5>
                </div>
                <div style={{ padding: '1.5rem' }}>
                  <p>Delete ETL parameter <strong>{deleteEtlTarget.parameter_name}</strong>? This cannot be undone.</p>
                </div>
                <div style={{ borderTop: '1px solid #e5e7eb', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-outline-secondary" onClick={() => setDeleteEtlTarget(null)}>Cancel</button>
                  <button className="btn btn-danger" disabled={loading} onClick={confirmDeleteEtl}>{loading ? 'Deleting...' : 'Delete'}</button>
                </div>
              </div>
            </div>,
            document.body
          )}

        </>
      )}
    </>
  )
}
