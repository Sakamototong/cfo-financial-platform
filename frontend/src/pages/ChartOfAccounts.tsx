import React, { useState, useEffect, useCallback, useRef } from 'react'
import ReactDOM from 'react-dom'
import api from '../api/client'
import { useTenant } from '../components/TenantContext'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Account {
  id: string
  account_code: string
  account_name: string
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  parent_account_code: string | null
  normal_balance: 'debit' | 'credit'
  description?: string
  level: number
  sort_order: number
  is_active: boolean
  children?: Account[]
}

interface Template {
  id: string
  template_name: string
  industry: string
  description: string
}

interface TemplateAccount {
  code: string
  name: string
  type: string
  balance: string
  parent?: string
  level?: number
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ACCT_TYPES: { value: string; label: string; labelTh: string; color: string; icon: string; balance: 'debit' | 'credit' }[] = [
  { value: 'asset',     label: 'Asset',     labelTh: 'สินทรัพย์',           color: 'primary', icon: 'building',        balance: 'debit'  },
  { value: 'liability', label: 'Liability', labelTh: 'หนี้สิน',             color: 'warning', icon: 'credit-card',     balance: 'credit' },
  { value: 'equity',    label: 'Equity',    labelTh: 'ส่วนของผู้ถือหุ้น',  color: 'info',    icon: 'pie-chart',       balance: 'credit' },
  { value: 'revenue',   label: 'Revenue',   labelTh: 'รายได้',              color: 'success', icon: 'graph-up-arrow',  balance: 'credit' },
  { value: 'expense',   label: 'Expense',   labelTh: 'ค่าใช้จ่าย',         color: 'danger',  icon: 'graph-down-arrow', balance: 'debit' },
]

const INDUSTRY_ICONS: Record<string, string> = {
  general: 'briefcase', manufacturing: 'gear', retail: 'cart', service: 'headset',
  construction: 'hammer', hospitality: 'house', healthcare: 'hospital', technology: 'cpu',
  finance: 'bank', thai: 'flag',
}

function typeInfo(type: string) { return ACCT_TYPES.find(t => t.value === type) || ACCT_TYPES[0] }

function TypeBadge({ type }: { type: string }) {
  const t = typeInfo(type)
  return (
    <span className={`badge bg-${t.color}`} style={{ fontSize: '0.65rem' }}>
      <i className={`bi bi-${t.icon} me-1`}></i>{t.labelTh}
    </span>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: string }) {
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 9999, minWidth: 280 }}>
      <div className={`alert alert-${type} shadow d-flex align-items-center gap-2 mb-0`} style={{ fontSize: '0.9rem' }}>
        <i className={`bi bi-${type === 'success' ? 'check-circle-fill' : type === 'warning' ? 'exclamation-triangle-fill' : 'x-circle-fill'} flex-shrink-0`}></i>
        <span>{msg}</span>
      </div>
    </div>,
    document.body
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ChartOfAccounts() {
  const { tenantId } = useTenant()

  const [accounts,  setAccounts]  = useState<Account[]>([])
  const [hierarchy, setHierarchy] = useState<Account[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading,   setLoading]   = useState(false)
  const [tab, setTab] = useState<'accounts' | 'tree' | 'templates'>('accounts')

  const [search,     setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [showInact,  setShowInact]  = useState(false)
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set())

  const [formOpen, setFormOpen] = useState(false)
  const [editCode, setEditCode] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Account>>({
    account_type: 'asset', normal_balance: 'debit', level: 1, sort_order: 0, is_active: true,
  })

  const [previewTmpl,    setPreviewTmpl]    = useState<Template | null>(null)
  const [previewAccts,   setPreviewAccts]   = useState<TemplateAccount[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const toastTimer = useRef<any>(null)
  function showToast(msg: string, type = 'success') {
    setToast({ msg, type }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  const loadAll = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const [flatRes, hierRes, tmplRes] = await Promise.all([
        api.get('/coa').catch(() => ({ data: [] })),
        api.get('/coa/hierarchy').catch(() => ({ data: [] })),
        api.get('/coa/templates').catch(() => ({ data: [] })),
      ])
      const flat: Account[] = Array.isArray(flatRes.data)  ? flatRes.data  : []
      const hier: Account[] = Array.isArray(hierRes.data)  ? hierRes.data  : []
      setAccounts(flat); setHierarchy(hier)
      setTemplates(Array.isArray(tmplRes.data) ? tmplRes.data : [])
      setExpanded(new Set(hier.map(a => a.account_code)))
    } catch { showToast('Failed to load accounts', 'danger') }
    setLoading(false)
  }, [tenantId])

  useEffect(() => { loadAll() }, [loadAll])

  const [searchResults, setSearchResults] = useState<Account[]>([])
  const [searching,     setSearching]     = useState(false)
  const searchTimer = useRef<any>(null)

  function handleSearch(q: string) {
    setSearch(q); clearTimeout(searchTimer.current)
    if (q.length < 2) { setSearchResults([]); return }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get(`/coa/search?q=${encodeURIComponent(q)}`)
        setSearchResults(Array.isArray(res.data) ? res.data : [])
      } catch { setSearchResults([]) }
      setSearching(false)
    }, 300)
  }

  async function saveAccount() {
    if (!form.account_code || !form.account_name || !form.account_type) {
      showToast('Code, Name, and Type are required', 'danger'); return
    }
    try {
      let saved: Account
      if (editCode) {
        const res = await api.put(`/coa/${editCode}`, {
          account_name: form.account_name, account_type: form.account_type,
          parent_account_code: form.parent_account_code || null,
          normal_balance: form.normal_balance, description: form.description,
          level: form.level, sort_order: form.sort_order, is_active: form.is_active,
        })
        saved = res.data
        setAccounts(prev => prev.map(a => a.account_code === editCode ? saved : a))
        showToast('Account updated')
      } else {
        const res = await api.post('/coa', { ...form, parent_account_code: form.parent_account_code || null })
        saved = res.data
        setAccounts(prev => [...prev, saved])
        showToast('Account created')
      }
      closeForm()
      const hierRes = await api.get('/coa/hierarchy').catch(() => ({ data: [] }))
      setHierarchy(Array.isArray(hierRes.data) ? hierRes.data : [])
    } catch (e: any) { showToast(e?.response?.data?.message || 'Save failed', 'danger') }
  }

  async function deactivateAccount(code: string) {
    if (!confirm(`Deactivate account ${code}?`)) return
    try {
      await api.delete(`/coa/${code}`)
      setAccounts(prev => prev.map(a => a.account_code === code ? { ...a, is_active: false } : a))
      showToast(`Account ${code} deactivated`, 'warning')
      const hierRes = await api.get('/coa/hierarchy').catch(() => ({ data: [] }))
      setHierarchy(Array.isArray(hierRes.data) ? hierRes.data : [])
    } catch (e: any) { showToast(e?.response?.data?.message || 'Deactivate failed', 'danger') }
  }

  async function reactivateAccount(a: Account) {
    try {
      const res = await api.put(`/coa/${a.account_code}`, { is_active: true })
      setAccounts(prev => prev.map(x => x.account_code === a.account_code ? res.data : x))
      showToast(`Account ${a.account_code} reactivated`)
    } catch (e: any) { showToast(e?.response?.data?.message || 'Update failed', 'danger') }
  }

  async function loadTemplatePreview(t: Template) {
    setPreviewTmpl(t); setPreviewLoading(true)
    try {
      const res = await api.get(`/coa/templates/${t.id}/accounts`)
      setPreviewAccts(Array.isArray(res.data) ? res.data : [])
    } catch { setPreviewAccts([]) }
    setPreviewLoading(false)
  }

  async function applyTemplate(t: Template) {
    if (!confirm(`Apply template "${t.template_name}"?\nThis will add all template accounts.\nIf you already have accounts this will fail.`)) return
    try {
      const res = await api.post(`/coa/templates/${t.id}/apply`)
      showToast(`Template applied — ${res.data.accountsCreated || '?'} accounts created`)
      setPreviewTmpl(null); setPreviewAccts([])
      await loadAll(); setTab('accounts')
    } catch (e: any) { showToast(e?.response?.data?.message || 'Apply failed', 'danger') }
  }

  function openNewForm() {
    setEditCode(null); setForm({ account_type: 'asset', normal_balance: 'debit', level: 1, sort_order: 0, is_active: true }); setFormOpen(true)
  }
  function openEditForm(a: Account) { setEditCode(a.account_code); setForm({ ...a }); setFormOpen(true) }
  function closeForm() { setFormOpen(false); setEditCode(null) }
  function onTypeChange(type: string) { const t = typeInfo(type); setForm(p => ({ ...p, account_type: type as any, normal_balance: t.balance })) }

  const activeAccounts = accounts.filter(a => a.is_active)
  const typeCounts = ACCT_TYPES.map(t => ({ ...t, count: accounts.filter(a => a.account_type === t.value && a.is_active).length }))
  const displayAccounts = (search.length >= 2
    ? (typeFilter !== 'ALL' ? searchResults.filter(a => a.account_type === typeFilter) : searchResults)
    : accounts.filter(a => { if (!showInact && !a.is_active) return false; if (typeFilter !== 'ALL' && a.account_type !== typeFilter) return false; return true })
  )

  function TreeNode({ account, depth = 0 }: { account: Account; depth?: number }) {
    const hasChildren = (account.children?.length ?? 0) > 0
    const isExp = expanded.has(account.account_code)
    const t = typeInfo(account.account_type)
    return (
      <div>
        <div className={`d-flex align-items-center py-1 border-bottom gap-1 ${!account.is_active ? 'opacity-50' : ''}`}
          style={{ paddingLeft: `${depth * 20 + 6}px` }}>
          <span style={{ width: 18, flexShrink: 0 }}>
            {hasChildren
              ? <button className="btn btn-link p-0 text-muted" style={{ lineHeight: 1 }}
                  onClick={() => setExpanded(prev => { const s = new Set(prev); s.has(account.account_code) ? s.delete(account.account_code) : s.add(account.account_code); return s })}>
                  <i className={`bi bi-chevron-${isExp ? 'down' : 'right'} small`}></i>
                </button>
              : <i className="bi bi-dot small text-muted"></i>}
          </span>
          <span className={`badge bg-${t.color} bg-opacity-15 border border-${t.color} text-dark me-1`} style={{ fontSize: '0.55rem', fontWeight: 600 }}>L{account.level}</span>
          <code className={`text-${t.color} fw-semibold`} style={{ fontSize: '0.8rem', minWidth: 55 }}>{account.account_code}</code>
          <span className="flex-grow-1 small">{account.account_name}</span>
          <TypeBadge type={account.account_type} />
          <span className={`badge ms-1 ${account.normal_balance === 'debit' ? 'bg-primary bg-opacity-10 text-primary border border-primary' : 'bg-success bg-opacity-10 text-success border border-success'}`}
            style={{ fontSize: '0.6rem' }}>{account.normal_balance === 'debit' ? 'Dr' : 'Cr'}</span>
          {!account.is_active && <span className="badge bg-secondary ms-1" style={{ fontSize: '0.6rem' }}>Inactive</span>}
          <div className="d-flex gap-1 ms-2 flex-shrink-0">
            <button className="btn btn-link btn-sm p-0 text-secondary" onClick={() => { openEditForm(account); setTab('accounts') }} title="Edit">
              <i className="bi bi-pencil small"></i>
            </button>
            {account.is_active
              ? <button className="btn btn-link btn-sm p-0 text-danger" onClick={() => deactivateAccount(account.account_code)} title="Deactivate">
                  <i className="bi bi-slash-circle small"></i>
                </button>
              : <button className="btn btn-link btn-sm p-0 text-success" onClick={() => reactivateAccount(account)} title="Reactivate">
                  <i className="bi bi-play-circle small"></i>
                </button>}
          </div>
        </div>
        {hasChildren && isExp && account.children!.map(child => <TreeNode key={child.account_code} account={child} depth={depth + 1} />)}
      </div>
    )
  }

  return (
    <>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* ─── Form Panel ──────────────────────────────────────────────── */}
      {formOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1050, display: 'flex' }}
          onClick={e => { if (e.target === e.currentTarget) closeForm() }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.45)' }}></div>
          <div className="bg-white shadow-lg d-flex flex-column" style={{ width: 420, overflowY: 'auto' }}>
            <div className="px-4 py-3 border-bottom d-flex justify-content-between align-items-center"
              style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', color: '#fff' }}>
              <div>
                <div className="fw-bold"><i className={`bi bi-${editCode ? 'pencil' : 'plus-circle'} me-2`}></i>{editCode ? `Edit ${editCode}` : 'เพิ่มบัญชีใหม่'}</div>
                <small className="opacity-75">Chart of Accounts</small>
              </div>
              <button className="btn btn-link text-white p-0" onClick={closeForm}><i className="bi bi-x-lg fs-5"></i></button>
            </div>
            <div className="p-4 flex-grow-1">
              <div className="mb-3">
                <label className="form-label small fw-semibold text-muted mb-1">Account Code *</label>
                <input className="form-control" placeholder="เช่น 1100, 2100, 4000" disabled={!!editCode}
                  value={form.account_code || ''}
                  onChange={e => setForm(p => ({ ...p, account_code: e.target.value }))} />
                {editCode && <div className="form-text">ไม่สามารถเปลี่ยน Code ได้</div>}
              </div>
              <div className="mb-3">
                <label className="form-label small fw-semibold text-muted mb-1">ชื่อบัญชี *</label>
                <input className="form-control" placeholder="เช่น เงินสดและเงินฝากธนาคาร"
                  value={form.account_name || ''}
                  onChange={e => setForm(p => ({ ...p, account_name: e.target.value }))} />
              </div>
              <div className="mb-3">
                <label className="form-label small fw-semibold text-muted mb-1">ประเภทบัญชี *</label>
                <div className="row g-1">
                  {ACCT_TYPES.map(t => (
                    <div className="col-6" key={t.value}>
                      <button className={`btn btn-sm w-100 ${form.account_type === t.value ? `btn-${t.color}` : `btn-outline-${t.color}`}`}
                        style={{ fontSize: '0.75rem' }} onClick={() => onTypeChange(t.value)}>
                        <i className={`bi bi-${t.icon} me-1`}></i>{t.labelTh}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label small fw-semibold text-muted mb-1">Parent Account</label>
                <select className="form-select" value={form.parent_account_code || ''}
                  onChange={e => setForm(p => ({ ...p, parent_account_code: e.target.value || null }))}>
                  <option value="">— Root (ไม่มี Parent) —</option>
                  {accounts.filter(a => a.is_active && a.account_code !== editCode).map(a => (
                    <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.account_name}</option>
                  ))}
                </select>
              </div>
              <div className="row g-2 mb-3">
                <div className="col-7">
                  <label className="form-label small fw-semibold text-muted mb-1">Normal Balance</label>
                  <div className="btn-group w-100">
                    <button className={`btn btn-sm ${form.normal_balance === 'debit' ? 'btn-primary' : 'btn-outline-primary'}`}
                      onClick={() => setForm(p => ({ ...p, normal_balance: 'debit' }))}>Debit (Dr)</button>
                    <button className={`btn btn-sm ${form.normal_balance === 'credit' ? 'btn-success' : 'btn-outline-success'}`}
                      onClick={() => setForm(p => ({ ...p, normal_balance: 'credit' }))}>Credit (Cr)</button>
                  </div>
                </div>
                <div className="col-3">
                  <label className="form-label small fw-semibold text-muted mb-1">Level</label>
                  <input type="number" className="form-control form-control-sm" min={1} max={9}
                    value={form.level ?? 1} onChange={e => setForm(p => ({ ...p, level: parseInt(e.target.value) || 1 }))} />
                </div>
                <div className="col-2" style={{ paddingTop: 26 }}>
                  <div className="form-check">
                    <input type="checkbox" className="form-check-input" id="form-active"
                      checked={form.is_active !== false} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
                    <label className="form-check-label small" htmlFor="form-active">Active</label>
                  </div>
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label small fw-semibold text-muted mb-1">คำอธิบาย</label>
                <textarea className="form-control" rows={3} placeholder="รายละเอียดของบัญชีนี้"
                  value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              {form.account_type && (
                <div className={`alert alert-${typeInfo(form.account_type).color} py-2`} style={{ fontSize: '0.8rem' }}>
                  <i className={`bi bi-${typeInfo(form.account_type).icon} me-1`}></i>
                  <strong>{typeInfo(form.account_type).labelTh}</strong> — Normal Balance: <strong>{typeInfo(form.account_type).balance === 'debit' ? 'Dr (เดบิต)' : 'Cr (เครดิต)'}</strong>
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-top d-flex gap-2">
              <button className="btn btn-primary flex-grow-1" onClick={saveAccount}>
                <i className="bi bi-check-lg me-1"></i>{editCode ? 'Update Account' : 'Create Account'}
              </button>
              <button className="btn btn-outline-secondary" onClick={closeForm}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Template Preview Modal ───────────────────────────────────── */}
      {previewTmpl && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-xl modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header" style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', color: '#fff' }}>
                <h5 className="modal-title">
                  <i className={`bi bi-${INDUSTRY_ICONS[previewTmpl.industry] || 'briefcase'} me-2`}></i>
                  {previewTmpl.template_name}
                </h5>
                <button className="btn-close btn-close-white" onClick={() => { setPreviewTmpl(null); setPreviewAccts([]) }}></button>
              </div>
              <div className="modal-body">
                <div className="d-flex align-items-center gap-3 mb-3">
                  <span className="badge bg-secondary text-capitalize">{previewTmpl.industry}</span>
                  {previewTmpl.description && <span className="text-muted small">{previewTmpl.description}</span>}
                  {!previewLoading && <span className="badge bg-primary ms-auto">{previewAccts.length} accounts</span>}
                </div>
                {previewLoading ? (
                  <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>
                ) : (
                  <>
                    <div className="mb-3 d-flex flex-wrap gap-2">
                      {ACCT_TYPES.map(t => {
                        const cnt = previewAccts.filter(a => a.type === t.value).length
                        return cnt > 0 ? (
                          <span key={t.value} className={`badge bg-${t.color}`}>
                            <i className={`bi bi-${t.icon} me-1`}></i>{t.labelTh} {cnt}
                          </span>
                        ) : null
                      })}
                    </div>
                    <div className="table-responsive" style={{ maxHeight: 420 }}>
                      <table className="table table-sm table-hover mb-0">
                        <thead className="table-dark sticky-top">
                          <tr><th>Code</th><th>ชื่อบัญชี</th><th>ประเภท</th><th>Balance</th><th>Parent</th><th>Level</th></tr>
                        </thead>
                        <tbody>
                          {previewAccts.map(a => (
                            <tr key={a.code}>
                              <td><code className="text-primary">{a.code}</code></td>
                              <td className="small" style={{ paddingLeft: (a.level || 0) * 12 }}>{a.name}</td>
                              <td><TypeBadge type={a.type} /></td>
                              <td><span className={`badge ${a.balance === 'debit' ? 'bg-primary' : 'bg-success'}`} style={{ fontSize: '0.6rem' }}>{a.balance}</span></td>
                              <td><code className="small text-muted">{a.parent || '—'}</code></td>
                              <td className="text-center"><span className="badge bg-light text-dark border" style={{ fontSize: '0.6rem' }}>L{a.level ?? 1}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline-secondary" onClick={() => { setPreviewTmpl(null); setPreviewAccts([]) }}>ปิด</button>
                <button className="btn btn-warning" onClick={() => applyTemplate(previewTmpl)}>
                  <i className="bi bi-lightning-fill me-1"></i>Apply Template นี้
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Page Header ──────────────────────────────────────────────── */}
      <div className="d-flex justify-content-between align-items-start mb-3 px-1">
        <div>
          <h2 className="mb-0 fw-bold" style={{ color: '#1a3c5e' }}>
            <i className="bi bi-journal-bookmark me-2 text-primary"></i>Chart of Accounts (COA)
          </h2>
          <small className="text-muted">จัดการผังบัญชี — สินทรัพย์ หนี้สิน ส่วนของทุน รายได้ ค่าใช้จ่าย</small>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary btn-sm" onClick={loadAll} disabled={loading}>
            <i className={`bi bi-arrow-clockwise me-1 ${loading ? 'spin' : ''}`}></i>Refresh
          </button>
          <button className="btn btn-outline-success btn-sm" onClick={() => setTab('templates')}>
            <i className="bi bi-file-earmark-text me-1"></i>ใช้ Template
          </button>
          <button className="btn btn-primary btn-sm" onClick={openNewForm}>
            <i className="bi bi-plus-lg me-1"></i>เพิ่มบัญชี
          </button>
        </div>
      </div>

      {/* ─── KPI Strip ───────────────────────────────────────────────── */}
      <div className="row g-2 mb-3">
        <div className="col-6 col-md-2">
          <div className="card border-primary h-100">
            <div className="card-body d-flex align-items-center gap-2 py-2 px-3">
              <div className="text-bg-primary rounded-3 d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 40, height: 40, fontSize: 18 }}>
                <i className="bi bi-journal-bookmark"></i>
              </div>
              <div>
                <div className="fw-bold fs-5 lh-1">{loading ? <span className="spinner-border spinner-border-sm"></span> : accounts.length}</div>
                <small className="text-muted" style={{ fontSize: '0.7rem' }}>Total</small>
              </div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-2">
          <div className="card border-success h-100">
            <div className="card-body d-flex align-items-center gap-2 py-2 px-3">
              <div className="text-bg-success rounded-3 d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 40, height: 40, fontSize: 18 }}>
                <i className="bi bi-check-circle"></i>
              </div>
              <div>
                <div className="fw-bold fs-5 lh-1">{activeAccounts.length}</div>
                <small className="text-muted" style={{ fontSize: '0.7rem' }}>Active</small>
              </div>
            </div>
          </div>
        </div>
        {typeCounts.map(t => (
          <div className="col-6 col-md" key={t.value}>
            <div className={`card border-${t.color} h-100`} style={{ cursor: 'pointer' }}
              onClick={() => { setTypeFilter(prev => prev === t.value ? 'ALL' : t.value); setTab('accounts') }}>
              <div className="card-body d-flex align-items-center gap-2 py-2 px-3">
                <div className={`text-bg-${t.color} rounded-3 d-flex align-items-center justify-content-center flex-shrink-0`} style={{ width: 40, height: 40, fontSize: 18 }}>
                  <i className={`bi bi-${t.icon}`}></i>
                </div>
                <div>
                  <div className={`fw-bold fs-5 lh-1 text-${t.color}`}>{t.count}</div>
                  <small className="text-muted" style={{ fontSize: '0.7rem' }}>{t.labelTh}</small>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Main Card ────────────────────────────────────────────────── */}
      <div className="card shadow-sm">
        <div className="card-header" style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', color: '#fff', padding: '0 1rem' }}>
          <ul className="nav nav-tabs border-0" style={{ marginBottom: -1 }}>
            {[
              { id: 'accounts',  label: 'Accounts',  icon: 'list-ul'           },
              { id: 'tree',      label: 'Tree View', icon: 'diagram-3'         },
              { id: 'templates', label: 'Templates', icon: 'file-earmark-text' },
            ].map(t => (
              <li className="nav-item" key={t.id}>
                <button className={`nav-link border-0 ${tab === t.id ? 'active text-primary fw-bold' : 'text-white'}`}
                  style={{ background: tab === t.id ? '#fff' : 'transparent', borderRadius: '4px 4px 0 0', marginTop: 4 }}
                  onClick={() => setTab(t.id as any)}>
                  <i className={`bi bi-${t.icon} me-1`}></i>{t.label}
                  {t.id === 'accounts' && <span className={`badge ms-1 ${tab === 'accounts' ? 'bg-primary' : 'bg-light text-dark'}`} style={{ fontSize: '0.6rem' }}>{displayAccounts.length}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card-body">

          {/* ══ Tab 1: Accounts ══════════════════════════════════════════ */}
          {tab === 'accounts' && (
            <>
              {/* Filter bar */}
              <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
                <div className="btn-group btn-group-sm flex-wrap">
                  <button className={`btn ${typeFilter === 'ALL' ? 'btn-dark' : 'btn-outline-secondary'}`} onClick={() => setTypeFilter('ALL')}>ทั้งหมด</button>
                  {ACCT_TYPES.map(t => (
                    <button key={t.value} className={`btn ${typeFilter === t.value ? `btn-${t.color}` : `btn-outline-${t.color}`}`}
                      onClick={() => setTypeFilter(prev => prev === t.value ? 'ALL' : t.value)}>
                      <i className={`bi bi-${t.icon} me-1`}></i><span className="d-none d-md-inline">{t.labelTh}</span>
                      <span className="d-md-none">{t.label}</span>
                    </button>
                  ))}
                </div>
                <div className="input-group" style={{ maxWidth: 260 }}>
                  <span className="input-group-text"><i className="bi bi-search"></i></span>
                  <input type="search" className="form-control form-control-sm" placeholder="ค้นหา code / ชื่อบัญชี…"
                    value={search} onChange={e => handleSearch(e.target.value)} />
                  {searching && <span className="input-group-text"><span className="spinner-border spinner-border-sm"></span></span>}
                </div>
                <div className="form-check form-switch mb-0 ms-1">
                  <input type="checkbox" className="form-check-input" id="show-inactive-coa"
                    checked={showInact} onChange={e => setShowInact(e.target.checked)} />
                  <label className="form-check-label small" htmlFor="show-inactive-coa">Inactive</label>
                </div>
                <button className="btn btn-primary btn-sm ms-auto" onClick={openNewForm}>
                  <i className="bi bi-plus-lg me-1"></i>เพิ่มบัญชี
                </button>
              </div>

              {search.length >= 2 && (
                <div className="alert alert-info py-2 mb-3 d-flex align-items-center gap-2">
                  <i className="bi bi-search"></i>
                  <span>ผลการค้นหา "<strong>{search}</strong>": {searchResults.length} บัญชี</span>
                  <button className="btn btn-link btn-sm p-0 ms-auto" onClick={() => { setSearch(''); setSearchResults([]) }}>ล้าง</button>
                </div>
              )}

              <div className="table-responsive">
                <table className="table table-sm table-hover border mb-0">
                  <thead className="table-dark">
                    <tr>
                      <th style={{ width: 90 }}>Code</th>
                      <th>ชื่อบัญชี</th>
                      <th style={{ width: 140 }}>ประเภท</th>
                      <th style={{ width: 90 }}>Parent</th>
                      <th style={{ width: 70 }} className="text-center">Balance</th>
                      <th style={{ width: 50 }} className="text-center">Lv</th>
                      <th style={{ width: 80 }} className="text-center">Status</th>
                      <th style={{ width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayAccounts.length === 0 && (
                      <tr><td colSpan={8} className="text-center text-muted py-5">
                        {accounts.length === 0
                          ? <><i className="bi bi-journal-x d-block mb-2" style={{ fontSize: '2.5rem', opacity: 0.25 }}></i>ยังไม่มีบัญชี — <button className="btn btn-link p-0" onClick={() => setTab('templates')}>ใช้ Template</button> หรือ <button className="btn btn-link p-0" onClick={openNewForm}>เพิ่มบัญชีใหม่</button></>
                          : 'ไม่พบบัญชีที่ตรงกับตัวกรอง'}
                      </td></tr>
                    )}
                    {displayAccounts.map(a => {
                      const t = typeInfo(a.account_type)
                      return (
                        <tr key={a.id || a.account_code} className={!a.is_active ? 'opacity-50' : ''}>
                          <td><code className={`text-${t.color} fw-semibold`}>{a.account_code}</code></td>
                          <td>
                            <div className="small fw-semibold" style={{ paddingLeft: Math.max(0, (a.level - 1)) * 12 }}>
                              {a.level > 1 && <i className="bi bi-arrow-return-right text-muted me-1 small"></i>}
                              {a.account_name}
                            </div>
                            {a.description && <div className="text-muted" style={{ fontSize: '0.7rem', paddingLeft: Math.max(0, (a.level - 1)) * 12 }}>{a.description}</div>}
                          </td>
                          <td><TypeBadge type={a.account_type} /></td>
                          <td><code className="small text-muted">{a.parent_account_code || '—'}</code></td>
                          <td className="text-center">
                            <span className={`badge ${a.normal_balance === 'debit' ? 'bg-primary' : 'bg-success'}`} style={{ fontSize: '0.65rem' }}>
                              {a.normal_balance === 'debit' ? 'Dr' : 'Cr'}
                            </span>
                          </td>
                          <td className="text-center"><span className="badge bg-light text-dark border" style={{ fontSize: '0.65rem' }}>L{a.level}</span></td>
                          <td className="text-center">
                            <span className={`badge ${a.is_active ? 'bg-success' : 'bg-secondary'}`} style={{ fontSize: '0.65rem' }}>
                              {a.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div className="d-flex gap-1 justify-content-end">
                              <button className="btn btn-outline-primary btn-sm py-0 px-1" onClick={() => openEditForm(a)} title="Edit">
                                <i className="bi bi-pencil small"></i>
                              </button>
                              {a.is_active
                                ? <button className="btn btn-outline-warning btn-sm py-0 px-1" onClick={() => deactivateAccount(a.account_code)} title="Deactivate">
                                    <i className="bi bi-slash-circle small"></i>
                                  </button>
                                : <button className="btn btn-outline-success btn-sm py-0 px-1" onClick={() => reactivateAccount(a)} title="Reactivate">
                                    <i className="bi bi-play-circle small"></i>
                                  </button>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 p-2 bg-light rounded-2 d-flex flex-wrap gap-2 align-items-center">
                <span className="small fw-semibold text-muted me-2">สรุปตามประเภท:</span>
                {typeCounts.map(t => (
                  <button key={t.value}
                    className={`badge border-0 ${typeFilter === t.value ? `bg-${t.color}` : `bg-${t.color} bg-opacity-25 text-dark`}`}
                    style={{ fontSize: '0.72rem', cursor: 'pointer' }}
                    onClick={() => setTypeFilter(prev => prev === t.value ? 'ALL' : t.value)}>
                    <i className={`bi bi-${t.icon} me-1`}></i>{t.labelTh}: {t.count}
                  </button>
                ))}
                <span className="ms-auto text-muted small">{activeAccounts.length} active / {accounts.length} total</span>
              </div>
            </>
          )}

          {/* ══ Tab 2: Tree View ══════════════════════════════════════════ */}
          {tab === 'tree' && (
            <>
              <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                <span className="small text-muted">
                  <i className="bi bi-diagram-3 me-1 text-primary"></i>Hierarchy Tree
                  <span className="badge bg-secondary ms-2">{accounts.length} accounts</span>
                </span>
                <div className="d-flex gap-2">
                  <button className="btn btn-outline-secondary btn-sm"
                    onClick={() => setExpanded(new Set(accounts.map(a => a.account_code)))}>
                    <i className="bi bi-arrows-expand me-1"></i>Expand All
                  </button>
                  <button className="btn btn-outline-secondary btn-sm"
                    onClick={() => setExpanded(new Set(hierarchy.map(a => a.account_code)))}>
                    <i className="bi bi-arrows-collapse me-1"></i>Collapse
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={openNewForm}>
                    <i className="bi bi-plus-lg me-1"></i>เพิ่มบัญชี
                  </button>
                </div>
              </div>
              <div className="mb-2 d-flex flex-wrap gap-1">
                {ACCT_TYPES.map(t => (
                  <span key={t.value} className={`badge bg-${t.color}`} style={{ fontSize: '0.65rem' }}>
                    <i className={`bi bi-${t.icon} me-1`}></i>{t.labelTh}
                  </span>
                ))}
                <span className="badge border text-primary bg-primary bg-opacity-10" style={{ fontSize: '0.65rem' }}>Dr</span>
                <span className="badge border text-success bg-success bg-opacity-10" style={{ fontSize: '0.65rem' }}>Cr</span>
              </div>
              <div className="border rounded-2" style={{ minHeight: 200 }}>
                {hierarchy.length === 0 ? (
                  <div className="text-center text-muted py-5">
                    <i className="bi bi-diagram-3 d-block mb-2" style={{ fontSize: '3rem', opacity: 0.2 }}></i>
                    ยังไม่มีบัญชี — <button className="btn btn-link p-0" onClick={() => setTab('templates')}>ใช้ Template</button> หรือ <button className="btn btn-link p-0" onClick={openNewForm}>เพิ่มบัญชีใหม่</button>
                  </div>
                ) : (
                  <div className="p-1">{hierarchy.map(root => <TreeNode key={root.account_code} account={root} depth={0} />)}</div>
                )}
              </div>
              {hierarchy.length > 0 && (
                <div className="row g-2 mt-2">
                  {hierarchy.map(root => {
                    const t = typeInfo(root.account_type)
                    function countAll(node: Account): number { return 1 + (node.children || []).reduce((s, c) => s + countAll(c), 0) }
                    return (
                      <div className="col-auto" key={root.account_code}>
                        <div className={`badge bg-${t.color} bg-opacity-15 text-dark border border-${t.color} px-3 py-2`} style={{ fontSize: '0.7rem' }}>
                          <i className={`bi bi-${t.icon} me-1 text-${t.color}`}></i>
                          <strong>{root.account_code}</strong> {root.account_name}
                          <span className={`ms-2 badge bg-${t.color}`}>{countAll(root)} nodes</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* ══ Tab 3: Templates ══════════════════════════════════════════ */}
          {tab === 'templates' && (
            <>
              <div className="alert alert-info d-flex gap-2 align-items-start mb-3">
                <i className="bi bi-info-circle-fill fs-5 text-info flex-shrink-0 mt-1"></i>
                <div>
                  <strong>Templates สำเร็จรูป</strong><br />
                  <span className="small">เลือก Template อุตสาหกรรมเพื่อสร้างผังบัญชีอัตโนมัติ — <strong>หากมีบัญชีอยู่แล้วจะ Apply ไม่ได้</strong> ต้อง Deactivate บัญชีทั้งหมดก่อน</span>
                </div>
              </div>

              {templates.length === 0 ? (
                <div className="text-center text-muted py-5">
                  <i className="bi bi-file-earmark-x d-block mb-2" style={{ fontSize: '3rem', opacity: 0.25 }}></i>
                  ยังไม่มี Templates — กรุณาติดต่อ Admin
                </div>
              ) : (
                <div className="row g-3">
                  {templates.map(t => (
                    <div className="col-md-6 col-xl-4" key={t.id}>
                      <div className="card h-100 shadow-sm">
                        <div className="card-body">
                          <div className="d-flex align-items-start gap-3">
                            <div className="text-bg-primary rounded-3 d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 46, height: 46, fontSize: 22 }}>
                              <i className={`bi bi-${INDUSTRY_ICONS[t.industry] || 'briefcase'}`}></i>
                            </div>
                            <div className="flex-grow-1">
                              <div className="fw-semibold">{t.template_name}</div>
                              <span className="badge bg-secondary bg-opacity-75 text-capitalize" style={{ fontSize: '0.65rem' }}>{t.industry}</span>
                              {t.description && <p className="text-muted small mt-1 mb-0">{t.description}</p>}
                            </div>
                          </div>
                        </div>
                        <div className="card-footer bg-transparent pt-0 border-top-0 pb-3 px-3 d-flex gap-2">
                          <button className="btn btn-outline-primary btn-sm flex-grow-1" onClick={() => loadTemplatePreview(t)}>
                            <i className="bi bi-eye me-1"></i>Preview
                          </button>
                          <button className="btn btn-warning btn-sm" onClick={() => loadTemplatePreview(t)}>
                            <i className="bi bi-lightning-fill me-1"></i>Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {accounts.length > 0 && (
                <div className="alert alert-warning mt-3 d-flex gap-2">
                  <i className="bi bi-exclamation-triangle-fill text-warning flex-shrink-0"></i>
                  <span className="small">มีบัญชีอยู่แล้ว <strong>{accounts.length} บัญชี</strong> — การ Apply Template จะไม่สำเร็จ</span>
                </div>
              )}

              <div className="card border-0 bg-light mt-3">
                <div className="card-header py-2"><strong className="small"><i className="bi bi-book me-1 text-primary"></i>คู่มือ CFO — Chart of Accounts</strong></div>
                <div className="card-body py-2">
                  <div className="row g-3">
                    {[
                      { icon: 'building',        color: 'primary', title: 'สินทรัพย์ (Asset)',          body: 'เงินสด, ลูกหนี้, สินค้าคงเหลือ, สินทรัพย์ถาวร — Dr normal balance' },
                      { icon: 'credit-card',      color: 'warning', title: 'หนี้สิน (Liability)',         body: 'เจ้าหนี้, เงินกู้, ค้างจ่าย — Cr normal balance' },
                      { icon: 'pie-chart',        color: 'info',    title: 'ส่วนของทุน (Equity)',          body: 'ทุน, กำไรสะสม — Cr normal balance' },
                      { icon: 'graph-up-arrow',   color: 'success', title: 'รายได้ (Revenue)',              body: 'รายได้จากการขาย, รายได้อื่น — Cr normal balance' },
                      { icon: 'graph-down-arrow', color: 'danger',  title: 'ค่าใช้จ่าย (Expense)',         body: 'ต้นทุนขาย, ค่าใช้จ่ายขาย/บริหาร — Dr normal balance' },
                    ].map(s => (
                      <div key={s.title} className="col-md">
                        <div className={`border-start border-4 border-${s.color} ps-2`}>
                          <div className="fw-semibold small mb-1"><i className={`bi bi-${s.icon} me-1 text-${s.color}`}></i>{s.title}</div>
                          <div className="text-muted" style={{ fontSize: '0.73rem' }}>{s.body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
