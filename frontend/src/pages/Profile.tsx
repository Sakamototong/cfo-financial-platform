import React, { useState, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import api from '../api/client'
import { useAbortController, isAbortError } from '../hooks/useApi'
import { useTenant } from '../components/TenantContext'
import { useUser } from '../components/UserContext'

// ─── Types ────────────────────────────────────────────────────────────────────
type TabKey = 'info' | 'role' | 'alerts' | 'prefs' | 'security'

interface UserProfile {
  id: string
  full_name: string
  email: string
  phone: string
  bio: string
  role: string
  is_active: boolean
  last_login: string | null
  created_at: string | null
}

interface CfoAlerts {
  budgetUsedPct: number        // Alert when budget used > X%
  cashflowThreshold: number    // Alert when net cashflow < X (THB)
  plVariancePct: number        // Alert when P&L actual vs budget variance > X%
  arOverdueDays: number        // Alert when A/R overdue > X days
  approvalRequests: boolean
  reportDelivery: 'none' | 'daily' | 'weekly' | 'monthly'
  emailAlerts: boolean
  overdueAlerts: boolean
  budgetApproval: boolean
  forecastAlerts: boolean
}

interface DisplayPrefs {
  currency: 'THB' | 'USD' | 'EUR' | 'JPY'
  numberFormat: 'thai' | 'intl'
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  language: 'th' | 'en'
  fiscalYearStart: number  // month 1-12
  showCentsInReports: boolean
  defaultDashboard: 'cashflow' | 'budget' | 'pnl' | 'summary'
  theme: 'light' | 'dark' | 'auto'
}

// ─── Role metadata ─────────────────────────────────────────────────────────────
const ROLE_META: Record<string, { label: string; color: string; icon: string; desc: string }> = {
  super_admin: { label: 'Super Admin',   color: 'danger',  icon: 'bi-shield-fill-exclamation', desc: 'เข้าถึงระบบทั้งหมด จัดการ tenant และ system-wide settings' },
  admin:       { label: 'Admin',         color: 'primary', icon: 'bi-shield-fill-check',       desc: 'จัดการผู้ใช้ ตั้งค่าบริษัท อนุมัติงบประมาณ ดูรายงานทั้งหมด' },
  analyst:     { label: 'Analyst',       color: 'info',    icon: 'bi-graph-up-arrow',           desc: 'ดู/แก้ไขข้อมูลทางการเงิน สร้างรายงาน วิเคราะห์งบประมาณ' },
  viewer:      { label: 'Viewer',        color: 'secondary',icon: 'bi-eye-fill',                desc: 'ดูข้อมูลและรายงานเท่านั้น ไม่สามารถแก้ไขหรืออนุมัติ' },
}

const PERMISSIONS: Record<string, { label: string; roles: string[] }[]> = {
  'ข้อมูลทางการเงิน': [
    { label: 'ดูรายงานการเงิน',           roles: ['super_admin','admin','analyst','viewer'] },
    { label: 'แก้ไขธุรกรรม',              roles: ['super_admin','admin','analyst'] },
    { label: 'Import/Export ข้อมูล',       roles: ['super_admin','admin','analyst'] },
    { label: 'ลบข้อมูลทางการเงิน',        roles: ['super_admin','admin'] },
  ],
  'งบประมาณ (Budget)': [
    { label: 'ดูงบประมาณ',                roles: ['super_admin','admin','analyst','viewer'] },
    { label: 'สร้าง/แก้ไขงบประมาณ',      roles: ['super_admin','admin','analyst'] },
    { label: 'อนุมัติงบประมาณ',           roles: ['super_admin','admin'] },
    { label: 'ลบ Scenario',               roles: ['super_admin','admin'] },
  ],
  'การจัดการผู้ใช้': [
    { label: 'ดูรายชื่อผู้ใช้',           roles: ['super_admin','admin'] },
    { label: 'เพิ่ม/แก้ไขผู้ใช้',        roles: ['super_admin','admin'] },
    { label: 'เปลี่ยน Role ผู้ใช้',      roles: ['super_admin','admin'] },
    { label: 'โอนสิทธิ์ Owner',          roles: ['super_admin','admin'] },
  ],
  'การตั้งค่าระบบ': [
    { label: 'ตั้งค่าบริษัท',             roles: ['super_admin','admin'] },
    { label: 'Billing & Subscription',   roles: ['super_admin','admin'] },
    { label: 'Workflow Approval Config', roles: ['super_admin','admin'] },
    { label: 'Super Admin Functions',    roles: ['super_admin'] },
  ],
}

// ─── Helper hooks ─────────────────────────────────────────────────────────────
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

function initAlerts(): CfoAlerts {
  try {
    const s = localStorage.getItem('cfo_alerts')
    if (s) return JSON.parse(s)
  } catch {}
  return {
    budgetUsedPct: 85, cashflowThreshold: 500000, plVariancePct: 10,
    arOverdueDays: 30, approvalRequests: true, reportDelivery: 'weekly',
    emailAlerts: true, overdueAlerts: true, budgetApproval: true, forecastAlerts: false,
  }
}

function initPrefs(): DisplayPrefs {
  try {
    const s = localStorage.getItem('cfo_display_prefs')
    if (s) return JSON.parse(s)
  } catch {}
  return {
    currency: 'THB', numberFormat: 'thai', dateFormat: 'DD/MM/YYYY',
    language: 'th', fiscalYearStart: 1, showCentsInReports: false,
    defaultDashboard: 'summary', theme: 'light',
  }
}

function fmtDateTime(s?: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                 'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

function avatarGradient(name: string) {
  const colors = [
    'linear-gradient(135deg,#667eea,#764ba2)',
    'linear-gradient(135deg,#1a6fc7,#0d47a1)',
    'linear-gradient(135deg,#198754,#0f5132)',
    'linear-gradient(135deg,#f0a500,#c68400)',
    'linear-gradient(135deg,#dc3545,#a71d2a)',
    'linear-gradient(135deg,#6f42c1,#4a1a8f)',
  ]
  let hash = 0
  for (const c of name) hash = (hash + c.charCodeAt(0)) % colors.length
  return colors[hash]
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Profile() {
  const { tenantId } = useTenant()
  const { user, role } = useUser()
  const { toasts, add: toast } = useToast()
  const { getSignal } = useAbortController()

  const [tab, setTab] = useState<TabKey>('info')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState<UserProfile>({
    id: '', full_name: '', email: '', phone: '', bio: '', role: role || '',
    is_active: true, last_login: null, created_at: null,
  })

  const [alerts, setAlerts]   = useState<CfoAlerts>(initAlerts)
  const [prefs,  setPrefs]    = useState<DisplayPrefs>(initPrefs)

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false })

  // ─── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return
    const signal = getSignal()
    setLoading(true)
    api.get('/users/profile/me', { signal })
      .then(r => setProfile({
        id: r.data.id || '',
        full_name: r.data.full_name || '',
        email: r.data.email || '',
        phone: r.data.phone || '',
        bio: r.data.bio || '',
        role: r.data.role || role || '',
        is_active: r.data.is_active !== false,
        last_login: r.data.last_login || null,
        created_at: r.data.created_at || null,
      }))
      .catch(e => { if (!isAbortError(e)) setProfile(p => ({ ...p, email: (user as any)?.email || '', role: role || '' })) })
      .finally(() => setLoading(false))
  }, [tenantId])

  // ─── Save handlers ─────────────────────────────────────────────────────────
  const saveProfile = async () => {
    setSaving(true)
    try {
      await api.put('/users/profile/me', {
        full_name: profile.full_name,
        phone: profile.phone,
        bio: profile.bio,
      })
      toast('บันทึกข้อมูลส่วนตัวสำเร็จ', 'success')
    } catch (e: any) { toast(e.response?.data?.message || 'บันทึกไม่สำเร็จ', 'danger') }
    finally { setSaving(false) }
  }

  const saveAlerts = () => {
    localStorage.setItem('cfo_alerts', JSON.stringify(alerts))
    toast('บันทึกการตั้งค่าการแจ้งเตือนสำเร็จ', 'success')
  }

  const savePrefs = () => {
    localStorage.setItem('cfo_display_prefs', JSON.stringify(prefs))
    toast('บันทึกการตั้งค่าการแสดงผลสำเร็จ', 'success')
  }

  const savePassword = async () => {
    if (pwForm.next !== pwForm.confirm) { toast('รหัสผ่านไม่ตรงกัน', 'warning'); return }
    if (pwForm.next.length < 8) { toast('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', 'warning'); return }
    if (!pwForm.current) { toast('กรุณากรอกรหัสผ่านปัจจุบัน', 'warning'); return }
    setSaving(true)
    try {
      // Password change endpoint - using auth service
      await api.post('/auth/change-password', {
        current_password: pwForm.current,
        new_password: pwForm.next,
      })
      toast('เปลี่ยนรหัสผ่านสำเร็จ', 'success')
      setPwForm({ current: '', next: '', confirm: '' })
    } catch (e: any) {
      // If endpoint not available, show friendly message
      toast(e.response?.data?.message || 'ไม่สามารถเปลี่ยนรหัสผ่านผ่าน API ได้ กรุณาติดต่อ Admin', 'warning')
    }
    finally { setSaving(false) }
  }

  // ─── Derived ───────────────────────────────────────────────────────────────
  const rm = ROLE_META[profile.role] || ROLE_META.viewer
  const initials = profile.full_name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'U'
  const memberDays = profile.created_at
    ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000) : 0

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <ToastContainer toasts={toasts} />

      {/* ── Profile Header ──────────────────────────────────────────────────── */}
      <div className="card border-0 shadow-sm mb-4" style={{ background: 'linear-gradient(135deg,#f8f9ff,#fff)', borderLeft: '4px solid #1a6fc7' }}>
        <div className="card-body p-4">
          <div className="d-flex align-items-center gap-4 flex-wrap">
            {/* Avatar */}
            <div className="flex-shrink-0 position-relative">
              <div className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold shadow"
                style={{ width: 80, height: 80, fontSize: 28, background: avatarGradient(profile.full_name || 'U'), letterSpacing: 2 }}>
                {loading ? <span className="spinner-border spinner-border-sm" /> : initials}
              </div>
              <span className={`position-absolute bottom-0 end-0 badge bg-${rm.color} rounded-pill`}
                style={{ fontSize: '0.6rem', padding: '3px 6px' }}>
                <i className={`bi ${rm.icon}`} />
              </span>
            </div>

            {/* Info */}
            <div className="flex-grow-1">
              <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                <h4 className="mb-0 fw-bold">{loading ? '…' : (profile.full_name || 'ชื่อผู้ใช้')}</h4>
                <span className={`badge bg-${rm.color}`}><i className={`bi ${rm.icon} me-1`} />{rm.label}</span>
                {profile.is_active
                  ? <span className="badge bg-success"><i className="bi bi-circle-fill me-1" style={{ fontSize: '0.5rem' }} />Active</span>
                  : <span className="badge bg-danger"><i className="bi bi-circle-fill me-1" style={{ fontSize: '0.5rem' }} />Inactive</span>}
              </div>
              <div className="text-muted mb-2"><i className="bi bi-envelope me-2 text-primary" />{profile.email || '—'}</div>
              {profile.phone && <div className="text-muted mb-2 small"><i className="bi bi-telephone me-2 text-primary" />{profile.phone}</div>}
              <div className="d-flex gap-3 flex-wrap">
                <small className="text-muted"><i className="bi bi-calendar3 me-1" />เป็นสมาชิก {memberDays} วัน</small>
                <small className="text-muted"><i className="bi bi-clock me-1" />เข้าใช้ล่าสุด: {fmtDateTime(profile.last_login)}</small>
                <small className="text-muted"><i className="bi bi-building me-1" />Tenant: {tenantId}</small>
              </div>
            </div>

            {/* Quick actions */}
            <div className="text-end d-flex flex-column gap-2">
              <button className="btn btn-primary btn-sm" onClick={() => setTab('info')}>
                <i className="bi bi-pencil me-1" />แก้ไขโปรไฟล์
              </button>
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setTab('security')}>
                <i className="bi bi-key me-1" />เปลี่ยนรหัสผ่าน
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <ul className="nav nav-tabs mb-4">
        {([
          { key: 'info',     label: 'ข้อมูลส่วนตัว',      icon: 'bi-person-fill' },
          { key: 'role',     label: 'บทบาท & สิทธิ์',     icon: 'bi-shield-check' },
          { key: 'alerts',   label: 'การแจ้งเตือน CFO',   icon: 'bi-bell-fill' },
          { key: 'prefs',    label: 'การแสดงผล',           icon: 'bi-sliders' },
          { key: 'security', label: 'ความปลอดภัย',         icon: 'bi-lock-fill' },
        ] as { key: TabKey; label: string; icon: string }[]).map(t => (
          <li key={t.key} className="nav-item">
            <button className={`nav-link ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              <i className={`bi ${t.icon} me-1`} />{t.label}
            </button>
          </li>
        ))}
      </ul>

      {/* ══ TAB: ข้อมูลส่วนตัว ════════════════════════════════════════════════ */}
      {tab === 'info' && (
        <div className="row g-4">
          <div className="col-lg-8">
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold border-bottom">
                <i className="bi bi-person-circle me-2 text-primary" />ข้อมูลส่วนบุคคล
              </div>
              <div className="card-body p-4">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">ชื่อ-นามสกุล <span className="text-danger">*</span></label>
                    <div className="input-group">
                      <span className="input-group-text"><i className="bi bi-person" /></span>
                      <input className="form-control" value={profile.full_name}
                        onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
                        placeholder="กรอกชื่อ-นามสกุล" />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">อีเมล</label>
                    <div className="input-group">
                      <span className="input-group-text"><i className="bi bi-envelope" /></span>
                      <input className="form-control" value={profile.email} disabled
                        style={{ background: '#f8f9fa', color: '#6c757d' }} />
                    </div>
                    <div className="form-text"><i className="bi bi-lock me-1" />อีเมลไม่สามารถเปลี่ยนได้</div>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">เบอร์โทรศัพท์</label>
                    <div className="input-group">
                      <span className="input-group-text"><i className="bi bi-telephone" /></span>
                      <input className="form-control" value={profile.phone}
                        onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                        placeholder="0xx-xxx-xxxx" />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">บทบาทในระบบ</label>
                    <div className="input-group">
                      <span className="input-group-text"><i className={`bi ${rm.icon}`} /></span>
                      <input className="form-control" value={rm.label} disabled
                        style={{ background: '#f8f9fa' }} />
                    </div>
                    <div className="form-text">ติดต่อ Admin เพื่อเปลี่ยน Role</div>
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-semibold">เกี่ยวกับฉัน / ตำแหน่งงาน</label>
                    <textarea className="form-control" rows={3}
                      value={profile.bio}
                      onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                      placeholder="เช่น CFO, Financial Controller, Budget Manager — ระบุตำแหน่ง หน้าที่รับผิดชอบ…" />
                    <div className="form-text">{profile.bio.length}/500 ตัวอักษร</div>
                  </div>
                </div>
              </div>
              <div className="card-footer bg-transparent d-flex justify-content-between align-items-center">
                <small className="text-muted"><i className="bi bi-calendar3 me-1" />สมัครเมื่อ: {fmtDateTime(profile.created_at)}</small>
                <button className="btn btn-primary" onClick={saveProfile} disabled={saving || loading}>
                  {saving ? <><span className="spinner-border spinner-border-sm me-1" />กำลังบันทึก…</> : <><i className="bi bi-check-lg me-1" />บันทึกข้อมูล</>}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Account summary */}
          <div className="col-lg-4">
            <div className="card border-0 shadow-sm mb-3">
              <div className="card-header bg-transparent fw-semibold border-bottom">
                <i className="bi bi-info-circle me-2 text-primary" />สรุปบัญชี
              </div>
              <div className="card-body p-0">
                {[
                  { icon: 'bi-shield-fill-check', label: 'บทบาท',        value: rm.label,                     badge: rm.color },
                  { icon: 'bi-circle-fill',        label: 'สถานะ',        value: profile.is_active ? 'Active' : 'Inactive', badge: profile.is_active ? 'success' : 'danger' },
                  { icon: 'bi-building',            label: 'Tenant ID',   value: tenantId || '—',              badge: null },
                  { icon: 'bi-calendar-check',      label: 'เป็นสมาชิก', value: `${memberDays} วัน`,          badge: null },
                  { icon: 'bi-clock-history',       label: 'Login ล่าสุด',value: fmtDateTime(profile.last_login), badge: null },
                ].map((row, i) => (
                  <div key={i} className="px-3 py-2 border-bottom d-flex align-items-center gap-2">
                    <i className={`bi ${row.icon} text-primary flex-shrink-0`} style={{ width: 18 }} />
                    <span className="text-muted small flex-shrink-0" style={{ width: 90 }}>{row.label}</span>
                    {row.badge
                      ? <span className={`badge bg-${row.badge}`}>{row.value}</span>
                      : <span className="small fw-semibold text-truncate">{row.value}</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="card border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold border-bottom">
                <i className="bi bi-graph-up me-2 text-success" />การใช้งานระบบ
              </div>
              <div className="card-body">
                {[
                  { label: 'Module ที่ใช้บ่อย',  value: 'Dashboard, Budget, Cash Flow' },
                  { label: 'สกุลเงินหลัก',       value: prefs.currency },
                  { label: 'รูปแบบตัวเลข',       value: prefs.numberFormat === 'thai' ? 'Thai (1,234,567.89)' : 'International' },
                  { label: 'ปีงบประมาณเริ่ม',    value: `เดือน ${MONTHS[prefs.fiscalYearStart - 1]}` },
                  { label: 'รายงานสรุป',         value: { none: 'ปิด', daily: 'รายวัน', weekly: 'รายสัปดาห์', monthly: 'รายเดือน' }[alerts.reportDelivery] },
                ].map((row, i) => (
                  <div key={i} className="d-flex justify-content-between mb-2 small">
                    <span className="text-muted">{row.label}</span>
                    <span className="fw-semibold">{row.value}</span>
                  </div>
                ))}
                <hr className="my-2" />
                <div className="d-flex gap-2 flex-wrap">
                  <button className="btn btn-outline-primary btn-sm" onClick={() => setTab('alerts')}>
                    <i className="bi bi-bell me-1" />การแจ้งเตือน
                  </button>
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setTab('prefs')}>
                    <i className="bi bi-sliders me-1" />การแสดงผล
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB: บทบาท & สิทธิ์ ══════════════════════════════════════════════ */}
      {tab === 'role' && (
        <div className="row g-4">
          <div className="col-lg-4">
            <div className="card border-0 shadow-sm mb-3" style={{ borderLeft: `4px solid var(--bs-${rm.color})` }}>
              <div className="card-body p-4 text-center">
                <div className={`rounded-circle d-inline-flex align-items-center justify-content-center text-white mb-3`}
                  style={{ width: 72, height: 72, background: `var(--bs-${rm.color})`, fontSize: 30 }}>
                  <i className={`bi ${rm.icon}`} />
                </div>
                <h4 className="fw-bold mb-1">{rm.label}</h4>
                <div className="text-muted small mb-3">{rm.desc}</div>
                <span className={`badge bg-${rm.color} px-3 py-2 fs-6`}>{profile.role}</span>
              </div>
            </div>

            <div className="card border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold">
                <i className="bi bi-people me-2 text-primary" />Role Hierarchy
              </div>
              <div className="card-body p-0">
                {Object.entries(ROLE_META).map(([key, m]) => (
                  <div key={key} className={`px-3 py-2 border-bottom d-flex align-items-center gap-2 ${key === profile.role ? 'bg-primary bg-opacity-10' : ''}`}>
                    <i className={`bi ${m.icon} text-${m.color}`} />
                    <span className={`fw-semibold small ${key === profile.role ? 'text-primary' : ''}`}>{m.label}</span>
                    {key === profile.role && <span className="badge bg-primary ms-auto">ฉัน</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-lg-8">
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold">
                <i className="bi bi-list-check me-2 text-primary" />ตาราง Permission ตาม Role
              </div>
              <div className="card-body p-0">
                {Object.entries(PERMISSIONS).map(([group, perms]) => (
                  <div key={group}>
                    <div className="px-3 py-2 bg-light fw-bold small text-uppercase text-muted border-bottom"
                      style={{ letterSpacing: 1 }}>
                      <i className="bi bi-folder2-open me-2" />{group}
                    </div>
                    {perms.map((p, i) => {
                      const myHas = p.roles.includes(profile.role)
                      return (
                        <div key={i} className={`px-3 py-2 border-bottom d-flex align-items-center gap-3 ${myHas ? '' : 'opacity-50'}`}>
                          <div className={`flex-shrink-0 rounded-circle d-flex align-items-center justify-content-center`}
                            style={{ width: 24, height: 24, background: myHas ? '#198754' : '#dee2e6' }}>
                            <i className={`bi bi-${myHas ? 'check' : 'x'} text-white`} style={{ fontSize: '0.75rem' }} />
                          </div>
                          <span className="small flex-grow-1">{p.label}</span>
                          <div className="d-flex gap-1">
                            {Object.keys(ROLE_META).map(r => (
                              <span key={r} title={ROLE_META[r].label}
                                className={`badge ${p.roles.includes(r) ? `bg-${ROLE_META[r].color}` : 'bg-light text-muted border'}`}
                                style={{ fontSize: '0.6rem', padding: '2px 5px' }}>
                                {ROLE_META[r].label.substring(0, 3)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
              <div className="card-footer bg-transparent small text-muted">
                <i className="bi bi-info-circle me-1" />Permission ที่มีไฮไลท์คือสิ่งที่ Role ของคุณ ({rm.label}) สามารถทำได้
                {' '}— ติดต่อ Admin เพื่อขอเปลี่ยน Role
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB: การแจ้งเตือน CFO ════════════════════════════════════════════ */}
      {tab === 'alerts' && (
        <div className="row g-4">
          {/* Budget & Financial Thresholds */}
          <div className="col-lg-6">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-header bg-transparent fw-semibold border-bottom">
                <i className="bi bi-graph-up-arrow me-2 text-warning" />เกณฑ์แจ้งเตือนทางการเงิน (CFO Thresholds)
              </div>
              <div className="card-body p-4">

                {/* Budget Used % */}
                <div className="mb-4">
                  <label className="form-label fw-semibold">
                    <i className="bi bi-clipboard-data me-2 text-primary" />แจ้งเตือนเมื่องบประมาณถูกใช้เกิน
                  </label>
                  <div className="d-flex align-items-center gap-3">
                    <input type="range" className="form-range flex-grow-1"
                      min={50} max={100} step={5} value={alerts.budgetUsedPct}
                      onChange={e => setAlerts(a => ({ ...a, budgetUsedPct: +e.target.value }))} />
                    <div className="badge bg-warning text-dark fs-6 flex-shrink-0" style={{ minWidth: 55 }}>
                      {alerts.budgetUsedPct}%
                    </div>
                  </div>
                  <div className="small text-muted">แจ้งเตือนเมื่องบที่ใช้เกิน {alerts.budgetUsedPct}% ของงบทั้งหมด</div>
                </div>

                {/* Cash Flow Threshold */}
                <div className="mb-4">
                  <label className="form-label fw-semibold">
                    <i className="bi bi-cash-stack me-2 text-info" />แจ้งเตือนเมื่อกระแสเงินสดสุทธิต่ำกว่า
                  </label>
                  <div className="input-group">
                    <span className="input-group-text">฿</span>
                    <input type="number" className="form-control" step={100000}
                      value={alerts.cashflowThreshold}
                      onChange={e => setAlerts(a => ({ ...a, cashflowThreshold: +e.target.value }))} />
                    <span className="input-group-text">บาท</span>
                  </div>
                  <div className="small text-muted mt-1">แจ้งเตือนเมื่อ Net Cash Flow &lt; {alerts.cashflowThreshold.toLocaleString('th-TH')} บาท</div>
                </div>

                {/* P&L Variance */}
                <div className="mb-4">
                  <label className="form-label fw-semibold">
                    <i className="bi bi-bar-chart-line me-2 text-danger" />แจ้งเตือน P&L Variance เกิน
                  </label>
                  <div className="d-flex align-items-center gap-3">
                    <input type="range" className="form-range flex-grow-1"
                      min={5} max={50} step={5} value={alerts.plVariancePct}
                      onChange={e => setAlerts(a => ({ ...a, plVariancePct: +e.target.value }))} />
                    <div className="badge bg-danger fs-6 flex-shrink-0" style={{ minWidth: 55 }}>
                      {alerts.plVariancePct}%
                    </div>
                  </div>
                  <div className="small text-muted">แจ้งเตือนเมื่อ Actual vs Budget ต่างกันเกิน {alerts.plVariancePct}%</div>
                </div>

                {/* A/R Overdue */}
                <div className="mb-2">
                  <label className="form-label fw-semibold">
                    <i className="bi bi-receipt me-2 text-secondary" />แจ้งเตือนลูกหนี้ค้างชำระเกิน
                  </label>
                  <div className="input-group">
                    <input type="number" className="form-control"
                      value={alerts.arOverdueDays}
                      onChange={e => setAlerts(a => ({ ...a, arOverdueDays: +e.target.value }))} />
                    <span className="input-group-text">วัน</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Notification Channels */}
          <div className="col-lg-6">
            <div className="card border-0 shadow-sm mb-3">
              <div className="card-header bg-transparent fw-semibold border-bottom">
                <i className="bi bi-bell me-2 text-primary" />ช่องทางและประเภทการแจ้งเตือน
              </div>
              <div className="card-body p-4">
                {[
                  { key: 'emailAlerts',      label: 'Email Alerts',            desc: 'ส่งการแจ้งเตือนทุกประเภทผ่านอีเมล',               icon: 'bi-envelope-fill' },
                  { key: 'overdueAlerts',    label: 'Overdue Alerts',          desc: 'แจ้งเตือนเมื่อมีรายการค้างชำระหรือเกินกำหนด',     icon: 'bi-exclamation-triangle-fill' },
                  { key: 'budgetApproval',   label: 'Budget Approval',         desc: 'แจ้งเตือนเมื่อมีคำขออนุมัติงบประมาณใหม่',         icon: 'bi-clipboard-check-fill' },
                  { key: 'approvalRequests', label: 'Workflow Approvals',      desc: 'แจ้งเตือนเมื่อมีรายการรอการอนุมัติ',               icon: 'bi-check2-square' },
                  { key: 'forecastAlerts',   label: 'Forecast Variance',       desc: 'แจ้งเตือนเมื่อ Forecast เบี่ยงเบนจากเป้าหมาย',    icon: 'bi-graph-up-arrow' },
                ].map(item => (
                  <div key={item.key} className="d-flex align-items-center gap-3 mb-3 p-2 rounded"
                    style={{ background: (alerts as any)[item.key] ? '#f0f7ff' : '#f8f9fa' }}>
                    <div className={`flex-shrink-0 rounded d-flex align-items-center justify-content-center`}
                      style={{ width: 36, height: 36, background: (alerts as any)[item.key] ? '#1a6fc7' : '#dee2e6' }}>
                      <i className={`bi ${item.icon} text-white`} />
                    </div>
                    <div className="flex-grow-1">
                      <div className="fw-semibold small">{item.label}</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>{item.desc}</div>
                    </div>
                    <div className="form-check form-switch mb-0">
                      <input className="form-check-input" type="checkbox" role="switch"
                        checked={(alerts as any)[item.key]}
                        onChange={e => setAlerts(a => ({ ...a, [item.key]: e.target.checked }))} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold border-bottom">
                <i className="bi bi-calendar-week me-2 text-success" />กำหนดส่งรายงานสรุป
              </div>
              <div className="card-body">
                <div className="row g-2">
                  {([
                    { v: 'none',    label: 'ปิด',          icon: 'bi-bell-slash',    desc: 'ไม่รับรายงาน' },
                    { v: 'daily',   label: 'รายวัน',       icon: 'bi-calendar-day',  desc: 'ทุกเช้า 08:00' },
                    { v: 'weekly',  label: 'รายสัปดาห์',   icon: 'bi-calendar-week', desc: 'ทุกจันทร์ 08:00' },
                    { v: 'monthly', label: 'รายเดือน',     icon: 'bi-calendar-month',desc: 'วันที่ 1 ของเดือน' },
                  ] as const).map(opt => (
                    <div key={opt.v} className="col-6">
                      <div className={`card border-2 h-100 ${alerts.reportDelivery === opt.v ? 'border-success' : 'border-light'}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setAlerts(a => ({ ...a, reportDelivery: opt.v }))}>
                        <div className="card-body p-2 d-flex align-items-center gap-2">
                          <i className={`bi ${opt.icon} text-success`} />
                          <div>
                            <div className="small fw-semibold">{opt.label}</div>
                            <div style={{ fontSize: '0.68rem' }} className="text-muted">{opt.desc}</div>
                          </div>
                          {alerts.reportDelivery === opt.v && <i className="bi bi-check-circle-fill text-success ms-auto flex-shrink-0" />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 text-end">
            <button className="btn btn-primary" onClick={saveAlerts}>
              <i className="bi bi-check-lg me-1" />บันทึกการตั้งค่าการแจ้งเตือน
            </button>
          </div>
        </div>
      )}

      {/* ══ TAB: การแสดงผล ═══════════════════════════════════════════════════ */}
      {tab === 'prefs' && (
        <div className="row g-4">
          <div className="col-lg-6">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-header bg-transparent fw-semibold border-bottom">
                <i className="bi bi-currency-exchange me-2 text-primary" />การเงิน & ตัวเลข
              </div>
              <div className="card-body p-4">

                {/* Currency */}
                <div className="mb-4">
                  <label className="form-label fw-semibold">สกุลเงินหลัก</label>
                  <div className="row g-2">
                    {([
                      { v: 'THB', label: 'Thai Baht', symbol: '฿', flag: '🇹🇭' },
                      { v: 'USD', label: 'US Dollar',  symbol: '$', flag: '🇺🇸' },
                      { v: 'EUR', label: 'Euro',        symbol: '€', flag: '🇪🇺' },
                      { v: 'JPY', label: 'Japanese Yen',symbol: '¥', flag: '🇯🇵' },
                    ] as const).map(c => (
                      <div key={c.v} className="col-6">
                        <div className={`card border-2 ${prefs.currency === c.v ? 'border-primary' : 'border-light'}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setPrefs(p => ({ ...p, currency: c.v }))}>
                          <div className="card-body p-2 d-flex align-items-center gap-2">
                            <span style={{ fontSize: '1.3rem' }}>{c.flag}</span>
                            <div>
                              <div className="small fw-bold">{c.symbol} {c.v}</div>
                              <div style={{ fontSize: '0.7rem' }} className="text-muted">{c.label}</div>
                            </div>
                            {prefs.currency === c.v && <i className="bi bi-check-circle-fill text-primary ms-auto" />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Number format */}
                <div className="mb-4">
                  <label className="form-label fw-semibold">รูปแบบตัวเลข</label>
                  {([
                    { v: 'thai', label: 'Thai Format',          example: '1,234,567.89', desc: 'จุลภาค = หลักพัน, จุด = ทศนิยม' },
                    { v: 'intl', label: 'International Format', example: '1.234.567,89', desc: 'จุด = หลักพัน, จุลภาค = ทศนิยม' },
                  ] as const).map(n => (
                    <div key={n.v} className={`card border-2 mb-2 ${prefs.numberFormat === n.v ? 'border-primary' : 'border-light'}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setPrefs(p => ({ ...p, numberFormat: n.v }))}>
                      <div className="card-body p-2 d-flex align-items-center gap-3">
                        <div>
                          <div className="fw-semibold small">{n.label}</div>
                          <div className="fw-bold text-primary">{n.example}</div>
                          <div style={{ fontSize: '0.7rem' }} className="text-muted">{n.desc}</div>
                        </div>
                        {prefs.numberFormat === n.v && <i className="bi bi-check-circle-fill text-primary ms-auto" />}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Show cents */}
                <div className="d-flex align-items-center gap-3 p-3 bg-light rounded">
                  <div className="flex-grow-1">
                    <div className="fw-semibold small">แสดงทศนิยมในรายงาน</div>
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>เช่น 1,234,567<strong>.89</strong> บาท (ถ้าปิด = 1,234,568 บาท)</div>
                  </div>
                  <div className="form-check form-switch mb-0">
                    <input className="form-check-input" type="checkbox" checked={prefs.showCentsInReports}
                      onChange={e => setPrefs(p => ({ ...p, showCentsInReports: e.target.checked }))} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-lg-6">
            <div className="card border-0 shadow-sm mb-3">
              <div className="card-header bg-transparent fw-semibold border-bottom">
                <i className="bi bi-calendar3 me-2 text-primary" />วันที่ & ปีงบประมาณ
              </div>
              <div className="card-body p-4">
                {/* Date format */}
                <div className="mb-4">
                  <label className="form-label fw-semibold">รูปแบบวันที่</label>
                  <div className="row g-2">
                    {([
                      { v: 'DD/MM/YYYY', label: '31/12/2025', desc: 'Thai Standard' },
                      { v: 'MM/DD/YYYY', label: '12/31/2025', desc: 'US Format' },
                      { v: 'YYYY-MM-DD', label: '2025-12-31', desc: 'ISO 8601' },
                    ] as const).map(d => (
                      <div key={d.v} className="col-12">
                        <div className={`card border-2 ${prefs.dateFormat === d.v ? 'border-primary' : 'border-light'}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setPrefs(p => ({ ...p, dateFormat: d.v }))}>
                          <div className="card-body p-2 d-flex align-items-center gap-3">
                            <div className="fw-bold text-primary" style={{ minWidth: 100 }}>{d.label}</div>
                            <div>
                              <div className="small fw-semibold">{d.v}</div>
                              <div style={{ fontSize: '0.7rem' }} className="text-muted">{d.desc}</div>
                            </div>
                            {prefs.dateFormat === d.v && <i className="bi bi-check-circle-fill text-primary ms-auto" />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fiscal year */}
                <div className="mb-3">
                  <label className="form-label fw-semibold">เดือนเริ่มปีงบประมาณ</label>
                  <select className="form-select"
                    value={prefs.fiscalYearStart}
                    onChange={e => setPrefs(p => ({ ...p, fiscalYearStart: +e.target.value }))}>
                    {MONTHS.map((m, i) => (
                      <option key={i + 1} value={i + 1}>เดือน {i + 1} — {m}</option>
                    ))}
                  </select>
                  <div className="form-text">
                    ปีงบประมาณ: {MONTHS[prefs.fiscalYearStart - 1]} — {MONTHS[(prefs.fiscalYearStart + 10) % 12]}
                  </div>
                </div>
              </div>
            </div>

            <div className="card border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold border-bottom">
                <i className="bi bi-layout-sidebar me-2 text-primary" />การแสดงผล Dashboard
              </div>
              <div className="card-body p-4">
                <div className="mb-3">
                  <label className="form-label fw-semibold">Dashboard เริ่มต้น</label>
                  <div className="row g-2">
                    {([
                      { v: 'summary',  label: 'ภาพรวม CFO',   icon: 'bi-speedometer2' },
                      { v: 'cashflow', label: 'Cash Flow',     icon: 'bi-cash-stack' },
                      { v: 'budget',   label: 'Budget',        icon: 'bi-clipboard-data' },
                      { v: 'pnl',      label: 'P&L',           icon: 'bi-bar-chart-line' },
                    ] as const).map(d => (
                      <div key={d.v} className="col-6">
                        <div className={`card border-2 ${prefs.defaultDashboard === d.v ? 'border-primary' : 'border-light'}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setPrefs(p => ({ ...p, defaultDashboard: d.v }))}>
                          <div className="card-body p-2 text-center">
                            <i className={`bi ${d.icon} text-primary fs-5 d-block mb-1`} />
                            <div className="small fw-semibold">{d.label}</div>
                            {prefs.defaultDashboard === d.v && <i className="bi bi-check-circle-fill text-primary d-block mt-1" style={{ fontSize: '0.8rem' }} />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="form-label fw-semibold">Theme</label>
                  <div className="d-flex gap-2">
                    {([
                      { v: 'light', label: 'Light', icon: 'bi-sun' },
                      { v: 'dark',  label: 'Dark',  icon: 'bi-moon' },
                      { v: 'auto',  label: 'Auto',  icon: 'bi-circle-half' },
                    ] as const).map(t => (
                      <button key={t.v}
                        className={`btn ${prefs.theme === t.v ? 'btn-primary' : 'btn-outline-secondary'} btn-sm flex-fill`}
                        onClick={() => setPrefs(p => ({ ...p, theme: t.v }))}>
                        <i className={`bi ${t.icon} me-1`} />{t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="col-12">
            <div className="card border-0 shadow-sm" style={{ borderTop: '3px solid #1a6fc7' }}>
              <div className="card-header bg-transparent fw-semibold border-bottom">
                <i className="bi bi-eye me-2 text-primary" />Preview การแสดงผล
              </div>
              <div className="card-body">
                <div className="row g-3">
                  {[
                    { label: 'ตัวเลขการเงิน',  value: (12345678.9).toLocaleString(prefs.numberFormat === 'thai' ? 'th-TH' : 'de-DE', { minimumFractionDigits: prefs.showCentsInReports ? 2 : 0 }) + ' ' + prefs.currency },
                    { label: 'วันที่',           value: prefs.dateFormat.replace('DD','31').replace('MM','12').replace('YYYY','2025') },
                    { label: 'ปีงบประมาณ',       value: `${MONTHS[prefs.fiscalYearStart - 1]} 2025 — ${MONTHS[(prefs.fiscalYearStart + 10) % 12]} 2026` },
                    { label: 'Dashboard เริ่มต้น',value: { summary: 'ภาพรวม CFO', cashflow: 'Cash Flow', budget: 'Budget', pnl: 'P&L' }[prefs.defaultDashboard] },
                  ].map((item, i) => (
                    <div key={i} className="col-md-3">
                      <div className="p-3 bg-light rounded text-center">
                        <div className="text-muted small mb-1">{item.label}</div>
                        <div className="fw-bold text-primary">{item.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 text-end">
            <button className="btn btn-primary" onClick={savePrefs}>
              <i className="bi bi-check-lg me-1" />บันทึกการตั้งค่าการแสดงผล
            </button>
          </div>
        </div>
      )}

      {/* ══ TAB: ความปลอดภัย ════════════════════════════════════════════════ */}
      {tab === 'security' && (
        <div className="row g-4">
          <div className="col-lg-6">
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold border-bottom">
                <i className="bi bi-key me-2 text-warning" />เปลี่ยนรหัสผ่าน
              </div>
              <div className="card-body p-4">
                <div className="mb-3">
                  <label className="form-label fw-semibold">รหัสผ่านปัจจุบัน <span className="text-danger">*</span></label>
                  <div className="input-group">
                    <input type={showPw.current ? 'text' : 'password'} className="form-control"
                      value={pwForm.current}
                      onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                      placeholder="รหัสผ่านปัจจุบัน" />
                    <button className="btn btn-outline-secondary" type="button"
                      onClick={() => setShowPw(p => ({ ...p, current: !p.current }))}>
                      <i className={`bi bi-eye${showPw.current ? '-slash' : ''}`} />
                    </button>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">รหัสผ่านใหม่ <span className="text-danger">*</span></label>
                  <div className="input-group">
                    <input type={showPw.next ? 'text' : 'password'} className="form-control"
                      value={pwForm.next}
                      onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
                      placeholder="อย่างน้อย 8 ตัวอักษร" />
                    <button className="btn btn-outline-secondary" type="button"
                      onClick={() => setShowPw(p => ({ ...p, next: !p.next }))}>
                      <i className={`bi bi-eye${showPw.next ? '-slash' : ''}`} />
                    </button>
                  </div>
                  {/* Password strength */}
                  {pwForm.next.length > 0 && (
                    <div className="mt-2">
                      <div className="d-flex gap-1 mb-1">
                        {[1,2,3,4].map(i => {
                          const strength = Math.min(4, [
                            pwForm.next.length >= 8,
                            /[A-Z]/.test(pwForm.next),
                            /[0-9]/.test(pwForm.next),
                            /[^A-Za-z0-9]/.test(pwForm.next),
                          ].filter(Boolean).length)
                          const colors = ['','danger','warning','info','success']
                          return <div key={i} className={`flex-fill rounded`}
                            style={{ height: 4, background: i <= strength ? `var(--bs-${colors[strength]})` : '#dee2e6' }} />
                        })}
                      </div>
                      <small className="text-muted">
                        ความแข็งแกร่ง: {[
                          pwForm.next.length >= 8 && '8+ ตัวอักษร',
                          /[A-Z]/.test(pwForm.next) && 'ตัวพิมพ์ใหญ่',
                          /[0-9]/.test(pwForm.next) && 'ตัวเลข',
                          /[^A-Za-z0-9]/.test(pwForm.next) && 'อักขระพิเศษ',
                        ].filter(Boolean).join(', ') || 'อ่อนมาก'}
                      </small>
                    </div>
                  )}
                </div>
                <div className="mb-4">
                  <label className="form-label fw-semibold">ยืนยันรหัสผ่านใหม่ <span className="text-danger">*</span></label>
                  <div className="input-group">
                    <input type={showPw.confirm ? 'text' : 'password'} className="form-control"
                      value={pwForm.confirm}
                      onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                      placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                      style={pwForm.confirm && pwForm.next !== pwForm.confirm ? { borderColor: '#dc3545' } : {}} />
                    <button className="btn btn-outline-secondary" type="button"
                      onClick={() => setShowPw(p => ({ ...p, confirm: !p.confirm }))}>
                      <i className={`bi bi-eye${showPw.confirm ? '-slash' : ''}`} />
                    </button>
                  </div>
                  {pwForm.confirm && pwForm.next !== pwForm.confirm && (
                    <div className="text-danger small mt-1"><i className="bi bi-x-circle me-1" />รหัสผ่านไม่ตรงกัน</div>
                  )}
                  {pwForm.confirm && pwForm.next === pwForm.confirm && pwForm.confirm.length > 0 && (
                    <div className="text-success small mt-1"><i className="bi bi-check-circle me-1" />รหัสผ่านตรงกัน</div>
                  )}
                </div>
                <button className="btn btn-warning w-100" onClick={savePassword}
                  disabled={saving || !pwForm.current || !pwForm.next || pwForm.next !== pwForm.confirm}>
                  {saving ? <><span className="spinner-border spinner-border-sm me-1" />กำลังเปลี่ยนรหัสผ่าน…</> : <><i className="bi bi-key me-1" />เปลี่ยนรหัสผ่าน</>}
                </button>
              </div>
            </div>
          </div>

          <div className="col-lg-6 d-flex flex-column gap-3">
            {/* Session info */}
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold border-bottom">
                <i className="bi bi-pc-display me-2 text-primary" />Session ปัจจุบัน
              </div>
              <div className="card-body p-3">
                <div className="d-flex align-items-center gap-3 p-3 bg-success bg-opacity-10 rounded mb-3">
                  <div style={{ width: 44, height: 44, borderRadius: 8, background: '#198754', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="bi bi-laptop text-white fs-5" />
                  </div>
                  <div>
                    <div className="fw-semibold small">เครื่องนี้ (Browser)</div>
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>{navigator.userAgent.includes('Mac') ? 'macOS' : 'Windows'} — {new Date().toLocaleDateString('th-TH')}</div>
                  </div>
                  <span className="badge bg-success ms-auto"><i className="bi bi-circle-fill me-1" style={{ fontSize: '0.5rem' }} />Active</span>
                </div>
                <div className="alert alert-info py-2 small mb-0">
                  <i className="bi bi-info-circle me-2" />
                  หากต้องการ logout ออกจากทุก session กรุณาติดต่อ Admin หรือเปลี่ยนรหัสผ่าน
                </div>
              </div>
            </div>

            {/* Security checklist */}
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold border-bottom">
                <i className="bi bi-shield-check me-2 text-success" />Security Checklist
              </div>
              <div className="card-body p-0">
                {[
                  { label: 'บัญชีถูกเปิดใช้งาน',          ok: profile.is_active,        tip: 'ติดต่อ Admin' },
                  { label: 'อีเมลผูกกับ Keycloak',          ok: !!profile.email,          tip: 'กรอกอีเมลให้ครบ' },
                  { label: 'ตั้งชื่อเต็ม (Full Name)',      ok: !!profile.full_name,      tip: 'ไปแก้ไขที่แท็บข้อมูลส่วนตัว' },
                  { label: 'มีเบอร์โทรศัพท์',              ok: !!profile.phone,          tip: 'ไปเพิ่มที่แท็บข้อมูลส่วนตัว' },
                  { label: 'ตั้งค่าการแจ้งเตือน',          ok: alerts.emailAlerts,       tip: 'เปิดที่แท็บการแจ้งเตือน' },
                  { label: 'ตั้งค่า Fiscal Year',           ok: prefs.fiscalYearStart > 0,tip: 'ตั้งค่าที่แท็บการแสดงผล' },
                ].map((item, i) => (
                  <div key={i} className="px-3 py-2 border-bottom d-flex align-items-center gap-2">
                    <i className={`bi bi-${item.ok ? 'check-circle-fill text-success' : 'exclamation-circle-fill text-warning'}`} />
                    <span className={`small flex-grow-1 ${item.ok ? '' : 'text-muted'}`}>{item.label}</span>
                    {!item.ok && <span className="small text-muted">{item.tip}</span>}
                  </div>
                ))}
              </div>
              <div className="card-footer bg-transparent">
                <div className="d-flex justify-content-between align-items-center">
                  <small className="text-muted">ความสมบูรณ์ของโปรไฟล์</small>
                  <span className="fw-bold text-primary">
                    {Math.round([profile.is_active, !!profile.email, !!profile.full_name, !!profile.phone, alerts.emailAlerts, prefs.fiscalYearStart > 0].filter(Boolean).length / 6 * 100)}%
                  </span>
                </div>
                <div className="progress mt-1" style={{ height: 6 }}>
                  <div className="progress-bar bg-primary"
                    style={{ width: `${Math.round([profile.is_active, !!profile.email, !!profile.full_name, !!profile.phone, alerts.emailAlerts, prefs.fiscalYearStart > 0].filter(Boolean).length / 6 * 100)}%` }} />
                </div>
              </div>
            </div>

            {/* Account info */}
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold border-bottom">
                <i className="bi bi-clock-history me-2 text-primary" />ข้อมูล Account
              </div>
              <div className="card-body p-0">
                {[
                  { label: 'User ID',           value: profile.id ? profile.id.slice(0, 16) + '…' : '—' },
                  { label: 'สมัครวันที่',       value: fmtDateTime(profile.created_at) },
                  { label: 'Login ล่าสุด',       value: fmtDateTime(profile.last_login) },
                  { label: 'เป็นสมาชิก',        value: `${memberDays} วัน` },
                  { label: 'Auth Provider',      value: 'Keycloak SSO' },
                  { label: 'MFA',                value: 'ไม่ได้ตั้งค่า (ติดต่อ Admin)' },
                ].map((row, i) => (
                  <div key={i} className="px-3 py-2 border-bottom d-flex">
                    <span className="text-muted small flex-shrink-0" style={{ width: 130 }}>{row.label}</span>
                    <span className="small fw-semibold">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
