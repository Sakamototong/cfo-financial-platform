import React, { useState, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useTenant } from '../components/TenantContext'
import { useUser } from '../components/UserContext'

interface ApprovalStep {
  step_order: number
  approver_role?: string
  approver_email?: string
  approval_type: 'any' | 'all'
  required: boolean
}
interface ApprovalChain {
  id: string
  chain_name: string
  document_type: string
  steps: ApprovalStep[] | string
  is_active: boolean
  created_by: string
  created_at: string
}
interface ApprovalRequest {
  id: string
  chain_id: string
  document_type: string
  document_id: string
  document_name: string
  requested_by: string
  request_date: string
  current_step: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  completed_date?: string
  chain?: ApprovalChain
  actions?: ApprovalAction[]
}
interface ApprovalAction {
  id: string
  step_order: number
  approver_email: string
  action: 'approve' | 'reject' | 'delegate'
  action_date: string
  comments?: string
  delegated_to?: string
}
interface ApprovalNotification {
  id: string
  request_id: string
  notification_type: string
  sent_date: string
  is_read: boolean
}

type ToastType = 'success' | 'danger' | 'warning' | 'info'
interface ToastMsg { id: number; type: ToastType; msg: string }
let _toastSeq = 0

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
  const [toasts, setToasts] = React.useState<ToastMsg[]>([])
  const add = useCallback((msg: string, type: ToastType = 'success') => {
    const id = ++_toastSeq
    setToasts(p => [...p, { id, type, msg }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500)
  }, [])
  const remove = useCallback((id: number) => setToasts(p => p.filter(t => t.id !== id)), [])
  return { toasts, add, remove }
}

const DOC_TYPES = ['statement', 'scenario', 'projection', 'custom']
const DOC_TYPES_REQ = ['statement', 'scenario', 'projection', 'journal_entry', 'budget', 'payment', 'contract', 'other']
const API = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:3000'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: string }> = {
    pending: { cls: 'bg-warning text-dark', icon: 'clock' },
    approved: { cls: 'bg-success', icon: 'check-circle' },
    rejected: { cls: 'bg-danger', icon: 'x-circle' },
    cancelled: { cls: 'bg-secondary', icon: 'dash-circle' },
  }
  const s = map[status] || map.pending
  return (
    <span className={`badge ${s.cls}`} style={{ fontSize: '0.78rem' }}>
      <i className={`bi bi-${s.icon} me-1`}></i>{status}
    </span>
  )
}

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

function Modal({ onClose, children, maxW = 600 }: { onClose: () => void; children: React.ReactNode; maxW?: number }) {
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: maxW, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
        {children}
      </div>
    </div>,
    document.body
  )
}

function ModalHeader({ title, icon, onClose }: { title: string; icon: string; onClose: () => void }) {
  return (
    <div style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className={`bi bi-${icon}`} style={{ color: '#fff', fontSize: '1.1rem' }}></i>
        </div>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '1rem' }}>{title}</span>
      </div>
      <button className="btn-close btn-close-white btn-sm" onClick={onClose} />
    </div>
  )
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid #e9ecef', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      {children}
    </div>
  )
}

function StepBuilder({ steps, onChange }: { steps: ApprovalStep[]; onChange: (s: ApprovalStep[]) => void }) {
  const addStep = () => onChange([...steps, { step_order: steps.length + 1, approver_email: '', approver_role: '', approval_type: 'any', required: true }])
  const removeStep = (i: number) => {
    const n = steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step_order: idx + 1 }))
    onChange(n)
  }
  const update = (i: number, field: keyof ApprovalStep, val: any) => onChange(steps.map((s, idx) => idx === i ? { ...s, [field]: val } : s))
  return (
    <div>
      {steps.map((s, i) => (
        <div key={i} style={{ border: '1px solid #dee2e6', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: 8, background: '#f8f9fa' }}>
          <div className="d-flex align-items-center justify-content-between mb-2">
            <span style={{ fontWeight: 600, color: '#0d47a1', fontSize: '0.85rem' }}>
              <span style={{ background: '#0d47a1', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 6, fontSize: '0.75rem' }}>{s.step_order}</span>
              Step {s.step_order}
            </span>
            <button type="button" className="btn btn-sm btn-outline-danger" style={{ padding: '0.1rem 0.5rem', fontSize: '0.75rem' }} onClick={() => removeStep(i)}>
              <i className="bi bi-trash"></i>
            </button>
          </div>
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 2 }}>Approver Email</label>
              <input className="form-control form-control-sm" placeholder="user@company.com" value={s.approver_email || ''} onChange={e => update(i, 'approver_email', e.target.value)} />
            </div>
            <div className="col-md-6">
              <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 2 }}>Role (optional)</label>
              <input className="form-control form-control-sm" placeholder="e.g. manager, cfo" value={s.approver_role || ''} onChange={e => update(i, 'approver_role', e.target.value)} />
            </div>
            <div className="col-md-6">
              <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 2 }}>Approval Type</label>
              <select className="form-select form-select-sm" value={s.approval_type} onChange={e => update(i, 'approval_type', e.target.value as 'any' | 'all')}>
                <option value="any">Any one approver</option>
                <option value="all">All approvers must approve</option>
              </select>
            </div>
            <div className="col-md-6 d-flex align-items-end">
              <div className="form-check form-switch mt-1">
                <input className="form-check-input" type="checkbox" id={`req-${i}`} checked={s.required} onChange={e => update(i, 'required', e.target.checked)} />
                <label className="form-check-label" htmlFor={`req-${i}`} style={{ fontSize: '0.78rem' }}>Required step</label>
              </div>
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-outline-primary btn-sm w-100" onClick={addStep}>
        <i className="bi bi-plus-lg me-1"></i>Add Step
      </button>
    </div>
  )
}
export default function Workflow() {
  const { tenantId } = useTenant()
  const { user } = useUser()
  const { toasts, add: toast, remove: removeToast } = useToast()

  const [tab, setTab] = useState<'chains' | 'pending' | 'requests' | 'notifications'>('chains')
  const [loading, setLoading] = useState(false)
  const [chains, setChains] = useState<ApprovalChain[]>([])
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [notifications, setNotifications] = useState<ApprovalNotification[]>([])
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDocType, setFilterDocType] = useState('')
  const [filterRequester, setFilterRequester] = useState('')
  const [showChainModal, setShowChainModal] = useState(false)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [detailRequest, setDetailRequest] = useState<ApprovalRequest | null>(null)
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [deleteChainTarget, setDeleteChainTarget] = useState<ApprovalChain | null>(null)
  const [chainName, setChainName] = useState('')
  const [chainDocType, setChainDocType] = useState('statement')
  const [chainIsActive, setChainIsActive] = useState(true)
  const [chainSteps, setChainSteps] = useState<ApprovalStep[]>([{ step_order: 1, approver_email: '', approver_role: '', approval_type: 'any', required: true }])
  const [reqDocType, setReqDocType] = useState('statement')
  const [reqDocId, setReqDocId] = useState('')
  const [reqDocName, setReqDocName] = useState('')
  const [reqChainId, setReqChainId] = useState('')
  const [actionComments, setActionComments] = useState('')
  const [delegateTo, setDelegateTo] = useState('')
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'delegate' | null>(null)
  const [actionTarget, setActionTarget] = useState<string | null>(null)

  const authFetch = useCallback(async (url: string, opts?: RequestInit) => {
    const token = localStorage.getItem('access_token') || ''
    const tid = localStorage.getItem('tenant_id') || ''
    const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-tenant-id': tid, ...(opts?.headers || {}) } })
    if (!res.ok) { const err = await res.json().catch(() => ({ message: res.statusText })); throw new Error(err.message || res.statusText) }
    return res.json()
  }, [])

  const loadChains = useCallback(async () => {
    try { const d = await authFetch(`${API}/workflow/chains?active_only=false`); setChains(Array.isArray(d) ? d : []) }
    catch (e: any) { toast(e.message, 'danger') }
  }, [authFetch, toast])

  const loadRequests = useCallback(async () => {
    try { const d = await authFetch(`${API}/workflow/requests`); setRequests(Array.isArray(d) ? d : []) }
    catch (e: any) { toast(e.message, 'danger') }
  }, [authFetch, toast])

  const loadNotifications = useCallback(async () => {
    try { const d = await authFetch(`${API}/workflow/notifications`); setNotifications(Array.isArray(d) ? d : []) }
    catch (e: any) { toast(e.message, 'info') }
  }, [authFetch, toast])

  const initSchema = useCallback(async () => {
    try { await authFetch(`${API}/workflow/init`, { method: 'POST' }) } catch { /* ignore – tables may already exist */ }
  }, [authFetch])

  useEffect(() => {
    initSchema().then(() => { loadChains(); loadRequests(); loadNotifications() })
  }, [initSchema, loadChains, loadRequests, loadNotifications])

  const totalChains = chains.length
  const activeChains = chains.filter(c => c.is_active).length
  const pendingReqs = requests.filter(r => r.status === 'pending').length
  const approvedReqs = requests.filter(r => r.status === 'approved').length
  const rejectedReqs = requests.filter(r => r.status === 'rejected').length
  const unreadNotifs = notifications.filter(n => !n.is_read).length

  const resetChainForm = () => {
    setChainName(''); setChainDocType('statement'); setChainIsActive(true)
    setChainSteps([{ step_order: 1, approver_email: '', approver_role: '', approval_type: 'any', required: true }])
  }

  const submitChain = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chainName.trim()) { toast('Chain name is required', 'warning'); return }
    if (chainSteps.length === 0) { toast('At least one step is required', 'warning'); return }
    if (!chainSteps.every(s => s.approver_email || s.approver_role)) { toast('Each step needs approver email or role', 'warning'); return }
    setLoading(true)
    try {
      await authFetch(`${API}/workflow/chains`, { method: 'POST', body: JSON.stringify({ chain_name: chainName.trim(), document_type: chainDocType, steps: chainSteps, is_active: chainIsActive }) })
      toast('Approval chain created'); setShowChainModal(false); resetChainForm(); loadChains()
    } catch (e: any) { toast(e.message, 'danger') }
    finally { setLoading(false) }
  }

  const confirmDeleteChain = async () => {
    if (!deleteChainTarget) return
    setLoading(true)
    try { await authFetch(`${API}/workflow/chains/${deleteChainTarget.id}`, { method: 'DELETE' }); toast('Chain deleted'); setDeleteChainTarget(null); loadChains() }
    catch (e: any) { toast(e.message, 'danger') }
    finally { setLoading(false) }
  }

  const resetRequestForm = () => { setReqDocType('statement'); setReqDocId(''); setReqDocName(''); setReqChainId('') }

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reqDocId.trim() || !reqDocName.trim() || !reqChainId) { toast('All fields required', 'warning'); return }
    setLoading(true)
    try {
      await authFetch(`${API}/workflow/requests`, { method: 'POST', body: JSON.stringify({ document_type: reqDocType, document_id: reqDocId.trim(), document_name: reqDocName.trim(), chain_id: reqChainId }) })
      toast('Request created'); setShowRequestModal(false); resetRequestForm(); loadRequests()
    } catch (e: any) { toast(e.message, 'danger') }
    finally { setLoading(false) }
  }

  const openDetail = async (id: string) => {
    try { const d = await authFetch(`${API}/workflow/requests/${id}`); setDetailRequest(d) }
    catch (e: any) { toast(e.message, 'danger') }
  }

  const openAction = (requestId: string, action: 'approve' | 'reject' | 'delegate') => {
    setActionTarget(requestId); setActionType(action); setActionComments(''); setDelegateTo('')
  }

  const submitAction = async () => {
    if (!actionTarget || !actionType) return
    if (actionType === 'delegate' && !delegateTo.trim()) { toast('Delegate-to email required', 'warning'); return }
    setLoading(true)
    try {
      await authFetch(`${API}/workflow/requests/${actionTarget}/actions`, { method: 'POST', body: JSON.stringify({ action: actionType, comments: actionComments || undefined, delegated_to: actionType === 'delegate' ? delegateTo : undefined }) })
      toast(`Request ${actionType}d`, actionType === 'approve' ? 'success' : actionType === 'reject' ? 'danger' : 'info')
      setActionTarget(null); setActionType(null); setDetailRequest(null); loadRequests(); loadNotifications()
    } catch (e: any) { toast(e.message, 'danger') }
    finally { setLoading(false) }
  }

  const confirmCancel = async () => {
    if (!cancelTarget) return
    setLoading(true)
    try { await authFetch(`${API}/workflow/requests/${cancelTarget}/cancel`, { method: 'PUT' }); toast('Request cancelled'); setCancelTarget(null); loadRequests() }
    catch (e: any) { toast(e.message, 'danger') }
    finally { setLoading(false) }
  }

  const markRead = async (id: string) => {
    try { await authFetch(`${API}/workflow/notifications/${id}/read`, { method: 'PUT' }); setNotifications(p => p.map(n => n.id === id ? { ...n, is_read: true } : n)) }
    catch (e: any) { toast(e.message, 'danger') }
  }
  const markAllRead = async () => { for (const n of notifications.filter(x => !x.is_read)) await markRead(n.id); toast('All marked read') }

  const filteredRequests = requests.filter(r =>
    (!filterStatus || r.status === filterStatus) &&
    (!filterDocType || r.document_type === filterDocType) &&
    (!filterRequester || r.requested_by.toLowerCase().includes(filterRequester.toLowerCase()))
  )
  const pendingRequests = requests.filter(r => r.status === 'pending')
  const parseSteps = (s: ApprovalStep[] | string): ApprovalStep[] => typeof s === 'string' ? JSON.parse(s) : s

  const notifLabel = (t: string) => ({
    approval_requested: { label: 'Approval Requested', icon: 'bell', cls: 'text-primary' },
    approved: { label: 'Approved', icon: 'check-circle', cls: 'text-success' },
    rejected: { label: 'Rejected', icon: 'x-circle', cls: 'text-danger' },
    completed: { label: 'Completed', icon: 'flag', cls: 'text-success' },
    delegated: { label: 'Delegated', icon: 'arrow-right-circle', cls: 'text-info' },
  } as Record<string, any>)[t] || { label: t, icon: 'bell', cls: 'text-muted' }

  return (
    <>
      <Toast toasts={toasts} remove={removeToast} />

      {/* Page Header */}
      <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
        <div>
          <h3 className="mb-0 fw-bold" style={{ color: '#0d47a1' }}><i className="bi bi-diagram-3 me-2"></i>Workflow &amp; Approvals</h3>
          <p className="text-muted small mb-0 mt-1">Manage approval chains, requests, and notifications for all CFO documents</p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-outline-primary btn-sm" onClick={() => { loadChains(); loadRequests(); loadNotifications(); toast('Refreshed', 'info') }}>
            <i className="bi bi-arrow-clockwise me-1"></i>Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { resetChainForm(); setShowChainModal(true) }}>
            <i className="bi bi-plus-lg me-1"></i>New Chain
          </button>
          <button className="btn btn-success btn-sm" onClick={() => { resetRequestForm(); setShowRequestModal(true) }}>
            <i className="bi bi-send me-1"></i>New Request
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total Chains', value: totalChains, icon: 'link-45deg', color: '#1a6fc7', bg: '#e8f0fe', target: 'chains' },
          { label: 'Active Chains', value: activeChains, icon: 'toggle-on', color: '#0d9488', bg: '#d1fae5', target: 'chains' },
          { label: 'Pending', value: pendingReqs, icon: 'clock', color: '#d97706', bg: '#fef3c7', target: 'pending' },
          { label: 'Approved', value: approvedReqs, icon: 'check-circle', color: '#16a34a', bg: '#dcfce7', target: 'requests' },
          { label: 'Rejected', value: rejectedReqs, icon: 'x-circle', color: '#dc2626', bg: '#fee2e2', target: 'requests' },
          { label: 'Unread Notifs', value: unreadNotifs, icon: 'bell', color: '#7c3aed', bg: '#ede9fe', target: 'notifications' },
        ].map(k => (
          <div key={k.label} className="col-6 col-md-4 col-lg-2">
            <div style={{ background: '#fff', borderRadius: 12, padding: '0.9rem 1rem', boxShadow: '0 1px 6px rgba(0,0,0,0.08)', borderLeft: `4px solid ${k.color}`, height: '100%', cursor: 'pointer' }}
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
        {([['chains','link-45deg','Approval Chains'],['pending','clock','Pending'],['requests','file-earmark-check','All Requests'],['notifications','bell','Notifications']] as [string,string,string][]).map(([key, icon, label]) => (
          <li className="nav-item" key={key}>
            <button className={`nav-link ${tab === key ? 'active' : ''}`} onClick={() => setTab(key as any)}>
              <i className={`bi bi-${icon} me-1`}></i>{label}
              {key === 'pending' && pendingReqs > 0 && <span className="badge bg-warning text-dark ms-1" style={{ fontSize: '0.7rem' }}>{pendingReqs}</span>}
              {key === 'notifications' && unreadNotifs > 0 && <span className="badge bg-danger ms-1" style={{ fontSize: '0.7rem' }}>{unreadNotifs}</span>}
            </button>
          </li>
        ))}
      </ul>

      {/* CHAINS TAB */}
      {tab === 'chains' && (
        chains.length === 0
          ? <div className="text-center py-5" style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
              <i className="bi bi-diagram-3" style={{ fontSize: '3.5rem', color: '#cbd5e1' }}></i>
              <h5 className="mt-3 text-muted">No Approval Chains Yet</h5>
              <p className="text-muted small">Create your first chain to define multi-step approval workflows</p>
              <button className="btn btn-primary" onClick={() => { resetChainForm(); setShowChainModal(true) }}><i className="bi bi-plus-lg me-1"></i>Create First Chain</button>
            </div>
          : <div className="row g-3">
              {chains.map(chain => {
                const steps = parseSteps(chain.steps)
                return (
                  <div key={chain.id} className="col-md-6 col-lg-4">
                    <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.08)', padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e40af' }}><i className="bi bi-diagram-2 me-1"></i>{chain.chain_name}</div>
                          <div className="d-flex gap-1 mt-1">
                            <span className="badge bg-primary" style={{ fontSize: '0.7rem' }}>{chain.document_type}</span>
                            <span className={`badge ${chain.is_active ? 'bg-success' : 'bg-secondary'}`} style={{ fontSize: '0.7rem' }}>{chain.is_active ? 'Active' : 'Inactive'}</span>
                          </div>
                        </div>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => setDeleteChainTarget(chain)} style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}><i className="bi bi-trash"></i></button>
                      </div>
                      <div style={{ flex: 1, marginTop: 8 }}>
                        <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, marginBottom: 6 }}>STEPS ({steps.length})</div>
                        {steps.map((s, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#1a6fc7', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', flexShrink: 0, fontWeight: 700 }}>{s.step_order}</div>
                            <div style={{ fontSize: '0.78rem', color: '#374151' }}>
                              {s.approver_email || <span style={{ fontStyle: 'italic', color: '#9ca3af' }}>role: {s.approver_role}</span>}
                              <span className="ms-1" style={{ color: '#9ca3af', fontSize: '0.7rem' }}>({s.approval_type})</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #f0f0f0', fontSize: '0.72rem', color: '#9ca3af' }}>
                        <i className="bi bi-calendar me-1"></i>Created {fmtDate(chain.created_at)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
      )}

      {/* PENDING TAB */}
      {tab === 'pending' && (
        pendingRequests.length === 0
          ? <div className="text-center py-5" style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
              <i className="bi bi-inbox" style={{ fontSize: '3.5rem', color: '#cbd5e1' }}></i>
              <h5 className="mt-3 text-muted">No Pending Requests</h5>
              <p className="text-muted small">Requests awaiting your approval will appear here</p>
            </div>
          : <div className="card shadow-sm" style={{ borderRadius: 12, overflow: 'hidden' }}>
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead style={{ background: '#f8fafc' }}>
                    <tr>
                      <th className="px-3 py-2 small fw-semibold text-muted">Document</th>
                      <th className="px-3 py-2 small fw-semibold text-muted">Type</th>
                      <th className="px-3 py-2 small fw-semibold text-muted">Requested By</th>
                      <th className="px-3 py-2 small fw-semibold text-muted">Date</th>
                      <th className="px-3 py-2 small fw-semibold text-muted">Step</th>
                      <th className="px-3 py-2 small fw-semibold text-muted">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRequests.map(r => (
                      <tr key={r.id}>
                        <td className="px-3 py-2">
                          <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{r.document_name}</div>
                          <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{r.document_id}</div>
                        </td>
                        <td className="px-3 py-2"><span className="badge bg-primary" style={{ fontSize: '0.72rem' }}>{r.document_type}</span></td>
                        <td className="px-3 py-2" style={{ fontSize: '0.82rem' }}>{r.requested_by}</td>
                        <td className="px-3 py-2" style={{ fontSize: '0.82rem' }}>{fmtDate(r.request_date)}</td>
                        <td className="px-3 py-2"><span className="badge bg-warning text-dark" style={{ fontSize: '0.72rem' }}>Step {r.current_step}</span></td>
                        <td className="px-3 py-2">
                          <div className="d-flex gap-1 flex-wrap">
                            <button className="btn btn-xs btn-success" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }} onClick={() => openAction(r.id!, 'approve')}><i className="bi bi-check-lg me-1"></i>Approve</button>
                            <button className="btn btn-xs btn-danger" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }} onClick={() => openAction(r.id!, 'reject')}><i className="bi bi-x-lg me-1"></i>Reject</button>
                            <button className="btn btn-xs btn-info" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }} onClick={() => openAction(r.id!, 'delegate')}><i className="bi bi-person-arrow-up me-1"></i>Delegate</button>
                            <button className="btn btn-xs btn-outline-secondary" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }} onClick={() => openDetail(r.id!)}><i className="bi bi-eye"></i></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
      )}

      {/* ALL REQUESTS TAB */}
      {tab === 'requests' && (
        <>
          <div className="d-flex gap-2 mb-3 flex-wrap">
            <select className="form-select form-select-sm" style={{ maxWidth: 160 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select className="form-select form-select-sm" style={{ maxWidth: 180 }} value={filterDocType} onChange={e => setFilterDocType(e.target.value)}>
              <option value="">All Doc Types</option>
              <option value="statement">Statement</option>
              <option value="scenario">Scenario</option>
              <option value="projection">Projection</option>
              <option value="custom">Custom</option>
            </select>
            <input className="form-control form-control-sm" style={{ maxWidth: 220 }} placeholder="Filter by requester..." value={filterRequester} onChange={e => setFilterRequester(e.target.value)} />
            {(filterStatus || filterDocType || filterRequester) && (
              <button className="btn btn-sm btn-outline-secondary" onClick={() => { setFilterStatus(''); setFilterDocType(''); setFilterRequester('') }}>
                <i className="bi bi-x me-1"></i>Clear
              </button>
            )}
          </div>
          {filteredRequests.length === 0
            ? <div className="text-center py-5" style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
                <i className="bi bi-file-earmark-x" style={{ fontSize: '3.5rem', color: '#cbd5e1' }}></i>
                <h5 className="mt-3 text-muted">No Requests Found</h5>
              </div>
            : <div className="card shadow-sm" style={{ borderRadius: 12, overflow: 'hidden' }}>
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead style={{ background: '#f8fafc' }}>
                      <tr>
                        <th className="px-3 py-2 small fw-semibold text-muted">Document</th>
                        <th className="px-3 py-2 small fw-semibold text-muted">Type</th>
                        <th className="px-3 py-2 small fw-semibold text-muted">Status</th>
                        <th className="px-3 py-2 small fw-semibold text-muted">Requested By</th>
                        <th className="px-3 py-2 small fw-semibold text-muted">Date</th>
                        <th className="px-3 py-2 small fw-semibold text-muted">Step</th>
                        <th className="px-3 py-2 small fw-semibold text-muted">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map(r => (
                        <tr key={r.id}>
                          <td className="px-3 py-2">
                            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{r.document_name}</div>
                            <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{r.document_id}</div>
                          </td>
                          <td className="px-3 py-2"><span className="badge bg-primary" style={{ fontSize: '0.72rem' }}>{r.document_type}</span></td>
                          <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                          <td className="px-3 py-2" style={{ fontSize: '0.82rem' }}>{r.requested_by}</td>
                          <td className="px-3 py-2" style={{ fontSize: '0.82rem' }}>{fmtDate(r.request_date)}</td>
                          <td className="px-3 py-2"><span className="badge bg-secondary" style={{ fontSize: '0.72rem' }}>Step {r.current_step}</span></td>
                          <td className="px-3 py-2">
                            <div className="d-flex gap-1">
                              <button className="btn btn-xs btn-outline-primary" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }} onClick={() => openDetail(r.id!)}><i className="bi bi-eye me-1"></i>View</button>
                              {r.status === 'pending' && (
                                <button className="btn btn-xs btn-outline-danger" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }} onClick={() => setCancelTarget(r.id!)}><i className="bi bi-slash-circle me-1"></i>Cancel</button>
                              )}
                            </div>
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

      {/* NOTIFICATIONS TAB */}
      {tab === 'notifications' && (
        <>
          {notifications.length > 0 && unreadNotifs > 0 && (
            <div className="d-flex justify-content-end mb-2">
              <button className="btn btn-sm btn-outline-secondary" onClick={markAllRead}><i className="bi bi-check2-all me-1"></i>Mark All Read</button>
            </div>
          )}
          {notifications.length === 0
            ? <div className="text-center py-5" style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
                <i className="bi bi-bell-slash" style={{ fontSize: '3.5rem', color: '#cbd5e1' }}></i>
                <h5 className="mt-3 text-muted">No Notifications</h5>
              </div>
            : <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                {notifications.map((n, i) => {
                  const info = notifLabel(n.notification_type)
                  return (
                    <div key={n.id} style={{ padding: '0.85rem 1.25rem', borderBottom: i < notifications.length - 1 ? '1px solid #f0f0f0' : undefined, background: n.is_read ? '#fff' : '#f0f7ff', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: n.is_read ? '#f1f5f9' : '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className={`bi bi-${info.icon} ${info.cls}`} style={{ fontSize: '1rem' }}></i>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: n.is_read ? 400 : 600 }}>{info.label}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Request ID: {n.request_id}</div>
                        <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{fmtDate(n.sent_date)}</div>
                      </div>
                      {!n.is_read && (
                        <button className="btn btn-xs btn-outline-primary" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', flexShrink: 0 }} onClick={() => markRead(n.id!)}>
                          <i className="bi bi-check me-1"></i>Mark Read
                        </button>
                      )}
                      {n.is_read && <span style={{ fontSize: '0.72rem', color: '#9ca3af', flexShrink: 0 }}>Read</span>}
                    </div>
                  )
                })}
              </div>
          }
        </>
      )}

      {/* CREATE CHAIN MODAL */}
      {showChainModal && ReactDOM.createPortal(
        <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setShowChainModal(false) }}>
          <div style={{ width: '100%', maxWidth: 620, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', padding: '1rem 1.5rem', color: '#fff', flexShrink: 0 }}>
              <h5 className="mb-0 fw-bold"><i className="bi bi-diagram-2-fill me-2"></i>Create Approval Chain</h5>
            </div>
            <div style={{ overflowY: 'auto', padding: '1.5rem' }}>
              <form id="chainForm" onSubmit={submitChain}>
                <div className="row g-3">
                  <div className="col-md-8">
                    <label className="form-label fw-semibold small">Chain Name *</label>
                    <input className="form-control" placeholder="e.g. Financial Statement Approval" value={chainName} onChange={e => setChainName(e.target.value)} required />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-semibold small">Document Type *</label>
                    <select className="form-select" value={chainDocType} onChange={e => setChainDocType(e.target.value)}>
                      <option value="statement">Statement</option>
                      <option value="scenario">Scenario</option>
                      <option value="projection">Projection</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div className="col-12">
                    <div className="form-check form-switch">
                      <input className="form-check-input" type="checkbox" id="chainActive" checked={chainIsActive} onChange={e => setChainIsActive(e.target.checked)} />
                      <label className="form-check-label small fw-semibold" htmlFor="chainActive">Active (available for new requests)</label>
                    </div>
                  </div>
                </div>

                {/* Step Builder */}
                <div className="mt-3">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="fw-semibold small">Approval Steps</span>
                    <button type="button" className="btn btn-sm btn-outline-primary" style={{ fontSize: '0.75rem' }}
                      onClick={() => setChainSteps(p => [...p, { step_order: p.length + 1, approver_email: '', approver_role: '', approval_type: 'any', required: true }])}>
                      <i className="bi bi-plus-lg me-1"></i>Add Step
                    </button>
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {chainSteps.map((step, i) => (
                      <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: '0.75rem', marginBottom: 8, border: '1px solid #e2e8f0' }}>
                        <div className="d-flex align-items-center gap-1 mb-2">
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#1a6fc7', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>{step.step_order}</div>
                          <span className="small fw-semibold text-muted">Step {step.step_order}</span>
                          {chainSteps.length > 1 && (
                            <button type="button" className="btn btn-xs btn-outline-danger ms-auto" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}
                              onClick={() => setChainSteps(p => p.filter((_, j) => j !== i).map((s, j) => ({ ...s, step_order: j + 1 })))}>
                              <i className="bi bi-trash"></i>
                            </button>
                          )}
                        </div>
                        <div className="row g-2">
                          <div className="col-md-5">
                            <input className="form-control form-control-sm" placeholder="Approver email (optional)" value={step.approver_email || ''} onChange={e => setChainSteps(p => p.map((s, j) => j === i ? { ...s, approver_email: e.target.value } : s))} />
                          </div>
                          <div className="col-md-4">
                            <input className="form-control form-control-sm" placeholder="Role (optional)" value={step.approver_role || ''} onChange={e => setChainSteps(p => p.map((s, j) => j === i ? { ...s, approver_role: e.target.value } : s))} />
                          </div>
                          <div className="col-md-3">
                            <select className="form-select form-select-sm" value={step.approval_type} onChange={e => setChainSteps(p => p.map((s, j) => j === i ? { ...s, approval_type: e.target.value as 'any' | 'all' } : s))}>
                              <option value="any">Any One</option>
                              <option value="all">All Must</option>
                            </select>
                          </div>
                          <div className="col-12">
                            <div className="form-check">
                              <input className="form-check-input" type="checkbox" checked={step.required} id={`req_${i}`} onChange={e => setChainSteps(p => p.map((s, j) => j === i ? { ...s, required: e.target.checked } : s))} />
                              <label className="form-check-label small" htmlFor={`req_${i}`}>Required step</label>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </form>
            </div>
            <div style={{ borderTop: '1px solid #e5e7eb', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setShowChainModal(false)}>Cancel</button>
              <button type="submit" form="chainForm" className="btn btn-primary" disabled={loading}>{loading ? 'Creating...' : 'Create Chain'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* CREATE REQUEST MODAL */}
      {showRequestModal && ReactDOM.createPortal(
        <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setShowRequestModal(false) }}>
          <div style={{ width: '100%', maxWidth: 520, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
            <div style={{ background: 'linear-gradient(135deg,#0d9488,#065f46)', padding: '1rem 1.5rem', color: '#fff' }}>
              <h5 className="mb-0 fw-bold"><i className="bi bi-send-fill me-2"></i>Submit Approval Request</h5>
            </div>
            <form onSubmit={submitRequest}>
              <div style={{ padding: '1.5rem' }} className="row g-3">
                <div className="col-12">
                  <label className="form-label fw-semibold small">Approval Chain *</label>
                  <select className="form-select" value={reqChainId} onChange={e => setReqChainId(e.target.value)} required>
                    <option value="">-- Select Chain --</option>
                    {chains.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.chain_name} ({c.document_type})</option>)}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label fw-semibold small">Document Type *</label>
                  <input className="form-control" placeholder="e.g. statement, budget" value={reqDocType} onChange={e => setReqDocType(e.target.value)} required />
                </div>
                <div className="col-md-6">
                  <label className="form-label fw-semibold small">Document ID *</label>
                  <input className="form-control" placeholder="Unique document ID" value={reqDocId} onChange={e => setReqDocId(e.target.value)} required />
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold small">Document Name *</label>
                  <input className="form-control" placeholder="Readable name, e.g. Q3 2025 Income Statement" value={reqDocName} onChange={e => setReqDocName(e.target.value)} required />
                </div>
              </div>
              <div style={{ borderTop: '1px solid #e5e7eb', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-outline-secondary" onClick={() => setShowRequestModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-success" disabled={loading}>{loading ? 'Submitting...' : 'Submit Request'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* REQUEST DETAIL MODAL */}
      {detailRequest && ReactDOM.createPortal(
        <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setDetailRequest(null) }}>
          <div style={{ width: '100%', maxWidth: 680, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', padding: '1rem 1.5rem', color: '#fff', flexShrink: 0 }}>
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <h5 className="mb-0 fw-bold"><i className="bi bi-file-earmark-check me-2"></i>{(detailRequest as any).document_name}</h5>
                  <div style={{ fontSize: '0.78rem', opacity: 0.8, marginTop: 4 }}>
                    {(detailRequest as any).document_type} &bull; Requested by {(detailRequest as any).requested_by} &bull; {fmtDate((detailRequest as any).request_date)}
                  </div>
                </div>
                <StatusBadge status={(detailRequest as any).status} />
              </div>
            </div>
            <div style={{ overflowY: 'auto', padding: '1.5rem' }}>
              {/* Steps timeline */}
              {(detailRequest as any).chain?.steps && (
                <div className="mb-4">
                  <div className="fw-semibold small mb-2">Approval Steps</div>
                  {parseSteps((detailRequest as any).chain.steps).map((s: ApprovalStep, i: number) => {
                    const action = ((detailRequest as any).actions || []).find((a: ApprovalAction) => a.step_order === s.step_order)
                    const isCurrent = s.step_order === (detailRequest as any).current_step
                    const statusColor = action?.action === 'approve' ? '#16a34a' : action?.action === 'reject' ? '#dc2626' : isCurrent ? '#d97706' : '#9ca3af'
                    const statusBg = action?.action === 'approve' ? '#dcfce7' : action?.action === 'reject' ? '#fee2e2' : isCurrent ? '#fef3c7' : '#f1f5f9'
                    return (
                      <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: statusBg, border: `2px solid ${statusColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.8rem', fontWeight: 700, color: statusColor }}>{s.step_order}</div>
                          {i < parseSteps((detailRequest as any).chain.steps).length - 1 && <div style={{ width: 2, background: '#e2e8f0', flex: 1, minHeight: 16, marginTop: 2 }}></div>}
                        </div>
                        <div style={{ flex: 1, background: statusBg, borderRadius: 8, padding: '0.6rem 0.8rem', border: `1px solid ${statusColor}20` }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: statusColor }}>Step {s.step_order} — {action?.action || (isCurrent ? 'Awaiting' : 'Not Reached')}</div>
                          <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 2 }}>{s.approver_email || `Role: ${s.approver_role}`} &bull; Type: {s.approval_type}</div>
                          {action?.comments && <div style={{ fontSize: '0.75rem', color: '#374151', marginTop: 4, fontStyle: 'italic' }}>"{action.comments}"</div>}
                          {action?.action_date && <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>{fmtDate(action.action_date)}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div style={{ borderTop: '1px solid #e5e7eb', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
              {(detailRequest as any).status === 'pending' && (
                <>
                  <button className="btn btn-success btn-sm" onClick={() => { setDetailRequest(null); openAction((detailRequest as any).id, 'approve') }}><i className="bi bi-check-lg me-1"></i>Approve</button>
                  <button className="btn btn-danger btn-sm" onClick={() => { setDetailRequest(null); openAction((detailRequest as any).id, 'reject') }}><i className="bi bi-x-lg me-1"></i>Reject</button>
                  <button className="btn btn-info btn-sm text-white" onClick={() => { setDetailRequest(null); openAction((detailRequest as any).id, 'delegate') }}><i className="bi bi-person-arrow-up me-1"></i>Delegate</button>
                </>
              )}
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setDetailRequest(null)}>Close</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ACTION MODAL */}
      {actionTarget && actionType && ReactDOM.createPortal(
        <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) { setActionTarget(null); setActionType(null) } }}>
          <div style={{ width: '100%', maxWidth: 480, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
            <div style={{ background: actionType === 'approve' ? 'linear-gradient(135deg,#16a34a,#065f46)' : actionType === 'reject' ? 'linear-gradient(135deg,#dc2626,#7f1d1d)' : 'linear-gradient(135deg,#0284c7,#075985)', padding: '1rem 1.5rem', color: '#fff' }}>
              <h5 className="mb-0 fw-bold">
                <i className={`bi bi-${actionType === 'approve' ? 'check-circle' : actionType === 'reject' ? 'x-circle' : 'person-arrow-up'} me-2`}></i>
                {actionType === 'approve' ? 'Approve' : actionType === 'reject' ? 'Reject' : 'Delegate'} Request
              </h5>
            </div>
            <div style={{ padding: '1.5rem' }}>
              {actionType === 'delegate' && (
                <div className="mb-3">
                  <label className="form-label fw-semibold small">Delegate To (email) *</label>
                  <input className="form-control" placeholder="delegate@company.com" value={delegateTo} onChange={e => setDelegateTo(e.target.value)} />
                </div>
              )}
              <div>
                <label className="form-label fw-semibold small">Comments {actionType !== 'approve' ? '*' : '(optional)'}</label>
                <textarea className="form-control" rows={3} placeholder={actionType === 'reject' ? 'Reason for rejection...' : actionType === 'delegate' ? 'Delegation notes...' : 'Optional approval notes...'} value={actionComments} onChange={e => setActionComments(e.target.value)} />
              </div>
            </div>
            <div style={{ borderTop: '1px solid #e5e7eb', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-outline-secondary" onClick={() => { setActionTarget(null); setActionType(null) }}>Cancel</button>
              <button type="button" className={`btn btn-${actionType === 'approve' ? 'success' : actionType === 'reject' ? 'danger' : 'info text-white'}`} disabled={loading} onClick={submitAction}>
                {loading ? 'Processing...' : actionType === 'approve' ? 'Confirm Approve' : actionType === 'reject' ? 'Confirm Reject' : 'Confirm Delegate'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* DELETE CHAIN CONFIRM MODAL */}
      {deleteChainTarget && ReactDOM.createPortal(
        <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteChainTarget(null) }}>
          <div style={{ width: '100%', maxWidth: 420, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
            <div style={{ background: 'linear-gradient(135deg,#dc2626,#7f1d1d)', padding: '1rem 1.5rem', color: '#fff' }}>
              <h5 className="mb-0 fw-bold"><i className="bi bi-exclamation-triangle-fill me-2"></i>Delete Chain</h5>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <p>Are you sure you want to delete <strong>{deleteChainTarget.chain_name}</strong>? This cannot be undone.</p>
            </div>
            <div style={{ borderTop: '1px solid #e5e7eb', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setDeleteChainTarget(null)}>Cancel</button>
              <button type="button" className="btn btn-danger" disabled={loading} onClick={confirmDeleteChain}>{loading ? 'Deleting...' : 'Delete Chain'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* CANCEL REQUEST CONFIRM MODAL */}
      {cancelTarget && ReactDOM.createPortal(
        <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setCancelTarget(null) }}>
          <div style={{ width: '100%', maxWidth: 420, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
            <div style={{ background: 'linear-gradient(135deg,#92400e,#78350f)', padding: '1rem 1.5rem', color: '#fff' }}>
              <h5 className="mb-0 fw-bold"><i className="bi bi-slash-circle me-2"></i>Cancel Request</h5>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <p>Are you sure you want to cancel this approval request?</p>
            </div>
            <div style={{ borderTop: '1px solid #e5e7eb', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setCancelTarget(null)}>Cancel</button>
              <button type="button" className="btn btn-warning" disabled={loading} onClick={confirmCancel}>{loading ? 'Cancelling...' : 'Cancel Request'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
