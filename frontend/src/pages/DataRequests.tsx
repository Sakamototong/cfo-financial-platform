import React, { useState, useEffect, useCallback, useRef } from 'react'
import ReactDOM from 'react-dom'
import api from '../api/client'
import { useAbortController, isAbortError } from '../hooks/useApi'
import { useTenant } from '../components/TenantContext'
import { useUser } from '../components/UserContext'

// ─── Enums ───────────────────────────────────────────────────────────────────
type DsrType = 'access' | 'delete' | 'portability' | 'rectify' | 'restrict'
type DsrStatus = 'pending' | 'approved' | 'processing' | 'completed' | 'rejected' | 'expired'

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface DsrRequest {
  id: string
  request_type: DsrType
  requester_email: string
  requester_name: string | null
  requester_user_id: string | null
  request_reason: string | null
  request_scope: any
  status: DsrStatus
  due_date: string
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  processed_by: string | null
  processed_at: string | null
  processing_notes: string | null
  is_overdue: boolean
  created_at: string
  updated_at: string
}

interface DsrStats {
  total: number
  pending: number
  approved: number
  processing: number
  completed: number
  rejected: number
  expired: number
  overdue: number
  avgProcessingDays: number
  slaComplianceRate: number
}

interface AuditEntry {
  id: string
  action: string
  actor_email: string
  old_status: string | null
  new_status: string | null
  notes: string | null
  created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const TYPE_META: Record<DsrType, { label: string; icon: string; color: string; desc: string; cfoBenefit: string }> = {
  access:      { label: 'Access Request',       icon: 'bi-eye',             color: 'primary',   desc: 'ขอดูข้อมูลส่วนบุคคลที่ระบบเก็บของฉัน',                  cfoBenefit: 'ข้อมูลเงินเดือน, ธุรกรรม, บัญชีผู้ใช้' },
  portability: { label: 'Data Export',          icon: 'bi-download',        color: 'info',      desc: 'ขอ Export ข้อมูลส่วนตัวออกเป็น JSON/CSV',               cfoBenefit: 'Export ข้อมูลทางการเงินส่วนตัว' },
  rectify:     { label: 'Rectification',        icon: 'bi-pencil-square',   color: 'warning',   desc: 'ขอแก้ไขข้อมูลส่วนบุคคลที่ไม่ถูกต้อง',                  cfoBenefit: 'แก้ไขชื่อ, ที่อยู่, ข้อมูลบัญชี' },
  restrict:    { label: 'Restrict Processing',  icon: 'bi-slash-circle',    color: 'secondary', desc: 'ขอจำกัดการนำข้อมูลไปใช้',                               cfoBenefit: 'หยุดประมวลผลข้อมูลเงินเดือน/รายงาน' },
  delete:      { label: 'Deletion Request',     icon: 'bi-trash3',          color: 'danger',    desc: 'ขอลบข้อมูลส่วนบุคคลทั้งหมด (Right to be Forgotten)',   cfoBenefit: 'ลบข้อมูลพนักงานที่ออกแล้ว' },
}

const STATUS_META: Record<DsrStatus, { label: string; color: string; icon: string }> = {
  pending:    { label: 'รอดำเนินการ',  color: 'warning',   icon: 'bi-clock' },
  approved:   { label: 'อนุมัติแล้ว', color: 'info',      icon: 'bi-check-circle' },
  processing: { label: 'กำลังดำเนิน', color: 'primary',   icon: 'bi-gear' },
  completed:  { label: 'เสร็จสิ้น',   color: 'success',   icon: 'bi-check-circle-fill' },
  rejected:   { label: 'ปฏิเสธ',      color: 'secondary', icon: 'bi-x-circle' },
  expired:    { label: 'หมดอายุ',      color: 'dark',      icon: 'bi-calendar-x' },
}

function fmtDate(s?: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}
function fmtDateTime(s?: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function daysLeft(due: string): number {
  return Math.ceil((new Date(due).getTime() - Date.now()) / 86400000)
}
function SLABadge({ due, status }: { due: string; status: DsrStatus }) {
  if (status === 'completed' || status === 'rejected' || status === 'expired') return null
  const d = daysLeft(due)
  if (d < 0) return <span className="badge bg-danger ms-1"><i className="bi bi-exclamation-triangle me-1" />เกินกำหนด {Math.abs(d)} วัน</span>
  if (d <= 5) return <span className="badge bg-warning text-dark ms-1"><i className="bi bi-clock me-1" />เหลือ {d} วัน</span>
  return <span className="badge bg-light text-muted ms-1">เหลือ {d} วัน</span>
}

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
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 99999, minWidth: 280 }}>
      {toasts.map(t => (
        <div key={t.id} className={`alert alert-${t.type} shadow mb-2 py-2`} style={{ fontSize: '0.85rem' }}>
          {t.type === 'success' && <i className="bi bi-check-circle me-2" />}
          {t.type === 'danger'  && <i className="bi bi-x-circle me-2" />}
          {t.type === 'warning' && <i className="bi bi-exclamation-triangle me-2" />}
          {t.type === 'info'    && <i className="bi bi-info-circle me-2" />}
          {t.msg}
        </div>
      ))}
    </div>, document.body
  )
}

function Modal({ onClose, title, subtitle, icon, color, maxWidth, children }: {
  onClose: () => void; title: string; subtitle: string; icon: string
  color: string; maxWidth?: number; children: React.ReactNode
}) {
  const gradients: Record<string, string> = {
    blue:    'linear-gradient(135deg,#1a6fc7,#0d47a1)',
    red:     'linear-gradient(135deg,#dc3545,#a71d2a)',
    green:   'linear-gradient(135deg,#198754,#0f5132)',
    warning: 'linear-gradient(135deg,#f0a500,#c68400)',
    purple:  'linear-gradient(135deg,#6f42c1,#4a1a8f)',
    gray:    'linear-gradient(135deg,#6c757d,#495057)',
  }
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: maxWidth || 580, maxHeight: '92vh', display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
        <div style={{ background: gradients[color] || gradients.blue, padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div className="d-flex align-items-center gap-2">
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              <i className={`bi ${icon} text-white`} />
            </div>
            <div>
              <div className="fw-bold text-white" style={{ fontSize: '1rem', lineHeight: 1.2 }}>{title}</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem' }}>{subtitle}</div>
            </div>
          </div>
          <button className="btn-close btn-close-white" onClick={onClose} />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>, document.body
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DataRequests() {
  const { tenantId } = useTenant()
  const { user, role } = useUser()
  const { toasts, add: toast } = useToast()
  const { getSignal } = useAbortController()
  const isAdmin = role === 'admin' || role === 'super_admin'

  const [tab, setTab] = useState<'dashboard' | 'my' | 'admin'>('dashboard')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DsrStats | null>(null)
  const [requests, setRequests] = useState<DsrRequest[]>([])
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterEmail, setFilterEmail] = useState('')

  // Modals
  const [showNewModal, setShowNewModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showProcessModal, setShowProcessModal] = useState(false)
  const [selectedReq, setSelectedReq] = useState<DsrRequest | null>(null)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  // New request form
  const [newType, setNewType] = useState<DsrType>('access')
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newReason, setNewReason] = useState('')
  const [newSubmitting, setNewSubmitting] = useState(false)

  // Approve form
  const [approveDecision, setApproveDecision] = useState(true)
  const [approveNotes, setApproveNotes] = useState('')
  const [approveRejectionReason, setApproveRejectionReason] = useState('')
  const [approveSubmitting, setApproveSubmitting] = useState(false)

  // Process form
  const [processNotes, setProcessNotes] = useState('')
  const [processSubmitting, setProcessSubmitting] = useState(false)

  // ─── Loaders ───────────────────────────────────────────────────────────────
  const loadStats = useCallback(async (signal?: AbortSignal) => {
    if (!tenantId || !isAdmin) return
    try {
      const r = await api.get('/dsr/statistics', { signal })
      setStats(r.data)
    } catch (e) { if (!isAbortError(e)) { /* non-critical */ } }
  }, [tenantId, isAdmin])

  const loadRequests = useCallback(async (signal?: AbortSignal) => {
    if (!tenantId) return
    try {
      const params: any = {}
      if (filterStatus) params.status = filterStatus
      if (filterType) params.type = filterType
      if (filterEmail) params.email = filterEmail
      const r = await api.get('/dsr/requests', { params, signal })
      setRequests(r.data)
    } catch (e: any) {
      if (!isAbortError(e)) toast(e.response?.data?.message || 'ไม่สามารถโหลดข้อมูลได้', 'danger')
    }
  }, [tenantId, filterStatus, filterType, filterEmail])

  useEffect(() => {
    if (!tenantId) return
    const sig = getSignal()
    setLoading(true)
    Promise.all([loadStats(sig), loadRequests(sig)]).finally(() => setLoading(false))
  }, [tenantId])

  // ─── Actions ───────────────────────────────────────────────────────────────
  const handleNew = async () => {
    if (!newEmail) { toast('กรุณากรอกอีเมล', 'warning'); return }
    setNewSubmitting(true)
    try {
      await api.post('/dsr/requests', {
        request_type: newType,
        requester_email: newEmail,
        requester_name: newName || undefined,
        request_reason: newReason || undefined,
      })
      toast('ส่งคำขอสำเร็จ — จะได้รับการตอบกลับภายใน 30 วัน', 'success')
      setShowNewModal(false)
      setNewEmail(''); setNewName(''); setNewReason('')
      await Promise.all([loadStats(), loadRequests()])
    } catch (e: any) { if (!isAbortError(e)) toast(e.response?.data?.message || 'ส่งคำขอไม่สำเร็จ', 'danger') }
    finally { setNewSubmitting(false) }
  }

  const handleViewDetail = async (req: DsrRequest) => {
    setSelectedReq(req)
    setShowDetailModal(true)
    setAuditLoading(true)
    try {
      const r = await api.get(`/dsr/requests/${req.id}/audit-log`)
      setAuditLog(r.data)
    } catch (e) { if (!isAbortError(e)) setAuditLog([]) }
    finally { setAuditLoading(false) }
  }

  const handleApprove = async () => {
    if (!selectedReq) return
    if (!approveDecision && !approveRejectionReason.trim()) {
      toast('กรุณาระบุเหตุผลการปฏิเสธ', 'warning'); return
    }
    setApproveSubmitting(true)
    try {
      await api.put(`/dsr/requests/${selectedReq.id}/approve`, {
        approved: approveDecision,
        notes: approveNotes || undefined,
        rejection_reason: approveRejectionReason || undefined,
      })
      toast(approveDecision ? 'อนุมัติคำขอสำเร็จ' : 'ปฏิเสธคำขอสำเร็จ', 'success')
      setShowApproveModal(false)
      setApproveNotes(''); setApproveRejectionReason('')
      await Promise.all([loadStats(), loadRequests()])
    } catch (e: any) { if (!isAbortError(e)) toast(e.response?.data?.message || 'ดำเนินการไม่สำเร็จ', 'danger') }
    finally { setApproveSubmitting(false) }
  }

  const handleProcess = async () => {
    if (!selectedReq) return
    setProcessSubmitting(true)
    try {
      await api.post(`/dsr/requests/${selectedReq.id}/process`, {
        notes: processNotes || undefined,
      })
      toast('ดำเนินการเสร็จสิ้น', 'success')
      setShowProcessModal(false)
      setProcessNotes('')
      await Promise.all([loadStats(), loadRequests()])
    } catch (e: any) { if (!isAbortError(e)) toast(e.response?.data?.message || 'ดำเนินการไม่สำเร็จ', 'danger') }
    finally { setProcessSubmitting(false) }
  }

  // ─── Derived data ──────────────────────────────────────────────────────────
  const myEmail = (user as any)?.email || (user as any)?.preferred_username || ''
  const myRequests = requests.filter(r => r.requester_email === myEmail || r.requester_user_id === (user as any)?.sub)
  const overdueCount = requests.filter(r => r.is_overdue).length

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <ToastContainer toasts={toasts} />

      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="mb-0 fw-bold text-primary">
            <i className="bi bi-shield-lock me-2" />Data Subject Requests
          </h3>
          <small className="text-muted">จัดการสิทธิ์ข้อมูลส่วนบุคคลตาม พ.ร.บ. PDPA / GDPR — ต้องตอบสนองภายใน 30 วัน</small>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary btn-sm" onClick={() => Promise.all([loadStats(), loadRequests()])}>
            <i className="bi bi-arrow-clockwise me-1" />Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNewModal(true)}>
            <i className="bi bi-plus-circle me-1" />ส่งคำขอใหม่
          </button>
        </div>
      </div>

      {/* KPI Strip (admin only) */}
      {isAdmin && (
        <div className="row g-3 mb-3">
          {[
            { label: 'คำขอทั้งหมด',     value: stats?.total ?? 0,              icon: 'bi-clipboard-data',       color: 'primary',  click: 'admin' as const },
            { label: 'รอดำเนินการ',     value: stats?.pending ?? 0,            icon: 'bi-clock',                color: 'warning',  click: 'admin' as const },
            { label: 'กำลังดำเนิน',     value: stats?.processing ?? 0,         icon: 'bi-gear',                 color: 'info',     click: 'admin' as const },
            { label: 'เสร็จสิ้น',       value: stats?.completed ?? 0,          icon: 'bi-check-circle',         color: 'success',  click: 'admin' as const },
            { label: 'เกินกำหนด',       value: overdueCount,                   icon: 'bi-exclamation-triangle', color: 'danger',   click: 'admin' as const },
            { label: 'SLA Compliance',  value: stats ? `${stats.slaComplianceRate ?? 0}%` : '—', icon: 'bi-bar-chart', color: 'purple', click: 'dashboard' as const },
          ].map((k, i) => (
            <div key={i} className="col-6 col-md-4 col-lg-2" style={{ cursor: 'pointer' }} onClick={() => setTab(k.click)}>
              <div className="card h-100 border-0 shadow-sm"
                style={k.color === 'purple' ? { borderTop: '3px solid #6f42c1' } : { borderTop: `3px solid var(--bs-${k.color})` }}>
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-start mb-1">
                    <small className="text-muted text-uppercase fw-semibold" style={{ fontSize: '0.65rem', letterSpacing: 1 }}>{k.label}</small>
                    <i className={`bi ${k.icon}`} style={k.color === 'purple' ? { color: '#6f42c1' } : { color: `var(--bs-${k.color})` }} />
                  </div>
                  <div className="fw-bold" style={{ fontSize: '1.3rem' }}>
                    {loading ? <span className="placeholder col-6" /> : k.value}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        {([
          { key: 'dashboard', label: 'PDPA Overview',   icon: 'bi-shield-check' },
          { key: 'my',        label: 'คำขอของฉัน',      icon: 'bi-person-lines-fill' },
          ...(isAdmin ? [{ key: 'admin', label: 'จัดการทั้งหมด', icon: 'bi-people' }] : []),
        ] as { key: string; label: string; icon: string }[]).map(t => (
          <li key={t.key} className="nav-item">
            <button className={`nav-link ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key as any)}>
              <i className={`bi ${t.icon} me-1`} />{t.label}
              {t.key === 'admin' && overdueCount > 0 && <span className="badge bg-danger ms-1">{overdueCount}</span>}
            </button>
          </li>
        ))}
      </ul>

      {/* DASHBOARD TAB */}
      {tab === 'dashboard' && (
        <div className="row g-4">
          <div className="col-lg-7">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-header bg-primary text-white fw-semibold">
                <i className="bi bi-shield-check me-2" />สิทธิ์ของคุณตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) พ.ศ. 2562
              </div>
              <div className="card-body p-0">
                {(Object.entries(TYPE_META) as [DsrType, typeof TYPE_META[DsrType]][]).map(([type, meta]) => (
                  <div key={type} className="p-3 border-bottom d-flex align-items-start gap-3"
                    style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <div className={`rounded-circle d-flex align-items-center justify-content-center flex-shrink-0`}
                      style={{ width: 42, height: 42, background: `var(--bs-${meta.color})`, opacity: 0.9 }}>
                      <i className={`bi ${meta.icon} text-white fs-5`} />
                    </div>
                    <div className="flex-grow-1">
                      <div className="fw-semibold mb-1">{meta.label}</div>
                      <div className="text-muted small mb-1">{meta.desc}</div>
                      <div className="small">
                        <i className="bi bi-building me-1 text-primary" />
                        <span className="text-primary">{meta.cfoBenefit}</span>
                      </div>
                    </div>
                    <button className="btn btn-outline-primary btn-sm flex-shrink-0"
                      onClick={() => { setNewType(type); setShowNewModal(true) }}>
                      ยื่นคำขอ
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-lg-5 d-flex flex-column gap-3">
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold">
                <i className="bi bi-calendar-check me-2 text-primary" />SLA & กำหนดเวลาตามกฎหมาย
              </div>
              <div className="card-body">
                <div className="d-flex align-items-center gap-3 mb-3 p-3 bg-light rounded">
                  <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>⏱️</div>
                  <div>
                    <div className="fw-bold fs-5 text-primary">30 วัน</div>
                    <div className="text-muted small">กำหนดตอบสนองสูงสุดตาม PDPA มาตรา 41</div>
                  </div>
                </div>
                <div className="d-flex align-items-center gap-3 mb-3 p-3 bg-light rounded">
                  <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>💰</div>
                  <div>
                    <div className="fw-bold fs-5 text-danger">3 ล้านบาท</div>
                    <div className="text-muted small">โทษปรับสูงสุดกรณีฝ่าฝืน</div>
                  </div>
                </div>
                {isAdmin && stats && (
                  <>
                    <hr />
                    <div className="mb-1 d-flex justify-content-between small">
                      <span>SLA Compliance Rate</span>
                      <span className="fw-bold">{stats.slaComplianceRate ?? 0}%</span>
                    </div>
                    <div className="progress mb-3" style={{ height: 8 }}>
                      <div className={`progress-bar bg-${(stats.slaComplianceRate ?? 0) >= 90 ? 'success' : (stats.slaComplianceRate ?? 0) >= 70 ? 'warning' : 'danger'}`}
                        style={{ width: `${stats.slaComplianceRate ?? 0}%` }} />
                    </div>
                    <div className="mb-1 d-flex justify-content-between small">
                      <span>Avg. Processing Time</span>
                      <span className="fw-bold">{stats.avgProcessingDays ?? 0} วัน</span>
                    </div>
                    <div className="progress" style={{ height: 8 }}>
                      <div className="progress-bar bg-info" style={{ width: `${Math.min(100, ((stats.avgProcessingDays ?? 0) / 30) * 100)}%` }} />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="card border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold">
                <i className="bi bi-database me-2 text-primary" />ข้อมูลที่ระบบ CFO เก็บ
              </div>
              <div className="card-body p-0">
                {[
                  { icon: '💼', label: 'ข้อมูลพนักงาน',          items: 'เงินเดือน, เลขบัตร, บัญชีธนาคาร' },
                  { icon: '📊', label: 'ข้อมูลทางการเงิน',        items: 'ธุรกรรม, งบดุล, กระแสเงินสด' },
                  { icon: '🏢', label: 'ข้อมูล Vendor/Supplier',  items: 'ชื่อ, ที่อยู่, ข้อมูลติดต่อ' },
                  { icon: '📑', label: 'บัญชีผู้ใช้ระบบ',          items: 'อีเมล, log การเข้าใช้, สิทธิ์' },
                  { icon: '📈', label: 'ข้อมูลสัญญา/นักลงทุน',    items: 'ผู้ถือหุ้น, เจ้าหนี้, ผู้รับงาน' },
                ].map((d, i) => (
                  <div key={i} className="px-3 py-2 border-bottom d-flex align-items-center gap-2">
                    <span style={{ fontSize: '1.2rem' }}>{d.icon}</span>
                    <div>
                      <div className="small fw-semibold">{d.label}</div>
                      <div className="small text-muted">{d.items}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MY REQUESTS TAB */}
      {tab === 'my' && (
        <div>
          {loading ? (
            <div className="text-center py-5"><span className="spinner-border text-primary" /></div>
          ) : myRequests.length === 0 ? (
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center py-5">
                <i className="bi bi-clipboard-data fs-1 text-muted mb-3 d-block" />
                <h5 className="text-muted">ยังไม่มีคำขอ</h5>
                <p className="text-muted small">คุณสามารถยื่นคำขอสิทธิ์ข้อมูลส่วนบุคคลของคุณได้ตามกฎหมาย PDPA</p>
                <button className="btn btn-primary" onClick={() => setShowNewModal(true)}>
                  <i className="bi bi-plus-circle me-1" />ส่งคำขอแรก
                </button>
              </div>
            </div>
          ) : (
            <div className="row g-3">
              {myRequests.map(req => {
                const tm = TYPE_META[req.request_type]
                const sm = STATUS_META[req.status]
                return (
                  <div key={req.id} className="col-md-6 col-xl-4">
                    <div className="card border-0 shadow-sm h-100" style={{ borderLeft: `4px solid var(--bs-${tm.color})` }}>
                      <div className="card-body">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <div className="d-flex align-items-center gap-2">
                            <i className={`bi ${tm.icon} text-${tm.color} fs-5`} />
                            <span className="fw-semibold small">{tm.label}</span>
                          </div>
                          <span className={`badge bg-${sm.color}`}><i className={`bi ${sm.icon} me-1`} />{sm.label}</span>
                        </div>
                        <div className="text-muted small mb-2">{req.request_reason || '—'}</div>
                        <div className="d-flex justify-content-between align-items-center">
                          <small className="text-muted"><i className="bi bi-calendar3 me-1" />{fmtDate(req.created_at)}</small>
                          <SLABadge due={req.due_date} status={req.status} />
                        </div>
                        {req.rejection_reason && (
                          <div className="alert alert-danger py-1 px-2 mt-2 mb-0 small">
                            <i className="bi bi-x-circle me-1" />เหตุผล: {req.rejection_reason}
                          </div>
                        )}
                        <div className="mt-2 pt-2 border-top d-flex justify-content-between align-items-center">
                          <small className="text-muted">กำหนด: {fmtDate(req.due_date)}</small>
                          <button className="btn btn-outline-primary btn-sm py-0 px-2" onClick={() => handleViewDetail(req)}>
                            <i className="bi bi-eye me-1" />ดูรายละเอียด
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ADMIN TAB */}
      {tab === 'admin' && isAdmin && (
        <div>
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body py-2">
              <div className="row g-2 align-items-end">
                <div className="col-md-3">
                  <label className="form-label small fw-semibold mb-1">ประเภท</label>
                  <select className="form-select form-select-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
                    <option value="">— ทั้งหมด —</option>
                    {(Object.entries(TYPE_META) as [DsrType, typeof TYPE_META[DsrType]][]).map(([v, m]) => (
                      <option key={v} value={v}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label small fw-semibold mb-1">สถานะ</label>
                  <select className="form-select form-select-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">— ทั้งหมด —</option>
                    {(Object.entries(STATUS_META) as [DsrStatus, typeof STATUS_META[DsrStatus]][]).map(([v, m]) => (
                      <option key={v} value={v}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold mb-1">ค้นหาอีเมล</label>
                  <input className="form-control form-control-sm" placeholder="email@example.com" value={filterEmail}
                    onChange={e => setFilterEmail(e.target.value)} />
                </div>
                <div className="col-md-2">
                  <button className="btn btn-primary btn-sm w-100" onClick={loadRequests}>
                    <i className="bi bi-search me-1" />ค้นหา
                  </button>
                </div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-5"><span className="spinner-border text-primary" /></div>
          ) : requests.length === 0 ? (
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center py-5">
                <i className="bi bi-inbox fs-1 text-muted mb-3 d-block" />
                <h5 className="text-muted">ไม่พบคำขอ</h5>
              </div>
            </div>
          ) : (
            <div className="card border-0 shadow-sm">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 200 }}>ผู้ขอ</th>
                      <th>ประเภท</th>
                      <th>สถานะ</th>
                      <th>วันที่สร้าง</th>
                      <th>SLA / กำหนด</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map(req => {
                      const tm = TYPE_META[req.request_type]
                      const sm = STATUS_META[req.status]
                      return (
                        <tr key={req.id} className={req.is_overdue ? 'table-danger' : ''}>
                          <td>
                            <div className="fw-semibold small">{req.requester_name || req.requester_email}</div>
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>{req.requester_email}</div>
                          </td>
                          <td>
                            <span className={`badge bg-${tm.color} bg-opacity-10 text-${tm.color} border border-${tm.color}`}>
                              <i className={`bi ${tm.icon} me-1`} />{tm.label}
                            </span>
                          </td>
                          <td>
                            <span className={`badge bg-${sm.color}`}><i className={`bi ${sm.icon} me-1`} />{sm.label}</span>
                            {req.is_overdue && <span className="badge bg-danger ms-1">OVERDUE</span>}
                          </td>
                          <td><small>{fmtDate(req.created_at)}</small></td>
                          <td>
                            <small>{fmtDate(req.due_date)}</small>
                            <SLABadge due={req.due_date} status={req.status} />
                          </td>
                          <td className="text-end">
                            <div className="d-flex gap-1 justify-content-end">
                              <button className="btn btn-outline-secondary btn-sm py-0 px-2" title="ดูรายละเอียด" onClick={() => handleViewDetail(req)}>
                                <i className="bi bi-eye" />
                              </button>
                              {req.status === 'pending' && (
                                <button className="btn btn-outline-success btn-sm py-0 px-2" title="อนุมัติ/ปฏิเสธ"
                                  onClick={() => { setSelectedReq(req); setApproveDecision(true); setApproveNotes(''); setApproveRejectionReason(''); setShowApproveModal(true) }}>
                                  <i className="bi bi-check-lg" />
                                </button>
                              )}
                              {req.status === 'approved' && (
                                <button className="btn btn-outline-primary btn-sm py-0 px-2" title="ดำเนินการ"
                                  onClick={() => { setSelectedReq(req); setProcessNotes(''); setShowProcessModal(true) }}>
                                  <i className="bi bi-gear" />
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
              <div className="card-footer text-muted small">{requests.length} คำขอ</div>
            </div>
          )}
        </div>
      )}

      {/* NEW REQUEST MODAL */}
      {showNewModal && (
        <Modal onClose={() => setShowNewModal(false)} title="ส่งคำขอสิทธิ์ข้อมูลส่วนบุคคล"
          subtitle="กรอกข้อมูลเพื่อยื่นคำขอตาม PDPA / GDPR" icon="bi-shield-plus" color="blue" maxWidth={640}>
          <div className="p-4">
            <div className="mb-3">
              <label className="form-label fw-semibold">ประเภทคำขอ <span className="text-danger">*</span></label>
              <div className="row g-2">
                {(Object.entries(TYPE_META) as [DsrType, typeof TYPE_META[DsrType]][]).map(([type, meta]) => (
                  <div key={type} className="col-6">
                    <div className={`card border-2 h-100 ${newType === type ? `border-${meta.color}` : 'border-light'}`}
                      style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                      onClick={() => setNewType(type)}>
                      <div className="card-body p-2 d-flex align-items-center gap-2">
                        <i className={`bi ${meta.icon} text-${meta.color} fs-5 flex-shrink-0`} />
                        <div>
                          <div className="small fw-semibold">{meta.label}</div>
                          <div style={{ fontSize: '0.7rem' }} className="text-muted">{meta.desc}</div>
                        </div>
                        {newType === type && <i className="bi bi-check-circle-fill text-success ms-auto flex-shrink-0" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <label className="form-label fw-semibold">อีเมล <span className="text-danger">*</span></label>
                <input className="form-control" type="email" placeholder="your@email.com" value={newEmail}
                  onChange={e => setNewEmail(e.target.value)} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">ชื่อ-นามสกุล</label>
                <input className="form-control" placeholder="ชื่อผู้ยื่นคำขอ" value={newName}
                  onChange={e => setNewName(e.target.value)} />
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label fw-semibold">เหตุผลและรายละเอียด</label>
              <textarea className="form-control" rows={3} placeholder="อธิบายว่าต้องการข้อมูลอะไร เพื่อวัตถุประสงค์อะไร…"
                value={newReason} onChange={e => setNewReason(e.target.value)} />
            </div>
            <div className="alert alert-info py-2 small mb-0">
              <i className="bi bi-clock me-2" />
              คำขอของคุณจะได้รับการตอบสนอง<strong>ภายใน 30 วัน</strong>ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) พ.ศ. 2562
            </div>
          </div>
          <div className="modal-footer" style={{ borderTop: '1px solid #e9ecef', background: '#f8f9fa', padding: '0.875rem 1.5rem' }}>
            <button className="btn btn-outline-secondary" onClick={() => setShowNewModal(false)}>
              <i className="bi bi-x-lg me-1" />ยกเลิก
            </button>
            <button className="btn btn-primary" onClick={handleNew} disabled={newSubmitting || !newEmail}>
              {newSubmitting ? <><span className="spinner-border spinner-border-sm me-1" />กำลังส่ง…</> : <><i className="bi bi-send me-1" />ส่งคำขอ</>}
            </button>
          </div>
        </Modal>
      )}

      {/* DETAIL MODAL */}
      {showDetailModal && selectedReq && (() => {
        const tm = TYPE_META[selectedReq.request_type]
        const sm = STATUS_META[selectedReq.status]
        return (
          <Modal onClose={() => setShowDetailModal(false)}
            title={`${tm.label}`} subtitle={`ID: ${selectedReq.id.slice(0, 8)}… | ${sm.label}`}
            icon={tm.icon} color="blue" maxWidth={740}>
            <div className="p-4">
              <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
                <span className={`badge bg-${sm.color} fs-6 px-3 py-2`}><i className={`bi ${sm.icon} me-2`} />{sm.label}</span>
                {selectedReq.is_overdue && <span className="badge bg-danger fs-6 px-3 py-2"><i className="bi bi-exclamation-triangle me-1" />เกินกำหนด</span>}
                <SLABadge due={selectedReq.due_date} status={selectedReq.status} />
              </div>
              <div className="row g-3 mb-3">
                <div className="col-md-6">
                  <table className="table table-sm table-borderless mb-0">
                    <tbody>
                      <tr><td className="text-muted ps-0 small" style={{ width: 100 }}>ผู้ขอ</td><td className="fw-semibold small">{selectedReq.requester_name || '—'}</td></tr>
                      <tr><td className="text-muted ps-0 small">อีเมล</td><td className="small">{selectedReq.requester_email}</td></tr>
                      <tr><td className="text-muted ps-0 small">ประเภท</td><td><span className={`badge bg-${tm.color}`}>{tm.label}</span></td></tr>
                      <tr><td className="text-muted ps-0 small">วันที่ยื่น</td><td className="small">{fmtDateTime(selectedReq.created_at)}</td></tr>
                      <tr><td className="text-muted ps-0 small">กำหนดตอบ</td><td className="small">{fmtDate(selectedReq.due_date)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="col-md-6">
                  <table className="table table-sm table-borderless mb-0">
                    <tbody>
                      {selectedReq.approved_by  && <tr><td className="text-muted ps-0 small" style={{ width: 110 }}>อนุมัติโดย</td><td className="small">{selectedReq.approved_by}</td></tr>}
                      {selectedReq.approved_at  && <tr><td className="text-muted ps-0 small">วันอนุมัติ</td><td className="small">{fmtDateTime(selectedReq.approved_at)}</td></tr>}
                      {selectedReq.processed_by && <tr><td className="text-muted ps-0 small">ดำเนินการโดย</td><td className="small">{selectedReq.processed_by}</td></tr>}
                      {selectedReq.processed_at && <tr><td className="text-muted ps-0 small">วันดำเนินการ</td><td className="small">{fmtDateTime(selectedReq.processed_at)}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
              {selectedReq.request_reason && (
                <div className="mb-3">
                  <div className="fw-semibold small mb-1">เหตุผล / รายละเอียด</div>
                  <div className="alert alert-light py-2 small mb-0">{selectedReq.request_reason}</div>
                </div>
              )}
              {selectedReq.rejection_reason && (
                <div className="mb-3">
                  <div className="fw-semibold small text-danger mb-1"><i className="bi bi-x-circle me-1" />เหตุผลการปฏิเสธ</div>
                  <div className="alert alert-danger py-2 small mb-0">{selectedReq.rejection_reason}</div>
                </div>
              )}
              {selectedReq.processing_notes && (
                <div className="mb-3">
                  <div className="fw-semibold small mb-1"><i className="bi bi-gear me-1" />หมายเหตุการดำเนินการ</div>
                  <div className="alert alert-info py-2 small mb-0">{selectedReq.processing_notes}</div>
                </div>
              )}
              <div className="fw-semibold small mb-2"><i className="bi bi-clock-history me-1" />Audit Trail</div>
              {auditLoading ? (
                <div className="text-center py-3"><span className="spinner-border spinner-border-sm" /></div>
              ) : auditLog.length === 0 ? (
                <div className="text-muted small text-center py-2 bg-light rounded">ไม่มีประวัติ</div>
              ) : (
                <div className="border rounded" style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {auditLog.map((a, i) => (
                    <div key={a.id} className={`px-3 py-2 small ${i < auditLog.length - 1 ? 'border-bottom' : ''}`}>
                      <div className="d-flex justify-content-between">
                        <span className="fw-semibold"><i className="bi bi-person-circle me-1" />{a.actor_email}</span>
                        <span className="text-muted">{fmtDateTime(a.created_at)}</span>
                      </div>
                      <div className="text-muted mt-1">
                        <span className="badge bg-secondary me-1">{a.action}</span>
                        {a.old_status && <>{a.old_status} → {a.new_status}</>}
                        {a.notes && <span className="ms-1">— {a.notes}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid #e9ecef', background: '#f8f9fa', padding: '0.875rem 1.5rem' }}>
              {isAdmin && selectedReq.status === 'pending' && (
                <button className="btn btn-success btn-sm" onClick={() => { setShowDetailModal(false); setApproveDecision(true); setApproveNotes(''); setApproveRejectionReason(''); setShowApproveModal(true) }}>
                  <i className="bi bi-check-circle me-1" />อนุมัติ / ปฏิเสธ
                </button>
              )}
              {isAdmin && selectedReq.status === 'approved' && (
                <button className="btn btn-primary btn-sm" onClick={() => { setShowDetailModal(false); setProcessNotes(''); setShowProcessModal(true) }}>
                  <i className="bi bi-gear me-1" />ดำเนินการ
                </button>
              )}
              <button className="btn btn-outline-secondary" onClick={() => setShowDetailModal(false)}>ปิด</button>
            </div>
          </Modal>
        )
      })()}

      {/* APPROVE MODAL */}
      {showApproveModal && selectedReq && (
        <Modal onClose={() => setShowApproveModal(false)} title="อนุมัติ / ปฏิเสธคำขอ"
          subtitle={`${TYPE_META[selectedReq.request_type].label} — ${selectedReq.requester_email}`}
          icon="bi-check-circle" color={approveDecision ? 'green' : 'red'} maxWidth={520}>
          <div className="p-4">
            <div className="mb-3">
              <label className="form-label fw-semibold">การตัดสินใจ <span className="text-danger">*</span></label>
              <div className="d-flex gap-3">
                {[
                  { v: true,  label: 'อนุมัติ', color: 'success', icon: 'bi-check-circle-fill' },
                  { v: false, label: 'ปฏิเสธ', color: 'danger',  icon: 'bi-x-circle-fill' },
                ].map(opt => (
                  <div key={String(opt.v)} className={`card flex-fill border-2 ${approveDecision === opt.v ? `border-${opt.color}` : 'border-light'}`}
                    style={{ cursor: 'pointer' }} onClick={() => setApproveDecision(opt.v)}>
                    <div className="card-body p-2 text-center">
                      <i className={`bi ${opt.icon} text-${opt.color} fs-3`} />
                      <div className="fw-semibold">{opt.label}</div>
                      {approveDecision === opt.v && <i className="bi bi-check-circle-fill text-primary d-block" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {!approveDecision && (
              <div className="mb-3">
                <label className="form-label fw-semibold">เหตุผลการปฏิเสธ <span className="text-danger">*</span></label>
                <textarea className="form-control" rows={3} placeholder="กรุณาระบุเหตุผลที่ชัดเจนเพื่อแจ้งผู้ยื่นคำขอ…"
                  value={approveRejectionReason} onChange={e => setApproveRejectionReason(e.target.value)} />
              </div>
            )}
            <div>
              <label className="form-label fw-semibold">หมายเหตุ (optional)</label>
              <textarea className="form-control" rows={2} placeholder="หมายเหตุสำหรับ audit log…"
                value={approveNotes} onChange={e => setApproveNotes(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer" style={{ borderTop: '1px solid #e9ecef', background: '#f8f9fa', padding: '0.875rem 1.5rem' }}>
            <button className="btn btn-outline-secondary" onClick={() => setShowApproveModal(false)}>
              <i className="bi bi-x-lg me-1" />ยกเลิก
            </button>
            <button className={`btn btn-${approveDecision ? 'success' : 'danger'}`} onClick={handleApprove}
              disabled={approveSubmitting || (!approveDecision && !approveRejectionReason.trim())}>
              {approveSubmitting
                ? <><span className="spinner-border spinner-border-sm me-1" />กำลังบันทึก…</>
                : approveDecision
                  ? <><i className="bi bi-check-circle me-1" />ยืนยันอนุมัติ</>
                  : <><i className="bi bi-x-circle me-1" />ยืนยันปฏิเสธ</>}
            </button>
          </div>
        </Modal>
      )}

      {/* PROCESS MODAL */}
      {showProcessModal && selectedReq && (
        <Modal onClose={() => setShowProcessModal(false)} title="ดำเนินการคำขอ"
          subtitle={`${TYPE_META[selectedReq.request_type].label} — ${selectedReq.requester_email}`}
          icon="bi-gear" color="blue" maxWidth={520}>
          <div className="p-4">
            <div className="alert alert-info mb-3 small">
              <i className="bi bi-info-circle me-2" />
              <strong>ประเภท: </strong>{TYPE_META[selectedReq.request_type].label}<br />
              <strong className="mt-1 d-block">ขั้นตอน: </strong>
              {selectedReq.request_type === 'access'      && 'รวบรวมข้อมูลของผู้ขอจากระบบ แล้วส่งให้ผู้ขอผ่านอีเมลที่ลงทะเบียน'}
              {selectedReq.request_type === 'portability' && 'Export ข้อมูลเป็น JSON หรือ CSV แล้วส่งให้ผู้ขอ'}
              {selectedReq.request_type === 'rectify'     && 'แก้ไขข้อมูลที่ไม่ถูกต้องตามคำขอ และแจ้งยืนยัน'}
              {selectedReq.request_type === 'restrict'    && 'ระงับการประมวลผลข้อมูลของผู้ขอ และแจ้งยืนยัน'}
              {selectedReq.request_type === 'delete'      && 'ลบข้อมูลส่วนบุคคลของผู้ขอทั้งหมดออกจากระบบ (Irreversible)'}
            </div>
            {selectedReq.request_type === 'delete' && (
              <div className="alert alert-danger mb-3 small">
                <i className="bi bi-exclamation-triangle me-2" />
                <strong>คำเตือน:</strong> การลบข้อมูลไม่สามารถกู้คืนได้ กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการ
              </div>
            )}
            <div>
              <label className="form-label fw-semibold">หมายเหตุการดำเนินการ</label>
              <textarea className="form-control" rows={4}
                placeholder="อธิบายการดำเนินการที่ทำจริง เช่น ส่ง export ทางอีเมล, ลบข้อมูล table X เมื่อ…"
                value={processNotes} onChange={e => setProcessNotes(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer" style={{ borderTop: '1px solid #e9ecef', background: '#f8f9fa', padding: '0.875rem 1.5rem' }}>
            <button className="btn btn-outline-secondary" onClick={() => setShowProcessModal(false)}>
              <i className="bi bi-x-lg me-1" />ยกเลิก
            </button>
            <button className={`btn btn-${selectedReq.request_type === 'delete' ? 'danger' : 'primary'}`}
              onClick={handleProcess} disabled={processSubmitting}>
              {processSubmitting
                ? <><span className="spinner-border spinner-border-sm me-1" />กำลังดำเนินการ…</>
                : <><i className="bi bi-check-circle me-1" />ยืนยันดำเนินการเสร็จสิ้น</>}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
