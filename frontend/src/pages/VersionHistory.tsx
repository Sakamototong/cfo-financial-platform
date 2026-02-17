import React, { useState, useEffect } from 'react';
import api from '../api/client';

interface Version {
  id: string; object_type: string; object_id: string; object_name: string;
  version_number: number; version_label: string; change_type: string;
  created_by: string; created_at: string; snapshot_data?: any;
}
interface VersionDetail extends Version { change_summary?: string; changed_fields?: string[]; }
interface ComparisonDiff { field: string; old_value: any; new_value: any; change_type: string; }
interface ComparisonResult {
  version_from: number; version_to: number; version_from_date: string; version_to_date: string;
  differences: ComparisonDiff[];
  summary: { fields_changed: number; changes_by_field: string[]; };
}

const VersionHistory: React.FC = () => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<VersionDetail | null>(null);
  const [filterType, setFilterType] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCompare, setShowCompare] = useState(false);
  const [compareFrom, setCompareFrom] = useState<number>(0);
  const [compareTo, setCompareTo] = useState<number>(0);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [showRestore, setShowRestore] = useState(false);
  const [restoreVersion, setRestoreVersion] = useState<VersionDetail | null>(null);
  const [restoreNote, setRestoreNote] = useState('');

  useEffect(() => { fetchVersions() }, [filterType]);

  const fetchVersions = async () => {
    setLoading(true); setError('');
    try {
      const params = filterType ? `?object_type=${filterType}&limit=200` : '?limit=200';
      const r = await api.get(`/version-control/versions${params}`);
      setVersions(r.data);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to fetch versions'); }
    finally { setLoading(false); }
  };

  const fetchVersionDetail = async (v: Version) => {
    try {
      const r = await api.get(`/version-control/versions/${v.object_type}/${v.object_id}/${v.version_number}`);
      setSelectedVersion(r.data);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to fetch version detail'); }
  };

  const handleCompare = async () => {
    if (!selectedVersion || compareFrom === 0 || compareTo === 0) { setError('Please select two versions'); return; }
    try {
      const r = await api.post(`/version-control/versions/${selectedVersion.object_type}/${selectedVersion.object_id}/compare`, { version_from: compareFrom, version_to: compareTo, save_comparison: false });
      setComparison(r.data);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to compare'); }
  };

  const handleRestore = async () => {
    if (!restoreVersion) return;
    try {
      const r = await api.post(`/version-control/versions/${restoreVersion.object_type}/${restoreVersion.object_id}/restore`, { version_number: restoreVersion.version_number, restore_note: restoreNote });
      alert(`Version ${restoreVersion.version_number} restored from ${new Date(r.data.restored_from_date).toLocaleString()}`);
      setShowRestore(false); setRestoreNote(''); fetchVersions();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to restore'); }
  };

  const changeTypeBadge = (ct: string) => {
    const m: Record<string, string> = { create: 'text-bg-success', update: 'text-bg-warning', delete: 'text-bg-danger', restore: 'text-bg-info' };
    return <span className={`badge ${m[ct] || 'text-bg-secondary'}`}>{ct}</span>;
  };

  const fmtDate = (d: string) => new Date(d).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtValue = (v: any): string => { if (v === null || v === undefined) return 'null'; if (typeof v === 'object') return JSON.stringify(v, null, 2); return String(v); };

  const grouped = versions.reduce((acc, v) => {
    const key = `${v.object_type}:${v.object_id}`;
    if (!acc[key]) acc[key] = { object_type: v.object_type, object_id: v.object_id, object_name: v.object_name, versions: [] };
    acc[key].versions.push(v); return acc;
  }, {} as Record<string, { object_type: string; object_id: string; object_name: string; versions: Version[] }>);

  return (
    <>
      {/* Header */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title"><i className="bi bi-clock-history me-2"></i>Version History</h3>
          <div className="card-tools">
            <button className="btn btn-outline-secondary btn-sm" onClick={fetchVersions}><i className="bi bi-arrow-clockwise me-1"></i>Refresh</button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger alert-dismissible"><button className="btn-close" onClick={() => setError('')}></button>{error}</div>}

      {/* Filter */}
      <div className="row mb-3">
        <div className="col-md-4">
          <div className="input-group">
            <span className="input-group-text"><i className="bi bi-funnel"></i></span>
            <select className="form-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">All Types</option>
              <option value="coa_entry">Chart of Accounts</option>
              <option value="budget">Budgets</option>
              <option value="budget_line">Budget Lines</option>
              <option value="statement">Financial Statements</option>
              <option value="scenario">Scenarios</option>
              <option value="cash_flow_forecast">Cash Flow Forecasts</option>
            </select>
          </div>
        </div>
        <div className="col-md-8">
          <div className="d-flex gap-3">
            <div className="info-box mb-0 flex-fill"><span className="info-box-icon text-bg-primary"><i className="bi bi-layers"></i></span><div className="info-box-content"><span className="info-box-text">Total Versions</span><span className="info-box-number">{versions.length}</span></div></div>
            <div className="info-box mb-0 flex-fill"><span className="info-box-icon text-bg-info"><i className="bi bi-collection"></i></span><div className="info-box-content"><span className="info-box-text">Objects</span><span className="info-box-number">{Object.keys(grouped).length}</span></div></div>
          </div>
        </div>
      </div>

      <div className="row">
        {/* Left: Version List */}
        <div className="col-md-5">
          <div className="card">
            <div className="card-header"><h3 className="card-title">Versions ({versions.length})</h3></div>
            <div className="card-body p-0" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {loading ? (
                <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>
              ) : Object.values(grouped).length === 0 ? (
                <div className="text-center text-muted py-5"><i className="bi bi-archive d-block mb-2" style={{ fontSize: '2.5rem' }}></i><p>No version history found</p></div>
              ) : (
                Object.values(grouped).map(g => (
                  <div key={`${g.object_type}:${g.object_id}`} className="mb-2">
                    <div className="px-3 py-2 bg-light border-bottom d-flex justify-content-between">
                      <div><span className="badge text-bg-primary me-2">{g.object_type}</span><strong>{g.object_name || 'Unnamed'}</strong></div>
                      <span className="badge text-bg-secondary">{g.versions.length}</span>
                    </div>
                    <div className="list-group list-group-flush">
                      {g.versions.map(v => (
                        <div key={v.id} className={`list-group-item list-group-item-action ${selectedVersion?.id === v.id ? 'active' : ''}`}
                          onClick={() => fetchVersionDetail(v)} style={{ cursor: 'pointer' }}>
                          <div className="d-flex justify-content-between align-items-center">
                            <div>
                              <strong className="me-2">v{v.version_number}</strong>
                              {changeTypeBadge(v.change_type)}
                            </div>
                            <small className={selectedVersion?.id === v.id ? '' : 'text-muted'}>{fmtDate(v.created_at)}</small>
                          </div>
                          <small className={selectedVersion?.id === v.id ? '' : 'text-muted'}>by {v.created_by}</small>
                          {v.version_label && <div><span className="badge text-bg-light">{v.version_label}</span></div>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Version Detail */}
        <div className="col-md-7">
          {selectedVersion ? (
            <>
              <div className="card mb-3">
                <div className="card-header">
                  <h3 className="card-title">Version {selectedVersion.version_number} {changeTypeBadge(selectedVersion.change_type)}</h3>
                  <div className="card-tools d-flex gap-2">
                    <button className="btn btn-outline-info btn-sm" onClick={() => { setShowCompare(true); setCompareFrom(selectedVersion.version_number); setCompareTo(selectedVersion.version_number > 1 ? selectedVersion.version_number - 1 : 0); }}>
                      <i className="bi bi-arrow-left-right me-1"></i>Compare
                    </button>
                    <button className="btn btn-outline-warning btn-sm" onClick={() => { setRestoreVersion(selectedVersion); setShowRestore(true); }}>
                      <i className="bi bi-arrow-counterclockwise me-1"></i>Restore
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  <div className="row">
                    <div className="col-sm-6"><strong>Object Type:</strong> {selectedVersion.object_type}</div>
                    <div className="col-sm-6"><strong>Object ID:</strong> <code className="small">{selectedVersion.object_id}</code></div>
                    <div className="col-sm-6"><strong>Created:</strong> {fmtDate(selectedVersion.created_at)}</div>
                    <div className="col-sm-6"><strong>By:</strong> {selectedVersion.created_by}</div>
                  </div>
                  {selectedVersion.change_summary && <p className="mt-2 mb-1 text-muted">{selectedVersion.change_summary}</p>}
                  {selectedVersion.changed_fields && selectedVersion.changed_fields.length > 0 && (
                    <div className="mt-2">{selectedVersion.changed_fields.map((f, i) => <span key={i} className="badge text-bg-light me-1">{f}</span>)}</div>
                  )}
                </div>
              </div>
              <div className="card">
                <div className="card-header"><h3 className="card-title"><i className="bi bi-code-square me-2"></i>Snapshot Data</h3></div>
                <div className="card-body"><pre className="bg-light p-3 rounded" style={{ maxHeight: '400px', overflow: 'auto', fontSize: '0.85rem' }}>{JSON.stringify(selectedVersion.snapshot_data, null, 2)}</pre></div>
              </div>
            </>
          ) : (
            <div className="card"><div className="card-body text-center text-muted py-5"><i className="bi bi-hand-index d-block mb-2" style={{ fontSize: '3rem' }}></i><h5>Select a version to view details</h5></div></div>
          )}
        </div>
      </div>

      {/* Compare Modal */}
      {showCompare && selectedVersion && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg"><div className="modal-content">
            <div className="modal-header"><h5 className="modal-title"><i className="bi bi-arrow-left-right me-2"></i>Compare Versions</h5><button className="btn-close" onClick={() => { setShowCompare(false); setComparison(null); }}></button></div>
            <div className="modal-body">
              <div className="row mb-3">
                <div className="col-md-4"><label className="form-label">From Version</label><input type="number" className="form-control" value={compareFrom} onChange={e => setCompareFrom(parseInt(e.target.value))} min={1} /></div>
                <div className="col-md-4"><label className="form-label">To Version</label><input type="number" className="form-control" value={compareTo} onChange={e => setCompareTo(parseInt(e.target.value))} min={1} /></div>
                <div className="col-md-4 d-flex align-items-end"><button className="btn btn-primary w-100" onClick={handleCompare}><i className="bi bi-arrow-left-right me-1"></i>Compare</button></div>
              </div>
              {comparison && (
                <>
                  <div className="alert alert-info"><strong>{comparison.summary.fields_changed}</strong> field(s) changed from v{comparison.version_from} to v{comparison.version_to}</div>
                  {comparison.differences.length === 0 ? (
                    <p className="text-center text-muted">No changes detected</p>
                  ) : (
                    <div className="table-responsive"><table className="table table-sm table-bordered">
                      <thead className="table-light"><tr><th>Field</th><th>Change</th><th>Old Value</th><th>New Value</th></tr></thead>
                      <tbody>
                        {comparison.differences.map((d, i) => (
                          <tr key={i}><td><strong>{d.field}</strong></td><td>{changeTypeBadge(d.change_type)}</td><td><pre className="mb-0 small">{fmtValue(d.old_value)}</pre></td><td><pre className="mb-0 small">{fmtValue(d.new_value)}</pre></td></tr>
                        ))}
                      </tbody>
                    </table></div>
                  )}
                </>
              )}
            </div>
          </div></div>
        </div>
      )}

      {/* Restore Modal */}
      {showRestore && restoreVersion && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog"><div className="modal-content">
            <div className="modal-header"><h5 className="modal-title"><i className="bi bi-arrow-counterclockwise me-2"></i>Restore Version</h5><button className="btn-close" onClick={() => setShowRestore(false)}></button></div>
            <div className="modal-body">
              <div className="alert alert-warning"><i className="bi bi-exclamation-triangle me-2"></i><strong>Warning:</strong> This will restore to version {restoreVersion.version_number}. Current state will be saved first.</div>
              <p><strong>Object:</strong> {restoreVersion.object_type} - {restoreVersion.object_name}</p>
              <p><strong>Version:</strong> {restoreVersion.version_number}</p>
              <p><strong>Created:</strong> {fmtDate(restoreVersion.created_at)}</p>
              <div className="mb-3"><label className="form-label">Restore Note (optional)</label><textarea className="form-control" value={restoreNote} onChange={e => setRestoreNote(e.target.value)} placeholder="Why are you restoring this version?" rows={3} /></div>
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowRestore(false)}>Cancel</button><button className="btn btn-warning" onClick={handleRestore}><i className="bi bi-arrow-counterclockwise me-1"></i>Confirm Restore</button></div>
          </div></div>
        </div>
      )}
    </>
  );
};

export default VersionHistory;
