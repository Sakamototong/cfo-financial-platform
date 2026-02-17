import React, { useState, useEffect } from 'react'
import api from '../api/client'
import { getAuthHeaders } from '../lib/headers'
import { useTenant } from '../components/TenantContext'

interface ImportHistory {
  id: string
  import_type: string
  file_name: string
  status: string
  rows_imported?: number
  rows_failed?: number
  error_log?: string
  created_at: string
}

export default function ETL() {
  const { tenantId } = useTenant()
  const [history, setHistory] = useState<ImportHistory[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [importType, setImportType] = useState<'excel' | 'csv'>('excel')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<any | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({})
  // Mapping templates
  const [mappingTemplates, setMappingTemplates] = useState<any[]>([])
  const [mappingName, setMappingName] = useState('')
  const [mapping, setMapping] = useState('{}')

  useEffect(() => {
    if (!tenantId) { setHistory([]); setMappingTemplates([]); return }
    loadHistory()
    loadMappingTemplates()
  }, [tenantId])

  async function loadMappingTemplates() {
    if (!tenantId) { setMappingTemplates([]); return }
    try {
      const res = await api.get('/admin/config')
      const items = Array.isArray(res.data) ? res.data : []
      const maps = items.filter((c: any) => typeof c.config_key === 'string' && c.config_key.startsWith('etl.mapping.'))
      setMappingTemplates(maps)
    } catch (err: any) {
      console.error('Failed to load mapping templates', err)
    }
  }

  async function loadHistory() {
    if (!tenantId) { setHistory([]); return }
    try {
      const res = await api.get('/etl/import/history')
      setHistory(res.data)
    } catch (err: any) {
      console.error('Failed to load history:', err)
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return

    setError(null)
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    // attach mapping if present
    try {
      const m = JSON.parse(mapping || '{}')
      formData.append('mapping', JSON.stringify(m))
    } catch (e) {
      // ignore invalid mapping
    }

    try {
      const endpoint = importType === 'excel' ? '/etl/import/excel' : '/etl/import/csv'
      const mappingHeader = (() => {
        try { return JSON.stringify(JSON.parse(mapping || '{}')) } catch (e) { return undefined }
      })()
      const headers = { ...getAuthHeaders() }
      if (mappingHeader) headers['x-mapping'] = mappingHeader

      const res = await api.post(endpoint, formData, { headers })
      alert('Import successful: ' + JSON.stringify(res.data, null, 2))
      setFile(null)
      loadHistory()
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handlePreview(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault()
    if (!file) return

    setError(null)
    setPreview(null)
    setPreviewing(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const endpoint = importType === 'excel' ? '/etl/preview/excel' : '/etl/preview/csv'
      const mappingHeader = (() => {
        try { return JSON.stringify(JSON.parse(mapping || '{}')) } catch (e) { return undefined }
      })()
      const headers = { ...getAuthHeaders() }
      if (mappingHeader) headers['x-mapping'] = mappingHeader

      const resp = await api.post(endpoint, formData, { headers })
      setPreview(resp.data)
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }

  async function handleDownloadLog(importId: string, fallbackLog?: string) {
    try {
      const headers = getAuthHeaders()
      const base = (import.meta as any)?.env?.VITE_API_BASE || 'http://localhost:3000'
      const res = await fetch(`${base}/etl/import/${importId}/log`, {
        method: 'GET',
        headers,
      })

      if (!res.ok) {
        const text = fallbackLog || (await res.text()).slice(0, 1000)
        const w = window.open('', '_blank')
        if (!w) return
        w.document.write('<pre>'+String(text).replace(/</g,'&lt;')+'</pre>')
        return
      }

      const contentLength = res.headers.get('Content-Length')
      const total = contentLength ? parseInt(contentLength, 10) : undefined
      const reader = res.body?.getReader()
      if (!reader) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `import_${importId}_error.log`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        return
      }

      const chunks: Uint8Array[] = []
      let received = 0
      setDownloadProgress(prev => ({ ...prev, [importId]: 0 }))
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          received += value.length
          setDownloadProgress(prev => ({ ...prev, [importId]: total ? (received / total) * 100 : Math.min(99, (received / 1024) * 100) }))
        }
      }

      const blob = new Blob(chunks as any, { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers.get('Content-Disposition')
      let fileName = `import_${importId}_error.log`
      if (cd) {
        const m = cd.match(/filename\*?=([^;]+)$/)
        if (m) fileName = m[1].replace(/UTF-8''/, '').replace(/"/g, '').trim()
        else {
          const m2 = cd.match(/filename="?([^";]+)"?/)
          if (m2) fileName = m2[1]
        }
      }
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setDownloadProgress(prev => { const n = { ...prev }; delete n[importId]; return n })
    } catch (e) {
      console.error('Download failed', e)
    }
  }

  async function saveMappingTemplate(e?: React.FormEvent) {
    e?.preventDefault()
    if (!mappingName) return alert('Please provide a template name')
    let parsed
    try {
      parsed = JSON.parse(mapping)
    } catch (err: any) {
      return alert('Invalid JSON in mapping')
    }
    try {
      const key = `etl.mapping.${mappingName}`
      const body = {
        tenant_id: localStorage.getItem('tenant_id') || undefined,
        config_key: key,
        config_value: parsed,
        description: 'ETL mapping template'
      }
      await api.post('/admin/config', body)
      await loadMappingTemplates()
      alert('Template saved')
    } catch (err: any) {
      alert('Save failed: ' + (err.response?.data?.message || err.message))
    }
  }

  function applyTemplate(t: any) {
    try {
      setMapping(JSON.stringify(t.config_value || {}, null, 2))
      const parts = (t.config_key || '').split('.')
      setMappingName(parts.slice(2).join('.') || '')
    } catch (e) {
      console.error(e)
    }
  }

  async function deleteMappingTemplate(t: any) {
    if (!confirm('Delete this mapping template?')) return
    try {
      await api.delete(`/admin/config/${encodeURIComponent(t.config_key)}`)
      await loadMappingTemplates()
      alert('Deleted')
    } catch (err: any) {
      alert('Delete failed: ' + (err.response?.data?.message || err.message))
    }
  }

  return (
    <>
      {/* Page Header */}
      <div className="card mb-4">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-cloud-upload me-2"></i>
            ETL / Import
          </h3>
        </div>
        <div className="card-body">
          <p className="text-secondary mb-0">Upload Excel or CSV files to import financial data</p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <i className="bi bi-exclamation-triangle-fill me-2"></i>
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)} aria-label="Close"></button>
        </div>
      )}

      {/* Upload File Card */}
      <div className="card mb-4">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-file-earmark-arrow-up me-2"></i>
            Upload File
          </h3>
        </div>
        <div className="card-body">
          <form onSubmit={handleUpload}>
            <div className="row">
              <div className="col-md-4 mb-3">
                <label className="form-label">Import Type</label>
                <select
                  className="form-select"
                  value={importType}
                  onChange={e => setImportType(e.target.value as any)}
                >
                  <option value="excel">Excel (.xlsx)</option>
                  <option value="csv">CSV (.csv)</option>
                </select>
              </div>
              <div className="col-md-8 mb-3">
                <label className="form-label">File</label>
                <input
                  type="file"
                  className="form-control"
                  accept={importType === 'excel' ? '.xlsx,.xls' : '.csv'}
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  required
                />
              </div>
            </div>

            {file && (
              <div className="alert alert-info d-flex align-items-center py-2 mb-3">
                <i className="bi bi-file-earmark-check me-2"></i>
                Selected: <strong className="ms-1">{file.name}</strong>
                <span className="text-secondary ms-2">({(file.size / 1024).toFixed(2)} KB)</span>
              </div>
            )}

            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={uploading || !file}>
                {uploading ? (
                  <><span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Uploading...</>
                ) : (
                  <><i className="bi bi-upload me-1"></i>Upload &amp; Import</>
                )}
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={handlePreview} disabled={previewing || !file}>
                {previewing ? (
                  <><span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Previewing...</>
                ) : (
                  <><i className="bi bi-eye me-1"></i>Preview File</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Mapping Templates Card */}
      <div className="card mb-4">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-diagram-3 me-2"></i>
            Mapping Templates
          </h3>
        </div>
        <div className="card-body">
          <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
            <select
              className="form-select"
              style={{ maxWidth: '280px' }}
              onChange={e => {
                const v = mappingTemplates.find(m => m.config_key === e.target.value)
                if (v) applyTemplate(v)
              }}
            >
              <option value="">-- Load template --</option>
              {mappingTemplates.map(t => (
                <option key={t.config_key} value={t.config_key}>
                  {t.config_key.replace('etl.mapping.', '')}
                </option>
              ))}
            </select>
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={() => { if (mappingTemplates.length > 0) applyTemplate(mappingTemplates[0]) }}
            >
              <i className="bi bi-box-arrow-in-down me-1"></i>Load First
            </button>
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={async () => {
                try {
                  const res = await api.get('/admin/config')
                  const items = Array.isArray(res.data) ? res.data : []
                  const exampleKeys = [
                    'etl.mapping.basic_pl_csv',
                    'etl.mapping.excel_sales_sheet',
                    'etl.mapping.fx_currency_map',
                    'etl.mapping.advanced_pl'
                  ]
                  const found = items.find((c: any) => exampleKeys.includes(c.config_key))
                  if (found) applyTemplate(found)
                  else {
                    await loadMappingTemplates()
                    if (mappingTemplates.length > 0) applyTemplate(mappingTemplates[0])
                    else alert('No example templates found. Please create or import them first.')
                  }
                } catch (err: any) {
                  console.error('Failed to load examples', err)
                  alert('Failed to load example templates')
                }
              }}
            >
              <i className="bi bi-lightbulb me-1"></i>Load Example
            </button>
            <button
              className="btn btn-outline-warning btn-sm"
              onClick={() => { setMapping('{}'); setMappingName('') }}
            >
              <i className="bi bi-x-circle me-1"></i>Clear
            </button>
          </div>

          <form onSubmit={saveMappingTemplate}>
            <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
              <input
                className="form-control"
                style={{ maxWidth: '240px' }}
                placeholder="Template name"
                value={mappingName}
                onChange={e => setMappingName(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary btn-sm">
                <i className="bi bi-save me-1"></i>Save Template
              </button>
              <button
                type="button"
                className="btn btn-outline-danger btn-sm"
                onClick={() => {
                  if (!mappingName) return
                  const t = mappingTemplates.find(m => m.config_key === `etl.mapping.${mappingName}`)
                  if (t) deleteMappingTemplate(t)
                }}
              >
                <i className="bi bi-trash me-1"></i>Delete Template
              </button>
            </div>
            <div className="mb-0">
              <textarea
                className="form-control font-monospace"
                value={mapping}
                onChange={e => setMapping(e.target.value)}
                rows={6}
              />
            </div>
          </form>
        </div>
      </div>

      {/* Preview Card */}
      {preview && (
        <div className="card mb-4 border-warning">
          <div className="card-header bg-warning-subtle">
            <h3 className="card-title">
              <i className="bi bi-eye me-2"></i>
              Preview
            </h3>
          </div>
          <div className="card-body">
            <div className="mb-3">
              <strong>Metadata:</strong>
              <pre className="bg-body-tertiary p-3 rounded mt-1 mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(preview.metadata, null, 2)}
              </pre>
            </div>

            {preview.errors && preview.errors.length > 0 && (
              <div className="alert alert-danger mb-3">
                <strong><i className="bi bi-exclamation-octagon me-1"></i>Validation Errors:</strong>
                <ul className="mb-0 mt-1">
                  {preview.errors.map((er: string, idx: number) => <li key={idx}>{er}</li>)}
                </ul>
              </div>
            )}

            <div>
              <strong>Sample Rows:</strong>
              <div className="table-responsive mt-2">
                <table className="table table-hover table-striped table-bordered mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Line Code</th>
                      <th>Line Name</th>
                      <th>Amount</th>
                      <th>Currency</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.previewRows && preview.previewRows.map((r: any, i: number) => (
                      <tr key={i}>
                        <td>{r.line_code}</td>
                        <td>{r.line_name}</td>
                        <td>{r.amount}</td>
                        <td>{r.currency}</td>
                        <td>{r.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import History Card */}
      <div className="card mb-4">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-clock-history me-2"></i>
            Import History
          </h3>
        </div>
        <div className="card-body">
          {history.length === 0 ? (
            <p className="text-secondary mb-0">No imports yet</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover table-striped mb-0">
                <thead className="table-light">
                  <tr>
                    <th>File Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Rows</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id}>
                      <td>{h.file_name}</td>
                      <td>
                        <span className="badge text-bg-secondary">{h.import_type}</span>
                      </td>
                      <td>
                        <span className={`badge ${h.status === 'success' ? 'text-bg-success' : 'text-bg-danger'}`}>
                          {h.status}
                        </span>
                      </td>
                      <td>
                        {h.rows_imported || 0} / {(h.rows_imported || 0) + (h.rows_failed || 0)}
                      </td>
                      <td>{new Date(h.created_at).toLocaleString()}</td>
                      <td>
                        {h.error_log ? (
                          <div>
                            <button
                              className="btn btn-outline-primary btn-sm"
                              onClick={() => handleDownloadLog(h.id, h.error_log)}
                            >
                              <i className="bi bi-download me-1"></i>Download Log
                            </button>
                            {downloadProgress[h.id] != null && (
                              <div className="mt-2" style={{ width: '160px' }}>
                                <div className="progress" style={{ height: '8px' }}>
                                  <div
                                    className="progress-bar"
                                    role="progressbar"
                                    style={{ width: `${Math.round(downloadProgress[h.id])}%` }}
                                    aria-valuenow={Math.round(downloadProgress[h.id])}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                  ></div>
                                </div>
                                <small className="text-secondary">{Math.round(downloadProgress[h.id])}%</small>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-secondary">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
