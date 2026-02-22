import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import api from '../api/client';
import { useAbortController, isAbortError } from '../hooks/useApi';
import { useUser } from '../components/UserContext';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TenantListItem {
  id: string;
  name: string;
  dbName: string;
  dbUser: string;
  createdAt: string;
}

interface TenantDetail {
  id: string;
  name: string;
  dbName: string;
  dbUser: string;
  password: string;
  connectionString: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
}

function previewDbName(name: string) {
  if (!name.trim()) return '';
  const safe = name.trim().replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  return `tenant_${safe}_<id>`;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function ToastAlert({ msg, type, onClose }: { msg: string; type: 'success' | 'danger' | 'warning'; onClose: () => void }) {
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99999, minWidth: 300 }}>
      <div className={`alert alert-${type} alert-dismissible shadow d-flex align-items-center mb-0`}>
        <i className={`bi ${
          type === 'success' ? 'bi-check-circle-fill' :
          type === 'warning' ? 'bi-exclamation-triangle-fill' :
          'bi-x-circle-fill'
        } me-2 flex-shrink-0`}></i>
        <span>{msg}</span>
        <button type="button" className="btn-close ms-auto" onClick={onClose}></button>
      </div>
    </div>,
    document.body
  );
}

// ─── Role Permission Badge ────────────────────────────────────────────────────
function RolePermissionBar() {
  const { role } = useUser();
  const roleLabel: Record<string, string> = {
    admin: 'Admin', tenant_admin: 'Tenant Admin',
    finance_manager: 'Finance Manager', super_admin: 'Super Admin',
  };
  return (
    <div className="alert alert-primary d-flex align-items-center gap-2 mb-3 py-2" role="alert">
      <i className="bi bi-shield-lock-fill flex-shrink-0"></i>
      <div className="small">
        <strong>หน้านี้สำหรับ Super Admin เท่านั้น</strong>
        {' '}— สิทธิ์ที่เข้าได้: <span className="badge text-bg-dark">super_admin</span>{' '}
        &nbsp;|&nbsp; สิทธิ์ปัจจุบัน:&nbsp;
        <span className="badge text-bg-primary">{roleLabel[role || ''] || role || 'unknown'}</span>
        &nbsp;|&nbsp; <span className="text-muted">admin / finance_manager / analyst / viewer : ❌ ไม่มีสิทธิ์เข้าถึงและสร้าง tenant</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Tenants() {
  const { role } = useUser();
  const { getSignal } = useAbortController();

  // List state
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Detail state
  const [selectedTenant, setSelectedTenant] = useState<TenantDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showConnStr, setShowConnStr] = useState(false);

  // Create panel
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit modal
  const [editTenant, setEditTenant] = useState<TenantListItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete modal
  const [deleteTenant, setDeleteTenant] = useState<TenantListItem | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' | 'warning' } | null>(null);
  const toastTimer = useRef<any>(null);
  const showToast = (msg: string, type: 'success' | 'danger' | 'warning' = 'success') => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  };

  const detailRef = useRef<HTMLDivElement>(null);

  // ── Load Tenants ─────────────────────────────────────────────────────────

  const loadTenants = useCallback(async (signal?: AbortSignal) => {
    setListLoading(true); setListError(null);
    try {
      const res = await api.get('/tenants', { signal });
      const raw = res.data || [];
      // Normalize field names (API returns dbName/camelCase from service)
      const normalized: TenantListItem[] = raw.map((t: any) => ({
        id: t.id,
        name: t.name,
        dbName: t.dbName || t.db_name || '',
        dbUser: t.dbUser || t.db_user || '',
        createdAt: t.createdAt || t.created_at || '',
      }));
      setTenants(normalized);
    } catch (e: any) {
      if (!isAbortError(e)) setListError(e.response?.data?.message || e.message || 'Failed to load tenants');
    } finally { setListLoading(false); }
  }, []);

  useEffect(() => { loadTenants(getSignal()); }, [loadTenants]);

  // ── Load Tenant Detail ────────────────────────────────────────────────────

  const loadDetail = async (id: string) => {
    setDetailLoading(true); setDetailError(null); setSelectedTenant(null); setShowConnStr(false);
    try {
      const res = await api.get(`/tenant/${id}`);
      const d = res.data;
      setSelectedTenant({
        id: d.id,
        name: d.name,
        dbName: d.dbName || d.db_name || '',
        dbUser: d.dbUser || d.db_user || '',
        password: d.password || '***',
        connectionString: d.connectionString || d.connection_string || '',
      });
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (e: any) {
      setDetailError(e.response?.data?.message || e.message || 'Failed to load tenant details');
    } finally { setDetailLoading(false); }
  };

  // ── Create Tenant ─────────────────────────────────────────────────────────

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true); setCreateError(null);
    try {
      await api.post('/tenant', { name: newName.trim() });
      setNewName(''); setShowCreatePanel(false);
      await loadTenants();
      showToast(`Tenant "${newName.trim()}" created successfully`);
    } catch (e: any) {
      setCreateError(e.response?.data?.message || e.message || 'Failed to create tenant');
    } finally { setCreating(false); }
  };

  // ── Edit Tenant ───────────────────────────────────────────────────────────

  const openEdit = (t: TenantListItem) => {
    setEditTenant(t); setEditName(t.name); setEditError(null);
  };

  const handleEdit = async () => {
    if (!editTenant || !editName.trim()) return;
    setEditSaving(true); setEditError(null);
    try {
      await api.put(`/tenant/${editTenant.id}`, { name: editName.trim() });
      setEditTenant(null);
      // Refresh detail if open for same tenant
      if (selectedTenant?.id === editTenant.id) loadDetail(editTenant.id);
      await loadTenants();
      showToast('Tenant name updated');
    } catch (e: any) {
      setEditError(e.response?.data?.message || e.message || 'Failed to update tenant');
    } finally { setEditSaving(false); }
  };

  // ── Delete Tenant ─────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTenant || deleteConfirmName !== deleteTenant.name) return;
    setDeleting(true);
    try {
      await api.delete(`/tenant/${deleteTenant.id}`);
      if (selectedTenant?.id === deleteTenant.id) setSelectedTenant(null);
      setDeleteTenant(null); setDeleteConfirmName('');
      await loadTenants();
      showToast('Tenant deleted successfully', 'warning');
    } catch (e: any) {
      showToast('Error: ' + (e.response?.data?.message || e.message), 'danger');
      setDeleteTenant(null); setDeleteConfirmName('');
    } finally { setDeleting(false); }
  };

  // ── Copy to Clipboard ─────────────────────────────────────────────────────

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => showToast(`${label} copied`));
  };

  // ── Computed ──────────────────────────────────────────────────────────────

  const now = new Date();
  const thisMonth = tenants.filter(t => {
    if (!t.createdAt) return false;
    const d = new Date(t.createdAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  const filteredTenants = tenants.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.id.toLowerCase().includes(search.toLowerCase()) ||
    (t.dbName || '').toLowerCase().includes(search.toLowerCase())
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Role Permission Banner */}
      <RolePermissionBar />

      {/* KPI Strip */}
      <div className="row g-2 mb-3">
        {[
          { label: 'Total Tenants',       value: tenants.length,  icon: 'bi-building',       color: 'text-bg-primary'   },
          { label: 'New This Month',       value: thisMonth,       icon: 'bi-calendar-plus',  color: 'text-bg-success'   },
          { label: 'Databases',            value: tenants.filter(t => t.dbName).length, icon: 'bi-database', color: 'text-bg-info' },
          { label: 'Accessible by Role',   value: 4,               icon: 'bi-shield-check',   color: 'text-bg-warning'   },
        ].map(k => (
          <div key={k.label} className="col-6 col-sm-3">
            <div className="info-box mb-0">
              <span className={`info-box-icon ${k.color}`}><i className={`bi ${k.icon}`}></i></span>
              <div className="info-box-content">
                <span className="info-box-text">{k.label}</span>
                <span className="info-box-number">{k.value}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3">
        {/* ── Left: List ──────────────────────────────────────────────────── */}
        <div className="col-xl-5 col-lg-5 col-md-5">
          {/* Create Panel Toggle */}
          {showCreatePanel ? (
            <div className="card mb-3 border-primary">
              <div className="card-header bg-primary text-white">
                <h3 className="card-title mb-0">
                  <i className="bi bi-plus-circle me-2"></i>สร้าง Tenant ใหม่
                </h3>
                <div className="card-tools">
                  <button className="btn btn-sm btn-outline-light" onClick={() => { setShowCreatePanel(false); setNewName(''); setCreateError(null); }}>
                    <i className="bi bi-x-lg"></i>
                  </button>
                </div>
              </div>
              <form onSubmit={handleCreate}>
                <div className="card-body">
                  <div className="alert alert-warning py-2 mb-3 small">
                    <i className="bi bi-exclamation-triangle me-1"></i>
                    <strong>คำเตือน:</strong> การสร้าง Tenant จะสร้าง PostgreSQL database ใหม่ทันที ไม่สามารถย้อนคืนได้ง่าย กรุณาตรวจสอบชื่อให้ถูกต้อง
                  </div>
                  {createError && (
                    <div className="alert alert-danger py-2 mb-3 d-flex align-items-center small">
                      <i className="bi bi-exclamation-triangle me-2"></i>{createError}
                    </div>
                  )}
                  <div className="mb-3">
                    <label className="form-label fw-semibold">
                      ชื่อ Tenant <span className="text-danger">*</span>
                    </label>
                    <input
                      className="form-control"
                      value={newName}
                      onChange={e => { setNewName(e.target.value); setCreateError(null); }}
                      placeholder="เช่น acme, thai-corp, subsidiary-a"
                      autoFocus
                      required
                    />
                    <div className="form-text">
                      <i className="bi bi-lightbulb me-1 text-warning"></i>
                      ใช้ตัวพิมพ์เล็ก ตัวเลข และยัติภังค์เท่านั้น
                    </div>
                  </div>
                  {newName.trim() && (
                    <div className="p-2 bg-light rounded border small mb-0">
                      <div className="text-muted mb-1">Database จะถูกสร้างเป็น:</div>
                      <code className="text-primary">{previewDbName(newName)}</code>
                    </div>
                  )}
                </div>
                <div className="card-footer d-flex gap-2">
                  <button type="submit" className="btn btn-primary" disabled={creating || !newName.trim()}>
                    {creating ? (
                      <><span className="spinner-border spinner-border-sm me-2"></span>กำลังสร้าง…</>
                    ) : (
                      <><i className="bi bi-plus-circle me-1"></i>สร้าง Tenant</>
                    )}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => { setShowCreatePanel(false); setNewName(''); setCreateError(null); }}>
                    ยกเลิก
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="mb-2 d-flex justify-content-end">
              <button className="btn btn-primary btn-sm" onClick={() => setShowCreatePanel(true)}>
                <i className="bi bi-plus-lg me-1"></i>New Tenant
              </button>
            </div>
          )}

          {/* Tenant List Card */}
          <div className="card">
            <div className="card-header d-flex align-items-center">
              <h3 className="card-title mb-0">
                <i className="bi bi-list-ul me-2"></i>Tenants ({filteredTenants.length})
              </h3>
              <div className="ms-auto">
                <button className="btn btn-sm btn-outline-secondary" onClick={loadTenants} disabled={listLoading} title="Refresh">
                  <i className={`bi bi-arrow-clockwise ${listLoading ? 'spin' : ''}`}></i>
                </button>
              </div>
            </div>
            <div className="card-body p-2 border-bottom">
              <input
                className="form-control form-control-sm"
                placeholder="ค้นหาชื่อ, ID, Database…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="card-body p-0" style={{ maxHeight: 540, overflowY: 'auto' }}>
              {listLoading && (
                <div className="text-center py-5">
                  <div className="spinner-border spinner-border-sm text-primary"></div>
                  <p className="small text-muted mt-2">กำลังโหลด…</p>
                </div>
              )}
              {listError && !listLoading && (
                <div className="p-3">
                  <div className="alert alert-danger small d-flex align-items-center py-2">
                    <i className="bi bi-exclamation-triangle me-2"></i>{listError}
                    <button className="btn btn-sm btn-outline-danger ms-2" onClick={loadTenants}>Retry</button>
                  </div>
                </div>
              )}
              {!listLoading && !listError && filteredTenants.length === 0 && (
                <div className="text-center text-muted py-5">
                  <i className="bi bi-inbox d-block mb-2" style={{ fontSize: '2.5rem' }}></i>
                  <p className="small">{search ? 'ไม่พบ tenant ที่ตรงกับคำค้นหา' : 'ยังไม่มี tenant คลิก "New Tenant" เพื่อสร้างใหม่'}</p>
                </div>
              )}
              <div className="list-group list-group-flush">
                {filteredTenants.map((t, i) => (
                  <div
                    key={t.id}
                    className={`list-group-item list-group-item-action ${selectedTenant?.id === t.id ? 'active' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => loadDetail(t.id)}
                  >
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="flex-grow-1 min-w-0 me-2">
                        <div className="d-flex align-items-center gap-2">
                          <span className={`badge rounded-pill ${selectedTenant?.id === t.id ? 'text-bg-light' : 'text-bg-secondary'}`} style={{ fontSize: '0.65rem', minWidth: 22 }}>
                            {i + 1}
                          </span>
                          <strong className="text-truncate" style={{ maxWidth: 160 }} title={t.name}>
                            <i className="bi bi-building me-1"></i>{t.name}
                          </strong>
                        </div>
                        <div className="mt-1">
                          <small className={selectedTenant?.id === t.id ? 'text-white-50' : 'text-muted'}>
                            <code style={{ fontSize: '0.7rem' }}>{t.id}</code>
                          </small>
                        </div>
                        {t.dbName && (
                          <div>
                            <small className={selectedTenant?.id === t.id ? 'text-white-50' : 'text-muted'}>
                              <i className="bi bi-database me-1"></i>
                              <span style={{ fontSize: '0.7rem' }}>{t.dbName}</span>
                            </small>
                          </div>
                        )}
                      </div>
                      <div className="d-flex flex-column align-items-end gap-1 flex-shrink-0">
                        <button
                          className={`btn btn-sm ${selectedTenant?.id === t.id ? 'btn-outline-light' : 'btn-outline-primary'}`}
                          style={{ padding: '1px 8px', fontSize: '0.75rem' }}
                          onClick={e => { e.stopPropagation(); openEdit(t); }}
                          title="แก้ไขชื่อ"
                        >
                          <i className="bi bi-pencil"></i>
                        </button>
                        <button
                          className={`btn btn-sm ${selectedTenant?.id === t.id ? 'btn-outline-light' : 'btn-outline-danger'}`}
                          style={{ padding: '1px 8px', fontSize: '0.75rem' }}
                          onClick={e => { e.stopPropagation(); setDeleteTenant(t); setDeleteConfirmName(''); }}
                          title="ลบ Tenant"
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </div>
                    </div>
                    <div className={`mt-1 ${selectedTenant?.id === t.id ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '0.7rem' }}>
                      <i className="bi bi-calendar2 me-1"></i>{fmtDate(t.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {tenants.length > 0 && (
              <div className="card-footer py-2">
                <small className="text-muted">
                  <i className="bi bi-info-circle me-1"></i>Total: <strong>{tenants.length}</strong> tenant{tenants.length !== 1 ? 's' : ''}
                  {search && filteredTenants.length !== tenants.length && ` (แสดง ${filteredTenants.length})`}
                </small>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Detail Panel ──────────────────────────────────────────── */}
        <div className="col-xl-7 col-lg-7 col-md-7" ref={detailRef}>
          {/* Empty state */}
          {!selectedTenant && !detailLoading && !detailError && (
            <div className="card h-100">
              <div className="card-body d-flex flex-column align-items-center justify-content-center text-muted" style={{ minHeight: 360 }}>
                <i className="bi bi-arrow-left-circle d-block mb-3" style={{ fontSize: '3rem' }}></i>
                <h5>เลือก Tenant เพื่อดูรายละเอียด</h5>
                <p className="small">หรือคลิก <strong>New Tenant</strong> เพื่อสร้างใหม่</p>
              </div>
            </div>
          )}

          {/* Loading */}
          {detailLoading && (
            <div className="card">
              <div className="card-body text-center py-5">
                <div className="spinner-border text-primary"></div>
                <p className="mt-2 text-muted small">กำลังโหลดรายละเอียด…</p>
              </div>
            </div>
          )}

          {/* Detail Error */}
          {detailError && !detailLoading && (
            <div className="card">
              <div className="card-body">
                <div className="alert alert-danger d-flex align-items-center">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  {detailError}
                </div>
              </div>
            </div>
          )}

          {/* Detail Content */}
          {selectedTenant && !detailLoading && (
            <>
              {/* Header */}
              <div className="card mb-3">
                <div className="card-header">
                  <h3 className="card-title mb-0">
                    <i className="bi bi-building me-2 text-primary"></i>
                    {selectedTenant.name}
                  </h3>
                  <div className="card-tools d-flex gap-2">
                    <button className="btn btn-sm btn-outline-primary"
                      onClick={() => openEdit(tenants.find(t => t.id === selectedTenant.id)!)}>
                      <i className="bi bi-pencil me-1"></i>Edit Name
                    </button>
                    <button className="btn btn-sm btn-outline-danger"
                      onClick={() => { setDeleteTenant(tenants.find(t => t.id === selectedTenant.id) || null); setDeleteConfirmName(''); }}>
                      <i className="bi bi-trash me-1"></i>Delete
                    </button>
                  </div>
                </div>
              </div>

              {/* Info Section */}
              <div className="row g-3 mb-3">
                {/* Tenant Metadata */}
                <div className="col-md-6">
                  <div className="card h-100">
                    <div className="card-header py-2">
                      <h3 className="card-title small text-uppercase text-muted mb-0 fw-bold">
                        <i className="bi bi-info-circle me-1"></i>Tenant Info
                      </h3>
                    </div>
                    <div className="card-body py-3">
                      <dl className="mb-0 row">
                        <dt className="col-5 text-muted small">Tenant ID</dt>
                        <dd className="col-7 mb-2">
                          <div className="d-flex align-items-center gap-1">
                            <code className="text-primary" style={{ fontSize: '0.75rem' }}>{selectedTenant.id}</code>
                            <button className="btn btn-link btn-sm p-0" style={{ fontSize: '0.7rem' }}
                              onClick={() => copyToClipboard(selectedTenant.id, 'Tenant ID')} title="Copy">
                              <i className="bi bi-copy text-muted"></i>
                            </button>
                          </div>
                        </dd>
                        <dt className="col-5 text-muted small">Name</dt>
                        <dd className="col-7 mb-2 fw-semibold">{selectedTenant.name}</dd>
                        <dt className="col-5 text-muted small">Created</dt>
                        <dd className="col-7 mb-0">
                          {fmtDate(tenants.find(t => t.id === selectedTenant.id)?.createdAt)}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>

                {/* Database Info */}
                <div className="col-md-6">
                  <div className="card h-100">
                    <div className="card-header py-2">
                      <h3 className="card-title small text-uppercase text-muted mb-0 fw-bold">
                        <i className="bi bi-database me-1"></i>Database Info
                      </h3>
                    </div>
                    <div className="card-body py-3">
                      <dl className="mb-0 row">
                        <dt className="col-5 text-muted small">DB Name</dt>
                        <dd className="col-7 mb-2">
                          <div className="d-flex align-items-center gap-1">
                            <code className="text-info" style={{ fontSize: '0.75rem' }}>{selectedTenant.dbName || '—'}</code>
                            {selectedTenant.dbName && (
                              <button className="btn btn-link btn-sm p-0"
                                onClick={() => copyToClipboard(selectedTenant.dbName, 'DB Name')} title="Copy">
                                <i className="bi bi-copy text-muted" style={{ fontSize: '0.7rem' }}></i>
                              </button>
                            )}
                          </div>
                        </dd>
                        <dt className="col-5 text-muted small">DB User</dt>
                        <dd className="col-7 mb-2">
                          <div className="d-flex align-items-center gap-1">
                            <code className="text-success" style={{ fontSize: '0.75rem' }}>{selectedTenant.dbUser || '—'}</code>
                            {selectedTenant.dbUser && (
                              <button className="btn btn-link btn-sm p-0"
                                onClick={() => copyToClipboard(selectedTenant.dbUser, 'DB User')} title="Copy">
                                <i className="bi bi-copy text-muted" style={{ fontSize: '0.7rem' }}></i>
                              </button>
                            )}
                          </div>
                        </dd>
                        <dt className="col-5 text-muted small">Password</dt>
                        <dd className="col-7 mb-0">
                          <code className="text-muted" style={{ fontSize: '0.75rem' }}>••••••••••••</code>
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              {/* Connection String */}
              <div className="card mb-3">
                <div className="card-header py-2 d-flex align-items-center">
                  <h3 className="card-title small text-uppercase text-muted mb-0 fw-bold flex-grow-1">
                    <i className="bi bi-plug me-1"></i>Connection String
                  </h3>
                  <div className="d-flex gap-2">
                    <button className="btn btn-sm btn-outline-secondary py-0" style={{ fontSize: '0.75rem' }}
                      onClick={() => setShowConnStr(v => !v)}>
                      <i className={`bi ${showConnStr ? 'bi-eye-slash' : 'bi-eye'} me-1`}></i>
                      {showConnStr ? 'Hide' : 'Show'}
                    </button>
                    {selectedTenant.connectionString && (
                      <button className="btn btn-sm btn-outline-primary py-0" style={{ fontSize: '0.75rem' }}
                        onClick={() => copyToClipboard(selectedTenant.connectionString, 'Connection string')}>
                        <i className="bi bi-copy me-1"></i>Copy
                      </button>
                    )}
                  </div>
                </div>
                <div className="card-body py-2">
                  {showConnStr && selectedTenant.connectionString ? (
                    <div className="p-2 bg-dark text-light rounded" style={{ fontSize: '0.75rem', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                      {selectedTenant.connectionString}
                    </div>
                  ) : (
                    <div className="text-muted small">
                      <i className="bi bi-lock me-1"></i>
                      คลิก "Show" เพื่อดู connection string — ใช้สำหรับเชื่อมต่อ database โดยตรง
                    </div>
                  )}
                </div>
              </div>

              {/* What's Inside This Tenant */}
              <div className="card">
                <div className="card-header py-2">
                  <h3 className="card-title small text-uppercase text-muted mb-0 fw-bold">
                    <i className="bi bi-layers me-1"></i>Financial Schema ใน Tenant นี้
                  </h3>
                </div>
                <div className="card-body py-3">
                  <p className="text-muted small mb-3">
                    แต่ละ Tenant มี PostgreSQL database แยกต่างหาก พร้อม schema สำหรับงาน CFO ครบครัน:
                  </p>
                  <div className="row g-2">
                    {[
                      { icon: 'bi-cash-stack',         label: 'Financial Statements',      sub: 'P&L, Balance Sheet, Cash Flow' },
                      { icon: 'bi-list-columns',       label: 'Financial Line Items',       sub: 'รายการในงบการเงิน' },
                      { icon: 'bi-diagram-3',          label: 'Scenarios',                  sub: 'Best / Base / Worst / Custom' },
                      { icon: 'bi-sliders',            label: 'Scenario Assumptions',       sub: 'Revenue, Expense, Tax, etc.' },
                      { icon: 'bi-shield-check',       label: 'Chart of Accounts (COA)',    sub: 'ผังบัญชีอัตโนมัติ' },
                      { icon: 'bi-wallet2',            label: 'Budgets & Line Items',       sub: 'งบประมาณ 12 เดือน' },
                      { icon: 'bi-graph-up-arrow',     label: 'Projections',                sub: 'การพยากรณ์ทางการเงิน' },
                      { icon: 'bi-clock-history',      label: 'Audit Log',                  sub: 'ประวัติการเปลี่ยนแปลงทั้งหมด' },
                      { icon: 'bi-upload',             label: 'Import History',             sub: 'Excel / CSV / API' },
                      { icon: 'bi-grid-3x3-gap',       label: 'Dimensions',                 sub: 'โครงสร้าง dimension' },
                      { icon: 'bi-file-earmark-text',  label: 'Statement Templates',        sub: 'เทมเพลตงบการเงิน' },
                      { icon: 'bi-geo-alt',            label: 'Dimension Config',           sub: 'Row/Column hierarchy' },
                    ].map(item => (
                      <div key={item.label} className="col-md-6 col-lg-4">
                        <div className="d-flex align-items-start gap-2 p-2 rounded bg-light border small">
                          <i className={`bi ${item.icon} text-primary mt-1 flex-shrink-0`}></i>
                          <div>
                            <div className="fw-semibold" style={{ fontSize: '0.8rem' }}>{item.label}</div>
                            <div className="text-muted" style={{ fontSize: '0.72rem' }}>{item.sub}</div>
                          </div>
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

      {/* ── Edit Modal ─────────────────────────────────────────────────────── */}
      {editTenant && ReactDOM.createPortal(
        <div className="modal d-block" tabIndex={-1}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', position: 'fixed', inset: 0, zIndex: 9999 }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-pencil me-2"></i>แก้ไขชื่อ Tenant
                </h5>
                <button className="btn-close" onClick={() => setEditTenant(null)}></button>
              </div>
              <div className="modal-body">
                {editError && (
                  <div className="alert alert-danger py-2 small d-flex align-items-center">
                    <i className="bi bi-exclamation-triangle me-2"></i>{editError}
                  </div>
                )}
                <div className="mb-3">
                  <label className="form-label fw-semibold">ชื่อ Tenant <span className="text-danger">*</span></label>
                  <input
                    className="form-control"
                    value={editName}
                    onChange={e => { setEditName(e.target.value); setEditError(null); }}
                    placeholder="ชื่อ tenant"
                    autoFocus
                  />
                  <div className="form-text text-muted small">
                    <i className="bi bi-info-circle me-1"></i>
                    การเปลี่ยนชื่อจะ update เฉพาะ display name ไม่กระทบ database name หรือ connection
                  </div>
                </div>
                <div className="p-2 bg-light rounded border small">
                  <span className="text-muted">Tenant ID: </span>
                  <code className="text-primary">{editTenant.id}</code>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setEditTenant(null)}>ยกเลิก</button>
                <button className="btn btn-primary" disabled={editSaving || !editName.trim()} onClick={handleEdit}>
                  {editSaving ? (
                    <><span className="spinner-border spinner-border-sm me-2"></span>กำลังบันทึก…</>
                  ) : (
                    <><i className="bi bi-check-lg me-1"></i>บันทึก</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Delete Confirmation Modal ─────────────────────────────────────── */}
      {deleteTenant && ReactDOM.createPortal(
        <div className="modal d-block" tabIndex={-1}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', position: 'fixed', inset: 0, zIndex: 9999 }}>
          <div className="modal-dialog">
            <div className="modal-content border-danger">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>ยืนยันการลบ Tenant
                </h5>
                <button className="btn-close btn-close-white" onClick={() => setDeleteTenant(null)}></button>
              </div>
              <div className="modal-body">
                <div className="alert alert-danger py-2 mb-3">
                  <strong>⚠️ คำเตือน: ไม่สามารถย้อนคืนได้!</strong><br />
                  การลบ Tenant จะ <strong>ลบ PostgreSQL database</strong> และ <strong>ข้อมูลทั้งหมด</strong> ของ tenant นี้ออกอย่างถาวร รวมถึงงบการเงิน, budget, scenario ทั้งหมด
                </div>
                <div className="mb-3">
                  <p className="mb-2 small">กรุณาพิมพ์ชื่อ Tenant <strong className="text-danger">{deleteTenant.name}</strong> เพื่อยืนยัน:</p>
                  <input
                    className="form-control border-danger"
                    value={deleteConfirmName}
                    onChange={e => setDeleteConfirmName(e.target.value)}
                    placeholder={`พิมพ์ "${deleteTenant.name}" เพื่อยืนยัน`}
                    autoFocus
                  />
                </div>
                <div className="p-2 bg-light rounded border small">
                  <div><span className="text-muted">Tenant ID:</span> <code>{deleteTenant.id}</code></div>
                  {deleteTenant.dbName && <div><span className="text-muted">Database:</span> <code className="text-danger">{deleteTenant.dbName}</code></div>}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setDeleteTenant(null)}>ยกเลิก</button>
                <button
                  className="btn btn-danger"
                  disabled={deleteConfirmName !== deleteTenant.name || deleting}
                  onClick={handleDelete}
                >
                  {deleting ? (
                    <><span className="spinner-border spinner-border-sm me-2"></span>กำลังลบ…</>
                  ) : (
                    <><i className="bi bi-trash me-1"></i>ลบ Tenant ถาวร</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {toast && <ToastAlert msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
