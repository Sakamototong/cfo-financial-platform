import React, { useState, useEffect } from 'react'
import api from '../api/client'
import { useTenant } from '../components/TenantContext'

interface DIMTemplate {
  id: string
  template_name: string
  description?: string
  created_at: string
}

interface Dimension {
  id?: string
  dimension_code: string
  dimension_name: string
  dimension_type: string
  created_at?: string
}

export default function DIM() {
  const { tenantId } = useTenant()
  const [templates, setTemplates] = useState<DIMTemplate[]>([])
  const [showForm, setShowForm] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [description, setDescription] = useState('')
  const [config, setConfig] = useState('{}')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'templates' | 'dimensions'>('templates')

  // Dimensions state
  const [dimensions, setDimensions] = useState<Dimension[]>([])
  const [dimCode, setDimCode] = useState('')
  const [dimName, setDimName] = useState('')
  const [dimType, setDimType] = useState('custom')
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId) { setTemplates([]); setDimensions([]); return }
    loadTemplates()
    loadDimensions()
  }, [tenantId])

  async function loadTemplates() {
    if (!tenantId) { setTemplates([]); return }
    try {
      const res = await api.get('/dim/templates')
      setTemplates(res.data)
    } catch (err: any) {
      console.error('Failed to load templates:', err)
    }
  }

  async function loadDimensions() {
    if (!tenantId) { setDimensions([]); return }
    try {
      const res = await api.get('/dim/dimensions')
      setDimensions(res.data)
    } catch (err: any) {
      console.error('Failed to load dimensions:', err)
    }
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const configObj = JSON.parse(config)
      const res = await api.post('/dim/templates', {
        template_name: templateName,
        description,
        config: configObj,
        // default to PL and empty line_items so backend constraints are satisfied
        statement_type: 'PL',
        line_items: []
      })
      setTemplates([...templates, res.data])
      setTemplateName('')
      setDescription('')
      setConfig('{}')
      setShowForm(false)
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to create template')
    } finally {
      setLoading(false)
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return
    try {
      await api.delete(`/dim/templates/${id}`)
      setTemplates(templates.filter(t => t.id !== id))
    } catch (err: any) {
      alert('Delete failed: ' + (err.response?.data?.message || err.message))
    }
  }

  async function createDimension(e: React.FormEvent) {
    e.preventDefault()
    try {
      const body: any = {
        dimension_code: dimCode,
        dimension_name: dimName,
        dimension_type: dimType,
      }
      // When editing, ensure is_active true
      if (editingId) body.is_active = true

      const res = await api.post('/dim/dimensions', body)

      // Replace or append
      setDimensions(prev => {
        const existingIndex = prev.findIndex(d => d.dimension_code === res.data.dimension_code || d.id === res.data.id)
        if (existingIndex >= 0) {
          const copy = [...prev]
          copy[existingIndex] = res.data
          return copy
        }
        return [...prev, res.data]
      })

      setDimCode('')
      setDimName('')
      setDimType('custom')
      setEditingId(null)
      setActiveTab('dimensions')
    } catch (err: any) {
      alert('Create dimension failed: ' + (err.response?.data?.message || err.message))
    }
  }

  function startEdit(d: Dimension) {
    setEditingId(d.id || null)
    setDimCode(d.dimension_code)
    setDimName(d.dimension_name)
    setDimType(d.dimension_type)
    setActiveTab('dimensions')
  }

  function cancelEdit() {
    setEditingId(null)
    setDimCode('')
    setDimName('')
    setDimType('custom')
  }

  async function deleteDimension(id?: string) {
    if (!id) return
    if (!confirm('Delete this dimension?')) return
    try {
      // Backend doesn't provide a DELETE endpoint for dimensions; mark as inactive via upsert
      const existing = dimensions.find(d => d.id === id)
      if (!existing) throw new Error('Dimension not found')
      await api.post('/dim/dimensions', {
        dimension_code: existing.dimension_code,
        dimension_name: existing.dimension_name,
        dimension_type: existing.dimension_type,
        is_active: false,
      })
      setDimensions(dimensions.filter(d => d.id !== id))
    } catch (err: any) {
      alert('Delete failed: ' + (err.response?.data?.message || err.message))
    }
  }

  return (
    <>
      {/* Page Header */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-diagram-3 me-2"></i>
            Dimension Configuration (DIM)
          </h3>
          <div className="card-tools">
            <div className="btn-group" role="group">
              <button 
                type="button" 
                className={`btn btn-sm ${activeTab === 'templates' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setActiveTab('templates')}
              >
                <i className="bi bi-file-earmark-text me-1"></i>
                Templates
              </button>
              <button 
                type="button" 
                className={`btn btn-sm ${activeTab === 'dimensions' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setActiveTab('dimensions')}
              >
                <i className="bi bi-box me-1"></i>
                Dimensions
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <>
          {/* Create Template Form */}
          {showForm && (
            <div className="card card-primary card-outline mb-3">
              <div className="card-header">
                <h3 className="card-title">
                  <i className="bi bi-plus-circle me-2"></i>
                  Create Template
                </h3>
                <div className="card-tools">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowForm(false)}>
                    <i className="bi bi-x-lg"></i>
                  </button>
                </div>
              </div>
              <form onSubmit={createTemplate}>
                <div className="card-body">
                  {error && (
                    <div className="alert alert-danger alert-dismissible fade show" role="alert">
                      <i className="bi bi-exclamation-triangle me-2"></i>
                      {error}
                      <button type="button" className="btn-close" onClick={() => setError(null)}></button>
                    </div>
                  )}

                  <div className="mb-3">
                    <label className="form-label">Template Name</label>
                    <input 
                      type="text"
                      className="form-control"
                      value={templateName} 
                      onChange={e => setTemplateName(e.target.value)}
                      placeholder="e.g., Standard P&L Template"
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Description</label>
                    <textarea 
                      className="form-control"
                      value={description} 
                      onChange={e => setDescription(e.target.value)}
                      placeholder="Optional description"
                      rows={2}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Configuration (JSON)</label>
                    <textarea 
                      className="form-control"
                      value={config} 
                      onChange={e => setConfig(e.target.value)}
                      placeholder='{"dimensions": ["time", "geography", "product"]}'
                      rows={6}
                      style={{ fontFamily: 'monospace', fontSize: '13px' }}
                      required
                    />
                    <div className="form-text">Enter valid JSON configuration</div>
                  </div>
                </div>

                <div className="card-footer">
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    <i className="bi bi-check-circle me-1"></i>
                    {loading ? 'Creating...' : 'Create Template'}
                  </button>
                  <button type="button" className="btn btn-secondary ms-2" onClick={() => setShowForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Templates List */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <i className="bi bi-file-earmark-text me-2"></i>
                Dimension Templates
              </h3>
              <div className="card-tools">
                {!showForm && (
                  <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
                    <i className="bi bi-plus-lg me-1"></i>
                    New Template
                  </button>
                )}
              </div>
            </div>
            <div className="card-body">
              {templates.length === 0 ? (
                <div className="text-center py-5">
                  <i className="bi bi-inbox" style={{ fontSize: '3rem', color: '#ccc' }}></i>
                  <p className="mt-2 text-muted">No templates yet</p>
                  {!showForm && (
                    <button className="btn btn-primary btn-sm mt-2" onClick={() => setShowForm(true)}>
                      <i className="bi bi-plus-lg me-1"></i>
                      Create First Template
                    </button>
                  )}
                </div>
              ) : (
                <div className="row g-3">
                  {templates.map(t => (
                    <div key={t.id} className="col-md-6">
                      <div className="card card-outline card-info">
                        <div className="card-body">
                          <div className="d-flex justify-content-between align-items-start">
                            <div className="flex-grow-1">
                              <h5 className="card-title mb-2">{t.template_name}</h5>
                              {t.description && (
                                <p className="card-text text-muted small mb-2">
                                  {t.description}
                                </p>
                              )}
                              <small className="text-muted">
                                <i className="bi bi-calendar me-1"></i>
                                {new Date(t.created_at).toLocaleString()}
                              </small>
                            </div>
                            <button 
                              onClick={() => deleteTemplate(t.id)} 
                              className="btn btn-sm btn-outline-danger ms-2"
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {templates.length > 0 && (
              <div className="card-footer">
                <small className="text-muted">Showing {templates.length} template(s)</small>
              </div>
            )}
          </div>
        </>
      )}

      {/* Dimensions Tab */}
      {activeTab === 'dimensions' && (
        <>
          {/* Create/Edit Dimension Form */}
          <div className="card card-primary card-outline mb-3">
            <div className="card-header">
              <h3 className="card-title">
                <i className={`bi ${editingId ? 'bi-pencil' : 'bi-plus-circle'} me-2`}></i>
                {editingId ? 'Edit Dimension' : 'Create Dimension'}
              </h3>
            </div>
            <form onSubmit={createDimension}>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-4 mb-3">
                    <label className="form-label">Code</label>
                    <input 
                      type="text"
                      className="form-control" 
                      placeholder="e.g. COSTCTR" 
                      value={dimCode} 
                      onChange={e => setDimCode(e.target.value)} 
                      required 
                    />
                  </div>
                  
                  <div className="col-md-4 mb-3">
                    <label className="form-label">Name</label>
                    <input 
                      type="text"
                      className="form-control" 
                      placeholder="e.g. Cost Center" 
                      value={dimName} 
                      onChange={e => setDimName(e.target.value)} 
                      required 
                    />
                  </div>

                  <div className="col-md-4 mb-3">
                    <label className="form-label">Type</label>
                    <select className="form-select" value={dimType} onChange={e => setDimType(e.target.value)}>
                      <option value="account">Account</option>
                      <option value="department">Department</option>
                      <option value="product">Product</option>
                      <option value="location">Location</option>
                      <option value="project">Project</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="card-footer">
                <button type="submit" className="btn btn-primary">
                  <i className={`bi ${editingId ? 'bi-check-circle' : 'bi-plus-circle'} me-1`}></i>
                  {editingId ? 'Save Changes' : 'Create Dimension'}
                </button>
                {editingId && (
                  <button type="button" className="btn btn-secondary ms-2" onClick={cancelEdit}>
                    <i className="bi bi-x-lg me-1"></i>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Dimensions List */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <i className="bi bi-box me-2"></i>
                Dimensions
              </h3>
              <div className="card-tools">
                <span className="badge text-bg-primary">{dimensions.length}</span>
              </div>
            </div>
            <div className="card-body p-0">
              {dimensions.length === 0 ? (
                <div className="text-center py-5">
                  <i className="bi bi-inbox" style={{ fontSize: '3rem', color: '#ccc' }}></i>
                  <p className="mt-2 text-muted">No dimensions yet</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover table-striped mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dimensions.map(d => (
                        <tr key={d.id || d.dimension_code}>
                          <td><code>{d.dimension_code}</code></td>
                          <td><span className="fw-semibold">{d.dimension_name}</span></td>
                          <td><span className="badge text-bg-secondary">{d.dimension_type}</span></td>
                          <td>
                            <div className="btn-group" role="group">
                              <button 
                                onClick={() => startEdit(d)} 
                                className="btn btn-sm btn-primary"
                              >
                                <i className="bi bi-pencil me-1"></i>
                                Edit
                              </button>
                              <button 
                                onClick={() => deleteDimension(d.id)} 
                                className="btn btn-sm btn-outline-danger"
                              >
                                <i className="bi bi-trash"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {dimensions.length > 0 && (
              <div className="card-footer">
                <small className="text-muted">Showing {dimensions.length} dimension(s)</small>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
