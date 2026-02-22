import React, { useCallback, useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import api from '../api/client'
import { useTenant } from '../components/TenantContext'
import { useUser } from '../components/UserContext'
import { hasMinRole } from '../components/RequireRole'

// ─── Types ────────────────────────────────────────────────────────────────────
interface CompanyProfile {
  id?: string
  tenant_id?: string
  company_name: string
  tax_id?: string
  industry?: string
  fiscal_year_end?: string   // MM-DD
  default_currency: string
  address?: string
  phone?: string
  website?: string
  logo_url?: string
  settings?: Record<string, any>
  created_at?: string
  updated_at?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CURRENCIES = [
  { code: 'THB', label: 'THB — บาทไทย', symbol: '฿' },
  { code: 'USD', label: 'USD — US Dollar', symbol: '$' },
  { code: 'EUR', label: 'EUR — Euro', symbol: '€' },
  { code: 'SGD', label: 'SGD — Singapore Dollar', symbol: 'S$' },
  { code: 'JPY', label: 'JPY — Japanese Yen', symbol: '¥' },
  { code: 'CNY', label: 'CNY — Chinese Yuan', symbol: '¥' },
  { code: 'GBP', label: 'GBP — British Pound', symbol: '£' },
  { code: 'AUD', label: 'AUD — Australian Dollar', symbol: 'A$' },
  { code: 'HKD', label: 'HKD — Hong Kong Dollar', symbol: 'HK$' },
  { code: 'MYR', label: 'MYR — Malaysian Ringgit', symbol: 'RM' },
]

const INDUSTRIES = [
  'เทคโนโลยีสารสนเทศ (IT)',
  'การเงินและธนาคาร',
  'อสังหาริมทรัพย์',
  'การผลิต (Manufacturing)',
  'ค้าปลีก (Retail)',
  'ค้าส่ง (Wholesale)',
  'บริการ (Services)',
  'พลังงาน (Energy)',
  'สาธารณสุขและการแพทย์',
  'การเกษตร (Agriculture)',
  'การท่องเที่ยวและโรงแรม',
  'โลจิสติกส์และขนส่ง',
  'สื่อและบันเทิง',
  'การศึกษา',
  'ก่อสร้าง',
  'อาหารและเครื่องดื่ม',
  'แฟชั่นและสิ่งทอ',
  'เคมีและปิโตรเคมี',
  'ยานยนต์',
  'ประกันภัย',
  'อื่นๆ',
]

const FISCAL_MONTHS = [
  { val: '12-31', label: 'ธันวาคม (Dec 31) — ปฏิทินปกติ' },
  { val: '03-31', label: 'มีนาคม (Mar 31)' },
  { val: '06-30', label: 'มิถุนายน (Jun 30)' },
  { val: '09-30', label: 'กันยายน (Sep 30)' },
  { val: '01-31', label: 'มกราคม (Jan 31)' },
  { val: '02-28', label: 'กุมภาพันธ์ (Feb 28)' },
  { val: '04-30', label: 'เมษายน (Apr 30)' },
  { val: '05-31', label: 'พฤษภาคม (May 31)' },
  { val: '07-31', label: 'กรกฎาคม (Jul 31)' },
  { val: '08-31', label: 'สิงหาคม (Aug 31)' },
  { val: '10-31', label: 'ตุลาคม (Oct 31)' },
  { val: '11-30', label: 'พฤศจิกายน (Nov 30)' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
}

function calcCompleteness(p: CompanyProfile | null): { pct: number; filled: number; total: number; missing: string[] } {
  const fields: [keyof CompanyProfile, string][] = [
    ['company_name', 'ชื่อบริษัท'], ['tax_id', 'เลขประจำตัวผู้เสียภาษี'], ['industry', 'อุตสาหกรรม'],
    ['fiscal_year_end', 'สิ้นสุดปีการเงิน'], ['default_currency', 'สกุลเงิน'],
    ['address', 'ที่อยู่'], ['phone', 'เบอร์โทร'], ['website', 'เว็บไซต์'],
  ]
  if (!p) return { pct: 0, filled: 0, total: fields.length, missing: fields.map(f => f[1]) }
  const missing = fields.filter(([k]) => !p[k]).map(([, l]) => l)
  const filled = fields.length - missing.length
  return { pct: Math.round((filled / fields.length) * 100), filled, total: fields.length, missing }
}

function daysUntilFYEnd(fyEnd?: string): number | null {
  if (!fyEnd) return null
  const [mm, dd] = fyEnd.split('-').map(Number)
  const now = new Date()
  let candidate = new Date(now.getFullYear(), mm - 1, dd)
  if (candidate < now) candidate = new Date(now.getFullYear() + 1, mm - 1, dd)
  return Math.ceil((candidate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function logoPlaceholder(name: string) {
  return (name || '?').substring(0, 2).toUpperCase()
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function ToastAlert({ msg, type, onClose }: { msg: string; type: 'success' | 'danger' | 'warning'; onClose: () => void }) {
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99999, minWidth: 300 }}>
      <div className={`alert alert-${type} alert-dismissible shadow d-flex align-items-center mb-0`} role="alert">
        <i className={`bi ${type === 'success' ? 'bi-check-circle-fill' : type === 'warning' ? 'bi-exclamation-triangle-fill' : 'bi-x-circle-fill'} me-2 flex-shrink-0`}></i>
        <span>{msg}</span>
        <button className="btn-close ms-auto" onClick={onClose}></button>
      </div>
    </div>,
    document.body
  )
}

const BLANK: CompanyProfile = {
  company_name: '', tax_id: '', industry: '', fiscal_year_end: '12-31',
  default_currency: 'THB', address: '', phone: '', website: '', logo_url: '',
}

export default function CompanyProfile() {
  const { tenantId, refreshCompanyProfile } = useTenant()
  const { role } = useUser()
  const isAdmin = hasMinRole(role, 'admin')

  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'general' | 'financial' | 'address' | 'settings'>('general')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<CompanyProfile>(BLANK)
  const [saving, setSaving] = useState(false)
  const [settingsText, setSettingsText] = useState('')
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' | 'warning' } | null>(null)
  const toastTimer = useRef<any>(null)

  const showToast = (msg: string, type: 'success' | 'danger' | 'warning' = 'success') => {
    setToast({ msg, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4500)
  }

  const { getSignal } = useAbortController()

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!tenantId) { setProfile(null); setLoading(false); return }
    setLoading(true)
    try {
      const r = await api.get('/users/company/profile', { signal })
      setProfile(r.data || null)
    } catch (e: any) {
      if (!isAbortError(e)) { console.warn(e); setProfile(null) }
    } finally { setLoading(false) }
  }, [tenantId])

  useEffect(() => { load(getSignal()) }, [load])

  function startEdit() {
    setForm({
      company_name: profile?.company_name || '',
      tax_id: profile?.tax_id || '',
      industry: profile?.industry || '',
      fiscal_year_end: profile?.fiscal_year_end || '12-31',
      default_currency: profile?.default_currency || 'THB',
      address: profile?.address || '',
      phone: profile?.phone || '',
      website: profile?.website || '',
      logo_url: profile?.logo_url || '',
    })
    setSettingsText(profile?.settings ? JSON.stringify(profile.settings, null, 2) : '{}')
    setSettingsError(null)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setSettingsError(null)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.company_name.trim()) { showToast('กรุณาระบุชื่อบริษัท', 'warning'); return }
    let parsedSettings: any = null
    if (settingsText.trim() && settingsText.trim() !== '{}') {
      try { parsedSettings = JSON.parse(settingsText) }
      catch { setSettingsError('Invalid JSON'); return }
    }
    setSaving(true)
    try {
      const payload = { ...form, settings: parsedSettings }
      const res = await api.post('/users/company/profile', payload)
      setProfile(res.data)
      setEditing(false)
      showToast('บันทึกข้อมูลบริษัทสำเร็จ')
      await refreshCompanyProfile(tenantId)
    } catch (e: any) {
      showToast(e.response?.data?.message || e.message || 'Failed to save', 'danger')
    } finally { setSaving(false) }
  }

  const completeness = calcCompleteness(profile)
  const daysLeft = daysUntilFYEnd(profile?.fiscal_year_end)
  const currency = CURRENCIES.find(c => c.code === (profile?.default_currency || 'THB'))
  const fyLabel = FISCAL_MONTHS.find(f => f.val === profile?.fiscal_year_end)?.label || profile?.fiscal_year_end || '—'

  return (
    <>
      {/* ── Loading ────────────────────────────────────────────────────────── */}
      {loading && (
        <div className="text-center py-5">
          <div className="spinner-border text-primary"></div>
          <p className="mt-2 text-muted small">กำลังโหลดข้อมูลบริษัท…</p>
        </div>
      )}

      {!loading && (
        <>
          {/* ── Hero Banner ──────────────────────────────────────────────────── */}
          <div className="card mb-3 border-0 overflow-hidden"
            style={{ background: 'linear-gradient(135deg,#1a6fc7 0%,#0d47a1 60%,#0a336b 100%)', minHeight: 120 }}>
            <div className="card-body py-3 px-4 d-flex align-items-center gap-4 flex-wrap">
              {/* Logo / Avatar */}
              <div className="flex-shrink-0">
                {profile?.logo_url ? (
                  <img src={profile.logo_url} alt="logo"
                    style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 12, background: '#fff', padding: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }} />
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: '#fff', border: '2px solid rgba(255,255,255,0.4)' }}>
                    {logoPlaceholder(profile?.company_name || tenantId || '?')}
                  </div>
                )}
              </div>
              {/* Info */}
              <div className="flex-grow-1 min-w-0">
                <h4 className="mb-0 fw-bold text-white">
                  {profile?.company_name || <span className="opacity-75">ยังไม่ได้ตั้งชื่อบริษัท</span>}
                </h4>
                <div className="d-flex flex-wrap gap-3 mt-1">
                  {profile?.industry && (
                    <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>
                      <i className="bi bi-building me-1"></i>{profile.industry}
                    </span>
                  )}
                  {profile?.website && (
                    <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', textDecoration: 'none' }}>
                      <i className="bi bi-globe me-1"></i>{profile.website}
                    </a>
                  )}
                  {profile?.phone && (
                    <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem' }}>
                      <i className="bi bi-telephone me-1"></i>{profile.phone}
                    </span>
                  )}
                </div>
                {profile?.tax_id && (
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginTop: 2 }}>
                    <i className="bi bi-card-text me-1"></i>Tax ID: {profile.tax_id}
                  </div>
                )}
              </div>
              {/* Actions */}
              <div className="flex-shrink-0 d-flex gap-2">
                <button className="btn btn-sm btn-outline-light" onClick={load} title="Refresh">
                  <i className="bi bi-arrow-clockwise"></i>
                </button>
                {isAdmin && !editing && (
                  <button className="btn btn-sm btn-light fw-semibold" onClick={startEdit}>
                    <i className="bi bi-pencil me-1"></i>Edit Profile
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── KPI Strip ────────────────────────────────────────────────────── */}
          <div className="row g-2 mb-3">
            {[
              {
                label: 'Profile Completeness',
                value: `${completeness.pct}%`,
                icon: 'bi-clipboard-check-fill',
                color: completeness.pct >= 80 ? 'text-bg-success' : completeness.pct >= 50 ? 'text-bg-warning' : 'text-bg-danger',
                desc: `${completeness.filled}/${completeness.total} fields`,
              },
              {
                label: 'สกุลเงินหลัก',
                value: profile?.default_currency || 'THB',
                icon: 'bi-currency-exchange',
                color: 'text-bg-primary',
                desc: currency?.label.split('—')[1]?.trim() || '',
              },
              {
                label: 'สิ้นสุดปีการเงิน',
                value: profile?.fiscal_year_end || '—',
                icon: 'bi-calendar-check-fill',
                color: 'text-bg-info',
                desc: daysLeft !== null ? `อีก ${daysLeft} วัน` : 'ยังไม่ได้ตั้งค่า',
              },
              {
                label: 'Tax ID',
                value: profile?.tax_id ? 'มีแล้ว' : 'ยังไม่ระบุ',
                icon: 'bi-card-list',
                color: profile?.tax_id ? 'text-bg-success' : 'text-bg-secondary',
                desc: profile?.tax_id || '—',
              },
              {
                label: 'อุตสาหกรรม',
                value: profile?.industry ? '✓' : '—',
                icon: 'bi-buildings-fill',
                color: profile?.industry ? 'text-bg-primary' : 'text-bg-secondary',
                desc: profile?.industry || 'ยังไม่ระบุ',
              },
              {
                label: 'อัปเดตล่าสุด',
                value: profile?.updated_at ? fmtDate(profile.updated_at) : '—',
                icon: 'bi-clock-history',
                color: 'text-bg-secondary',
                desc: profile?.updated_at ? 'ข้อมูลล่าสุด' : 'ยังไม่มีข้อมูล',
              },
            ].map(k => (
              <div key={k.label} className="col-6 col-sm-4 col-lg-2">
                <div className="info-box mb-0">
                  <span className={`info-box-icon ${k.color}`}><i className={`bi ${k.icon}`}></i></span>
                  <div className="info-box-content">
                    <span className="info-box-text">{k.label}</span>
                    <span className="info-box-number" style={{ fontSize: '1rem' }}>{k.value}</span>
                    <span className="progress-description" style={{ fontSize: '0.72rem', color: '#666' }}>{k.desc}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Completeness Bar (when editing or missing fields) ── */}
          {(editing || completeness.pct < 100) && (
            <div className="card mb-3">
              <div className="card-body py-2 px-3">
                <div className="d-flex align-items-center gap-3">
                  <span className="text-muted small fw-semibold flex-shrink-0">ความสมบูรณ์ของโปรไฟล์:</span>
                  <div className="progress flex-grow-1" style={{ height: 10 }}>
                    <div
                      className={`progress-bar ${completeness.pct >= 80 ? 'bg-success' : completeness.pct >= 50 ? 'bg-warning' : 'bg-danger'} progress-bar-striped`}
                      style={{ width: `${completeness.pct}%`, transition: 'width 0.5s' }}>
                    </div>
                  </div>
                  <span className={`badge ${completeness.pct >= 80 ? 'text-bg-success' : completeness.pct >= 50 ? 'text-bg-warning' : 'text-bg-danger'} flex-shrink-0`}>
                    {completeness.pct}%
                  </span>
                </div>
                {completeness.missing.length > 0 && (
                  <div className="mt-1 small text-muted">
                    <i className="bi bi-info-circle me-1"></i>ยังขาด: {completeness.missing.join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Main Card ────────────────────────────────────────────────────── */}
          <div className="row g-3">
            <div className="col-lg-8">
              <div className="card">
                {/* Tabs */}
                <div className="card-header p-0">
                  <ul className="nav nav-tabs card-header-tabs px-3">
                    {([
                      ['general',   'bi-person-vcard',     'ข้อมูลทั่วไป'],
                      ['financial', 'bi-coin',              'การเงิน'],
                      ['address',   'bi-geo-alt-fill',      'ที่อยู่'],
                      ['settings',  'bi-sliders',           'Custom Settings'],
                    ] as [string, string, string][]).map(([t, ic, lb]) => (
                      <li key={t} className="nav-item">
                        <button className={`nav-link ${activeTab === t ? 'active' : ''}`}
                          onClick={() => setActiveTab(t as any)}>
                          <i className={`bi ${ic} me-1`}></i>{lb}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {editing ? (
                  /* ── Edit Form ─────────────────────────────────────────── */
                  <form onSubmit={handleSave}>
                    <div className="card-body">
                      {/* General Tab */}
                      {activeTab === 'general' && (
                        <div className="row g-3">
                          <div className="col-12">
                            <label className="form-label fw-semibold">ชื่อบริษัท / Company Name <span className="text-danger">*</span></label>
                            <input type="text" className="form-control" value={form.company_name}
                              onChange={e => setForm({ ...form, company_name: e.target.value })}
                              placeholder="บริษัท ตัวอย่าง จำกัด" required autoFocus />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label fw-semibold">เลขประจำตัวผู้เสียภาษี (Tax ID)</label>
                            <input type="text" className="form-control" value={form.tax_id || ''}
                              onChange={e => setForm({ ...form, tax_id: e.target.value })}
                              placeholder="0123456789012" maxLength={13} />
                            <div className="form-text">เลข 13 หลัก (สำหรับนิติบุคคลในไทย)</div>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label fw-semibold">อุตสาหกรรม (Industry)</label>
                            <select className="form-select" value={form.industry || ''}
                              onChange={e => setForm({ ...form, industry: e.target.value })}>
                              <option value="">— เลือกอุตสาหกรรม —</option>
                              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                            </select>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label fw-semibold">เบอร์โทรศัพท์</label>
                            <input type="tel" className="form-control" value={form.phone || ''}
                              onChange={e => setForm({ ...form, phone: e.target.value })}
                              placeholder="02-xxx-xxxx" />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label fw-semibold">เว็บไซต์</label>
                            <input type="text" className="form-control" value={form.website || ''}
                              onChange={e => setForm({ ...form, website: e.target.value })}
                              placeholder="https://example.com" />
                          </div>
                          <div className="col-12">
                            <label className="form-label fw-semibold">URL โลโก้บริษัท</label>
                            <input type="url" className="form-control" value={form.logo_url || ''}
                              onChange={e => setForm({ ...form, logo_url: e.target.value })}
                              placeholder="https://cdn.example.com/logo.png" />
                            {form.logo_url && (
                              <div className="mt-2 p-2 bg-light rounded d-flex align-items-center gap-2">
                                <img src={form.logo_url} alt="preview" style={{ height: 40, objectFit: 'contain' }}
                                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                <span className="text-muted small">Preview</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Financial Tab */}
                      {activeTab === 'financial' && (
                        <div className="row g-3">
                          <div className="col-12">
                            <div className="alert alert-info py-2 small d-flex align-items-start gap-2">
                              <i className="bi bi-info-circle-fill flex-shrink-0 mt-1"></i>
                              <span>การตั้งค่าเหล่านี้มีผลต่อการแสดงผลงบการเงิน, การคำนวณ projection และ budget ทั่วทั้งระบบ CFO</span>
                            </div>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label fw-semibold">สกุลเงินหลัก (Default Currency) <span className="text-danger">*</span></label>
                            <select className="form-select" value={form.default_currency}
                              onChange={e => setForm({ ...form, default_currency: e.target.value })}>
                              {CURRENCIES.map(c => (
                                <option key={c.code} value={c.code}>{c.label}</option>
                              ))}
                            </select>
                            <div className="form-text">ใช้สำหรับแสดงตัวเลขในรายงานทางการเงินทั้งหมด</div>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label fw-semibold">วันสิ้นสุดปีบัญชี (Fiscal Year End)</label>
                            <select className="form-select" value={form.fiscal_year_end || '12-31'}
                              onChange={e => setForm({ ...form, fiscal_year_end: e.target.value })}>
                              {FISCAL_MONTHS.map(f => (
                                <option key={f.val} value={f.val}>{f.label}</option>
                              ))}
                            </select>
                            <div className="form-text">กำหนดช่วงปีงบประมาณสำหรับ Budget และ Planning</div>
                          </div>
                          {/* FY Preview */}
                          {form.fiscal_year_end && (() => {
                            const d = daysUntilFYEnd(form.fiscal_year_end)
                            const fyLbl = FISCAL_MONTHS.find(f => f.val === form.fiscal_year_end)?.label || ''
                            return (
                              <div className="col-12">
                                <div className="p-3 rounded border bg-light">
                                  <div className="fw-semibold small mb-1"><i className="bi bi-calendar3 me-1"></i>ปีบัญชีถัดไป</div>
                                  <div className="text-muted small">สิ้นสุดที่: <strong>{fyLbl.split('—')[0].trim()}</strong>
                                    {d !== null && <span className="ms-2 badge text-bg-primary">อีก {d} วัน</span>}
                                  </div>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      )}

                      {/* Address Tab */}
                      {activeTab === 'address' && (
                        <div className="row g-3">
                          <div className="col-12">
                            <label className="form-label fw-semibold">ที่อยู่บริษัท</label>
                            <textarea className="form-control" rows={5} value={form.address || ''}
                              onChange={e => setForm({ ...form, address: e.target.value })}
                              placeholder={'เลขที่ ถนน แขวง/ตำบล\nเขต/อำเภอ จังหวัด รหัสไปรษณีย์\nประเทศ'} />
                            <div className="form-text">ที่อยู่ที่ใช้ในเอกสารสำคัญทางการเงินและภาษี</div>
                          </div>
                          {form.address && (
                            <div className="col-12">
                              <div className="p-3 bg-light rounded border small">
                                <div className="text-muted mb-1 fw-semibold"><i className="bi bi-geo-alt me-1"></i>Preview:</div>
                                <div style={{ whiteSpace: 'pre-wrap' }}>{form.address}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Settings Tab */}
                      {activeTab === 'settings' && (
                        <div>
                          <div className="alert alert-warning py-2 small mb-3 d-flex align-items-start gap-2">
                            <i className="bi bi-exclamation-triangle-fill flex-shrink-0 mt-1"></i>
                            <span>Custom settings เป็น JSON object สำหรับตั้งค่าขั้นสูง แก้ไขเฉพาะเมื่อเข้าใจผลกระทบ</span>
                          </div>
                          {settingsError && (
                            <div className="alert alert-danger py-1 small mb-2">{settingsError}</div>
                          )}
                          <label className="form-label fw-semibold">Custom Settings (JSON)</label>
                          <textarea className="form-control font-monospace" rows={10}
                            value={settingsText}
                            onChange={e => { setSettingsText(e.target.value); setSettingsError(null) }}
                            style={{ fontSize: '0.82rem' }}
                            placeholder={'{\n  "reportingPeriod": "monthly",\n  "autoRounding": true\n}'} />
                          <div className="mt-2 d-flex gap-2">
                            <button type="button" className="btn btn-sm btn-outline-secondary"
                              onClick={() => { try { setSettingsText(JSON.stringify(JSON.parse(settingsText), null, 2)); setSettingsError(null) } catch { setSettingsError('Invalid JSON') } }}>
                              <i className="bi bi-code-slash me-1"></i>Format JSON
                            </button>
                            <button type="button" className="btn btn-sm btn-outline-danger"
                              onClick={() => { setSettingsText('{}'); setSettingsError(null) }}>
                              <i className="bi bi-trash me-1"></i>Reset
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Save/Cancel Footer */}
                    <div className="card-footer d-flex justify-content-between align-items-center">
                      <span className="text-muted small"><i className="bi bi-info-circle me-1"></i>ข้อมูลจะถูกอัปเดตทั่วทั้งระบบ CFO</span>
                      <div className="d-flex gap-2">
                        <button type="button" className="btn btn-outline-secondary" onClick={cancelEdit}>
                          <i className="bi bi-x-lg me-1"></i>Cancel
                        </button>
                        <button type="submit" className="btn btn-primary px-4" disabled={saving || !form.company_name.trim()}>
                          {saving
                            ? <><span className="spinner-border spinner-border-sm me-1"></span>Saving…</>
                            : <><i className="bi bi-check-circle me-1"></i>Save Profile</>}
                        </button>
                      </div>
                    </div>
                  </form>
                ) : (
                  /* ── View Mode ─────────────────────────────────────────── */
                  <>
                    <div className="card-body">
                      {/* General Tab */}
                      {activeTab === 'general' && (
                        profile ? (
                          <dl className="row mb-0">
                            {[
                              ['ชื่อบริษัท', profile.company_name, 'bi-buildings'],
                              ['เลขผู้เสียภาษี (Tax ID)', profile.tax_id, 'bi-card-text'],
                              ['อุตสาหกรรม', profile.industry, 'bi-building'],
                              ['เบอร์โทร', profile.phone, 'bi-telephone'],
                              ['เว็บไซต์', profile.website, 'bi-globe'],
                              ['URL โลโก้', profile.logo_url, 'bi-image'],
                            ].map(([label, val, icon]) => (
                              <React.Fragment key={label as string}>
                                <dt className="col-sm-4 text-muted small py-2 d-flex align-items-center gap-1">
                                  <i className={`bi ${icon}`}></i>{label}
                                </dt>
                                <dd className="col-sm-8 py-2 mb-0">
                                  {val ? (
                                    label === 'เว็บไซต์' ? (
                                      <a href={(val as string).startsWith('http') ? val as string : `https://${val}`} target="_blank" rel="noopener noreferrer">
                                        {val as string}
                                      </a>
                                    ) : (
                                      <span className="fw-semibold">{val as string}</span>
                                    )
                                  ) : (
                                    <span className="text-muted fst-italic">ยังไม่ระบุ</span>
                                  )}
                                </dd>
                                <div className="col-12 border-bottom my-0" style={{ borderColor: '#f0f0f0' }}></div>
                              </React.Fragment>
                            ))}
                          </dl>
                        ) : (
                          <div className="text-center py-5">
                            <i className="bi bi-building text-muted" style={{ fontSize: 48 }}></i>
                            <h5 className="mt-3">ยังไม่มีข้อมูลบริษัท</h5>
                            <p className="text-muted">กรุณา Setup ข้อมูลบริษัทเพื่อใช้งานระบบ CFO ได้อย่างสมบูรณ์</p>
                            {isAdmin && (
                              <button className="btn btn-primary" onClick={startEdit}>
                                <i className="bi bi-plus-circle me-1"></i>Setup Company Profile
                              </button>
                            )}
                          </div>
                        )
                      )}

                      {/* Financial Tab */}
                      {activeTab === 'financial' && (
                        <dl className="row mb-0">
                          {[
                            ['สกุลเงินหลัก', `${profile?.default_currency || 'THB'} — ${currency?.label.split('—')[1]?.trim() || ''}`, 'bi-currency-exchange'],
                            ['สัญลักษณ์สกุลเงิน', currency?.symbol || '฿', 'bi-cash'],
                            ['วันสิ้นสุดปีบัญชี', fyLabel, 'bi-calendar-check'],
                            ['อีกกี่วันถึงสิ้นปี', daysLeft !== null ? `${daysLeft} วัน` : '—', 'bi-hourglass-split'],
                            ['รหัส Tenant', tenantId || '—', 'bi-key'],
                            ['สร้างเมื่อ', fmtDate(profile?.created_at), 'bi-calendar-plus'],
                          ].map(([label, val, icon]) => (
                            <React.Fragment key={label as string}>
                              <dt className="col-sm-4 text-muted small py-2 d-flex align-items-center gap-1">
                                <i className={`bi ${icon}`}></i>{label}
                              </dt>
                              <dd className="col-sm-8 py-2 mb-0">
                                {label === 'อีกกี่วันถึงสิ้นปี' && daysLeft !== null ? (
                                  <span className={`badge ${daysLeft <= 30 ? 'text-bg-danger' : daysLeft <= 90 ? 'text-bg-warning' : 'text-bg-success'}`}>
                                    {daysLeft} วัน
                                  </span>
                                ) : (
                                  <span className="fw-semibold">{val as string || <span className="text-muted fst-italic">ยังไม่ระบุ</span>}</span>
                                )}
                              </dd>
                              <div className="col-12 border-bottom" style={{ borderColor: '#f0f0f0' }}></div>
                            </React.Fragment>
                          ))}
                        </dl>
                      )}

                      {/* Address Tab */}
                      {activeTab === 'address' && (
                        profile?.address ? (
                          <div>
                            <div className="d-flex align-items-start gap-2 mb-2">
                              <i className="bi bi-geo-alt-fill text-primary mt-1"></i>
                              <div>
                                <p className="mb-0 fw-semibold">{profile.company_name}</p>
                                <p className="mb-0 text-muted" style={{ whiteSpace: 'pre-wrap' }}>{profile.address}</p>
                              </div>
                            </div>
                            {profile.phone && (
                              <div className="mt-2 text-muted small">
                                <i className="bi bi-telephone me-1"></i>โทร: {profile.phone}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center text-muted py-5">
                            <i className="bi bi-geo-alt d-block mb-2" style={{ fontSize: 48 }}></i>
                            <p>ยังไม่ได้ระบุที่อยู่บริษัท</p>
                            {isAdmin && <button className="btn btn-sm btn-outline-primary" onClick={() => { startEdit(); setActiveTab('address') }}>เพิ่มที่อยู่</button>}
                          </div>
                        )
                      )}

                      {/* Settings Tab */}
                      {activeTab === 'settings' && (
                        profile?.settings ? (
                          <div>
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <span className="text-muted small fw-semibold">Custom Settings (JSON)</span>
                              {isAdmin && <button className="btn btn-sm btn-outline-primary" onClick={() => { startEdit(); setActiveTab('settings') }}>Edit</button>}
                            </div>
                            <pre className="p-3 bg-light rounded border small" style={{ maxHeight: 300, overflowY: 'auto', fontSize: '0.8rem' }}>
                              {JSON.stringify(profile.settings, null, 2)}
                            </pre>
                          </div>
                        ) : (
                          <div className="text-center text-muted py-5">
                            <i className="bi bi-sliders d-block mb-2" style={{ fontSize: 48 }}></i>
                            <p>ยังไม่มี Custom Settings</p>
                            {isAdmin && <button className="btn btn-sm btn-outline-secondary" onClick={() => { startEdit(); setActiveTab('settings') }}>เพิ่ม Custom Settings</button>}
                          </div>
                        )
                      )}
                    </div>

                    {isAdmin && (
                      <div className="card-footer py-2 d-flex justify-content-end">
                        <button className="btn btn-primary btn-sm" onClick={startEdit}>
                          <i className="bi bi-pencil me-1"></i>Edit Profile
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ── Sidebar ──────────────────────────────────────────────────── */}
            <div className="col-lg-4">
              {/* Completeness Card */}
              <div className="card mb-3">
                <div className="card-header py-2">
                  <h6 className="card-title mb-0 small fw-bold text-uppercase text-muted">
                    <i className="bi bi-clipboard-data me-1"></i>ความสมบูรณ์ของโปรไฟล์
                  </h6>
                </div>
                <div className="card-body py-3">
                  <div className="text-center mb-3">
                    <div className="fw-bold" style={{ fontSize: '2.5rem', lineHeight: 1, color: completeness.pct >= 80 ? '#198754' : completeness.pct >= 50 ? '#ffc107' : '#dc3545' }}>
                      {completeness.pct}%
                    </div>
                    <div className="text-muted small">{completeness.filled} / {completeness.total} fields</div>
                  </div>
                  <div className="progress mb-3" style={{ height: 12 }}>
                    <div className={`progress-bar ${completeness.pct >= 80 ? 'bg-success' : completeness.pct >= 50 ? 'bg-warning' : 'bg-danger'}`}
                      style={{ width: `${completeness.pct}%` }}></div>
                  </div>
                  <ul className="list-unstyled mb-0 small">
                    {[
                      ['company_name', 'ชื่อบริษัท'],
                      ['tax_id', 'Tax ID'],
                      ['industry', 'อุตสาหกรรม'],
                      ['fiscal_year_end', 'ปีบัญชี'],
                      ['default_currency', 'สกุลเงิน'],
                      ['address', 'ที่อยู่'],
                      ['phone', 'เบอร์โทร'],
                      ['website', 'เว็บไซต์'],
                    ].map(([k, l]) => {
                      const filled = !!(profile as any)?.[k]
                      return (
                        <li key={k} className="d-flex align-items-center gap-2 mb-1">
                          <i className={`bi ${filled ? 'bi-check-circle-fill text-success' : 'bi-circle text-secondary'} flex-shrink-0`} style={{ fontSize: '0.75rem' }}></i>
                          <span className={filled ? '' : 'text-muted'}>{l}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>

              {/* Fiscal Calendar Card */}
              <div className="card mb-3">
                <div className="card-header py-2">
                  <h6 className="card-title mb-0 small fw-bold text-uppercase text-muted">
                    <i className="bi bi-calendar3 me-1"></i>ปฏิทินปีบัญชี
                  </h6>
                </div>
                <div className="card-body py-3">
                  {profile?.fiscal_year_end ? (() => {
                    const [mm, dd] = profile.fiscal_year_end.split('-').map(Number)
                    const now = new Date()
                    const thisYearEnd = new Date(now.getFullYear(), mm - 1, dd)
                    const nextYearEnd = new Date(now.getFullYear() + 1, mm - 1, dd)
                    const fyEndDate = thisYearEnd >= now ? thisYearEnd : nextYearEnd
                    const fyStartDate = new Date(fyEndDate)
                    fyStartDate.setFullYear(fyEndDate.getFullYear() - 1)
                    fyStartDate.setDate(fyStartDate.getDate() + 1)
                    const d = daysUntilFYEnd(profile.fiscal_year_end)!
                    const progress = Math.round(((365 - d) / 365) * 100)
                    return (
                      <div>
                        <div className="d-flex justify-content-between small text-muted mb-1">
                          <span>ต้นปี: {fyStartDate.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}</span>
                          <span>สิ้นปี: {fyEndDate.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}</span>
                        </div>
                        <div className="progress mb-2" style={{ height: 8 }}>
                          <div className="progress-bar bg-info" style={{ width: `${progress}%` }}></div>
                        </div>
                        <div className="text-center">
                          <span className={`badge ${d <= 30 ? 'text-bg-danger' : d <= 90 ? 'text-bg-warning' : 'text-bg-info'} px-3 py-2`}>
                            <i className="bi bi-hourglass-split me-1"></i>อีก {d} วัน ({Math.round(progress)}% ของปีผ่านไปแล้ว)
                          </span>
                        </div>
                      </div>
                    )
                  })() : (
                    <div className="text-center text-muted small py-2">
                      <i className="bi bi-calendar-x d-block mb-1" style={{ fontSize: 28 }}></i>
                      ยังไม่ได้ตั้งค่า Fiscal Year End
                      {isAdmin && <div className="mt-1"><button className="btn btn-sm btn-outline-primary py-0" onClick={() => { startEdit(); setActiveTab('financial') }}>ตั้งค่าเลย</button></div>}
                    </div>
                  )}
                </div>
              </div>

              {/* CFO Checklist */}
              <div className="card">
                <div className="card-header py-2">
                  <h6 className="card-title mb-0 small fw-bold text-uppercase text-muted">
                    <i className="bi bi-check2-all me-1"></i>CFO Setup Checklist
                  </h6>
                </div>
                <div className="card-body py-2 px-3">
                  <ul className="list-unstyled mb-0 small">
                    {[
                      { done: !!profile?.company_name,      label: 'ตั้งชื่อบริษัท',             tab: 'general'   },
                      { done: !!profile?.tax_id,            label: 'ระบุ Tax ID',                  tab: 'general'   },
                      { done: !!profile?.industry,          label: 'เลือกอุตสาหกรรม',              tab: 'general'   },
                      { done: !!profile?.default_currency,  label: 'กำหนดสกุลเงินหลัก',            tab: 'financial' },
                      { done: !!profile?.fiscal_year_end,   label: 'ตั้งค่า Fiscal Year End',      tab: 'financial' },
                      { done: !!profile?.address,           label: 'ระบุที่อยู่บริษัท',            tab: 'address'   },
                      { done: !!profile?.phone,             label: 'ระบุเบอร์โทรติดต่อ',           tab: 'general'   },
                      { done: !!profile?.website,           label: 'ระบุเว็บไซต์',                  tab: 'general'   },
                    ].map((item, i) => (
                      <li key={i} className="d-flex align-items-center gap-2 py-1 border-bottom" style={{ borderColor: '#f5f5f5' }}>
                        <i className={`bi ${item.done ? 'bi-check-circle-fill text-success' : 'bi-circle text-secondary'} flex-shrink-0`}></i>
                        <span className={`flex-grow-1 ${item.done ? '' : 'text-muted'}`}>{item.label}</span>
                        {!item.done && isAdmin && (
                          <button className="btn btn-link btn-sm p-0 text-primary" style={{ fontSize: '0.7rem' }}
                            onClick={() => { startEdit(); setActiveTab(item.tab as any) }}>
                            Setup
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {completeness.pct === 100 && (
                    <div className="text-center mt-2 py-2">
                      <span className="badge text-bg-success px-3 py-2">
                        <i className="bi bi-trophy-fill me-1"></i>โปรไฟล์สมบูรณ์ 100%!
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {toast && <ToastAlert msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </>
  )
}
