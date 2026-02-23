import React, { useState, useEffect, useRef, useCallback, DragEvent } from 'react'
import ReactDOM from 'react-dom'
import api from '../api/client'
import { getAuthHeaders } from '../lib/headers'
import { useTenant } from '../components/TenantContext'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement,
  Title, Tooltip, Legend,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

// ─── Formatters ───────────────────────────────────────────────────────────────
const THB  = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 })
function fmtDT(d: string)  { return d ? new Date(d).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—' }
function fmtDate(d: string){ return d ? new Date(d).toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' }) : '—' }

// ─── Types ────────────────────────────────────────────────────────────────────
interface Template { id: string; template_name: string; template_type: string; description: string; file_format: string; column_mappings: any }
interface ImportLog { id: string; import_type: string; file_name: string; status: string; valid_rows?: number; invalid_rows?: number; total_rows?: number; rows_imported?: number; rows_failed?: number; started_at?: string; completed_at?: string; created_at?: string; template_name?: string; error_log?: string }
interface Transaction { id: string; transaction_date: string; description: string; amount: string; account_code: string; account_name?: string; vendor_customer?: string; department?: string; category?: string; document_number?: string; status: string; validation_status: string; created_at?: string }
interface Scenario { id: string; scenario_name: string; scenario_type: string; description?: string; is_active: boolean }
interface PreviewResult { format?: 'transaction' | 'statement' | 'unknown'; metadata?: any; previewRows?: any[]; errors?: string[]; total_rows?: number }

const STATUS_BADGE: Record<string, string> = {
  approved: 'success', pending: 'warning', rejected: 'danger', completed: 'success',
  valid: 'success', invalid: 'danger', warning: 'warning', failed: 'danger',
}

export default function ETL() {
  const { tenantId } = useTenant()

  // ── Global data ──────────────────────────────────────────────────
  const [templates, setTemplates]   = useState<Template[]>([])
  const [importLogs, setImportLogs] = useState<ImportLog[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [scenarios, setScenarios]  = useState<Scenario[]>([])
  const [loading, setLoading]      = useState(false)

  // ── Active tab ───────────────────────────────────────────────────
  const [tab, setTab] = useState<'upload' | 'review' | 'post' | 'history'>('upload')

  // ── Upload tab ───────────────────────────────────────────────────
  const [file, setFile]             = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [importType, setImportType] = useState<'excel' | 'csv'>('csv')
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [uploading, setUploading]   = useState(false)
  const [preview, setPreview]       = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Review tab ───────────────────────────────────────────────────
  const [txSearch, setTxSearch]     = useState('')
  const [txStatusFilter, setTxStatusFilter] = useState('ALL')
  const [txLogFilter, setTxLogFilter]       = useState('ALL')
  const [selectedTx, setSelectedTx] = useState<string[]>([])
  const [approvingTx, setApprovingTx]       = useState(false)
  const [deletingTx, setDeletingTx]         = useState<string | null>(null)
  const [loadingTx, setLoadingTx]   = useState(false)

  // ── Post to Financials tab ───────────────────────────────────────
  const [postForm, setPostForm] = useState({ statement_type: 'PL' as 'PL'|'BS'|'CF', period_start: '', period_end: '', scenario: 'actual', new_scenario_name: '', new_scenario_type: 'custom', use_selected: false })
  const [posting, setPosting]   = useState(false)
  const [postResult, setPostResult] = useState<any>(null)

  // ── History tab ──────────────────────────────────────────────────
  const [dlProgress, setDlProgress] = useState<Record<string, number>>({})
  const [histSearch, setHistSearch] = useState('')

  // ── Toast ────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' | 'warning' | 'info' } | null>(null)
  const toastTimer = useRef<any>(null)
  function showToast(msg: string, type: typeof toast extends null ? never : NonNullable<typeof toast>['type'] = 'success') {
    setToast({ msg, type }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 4500)
  }

  // ─── Load data ────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const [tRes, lRes, txRes, scRes] = await Promise.all([
        api.get('/etl/templates').catch(() => ({ data: [] })),
        api.get('/etl/imports').catch(() => ({ data: [] })),
        api.get('/etl/transactions').catch(() => ({ data: [] })),
        api.get('/etl/scenarios').catch(() => ({ data: [] })),
      ])
      setTemplates(Array.isArray(tRes.data) ? tRes.data : [])
      setImportLogs(Array.isArray(lRes.data) ? lRes.data : [])
      setTransactions(Array.isArray(txRes.data) ? txRes.data : [])
      setScenarios(Array.isArray(scRes.data) ? scRes.data : [])
    } catch { showToast('Failed to load data', 'danger') }
    setLoading(false)
  }, [tenantId])

  useEffect(() => { loadAll() }, [loadAll])

  // ─── File drag-drop ───────────────────────────────────────────────
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (!f) return
    setFile(f)
    if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) setImportType('excel')
    else setImportType('csv')
    setPreview(null)
  }
  function onDragOver(e: DragEvent<HTMLDivElement>) { e.preventDefault(); setIsDragging(true) }
  function onDragLeave() { setIsDragging(false) }
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setFile(f); setPreview(null)
    if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) setImportType('excel')
    else setImportType('csv')
  }

  // ─── Preview ─────────────────────────────────────────────────────
  async function handlePreview() {
    if (!file) return
    setPreviewing(true); setPreview(null)
    const fd = new FormData(); fd.append('file', file)
    try {
      const ep = importType === 'excel' ? '/etl/preview/excel' : '/etl/preview/csv'
      const res = await api.post(ep, fd, { headers: { ...getAuthHeaders() } })
      setPreview(res.data)
    } catch (e: any) { showToast(e?.response?.data?.message || 'Preview failed', 'danger') }
    setPreviewing(false)
  }

  // ─── Upload & Import ──────────────────────────────────────────────
  async function handleUpload() {
    if (!file) return
    setUploading(true)
    const fd = new FormData(); fd.append('file', file)
    if (selectedTemplate) fd.append('template_id', selectedTemplate.id)
    try {
      const ep = importType === 'excel' ? '/etl/import/excel' : '/etl/import/csv'
      const res = await api.post(ep, fd, { headers: { ...getAuthHeaders() } })
      const d = res.data
      showToast(`Import successful — ${d.valid_rows ?? d.rows_imported ?? '?'} rows imported`, 'success')
      setFile(null); setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
      await loadAll()
      setTab('review')
    } catch (e: any) { showToast(e?.response?.data?.message || 'Import failed', 'danger') }
    setUploading(false)
  }

  // ─── Transactions ─────────────────────────────────────────────────
  async function approveTransactions() {
    if (selectedTx.length === 0) return
    setApprovingTx(true)
    try {
      await api.post('/etl/transactions/approve', { transaction_ids: selectedTx })
      showToast(`${selectedTx.length} transaction(s) approved`)
      setSelectedTx([])
      await loadAll()
    } catch (e: any) { showToast(e?.response?.data?.message || 'Approve failed', 'danger') }
    setApprovingTx(false)
  }

  async function deleteTransaction(id: string) {
    if (!confirm('Delete this transaction?')) return
    setDeletingTx(id)
    try {
      await api.delete(`/etl/transactions/${id}`)
      showToast('Transaction deleted', 'warning')
      setTransactions(prev => prev.filter(t => t.id !== id))
      setSelectedTx(prev => prev.filter(x => x !== id))
    } catch (e: any) { showToast(e?.response?.data?.message || 'Delete failed', 'danger') }
    setDeletingTx(null)
  }

  // ─── Post to Financials ───────────────────────────────────────────
  async function handlePost() {
    const { statement_type, period_start, period_end, scenario, new_scenario_name, new_scenario_type, use_selected } = postForm
    if (!period_start || !period_end) { showToast('Period start and end are required', 'danger'); return }
    setPosting(true); setPostResult(null)
    try {
      const body: any = {
        statement_type, period_start, period_end,
        transaction_ids: use_selected && selectedTx.length > 0 ? selectedTx : undefined,
        scenario: scenario !== '__new__' ? scenario : undefined,
        new_scenario: scenario === '__new__' ? { name: new_scenario_name, type: new_scenario_type } : undefined,
      }
      const res = await api.post('/etl/post-to-financials', body)
      setPostResult(res.data)
      showToast('Posted to Financials successfully')
      await loadAll()
    } catch (e: any) { showToast(e?.response?.data?.message || 'Post failed', 'danger') }
    setPosting(false)
  }
  // ─── Download template CSV ─────────────────────────────────────
  async function downloadTemplate(templateId: string, templateName: string) {
    try {
      const base = (import.meta as any)?.env?.VITE_API_BASE || 'http://localhost:3000'
      const res = await fetch(`${base}/etl/templates/${templateId}/download`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url
      a.download = `${templateName.replace(/[^a-z0-9ก-๙]/gi, '_')}_template.csv`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      showToast(`Downloaded: ${templateName} template`, 'success')
    } catch { showToast('Download template failed', 'danger') }
  }
  // ─── Download log ─────────────────────────────────────────────────
  async function downloadLog(importId: string, fallbackLog?: string) {
    try {
      const headers = getAuthHeaders()
      const base = (import.meta as any)?.env?.VITE_API_BASE || 'http://localhost:3000'
      const res = await fetch(`${base}/etl/import/${importId}/log`, { method: 'GET', headers })
      if (!res.ok) {
        const w = window.open('', '_blank')
        if (w) { w.document.write('<pre>' + String(fallbackLog || 'No log').replace(/</g, '&lt;') + '</pre>') }
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a'); a.href = url; a.download = `import_${importId}.log`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      showToast('Log downloaded')
    } catch { showToast('Download failed', 'danger') }
  }

  // ─── Derived / filtered data ──────────────────────────────────────
  const filteredTx = transactions.filter(tx => {
    if (txStatusFilter !== 'ALL' && tx.status !== txStatusFilter && tx.validation_status !== txStatusFilter) return false
    if (txLogFilter   !== 'ALL' && (tx as any).import_log_id !== txLogFilter) return false
    if (txSearch) {
      const q = txSearch.toLowerCase()
      if (!((tx.description||'').toLowerCase().includes(q) || (tx.account_code||'').toLowerCase().includes(q) || (tx.document_number||'').toLowerCase().includes(q))) return false
    }
    return true
  })
  const allSelected = filteredTx.length > 0 && filteredTx.every(t => selectedTx.includes(t.id))
  function toggleAll() {
    if (allSelected) setSelectedTx(prev => prev.filter(id => !filteredTx.find(t => t.id === id)))
    else setSelectedTx(prev => [...new Set([...prev, ...filteredTx.map(t => t.id)])])
  }

  const filteredLogs = importLogs.filter(l => {
    if (!histSearch) return true
    const q = histSearch.toLowerCase()
    return (l.file_name||'').toLowerCase().includes(q) || (l.status||'').toLowerCase().includes(q) || (l.template_name||'').toLowerCase().includes(q)
  })

  // Stats
  const totalSuccess = importLogs.filter(l => l.status === 'completed' || l.status === 'success').length
  const pendingTx    = transactions.filter(t => t.status === 'pending').length
  const approvedTx   = transactions.filter(t => t.status === 'approved').length

  // Chart
  const statusCounts = { approved: approvedTx, pending: pendingTx, rejected: transactions.filter(t=>t.status==='rejected').length }
  const donutData = {
    data: { labels: ['Approved', 'Pending', 'Rejected'], datasets: [{ data: [statusCounts.approved, statusCounts.pending, statusCounts.rejected], backgroundColor: ['#2e7d32','#f57c00','#c62828'], borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' as const }, tooltip: { callbacks: { label: (c: any) => ` ${c.label}: ${c.parsed}` } } } },
  }
  const importByType = importLogs.reduce((acc: Record<string,number>, l) => { acc[l.import_type||l.template_name||'custom'] = (acc[l.import_type||l.template_name||'custom']||0)+1; return acc }, {})
  const barData = {
    data: { labels: Object.keys(importByType), datasets: [{ label: 'Imports', data: Object.values(importByType), backgroundColor: 'rgba(21,101,192,0.7)', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { stepSize: 1 } } } },
  }

  return (
    <>
      {/* ─── Page header ──────────────────────────────────────────── */}
      <div className="d-flex justify-content-between align-items-center mb-3 px-1">
        <div>
          <h2 className="mb-0 fw-bold" style={{ color: '#1a3c5e' }}>
            <i className="bi bi-cloud-upload me-2 text-primary"></i>ETL / Data Import
          </h2>
          <small className="text-muted">Upload, validate, approve and post financial transactions to statements</small>
        </div>
        <button className="btn btn-outline-secondary btn-sm" onClick={loadAll} disabled={loading}>
          <i className={`bi bi-arrow-clockwise me-1 ${loading ? 'spin' : ''}`}></i>Refresh
        </button>
      </div>

      {/* ─── KPI strip ────────────────────────────────────────────── */}
      <div className="row g-3 mb-3">
        {[
          { label: 'Total Imports',  val: importLogs.length,  icon: 'cloud-upload',  color: 'primary'   },
          { label: 'Successful',     val: totalSuccess,        icon: 'check-circle',  color: 'success'   },
          { label: 'Pending Review', val: pendingTx,           icon: 'clock-history', color: 'warning'   },
          { label: 'Approved Transactions', val: approvedTx,  icon: 'badge-check',   color: 'info'      },
        ].map(k => (
          <div className="col-6 col-md-3" key={k.label}>
            <div className={`card border-${k.color} h-100`}>
              <div className="card-body d-flex align-items-center gap-3 py-3">
                <div className={`text-bg-${k.color} rounded-3 d-flex align-items-center justify-content-center`} style={{ width: 46, height: 46, fontSize: 20 }}>
                  <i className={`bi bi-${k.icon}`}></i>
                </div>
                <div>
                  <div className="fw-bold fs-4 lh-1">{loading ? <span className="spinner-border spinner-border-sm"></span> : k.val}</div>
                  <small className="text-muted">{k.label}</small>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Charts ───────────────────────────────────────────────── */}
      {transactions.length > 0 && (
        <div className="row g-3 mb-3">
          <div className="col-md-4">
            <div className="card shadow-sm h-100">
              <div className="card-header py-2"><small className="fw-semibold text-muted"><i className="bi bi-pie-chart me-1"></i>Transaction Status</small></div>
              <div className="card-body p-2" style={{ height: 150 }}><Doughnut {...donutData} /></div>
            </div>
          </div>
          <div className="col-md-8">
            <div className="card shadow-sm h-100">
              <div className="card-header py-2"><small className="fw-semibold text-muted"><i className="bi bi-bar-chart me-1"></i>Imports by Type</small></div>
              <div className="card-body p-2" style={{ height: 150 }}><Bar {...barData} /></div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Main card with tabs ──────────────────────────────────── */}
      <div className="card shadow-sm">
        <div className="card-header" style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', color: '#fff', padding: '0 1rem' }}>
          <ul className="nav nav-tabs border-0" style={{ marginBottom: -1 }}>
            {[
              { id: 'upload',  label: 'Upload File',       icon: 'cloud-upload',   badge: null           },
              { id: 'review',  label: 'Review',             icon: 'list-check',     badge: pendingTx || null },
              { id: 'post',    label: 'Post to Financials', icon: 'send',           badge: null           },
              { id: 'history', label: 'Import History',     icon: 'clock-history',  badge: importLogs.length || null },
            ].map(t => (
              <li className="nav-item" key={t.id}>
                <button
                  className={`nav-link border-0 ${tab === t.id ? 'active text-primary fw-bold' : 'text-white'}`}
                  style={{ background: tab === t.id ? '#fff' : 'transparent', borderRadius: '4px 4px 0 0', marginTop: 4 }}
                  onClick={() => setTab(t.id as any)}>
                  <i className={`bi bi-${t.icon} me-1`}></i>{t.label}
                  {t.badge ? <span className={`badge ms-1 ${t.id === 'review' ? 'bg-warning text-dark' : 'bg-light text-dark'}`}>{t.badge}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card-body">
          {/* ══ Tab: Upload ══════════════════════════════════════════ */}
          {tab === 'upload' && (
            <div>
              {/* Template selector */}
              <div className="mb-3">
                <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>
                  <i className="bi bi-layout-text-window me-1 text-primary"></i>Select Import Template
                </label>
                <div className="row g-2">
                  {templates.map(t => (
                    <div className="col-md-4" key={t.id}>
                      <div
                        className={`card h-100 border-2 ${selectedTemplate?.id === t.id ? 'border-primary bg-primary bg-opacity-10' : 'border-light'}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => { setSelectedTemplate(selectedTemplate?.id === t.id ? null : t); setImportType(t.file_format === 'excel' ? 'excel' : 'csv') }}>
                        <div className="card-body py-2 px-3">
                          <div className="d-flex align-items-start gap-2">
                            <i className={`bi bi-file-earmark-${t.file_format === 'excel' ? 'spreadsheet text-success' : 'csv text-primary'} fs-4 flex-shrink-0`}></i>
                            <div className="flex-grow-1">
                              <div className="fw-semibold small">{t.template_name}</div>
                              <small className="text-muted">{t.description}</small>
                              <div className="mt-1 d-flex align-items-center gap-1 flex-wrap">
                                <span className="badge bg-secondary" style={{ fontSize: '0.6rem' }}>{t.template_type}</span>
                                <span className="badge bg-info" style={{ fontSize: '0.6rem' }}>{t.file_format.toUpperCase()}</span>
                                {(t as any).is_system && <span className="badge bg-warning text-dark" style={{ fontSize: '0.6rem' }}><i className="bi bi-globe me-1"></i>Master</span>}
                                <button
                                  className="btn btn-outline-success py-0 px-1 ms-auto"
                                  style={{ fontSize: '0.62rem', lineHeight: 1.4 }}
                                  title="Download template CSV"
                                  onClick={e => { e.stopPropagation(); downloadTemplate(t.id, t.template_name) }}>
                                  <i className="bi bi-download me-1"></i>Download
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {templates.length === 0 && <div className="col-12"><small className="text-muted">No templates loaded</small></div>}
                </div>
              </div>

              <div className="row g-3">
                {/* Drag-drop zone */}
                <div className="col-md-7">
                  <label className="form-label small fw-semibold text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>
                    <i className="bi bi-file-earmark-arrow-up me-1 text-primary"></i>File Upload
                  </label>
                  <div
                    className={`border-2 border-dashed rounded-3 text-center p-4 ${isDragging ? 'border-primary bg-primary bg-opacity-5' : 'border-secondary'}`}
                    style={{ cursor: 'pointer', transition: 'all .2s', borderStyle: 'dashed !important' }}
                    onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                    onClick={() => fileRef.current?.click()}>
                    {file ? (
                      <>
                        <i className={`bi bi-file-earmark-${importType === 'excel' ? 'spreadsheet text-success' : 'text text-primary'} display-5`}></i>
                        <div className="fw-semibold mt-2">{file.name}</div>
                        <div className="text-muted small">{(file.size / 1024).toFixed(1)} KB · {importType.toUpperCase()}</div>
                        <button type="button" className="btn btn-sm btn-outline-secondary mt-2" onClick={e => { e.stopPropagation(); setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = '' }}>
                          <i className="bi bi-x me-1"></i>Remove
                        </button>
                      </>
                    ) : (
                      <>
                        <i className="bi bi-cloud-upload display-4 text-muted opacity-50"></i>
                        <div className="mt-2 fw-semibold text-muted">{isDragging ? 'Drop file here' : 'Drag & drop file here'}</div>
                        <div className="text-muted small">or click to browse · .xlsx, .xls, .csv</div>
                      </>
                    )}
                  </div>
                  <input ref={fileRef} type="file" className="d-none" accept=".xlsx,.xls,.csv" onChange={onFileChange} />
                  <div className="mt-2 d-flex gap-2 align-items-center">
                    <label className="form-label small mb-0 text-muted">Format:</label>
                    <div className="btn-group btn-group-sm">
                      <button className={`btn ${importType === 'csv' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setImportType('csv')}>CSV</button>
                      <button className={`btn ${importType === 'excel' ? 'btn-success' : 'btn-outline-secondary'}`} onClick={() => setImportType('excel')}>Excel</button>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="col-md-5 d-flex flex-column gap-2 justify-content-start">
                  <div className="card border-0 bg-light mt-3 mt-md-0" style={{ marginTop: '1.8rem' }}>
                    <div className="card-body py-3">
                      <div className="fw-semibold small mb-2"><i className="bi bi-play-fill me-1 text-primary"></i>Import Actions</div>
                      <div className="d-grid gap-2">
                        <button className="btn btn-outline-secondary" disabled={previewing || !file} onClick={handlePreview}>
                          {previewing ? <><span className="spinner-border spinner-border-sm me-1"></span>Previewing…</> : <><i className="bi bi-eye me-1"></i>Preview File</>}
                        </button>
                        <button className="btn btn-primary" disabled={uploading || !file} onClick={handleUpload}>
                          {uploading ? <><span className="spinner-border spinner-border-sm me-1"></span>Importing…</> : <><i className="bi bi-upload me-1"></i>Upload &amp; Import</>}
                        </button>
                      </div>
                      {selectedTemplate && (
                        <div className="small text-success mt-2"><i className="bi bi-check-circle me-1"></i>Template: <strong>{selectedTemplate.template_name}</strong></div>
                      )}
                      {!selectedTemplate && (
                        <div className="small text-muted mt-2"><i className="bi bi-info-circle me-1"></i>No template selected — using auto-detect</div>
                      )}
                    </div>
                  </div>

                  {/* Sample file links */}
                  <div className="card border-0 bg-light">
                    <div className="card-body py-2 px-3">
                      <div className="fw-semibold small mb-1"><i className="bi bi-download me-1 text-info"></i>Sample Files</div>
                      {[
                        { label: 'Sample CSV (transactions)',    href: '/sample-transactions.csv' },
                        { label: 'Sample Thai Accounting CSV',  href: '/sample-thai-accounting-import.csv' },
                        { label: 'Sample QuickBooks CSV',        href: '/sample-quickbooks-import.csv' },
                      ].map(s => (
                        <a key={s.href} href={s.href} download className="d-block small text-info text-decoration-none mb-1">
                          <i className="bi bi-file-earmark-arrow-down me-1"></i>{s.label}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview results */}
              {preview && (
                <div className="mt-3 card border-warning">
                  <div className="card-header py-2" style={{ background: '#fff3cd' }}>
                    <div className="fw-semibold"><i className="bi bi-eye me-1 text-warning"></i>File Preview</div>
                  </div>
                  <div className="card-body">
                    {/* Format badge */}
                    <div className="mb-2 d-flex align-items-center gap-2 flex-wrap">
                      {preview.format === 'transaction' && <span className="badge bg-primary"><i className="bi bi-list-ul me-1"></i>Transaction Format</span>}
                      {preview.format === 'statement' && <span className="badge bg-success"><i className="bi bi-table me-1"></i>Financial Statement Format</span>}
                      {preview.total_rows != null && <span className="badge bg-secondary">{preview.total_rows} rows total</span>}
                    </div>

                    {/* Statement metadata badges */}
                    {preview.format === 'statement' && preview.metadata && (
                      <div className="mb-2 d-flex flex-wrap gap-2">
                        {Object.entries(preview.metadata).map(([k, v]) => (
                          <span key={k} className="badge bg-light text-dark border">{k}: <strong>{String(v)}</strong></span>
                        ))}
                      </div>
                    )}

                    {/* Errors */}
                    {preview.errors && preview.errors.length > 0 && (
                      <div className="alert alert-danger py-2 mb-2">
                        <strong><i className="bi bi-exclamation-octagon me-1"></i>Validation Errors:</strong>
                        <ul className="mb-0 mt-1">{preview.errors.map((er, i) => <li key={i} className="small">{er}</li>)}</ul>
                      </div>
                    )}

                    {preview.errors?.length === 0 && (
                      <div className="alert alert-success py-2 mb-2"><i className="bi bi-check-circle me-1"></i>File looks valid — ready to import</div>
                    )}

                    {/* Transaction preview table */}
                    {preview.format === 'transaction' && preview.previewRows && preview.previewRows.length > 0 && (
                      <div className="table-responsive">
                        <table className="table table-sm table-bordered table-hover mb-0">
                          <thead className="table-dark">
                            <tr><th>#</th><th>Date</th><th>Description</th><th className="text-end">Amount</th><th>Account</th><th>Vendor/Customer</th><th>Category</th><th>Currency</th></tr>
                          </thead>
                          <tbody>
                            {preview.previewRows.slice(0, 10).map((r, i) => (
                              <tr key={i}>
                                <td className="text-muted small">{i+1}</td>
                                <td className="small">{r.date}</td>
                                <td className="small">{r.description}</td>
                                <td className="text-end small fw-semibold">{r.amount != null ? THB.format(Number(r.amount)) : '—'}</td>
                                <td><code className="small">{r.account_code}</code>{r.account_name ? <span className="text-muted small ms-1">({r.account_name})</span> : null}</td>
                                <td className="small">{r.vendor_customer}</td>
                                <td className="small">{r.category}</td>
                                <td className="small">{r.currency || 'THB'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {(preview.total_rows ?? 0) > 10 && <div className="text-muted small mt-1">Showing 10 of {preview.total_rows} rows</div>}
                      </div>
                    )}

                    {/* Financial statement preview table */}
                    {preview.format === 'statement' && preview.previewRows && preview.previewRows.length > 0 && (
                      <div className="table-responsive">
                        <table className="table table-sm table-bordered mb-0">
                          <thead className="table-dark"><tr><th>#</th><th>Line Code</th><th>Line Name</th><th className="text-end">Amount</th><th>Currency</th><th>Notes</th></tr></thead>
                          <tbody>
                            {preview.previewRows.slice(0, 10).map((r, i) => (
                              <tr key={i}>
                                <td className="text-muted small">{i+1}</td>
                                <td><code className="small">{r.line_code}</code></td>
                                <td className="small">{r.line_name}</td>
                                <td className="text-end small">{r.amount != null ? THB.format(Number(r.amount)) : '—'}</td>
                                <td className="small">{r.currency || 'THB'}</td>
                                <td className="small text-muted">{r.notes}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {(preview.total_rows ?? preview.previewRows.length) > 10 && <div className="text-muted small mt-1">Showing 10 of {preview.total_rows ?? preview.previewRows.length} rows</div>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ Tab: Review Transactions ══════════════════════════════ */}
          {tab === 'review' && (
            <div>
              {/* Filter bar */}
              <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
                <input type="search" className="form-control form-control-sm" style={{ maxWidth: 220 }}
                  placeholder="🔍 Search transactions…" value={txSearch} onChange={e => setTxSearch(e.target.value)} />
                <div className="d-flex gap-1">
                  {(['ALL', 'pending', 'approved', 'rejected'] as const).map(s => (
                    <button key={s} className={`btn btn-sm py-0 ${txStatusFilter === s ? (s === 'approved' ? 'btn-success' : s === 'rejected' ? 'btn-danger' : s === 'pending' ? 'btn-warning' : 'btn-primary') : 'btn-outline-secondary'}`}
                      style={{ fontSize: '0.72rem' }} onClick={() => setTxStatusFilter(s)}>
                      {s === 'ALL' ? 'All' : s}
                    </button>
                  ))}
                </div>
                <select className="form-select form-select-sm" style={{ maxWidth: 180 }} value={txLogFilter} onChange={e => setTxLogFilter(e.target.value)}>
                  <option value="ALL">All Imports</option>
                  {importLogs.map(l => <option key={l.id} value={l.id}>{l.file_name?.slice(0,30)}</option>)}
                </select>
                <span className="ms-auto small text-muted">{filteredTx.length} of {transactions.length} transactions</span>

                {selectedTx.length > 0 && (
                  <button className="btn btn-sm btn-success px-3" onClick={approveTransactions} disabled={approvingTx}>
                    {approvingTx ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-check-all me-1"></i>}
                    Approve {selectedTx.length}
                  </button>
                )}
              </div>

              {loadingTx && <div className="text-center py-4"><span className="spinner-border text-primary"></span></div>}

              <div className="table-responsive" style={{ maxHeight: 450 }}>
                <table className="table table-sm table-hover table-bordered mb-0">
                  <thead className="table-dark sticky-top">
                    <tr>
                      <th style={{ width: 36 }}>
                        <input type="checkbox" className="form-check-input" checked={allSelected} onChange={toggleAll} />
                      </th>
                      <th>Date</th><th>Description</th><th>Account</th>
                      <th className="text-end">Amount</th><th>Dept.</th>
                      <th>Status</th><th>Validation</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTx.map(tx => {
                      const amt = parseFloat(tx.amount || '0')
                      return (
                        <tr key={tx.id} className={tx.validation_status === 'invalid' ? 'table-danger' : tx.status === 'approved' ? 'table-success bg-opacity-25' : ''}>
                          <td><input type="checkbox" className="form-check-input" checked={selectedTx.includes(tx.id)} onChange={e => setSelectedTx(prev => e.target.checked ? [...prev, tx.id] : prev.filter(x => x !== tx.id))} /></td>
                          <td className="small text-nowrap">{fmtDate(tx.transaction_date)}</td>
                          <td className="small" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</td>
                          <td><code className="small">{tx.account_code}</code>{tx.account_name && <span className="text-muted small ms-1">{tx.account_name}</span>}</td>
                          <td className={`text-end small fw-bold ${amt >= 0 ? 'text-success' : 'text-danger'}`}>{THB.format(amt)}</td>
                          <td className="small text-muted">{tx.department || '—'}</td>
                          <td><span className={`badge bg-${STATUS_BADGE[tx.status] || 'secondary'}`}>{tx.status}</span></td>
                          <td><span className={`badge bg-${STATUS_BADGE[tx.validation_status] || 'secondary'}`}>{tx.validation_status}</span></td>
                          <td>
                            <button className="btn btn-xs btn-outline-danger py-0 px-1" style={{ fontSize: '0.65rem' }}
                              disabled={deletingTx === tx.id} onClick={() => deleteTransaction(tx.id)}>
                              {deletingTx === tx.id ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-trash"></i>}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {filteredTx.length === 0 && !loadingTx && (
                <div className="text-center py-4 text-muted">
                  <i className="bi bi-inbox fs-2 d-block mb-2"></i>
                  {transactions.length === 0 ? <span>No transactions yet — import a file first</span> : <span>No transactions match the current filter</span>}
                </div>
              )}
            </div>
          )}

          {/* ══ Tab: Post to Financials ═══════════════════════════════ */}
          {tab === 'post' && (
            <div className="row g-3">
              <div className="col-md-6">
                <div className="card border-primary h-100">
                  <div className="card-header text-bg-primary"><i className="bi bi-send me-1"></i>Post Parameters</div>
                  <div className="card-body">
                    <div className="mb-3">
                      <label className="form-label fw-semibold small">Statement Type</label>
                      <div className="btn-group w-100">
                        {(['PL', 'BS', 'CF'] as const).map(t => (
                          <button key={t} type="button" className={`btn ${postForm.statement_type === t ? 'btn-primary' : 'btn-outline-primary'}`}
                            onClick={() => setPostForm(f => ({ ...f, statement_type: t }))}>
                            {t === 'PL' ? '📊 P&L' : t === 'BS' ? '🏦 Balance Sheet' : '💰 Cash Flow'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="row g-2 mb-3">
                      <div className="col-6">
                        <label className="form-label fw-semibold small">Period Start *</label>
                        <input type="date" className="form-control" value={postForm.period_start} onChange={e => setPostForm(f => ({ ...f, period_start: e.target.value }))} />
                      </div>
                      <div className="col-6">
                        <label className="form-label fw-semibold small">Period End *</label>
                        <input type="date" className="form-control" value={postForm.period_end} onChange={e => setPostForm(f => ({ ...f, period_end: e.target.value }))} />
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="form-label fw-semibold small">Scenario</label>
                      <select className="form-select" value={postForm.scenario} onChange={e => setPostForm(f => ({ ...f, scenario: e.target.value }))}>
                        <option value="actual">Actual (default)</option>
                        <option value="budget">Budget</option>
                        <option value="forecast">Forecast</option>
                        {scenarios.map(s => <option key={s.id} value={s.id}>{s.scenario_name} ({s.scenario_type})</option>)}
                        <option value="__new__">➕ Create new scenario…</option>
                      </select>
                    </div>
                    {postForm.scenario === '__new__' && (
                      <div className="card border-info mb-3">
                        <div className="card-body py-2">
                          <div className="row g-2">
                            <div className="col-8">
                              <label className="form-label small">New Scenario Name</label>
                              <input className="form-control form-control-sm" placeholder="e.g. Q1 2026 Budget" value={postForm.new_scenario_name} onChange={e => setPostForm(f => ({ ...f, new_scenario_name: e.target.value }))} />
                            </div>
                            <div className="col-4">
                              <label className="form-label small">Type</label>
                              <select className="form-select form-select-sm" value={postForm.new_scenario_type} onChange={e => setPostForm(f => ({ ...f, new_scenario_type: e.target.value }))}>
                                <option value="custom">Custom</option>
                                <option value="budget">Budget</option>
                                <option value="forecast">Forecast</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="mb-3">
                      <div className="form-check">
                        <input type="checkbox" className="form-check-input" id="useSelected" checked={postForm.use_selected}
                          onChange={e => setPostForm(f => ({ ...f, use_selected: e.target.checked }))} />
                        <label className="form-check-label small" htmlFor="useSelected">
                          Post only selected transactions ({selectedTx.length} selected from Review tab)
                        </label>
                      </div>
                      {!postForm.use_selected && <div className="form-text">All approved transactions will be posted when unchecked.</div>}
                    </div>
                    <button className="btn btn-primary w-100" onClick={handlePost} disabled={posting || !postForm.period_start || !postForm.period_end}>
                      {posting ? <><span className="spinner-border spinner-border-sm me-1"></span>Posting…</> : <><i className="bi bi-send-fill me-1"></i>Post to Financials</>}
                    </button>
                  </div>
                </div>
              </div>

              {/* Result */}
              <div className="col-md-6">
                {!postResult && !posting && (
                  <div className="text-center py-5 text-muted">
                    <i className="bi bi-arrow-left-circle display-3 opacity-25"></i>
                    <p className="mt-3">Configure and post to see results here</p>
                    <div className="small">
                      <div>Approved transactions: <strong className="text-success">{approvedTx}</strong></div>
                      <div>Pending review: <strong className="text-warning">{pendingTx}</strong></div>
                    </div>
                  </div>
                )}
                {posting && <div className="text-center py-5"><span className="spinner-border text-primary"></span><p className="mt-3 text-muted">Posting transactions to financial statement…</p></div>}
                {postResult && (
                  <div className="card border-success h-100">
                    <div className="card-header text-bg-success"><i className="bi bi-check-circle me-1"></i>Post Successful</div>
                    <div className="card-body">
                      <div className="row g-2 mb-3">
                        {[
                          { label: 'Statement ID',   val: postResult.statement_id?.slice(0, 8) + '…', color: 'primary'  },
                          { label: 'Posted Records', val: postResult.posted_count,   color: 'success' },
                          { label: 'Statement Type', val: postResult.statement_type, color: 'info'    },
                          { label: 'Scenario',       val: postResult.scenario || 'actual', color: 'secondary' },
                        ].map(k => (
                          <div className="col-6" key={k.label}>
                            <div className={`card border-${k.color} text-center`}>
                              <div className="card-body py-2">
                                <div className={`fw-bold text-${k.color}`}>{k.val}</div>
                                <div className="small text-muted">{k.label}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <pre className="bg-light p-2 rounded small" style={{ maxHeight: 200, overflow: 'auto' }}>{JSON.stringify(postResult, null, 2)}</pre>
                      <button className="btn btn-outline-primary btn-sm mt-2" onClick={() => setPostResult(null)}><i className="bi bi-arrow-counterclockwise me-1"></i>Post Again</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ Tab: Import History ═══════════════════════════════════ */}
          {tab === 'history' && (
            <div>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <input type="search" className="form-control form-control-sm" style={{ maxWidth: 260 }}
                  placeholder="🔍 Search history…" value={histSearch} onChange={e => setHistSearch(e.target.value)} />
                <span className="small text-muted">{filteredLogs.length} records</span>
              </div>
              <div className="table-responsive">
                <table className="table table-sm table-hover table-bordered mb-0">
                  <thead className="table-dark">
                    <tr>
                      <th>File</th><th>Template</th><th>Type</th><th>Status</th>
                      <th className="text-end">Total</th><th className="text-end">Valid</th><th className="text-end">Fail</th>
                      <th>Started</th><th>Completed</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map(l => {
                      const total = l.total_rows ?? ((l.valid_rows||0)+(l.invalid_rows||0))
                      const valid = l.valid_rows   ?? l.rows_imported ?? 0
                      const fail  = l.invalid_rows ?? l.rows_failed   ?? 0
                      const pct   = total > 0 ? (valid / total) * 100 : 0
                      return (
                        <tr key={l.id}>
                          <td className="small" style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.file_name}>
                            <i className={`bi bi-file-earmark-${l.import_type === 'excel' ? 'spreadsheet text-success' : 'csv text-primary'} me-1`}></i>{l.file_name}
                          </td>
                          <td className="small text-muted">{l.template_name || '—'}</td>
                          <td><span className="badge bg-secondary" style={{ fontSize: '0.6rem' }}>{l.import_type}</span></td>
                          <td>
                            <div className="d-flex align-items-center gap-1">
                              <span className={`badge bg-${l.status === 'completed' || l.status === 'success' ? 'success' : l.status === 'failed' || l.status === 'error' ? 'danger' : 'warning'}`}>
                                {l.status}
                              </span>
                            </div>
                          </td>
                          <td className="text-end small">{total}</td>
                          <td className="text-end small text-success">{valid}</td>
                          <td className="text-end small text-danger">{fail > 0 ? fail : '—'}</td>
                          <td className="small text-nowrap text-muted">{fmtDT(l.started_at || l.created_at || '')}</td>
                          <td className="small text-nowrap text-muted">{fmtDT(l.completed_at || '')}</td>
                          <td>
                            <div className="d-flex flex-column gap-1" style={{ minWidth: 120 }}>
                              <div className="progress" style={{ height: 5 }}>
                                <div className={`progress-bar bg-${pct >= 100 ? 'success' : pct > 0 ? 'primary' : 'danger'}`} style={{ width: `${pct}%` }}></div>
                              </div>
                              {(l.error_log || fail > 0) && (
                                <button className="btn btn-xs btn-outline-primary py-0 px-1" style={{ fontSize: '0.65rem' }} onClick={() => downloadLog(l.id, l.error_log)}>
                                  <i className="bi bi-download me-1"></i>Log
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
              {filteredLogs.length === 0 && (
                <div className="text-center py-4 text-muted">
                  <i className="bi bi-clock-history fs-2 d-block mb-2"></i>
                  {importLogs.length === 0 ? 'No import history yet' : 'No records match the search'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── CFO Guide ────────────────────────────────────────────── */}
      <div className="card mt-3 border-0" style={{ background: 'linear-gradient(90deg,#f8f9fa,#e9ecef)' }}>
        <div className="card-body py-3">
          <div className="small fw-semibold text-muted mb-2"><i className="bi bi-lightbulb me-1 text-warning"></i>CFO ETL Data Pipeline</div>
          <div className="row g-2">
            {[
              { step: '1', label: 'Upload File',     desc: 'Import CSV or Excel from ERP, QuickBooks, or custom source' },
              { step: '2', label: 'Review & Validate', desc: 'Check for invalid rows, fix account codes, remove bad data' },
              { step: '3', label: 'Approve',          desc: 'Bulk-approve valid transactions to mark as ready to post' },
              { step: '4', label: 'Post to Financials', desc: 'Create P&L / Balance Sheet / Cash Flow statement from approved transactions' },
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

      {/* ─── Toast ────────────────────────────────────────────────── */}
      {toast && ReactDOM.createPortal(
        <div className="position-fixed top-0 end-0 p-3" style={{ zIndex: 9999 }}>
          <div className={`toast show align-items-center text-bg-${toast.type} border-0`}>
            <div className="d-flex">
              <div className="toast-body d-flex align-items-center gap-2">
                <i className={`bi bi-${toast.type === 'success' ? 'check-circle-fill' : toast.type === 'warning' ? 'exclamation-circle-fill' : toast.type === 'info' ? 'info-circle-fill' : 'x-circle-fill'} fs-5`}></i>
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
