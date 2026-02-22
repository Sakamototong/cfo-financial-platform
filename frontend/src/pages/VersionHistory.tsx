import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import api from '../api/client';
import { useAbortController, isAbortError } from '../hooks/useApi';
import { useTenant } from '../components/TenantContext';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Version {
  id: string;
  object_type: string;
  object_id: string;
  version_number: number;
  version_label?: string;
  change_type: string;
  change_summary?: string;
  changed_fields?: string[] | string;
  created_by: string;
  created_at: string;
  snapshot_data?: any;
  object_name?: string;
}

interface VersionStats {
  total_versions?: number;
  object_types?: Record<string, number>;
  recent_changes?: number;
  objects_tracked?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const OBJECT_TYPES = [
  { value: 'coa_entry',         label: 'Chart of Accounts',    icon: 'bi-diagram-3',         color: 'text-bg-info'      },
  { value: 'budget',            label: 'Budget',               icon: 'bi-wallet2',            color: 'text-bg-primary'   },
  { value: 'budget_line',       label: 'Budget Line Item',     icon: 'bi-list-ol',            color: 'text-bg-secondary' },
  { value: 'statement',         label: 'Financial Statement',  icon: 'bi-cash-stack',         color: 'text-bg-success'   },
  { value: 'scenario',          label: 'Scenario',             icon: 'bi-diagram-2',          color: 'text-bg-warning'   },
  { value: 'cash_flow_forecast','label': 'Cash Flow Forecast', icon: 'bi-graph-up-arrow',     color: 'text-bg-danger'    },
] as const;

const CHANGE_TYPE_BADGE: Record<string, string> = {
  create:  'text-bg-success',
  update:  'text-bg-primary',
  delete:  'text-bg-danger',
  approve: 'text-bg-info',
  lock:    'text-bg-warning',
  restore: 'text-bg-secondary',
  import:  'text-bg-dark',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDateShort(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
}
function typeInfo(t: string) {
  return OBJECT_TYPES.find(o => o.value === t) || { label: t, icon: 'bi-circle', color: 'text-bg-secondary' };
}
function changedFieldsList(cf: any): string[] {
  if (!cf) return [];
  if (Array.isArray(cf)) return cf;
  if (typeof cf === 'string') {
    try { return JSON.parse(cf); } catch { return [cf]; }
  }
  return [];
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function ToastAlert({ msg, type, onClose }: { msg: string; type: 'success' | 'danger' | 'warning'; onClose: () => void }) {
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99999, minWidth: 300 }}>
      <div className={`alert alert-${type} alert-dismissible shadow d-flex align-items-center mb-0`}>
        <i className={`bi ${type === 'success' ? 'bi-check-circle-fill' : type === 'warning' ? 'bi-exclamation-triangle-fill' : 'bi-x-circle-fill'} me-2 flex-shrink-0`}></i>
        <span>{msg}</span>
        <button className="btn-close ms-auto" onClick={onClose}></button>
      </div>
    </div>,
    document.body
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function VersionHistory() {
  const { tenantId } = useTenant();

  // List
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [limitValue, setLimitValue] = useState(100);

  // Stats
  const [stats, setStats] = useState<VersionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Detail
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [objectHistory, setObjectHistory] = useState<Version[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'detail' | 'history' | 'snapshot'>('detail');

  // Compare
  const [compareVersion, setCompareVersion] = useState<Version | null>(null);
  interface CompareResult { version_a: any; version_b: any; differences: any; }
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [comparing, setComparing] = useState(false);

  // Restore
  const [restoring, setRestoring] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' | 'warning' } | null>(null);
  const toastTimer = useRef<any>(null);
  const showToast = (msg: string, type: 'success' | 'danger' | 'warning' = 'success') => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  };

  const detailRef = useRef<HTMLDivElement>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────

  const { getSignal } = useAbortController();

  const fetchVersions = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const params: any = { limit: limitValue };
      if (typeFilter !== 'all') params.object_type = typeFilter;
      const res = await api.get('/version-control/versions', { params, signal });
      setVersions(res.data || []);
    } catch (e: any) {
      if (!isAbortError(e)) setError(e.response?.data?.message || e.message || 'Failed to load version history');
    } finally { setLoading(false); }
  }, [typeFilter, limitValue]);

  const fetchStats = useCallback(async (signal?: AbortSignal) => {
    setStatsLoading(true);
    try {
      const res = await api.get('/version-control/stats', { signal });
      setStats(res.data);
    } catch (e) { if (!isAbortError(e)) { /* stats not critical */ } }
    finally { setStatsLoading(false); }
  }, []);

  useEffect(() => { const sig = getSignal(); fetchVersions(sig); fetchStats(sig); }, [fetchVersions, fetchStats]);

  const fetchObjectHistory = async (v: Version) => {
    setHistoryLoading(true);
    try {
      const res = await api.get(`/version-control/versions/${v.object_type}/${v.object_id}`);
      setObjectHistory(res.data || []);
    } catch { setObjectHistory([]); }
    finally { setHistoryLoading(false); }
  };

  const handleSelectVersion = (v: Version) => {
    setSelectedVersion(v); setActiveTab('detail');
    setCompareVersion(null); setCompareResult(null);
    fetchObjectHistory(v);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  // ── Compare ────────────────────────────────────────────────────────────

  const handleCompare = async (va: Version, vb: Version) => {
    setComparing(true); setCompareResult(null);
    try {
      const res = await api.post(
        `/version-control/versions/${va.object_type}/${va.object_id}/compare`,
        { version_a: va.version_number, version_b: vb.version_number }
      );
      setCompareResult(res.data); setActiveTab('history');
    } catch (e: any) {
      showToast('Compare failed: ' + (e.response?.data?.message || e.message), 'danger');
    } finally { setComparing(false); }
  };

  // ── Restore ────────────────────────────────────────────────────────────

  const handleRestore = async (v: Version) => {
    if (!confirm(`Restore to version ${v.version_number} (${v.version_label || v.change_type}) for "${v.object_name || v.object_id}"?\n\nThis will return the object to its state at that version.`)) return;
    setRestoring(true);
    try {
      const res = await api.post(
        `/version-control/versions/${v.object_type}/${v.object_id}/restore`,
        { version_number: v.version_number, created_by: 'cfo-user', change_summary: `Restored to v${v.version_number}` }
      );
      showToast(`Restored to version ${v.version_number}`);
      await fetchVersions();
      if (selectedVersion) fetchObjectHistory(selectedVersion);
    } catch (e: any) {
      showToast('Restore failed: ' + (e.response?.data?.message || e.message), 'danger');
    } finally { setRestoring(false); }
  };

  // ── Computed ───────────────────────────────────────────────────────────

  const filtered = versions.filter(v => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (v.object_name || '').toLowerCase().includes(q) ||
        v.object_id.toLowerCase().includes(q) ||
        v.object_type.toLowerCase().includes(q) ||
        (v.created_by || '').toLowerCase().includes(q) ||
        (v.change_summary || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalVersions = versions.length;
  const uniqueObjects = new Set(versions.map(v => v.object_id)).size;
  const todayChanges = versions.filter(v => {
    if (!v.created_at) return false;
    const d = new Date(v.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;
  const typeCount = (t: string) => versions.filter(v => v.object_type === t).length;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* KPI Strip */}
      <div className="row g-2 mb-3">
        {[
          { label: 'Total Versions',      value: stats?.total_versions ?? totalVersions, icon: 'bi-clock-history',    color: 'text-bg-primary'   },
          { label: 'Objects Tracked',     value: stats?.objects_tracked ?? uniqueObjects, icon: 'bi-archive',          color: 'text-bg-info'      },
          { label: "Today's Changes",     value: todayChanges,                            icon: 'bi-calendar-check',   color: 'text-bg-success'   },
          { label: 'Loaded',              value: totalVersions,                           icon: 'bi-list-ol',           color: 'text-bg-secondary' },
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

      {/* Object Type Quick Filters */}
      <div className="card mb-3">
        <div className="card-body py-2 px-3">
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <span className="text-muted small fw-semibold me-1">Filter:</span>
            <button
              className={`btn btn-sm ${typeFilter === 'all' ? 'btn-dark' : 'btn-outline-secondary'}`}
              onClick={() => setTypeFilter('all')}
            >
              <i className="bi bi-grid me-1"></i>ทั้งหมด
              <span className="badge text-bg-light text-dark ms-1">{totalVersions}</span>
            </button>
            {OBJECT_TYPES.map(t => (
              <button
                key={t.value}
                className={`btn btn-sm ${typeFilter === t.value ? t.color : 'btn-outline-secondary'}`}
                onClick={() => setTypeFilter(typeFilter === t.value ? 'all' : t.value)}
              >
                <i className={`bi ${t.icon} me-1`}></i>{t.label}
                <span className="badge text-bg-light text-dark ms-1">{typeCount(t.value)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="row g-3">
        {/* ── Version List ──────────────────────────────────────────────── */}
        <div className="col-xl-5 col-lg-5">
          <div className="card">
            <div className="card-header d-flex align-items-center">
              <h3 className="card-title mb-0">
                <i className="bi bi-clock-history me-2"></i>Version History
                <span className="badge text-bg-secondary ms-2">{filtered.length}</span>
              </h3>
              <div className="ms-auto d-flex gap-2 align-items-center">
                <select className="form-select form-select-sm" style={{ width: 70 }}
                  value={limitValue} onChange={e => setLimitValue(parseInt(e.target.value))}>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
                <button className="btn btn-sm btn-outline-secondary" onClick={fetchVersions} disabled={loading} title="Refresh">
                  <i className={`bi bi-arrow-clockwise ${loading ? 'spin' : ''}`}></i>
                </button>
              </div>
            </div>
            <div className="card-body p-2 border-bottom">
              <input className="form-control form-control-sm"
                placeholder="ค้นหาชื่อ, ID, ผู้บันทึก, รายละเอียด…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="card-body p-0" style={{ maxHeight: 580, overflowY: 'auto' }}>
              {loading && (
                <div className="text-center py-5">
                  <div className="spinner-border spinner-border-sm text-primary"></div>
                  <p className="small text-muted mt-2">กำลังโหลด…</p>
                </div>
              )}
              {error && !loading && (
                <div className="p-3">
                  <div className="alert alert-danger small py-2 d-flex align-items-center">
                    <i className="bi bi-exclamation-triangle me-2"></i>{error}
                    <button className="btn btn-sm btn-outline-danger ms-2" onClick={fetchVersions}>Retry</button>
                  </div>
                </div>
              )}
              {!loading && !error && filtered.length === 0 && (
                <div className="text-center text-muted py-5">
                  <i className="bi bi-clock-history d-block mb-2" style={{ fontSize: '2.5rem' }}></i>
                  <p className="small">{search ? 'ไม่พบรายการที่ตรงกับคำค้นหา' : 'ยังไม่มีประวัติ version ที่บันทึกไว้'}</p>
                </div>
              )}
              {/* Timeline List */}
              <div className="list-group list-group-flush">
                {filtered.map(v => {
                  const ti = typeInfo(v.object_type);
                  return (
                    <div
                      key={v.id}
                      className={`list-group-item list-group-item-action ${selectedVersion?.id === v.id ? 'active' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleSelectVersion(v)}
                    >
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="flex-grow-1 min-w-0 me-2">
                          <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                            <span className={`badge ${ti.color}`} style={{ fontSize: '0.68rem' }}>
                              <i className={`bi ${ti.icon} me-1`}></i>{ti.label}
                            </span>
                            <span className={`badge ${CHANGE_TYPE_BADGE[v.change_type] || 'text-bg-secondary'}`} style={{ fontSize: '0.68rem' }}>
                              {v.change_type}
                            </span>
                            <span className={`badge ${selectedVersion?.id === v.id ? 'text-bg-light text-dark' : 'text-bg-light text-muted border'}`} style={{ fontSize: '0.65rem' }}>
                              v{v.version_number}
                            </span>
                          </div>
                          <div className="fw-semibold text-truncate" style={{ fontSize: '0.85rem', maxWidth: 220 }} title={v.object_name || v.object_id}>
                            {v.object_name || <code style={{ fontSize: '0.75rem' }}>{v.object_id.slice(0, 8)}…</code>}
                          </div>
                          {v.change_summary && (
                            <div className={`small text-truncate ${selectedVersion?.id === v.id ? 'text-white-50' : 'text-muted'}`}
                              style={{ fontSize: '0.75rem' }} title={v.change_summary}>
                              {v.change_summary}
                            </div>
                          )}
                        </div>
                        <div className="text-end flex-shrink-0">
                          <div className={`small ${selectedVersion?.id === v.id ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '0.7rem' }}>
                            {fmtDateShort(v.created_at)}
                          </div>
                          <div className={`small ${selectedVersion?.id === v.id ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '0.68rem' }}>
                            {v.created_by}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="card-footer py-2">
              <small className="text-muted">
                <i className="bi bi-info-circle me-1"></i>
                แสดง {filtered.length} รายการ{search ? ` (ค้นหา: "${search}")` : ''}
              </small>
            </div>
          </div>
        </div>

        {/* ── Detail Panel ──────────────────────────────────────────────── */}
        <div className="col-xl-7 col-lg-7" ref={detailRef}>
          {!selectedVersion && (
            <div className="card h-100">
              <div className="card-body d-flex flex-column align-items-center justify-content-center text-muted" style={{ minHeight: 360 }}>
                <i className="bi bi-arrow-left-circle d-block mb-3" style={{ fontSize: '3rem' }}></i>
                <h5>เลือก version เพื่อดูรายละเอียด</h5>
                <p className="small text-center">ประวัติการเปลี่ยนแปลงครอบคลุม COA, Budget, Statements, Scenarios และ Cash Flow Forecasts</p>
              </div>
            </div>
          )}

          {selectedVersion && (
            <>
              {/* Header */}
              <div className="card mb-3">
                <div className="card-header">
                  <h3 className="card-title mb-0">
                    <i className={`bi ${typeInfo(selectedVersion.object_type).icon} me-2`}></i>
                    {selectedVersion.object_name || selectedVersion.object_id}
                    <span className={`badge ms-2 ${CHANGE_TYPE_BADGE[selectedVersion.change_type] || 'text-bg-secondary'}`}>
                      {selectedVersion.change_type}
                    </span>
                    <span className="badge text-bg-light text-dark border ms-1">v{selectedVersion.version_number}</span>
                  </h3>
                  <div className="card-tools d-flex gap-2">
                    <button className="btn btn-sm btn-outline-warning" disabled={restoring}
                      onClick={() => handleRestore(selectedVersion)}
                      title="Restore object to this version">
                      {restoring ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-arrow-counterclockwise me-1"></i>}
                      Restore
                    </button>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="card">
                <div className="card-header p-0">
                  <ul className="nav nav-tabs card-header-tabs px-3">
                    {(['detail', 'history', 'snapshot'] as const).map(tab => (
                      <li key={tab} className="nav-item">
                        <button className={`nav-link ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                          {tab === 'detail'   && <><i className="bi bi-info-circle me-1"></i>รายละเอียด</>}
                          {tab === 'history'  && <><i className="bi bi-list-ol me-1"></i>Object History <span className="badge text-bg-secondary ms-1">{objectHistory.length}</span></>}
                          {tab === 'snapshot' && <><i className="bi bi-file-code me-1"></i>Snapshot Data</>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="card-body">

                  {/* Detail Tab */}
                  {activeTab === 'detail' && (
                    <div>
                      <dl className="row mb-3">
                        <dt className="col-sm-4 text-muted small">Object Type</dt>
                        <dd className="col-sm-8 mb-2">
                          <span className={`badge ${typeInfo(selectedVersion.object_type).color}`}>
                            <i className={`bi ${typeInfo(selectedVersion.object_type).icon} me-1`}></i>
                            {typeInfo(selectedVersion.object_type).label}
                          </span>
                        </dd>
                        <dt className="col-sm-4 text-muted small">Object ID</dt>
                        <dd className="col-sm-8 mb-2"><code className="text-primary" style={{ fontSize: '0.8rem' }}>{selectedVersion.object_id}</code></dd>
                        <dt className="col-sm-4 text-muted small">Object Name</dt>
                        <dd className="col-sm-8 mb-2 fw-semibold">{selectedVersion.object_name || '—'}</dd>
                        <dt className="col-sm-4 text-muted small">Version</dt>
                        <dd className="col-sm-8 mb-2">
                          <span className="badge text-bg-primary">v{selectedVersion.version_number}</span>
                          {selectedVersion.version_label && (
                            <span className="badge text-bg-light text-dark border ms-1">{selectedVersion.version_label}</span>
                          )}
                        </dd>
                        <dt className="col-sm-4 text-muted small">Change Type</dt>
                        <dd className="col-sm-8 mb-2">
                          <span className={`badge ${CHANGE_TYPE_BADGE[selectedVersion.change_type] || 'text-bg-secondary'}`}>
                            {selectedVersion.change_type}
                          </span>
                        </dd>
                        <dt className="col-sm-4 text-muted small">Summary</dt>
                        <dd className="col-sm-8 mb-2">{selectedVersion.change_summary || '—'}</dd>
                        <dt className="col-sm-4 text-muted small">Changed By</dt>
                        <dd className="col-sm-8 mb-2">
                          <i className="bi bi-person me-1 text-muted"></i>{selectedVersion.created_by}
                        </dd>
                        <dt className="col-sm-4 text-muted small">Changed At</dt>
                        <dd className="col-sm-8 mb-2">{fmtDate(selectedVersion.created_at)}</dd>
                        {changedFieldsList(selectedVersion.changed_fields).length > 0 && (
                          <>
                            <dt className="col-sm-4 text-muted small">Changed Fields</dt>
                            <dd className="col-sm-8 mb-0">
                              <div className="d-flex flex-wrap gap-1">
                                {changedFieldsList(selectedVersion.changed_fields).map((f, i) => (
                                  <span key={i} className="badge text-bg-light border text-dark" style={{ fontSize: '0.75rem' }}>{f}</span>
                                ))}
                              </div>
                            </dd>
                          </>
                        )}
                      </dl>
                    </div>
                  )}

                  {/* Object History Tab */}
                  {activeTab === 'history' && (
                    <div>
                      {/* Compare Section */}
                      {compareResult && (
                        <div className="card bg-light mb-3">
                          <div className="card-header py-2">
                            <h6 className="card-title small mb-0">
                              <i className="bi bi-arrows-collapse me-1"></i>เปรียบเทียบ v{compareResult.version_a?.version_number} vs v{compareResult.version_b?.version_number}
                            </h6>
                            <div className="card-tools">
                              <button className="btn btn-sm btn-outline-secondary py-0" style={{ fontSize: '0.75rem' }}
                                onClick={() => { setCompareResult(null); setCompareVersion(null); }}>
                                <i className="bi bi-x"></i>
                              </button>
                            </div>
                          </div>
                          <div className="card-body py-2">
                            {compareResult.differences && (
                              <div>
                                <p className="small text-muted mb-2">ความแตกต่าง:</p>
                                <pre className="small bg-dark text-light p-2 rounded" style={{ fontSize: '0.72rem', maxHeight: 200, overflow: 'auto' }}>
                                  {JSON.stringify(compareResult.differences, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {historyLoading ? (
                        <div className="text-center py-3">
                          <div className="spinner-border spinner-border-sm text-primary"></div>
                          <p className="small text-muted mt-2">กำลังโหลดประวัติ…</p>
                        </div>
                      ) : objectHistory.length === 0 ? (
                        <div className="text-center text-muted py-4">
                          <i className="bi bi-inbox d-block mb-2" style={{ fontSize: '2rem' }}></i>
                          <small>ไม่พบประวัติสำหรับ object นี้</small>
                        </div>
                      ) : (
                        <>
                          <p className="small text-muted mb-2">
                            <i className="bi bi-info-circle me-1"></i>
                            คลิกที่ version เพื่อเปรียบเทียบกับ <strong>v{selectedVersion.version_number}</strong>
                          </p>
                          <div className="table-responsive">
                            <table className="table table-sm table-hover mb-0">
                              <thead className="table-light">
                                <tr>
                                  <th>Version</th><th>Type</th><th>Summary</th><th>By</th><th>Date</th><th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {objectHistory.map(v => (
                                  <tr key={v.id} className={v.id === selectedVersion.id ? 'table-primary' : ''}>
                                    <td>
                                      <span className="badge text-bg-primary">v{v.version_number}</span>
                                      {v.id === selectedVersion.id && <span className="badge text-bg-warning ms-1" style={{ fontSize: '0.65rem' }}>current</span>}
                                    </td>
                                    <td>
                                      <span className={`badge ${CHANGE_TYPE_BADGE[v.change_type] || 'text-bg-secondary'}`} style={{ fontSize: '0.68rem' }}>
                                        {v.change_type}
                                      </span>
                                    </td>
                                    <td className="text-muted small text-truncate" style={{ maxWidth: 150 }}>{v.change_summary || '—'}</td>
                                    <td className="text-muted small">{v.created_by}</td>
                                    <td className="text-muted small" style={{ whiteSpace: 'nowrap' }}>{fmtDateShort(v.created_at)}</td>
                                    <td>
                                      <div className="btn-group btn-group-sm">
                                        {v.id !== selectedVersion.id && (
                                          <button
                                            className={`btn btn-outline-info ${compareVersion?.id === v.id ? 'active' : ''}`}
                                            style={{ fontSize: '0.7rem' }}
                                            disabled={comparing}
                                            onClick={() => {
                                              setCompareVersion(v);
                                              handleCompare(selectedVersion, v);
                                            }}
                                            title="Compare with selected version"
                                          >
                                            {comparing && compareVersion?.id === v.id ? (
                                              <span className="spinner-border spinner-border-sm"></span>
                                            ) : (
                                              <i className="bi bi-arrows-collapse"></i>
                                            )}
                                          </button>
                                        )}
                                        <button
                                          className="btn btn-outline-warning"
                                          style={{ fontSize: '0.7rem' }}
                                          disabled={restoring}
                                          onClick={() => handleRestore(v)}
                                          title="Restore to this version"
                                        >
                                          <i className="bi bi-arrow-counterclockwise"></i>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Snapshot Data Tab */}
                  {activeTab === 'snapshot' && (
                    <div>
                      {selectedVersion.snapshot_data ? (
                        <>
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <h6 className="mb-0 small text-muted text-uppercase fw-bold">
                              <i className="bi bi-file-code me-1"></i>Snapshot at v{selectedVersion.version_number}
                            </h6>
                            <button className="btn btn-sm btn-outline-secondary py-0" style={{ fontSize: '0.75rem' }}
                              onClick={() => navigator.clipboard.writeText(JSON.stringify(selectedVersion.snapshot_data, null, 2)).then(() => showToast('Snapshot copied'))}>
                              <i className="bi bi-copy me-1"></i>Copy JSON
                            </button>
                          </div>
                          <pre className="bg-dark text-light p-3 rounded small" style={{ fontSize: '0.75rem', maxHeight: 500, overflow: 'auto' }}>
                            {JSON.stringify(selectedVersion.snapshot_data, null, 2)}
                          </pre>
                        </>
                      ) : (
                        <div className="text-center text-muted py-5">
                          <i className="bi bi-file-earmark-x d-block mb-2" style={{ fontSize: '2.5rem' }}></i>
                          <small>ไม่มี snapshot data สำหรับ version นี้</small>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {toast && <ToastAlert msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
