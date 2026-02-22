import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAbortController, isAbortError } from '../hooks/useApi';
import ReactDOM from 'react-dom';
import { Link } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend,
} from 'chart.js';
import api from '../api/client';
import { useTenant } from '../components/TenantContext';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// ─── Types ────────────────────────────────────────────────────────────────────
interface Budget {
  id: string; budget_name: string; fiscal_year: number; budget_type: string;
  status: string; description?: string; created_by?: string; approved_by?: string;
  approved_at?: string; notes?: string; created_at: string; locked_at?: string;
}
interface LineItem {
  id: string; account_code: string; account_name?: string; account_type?: string;
  department?: string; cost_center?: string; notes?: string;
  january: number; february: number; march: number; april: number;
  may: number; june: number; july: number; august: number;
  september: number; october: number; november: number; december: number;
  annual_total: number;
}
interface Summary { account_type: string; total_amount: string; department_count: string; line_item_count: string; }
interface DeptSummary { department: string; account_type: string; total_amount: string; }
interface CoaAccount { account_code: string; account_name: string; account_type: string; is_active?: boolean; }

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'] as const;
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const BUDGET_TYPES = ['annual','revised','supplemental','capital','departmental'];
const STATUS_ORDER = ['draft','submitted','approved','locked'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number | string) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
    typeof v === 'string' ? parseFloat(v) || 0 : v
  );

const fmtShort = (v: number | string) => {
  const n = typeof v === 'string' ? parseFloat(v) || 0 : v;
  if (Math.abs(n) >= 1_000_000) return `฿${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `฿${(n / 1_000).toFixed(0)}K`;
  return fmt(n);
};

const q = (item: LineItem, quarter: 1|2|3|4) => {
  if (quarter === 1) return item.january + item.february + item.march;
  if (quarter === 2) return item.april + item.may + item.june;
  if (quarter === 3) return item.july + item.august + item.september;
  return item.october + item.november + item.december;
};

const lineTotal = (item: LineItem) => MONTHS.reduce((s, m) => s + ((item as any)[m] || 0), 0);

function blankLineItem(): any {
  const z: any = { account_code: '', department: '', cost_center: '', notes: '', distribution: 'equal' };
  MONTHS.forEach(m => (z[m] = 0));
  return z;
}

function applyDistribution(item: any, total: number, pattern: string) {
  const weights: Record<string, number[]> = {
    equal:      [1,1,1,1,1,1,1,1,1,1,1,1],
    q1heavy:    [3,3,3,2,2,2,1,1,1,1,1,1],
    q4heavy:    [1,1,1,1,1,1,2,2,2,3,3,3],
    firsthalf:  [2,2,2,2,2,2,1,1,1,1,1,1],
    secondhalf: [1,1,1,1,1,1,2,2,2,2,2,2],
  };
  const w = weights[pattern] || weights.equal;
  const wsum = w.reduce((a, b) => a + b, 0);
  const updated = { ...item };
  MONTHS.forEach((m, i) => (updated[m] = Math.round((total * w[i]) / wsum)));
  return updated;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'text-bg-secondary', submitted: 'text-bg-warning',
    approved: 'text-bg-success', rejected: 'text-bg-danger', locked: 'text-bg-info',
  };
  return <span className={`badge ${map[status] || 'text-bg-secondary'}`}>{status.toUpperCase()}</span>;
}

function StatusStepper({ status }: { status: string }) {
  const cur = STATUS_ORDER.indexOf(status === 'rejected' ? 'submitted' : status);
  return (
    <div className="d-flex align-items-center gap-1 flex-wrap my-2">
      {STATUS_ORDER.map((s, i) => (
        <React.Fragment key={s}>
          <span className={`badge px-3 py-2 ${
            i < cur ? 'text-bg-success' :
            i === cur ? (status === 'rejected' ? 'text-bg-danger' : 'text-bg-primary') :
            'bg-light text-muted border'
          }`}>
            {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
            {status === 'rejected' && i === cur ? ' ✗' : ''}
          </span>
          {i < STATUS_ORDER.length - 1 && <i className="bi bi-chevron-right text-muted small"></i>}
        </React.Fragment>
      ))}
    </div>
  );
}

function ToastAlert({ msg, type, onClose }: { msg: string; type: 'success' | 'danger'; onClose: () => void }) {
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99999, minWidth: 280 }}>
      <div className={`alert alert-${type} alert-dismissible shadow d-flex align-items-center mb-0`}>
        <i className={`bi ${type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'} me-2`}></i>
        <span>{msg}</span>
        <button type="button" className="btn-close ms-auto" onClick={onClose}></button>
      </div>
    </div>,
    document.body
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const Budget: React.FC = () => {
  const { tenantId } = useTenant();

  // List state
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [fyFilter, setFyFilter] = useState<number | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [listSearch, setListSearch] = useState('');

  // Detail state
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [deptSummary, setDeptSummary] = useState<DeptSummary[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'lineitems' | 'departments' | 'monthly'>('overview');

  const [coaAccounts, setCoaAccounts] = useState<CoaAccount[]>([]);

  // UI visibility
  const [showNewBudgetPanel, setShowNewBudgetPanel] = useState(false);
  const [showLineItemModal, setShowLineItemModal] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<LineItem | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Forms
  const [newBudget, setNewBudget] = useState({ budget_name: '', fiscal_year: new Date().getFullYear() + 1, budget_type: 'annual', description: '' });
  const [lineItemForm, setLineItemForm] = useState<any>(blankLineItem());
  const [liDistributionTotal, setLiDistributionTotal] = useState(0);
  const [copyForm, setCopyForm] = useState({ newFiscalYear: new Date().getFullYear() + 1, newBudgetType: 'annual' });
  const [rejectReason, setRejectReason] = useState('');

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const toastTimer = useRef<any>(null);
  const showToast = (msg: string, type: 'success' | 'danger' = 'success') => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  const detailRef = useRef<HTMLDivElement>(null);

  // ── Data Fetching ─────────────────────────────────────────────────────────

  const { getSignal } = useAbortController();

  const fetchBudgets = useCallback(async (signal?: AbortSignal) => {
    setListLoading(true);
    try { const r = await api.get('/budgets', { signal }); setBudgets(r.data || []); }
    catch (e) { if (!isAbortError(e)) showToast('Failed to load budgets', 'danger'); }
    finally { setListLoading(false); }
  }, []);

  const fetchCoa = useCallback(async (signal?: AbortSignal) => {
    try { const r = await api.get('/coa', { signal }); setCoaAccounts(r.data || []); }
    catch (e) { if (!isAbortError(e)) { /* COA not critical */ } }
  }, []);

  useEffect(() => { const sig = getSignal(); fetchBudgets(sig); fetchCoa(sig); }, [fetchBudgets, fetchCoa]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true); setDetailError(null);
    try {
      const [li, sum, dept] = await Promise.all([
        api.get(`/budgets/${id}/line-items`),
        api.get(`/budgets/${id}/summary`),
        api.get(`/budgets/${id}/department-summary`),
      ]);
      setLineItems(li.data || []);
      setSummary(sum.data || []);
      setDeptSummary(dept.data || []);
    } catch (e: any) {
      setDetailError(e.response?.data?.message || e.message || 'Failed to load details');
    } finally { setDetailLoading(false); }
  }, []);

  const handleSelectBudget = (b: Budget) => {
    setSelectedBudget(b); setActiveTab('overview');
    setLineItems([]); setSummary([]); setDeptSummary([]);
    setShowNewBudgetPanel(false);
    fetchDetail(b.id);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  // ── Budget CRUD ───────────────────────────────────────────────────────────

  const handleCreateBudget = async () => {
    try {
      await api.post('/budgets', newBudget);
      setShowNewBudgetPanel(false);
      setNewBudget({ budget_name: '', fiscal_year: new Date().getFullYear() + 1, budget_type: 'annual', description: '' });
      await fetchBudgets(); showToast('Budget created');
    } catch (e: any) { showToast('Error: ' + (e.response?.data?.message || e.message), 'danger'); }
  };

  const handleDeleteBudget = async (b: Budget) => {
    if (!confirm(`Delete "${b.budget_name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/budgets/${b.id}`);
      if (selectedBudget?.id === b.id) setSelectedBudget(null);
      await fetchBudgets(); showToast('Budget deleted');
    } catch (e: any) { showToast('Error: ' + (e.response?.data?.message || e.message), 'danger'); }
  };

  // ── Line Items ────────────────────────────────────────────────────────────

  const handleAddLineItem = async () => {
    if (!selectedBudget) return;
    try {
      const { distribution, _account_name, _account_type, ...payload } = lineItemForm;
      await api.post(`/budgets/${selectedBudget.id}/line-items`, payload);
      setShowLineItemModal(false); setLineItemForm(blankLineItem()); setLiDistributionTotal(0);
      await fetchDetail(selectedBudget.id); showToast('Line item added');
    } catch (e: any) { showToast('Error: ' + (e.response?.data?.message || e.message), 'danger'); }
  };

  const handleUpdateLineItem = async () => {
    if (!selectedBudget || !editingLineItem) return;
    const payload: any = { notes: editingLineItem.notes };
    MONTHS.forEach(m => (payload[m] = (editingLineItem as any)[m]));
    try {
      await api.put(`/budgets/${selectedBudget.id}/line-items/${editingLineItem.id}`, payload);
      setEditingLineItem(null); await fetchDetail(selectedBudget.id); showToast('Line item updated');
    } catch { showToast('Error updating line item', 'danger'); }
  };

  const handleDeleteLineItem = async (id: string) => {
    if (!selectedBudget || !confirm('Delete this line item?')) return;
    try {
      await api.delete(`/budgets/${selectedBudget.id}/line-items/${id}`);
      await fetchDetail(selectedBudget.id); showToast('Line item deleted');
    } catch { showToast('Error deleting line item', 'danger'); }
  };

  // ── Workflow ──────────────────────────────────────────────────────────────

  const workflowAction = async (action: 'submit' | 'approve' | 'lock', payload?: any) => {
    if (!selectedBudget) return;
    try {
      const r = await api.post(`/budgets/${selectedBudget.id}/${action}`, payload || { userId: 'cfo-user' });
      setSelectedBudget(r.data); await fetchBudgets(); showToast(`Budget ${action}ed`);
    } catch (e: any) { showToast('Error: ' + (e.response?.data?.message || e.message), 'danger'); }
  };

  const handleReject = async () => {
    if (!selectedBudget || !rejectReason.trim()) return;
    try {
      const r = await api.post(`/budgets/${selectedBudget.id}/reject`, { userId: 'cfo-user', reason: rejectReason });
      setSelectedBudget(r.data); setShowRejectModal(false); setRejectReason('');
      await fetchBudgets(); showToast('Budget rejected');
    } catch (e: any) { showToast('Error: ' + (e.response?.data?.message || e.message), 'danger'); }
  };

  const handleCopyBudget = async () => {
    if (!selectedBudget) return;
    try {
      const r = await api.post('/budgets/copy', { sourceBudgetId: selectedBudget.id, ...copyForm });
      setShowCopyModal(false); await fetchBudgets();
      showToast('Budget copied to FY' + copyForm.newFiscalYear);
      handleSelectBudget(r.data);
    } catch (e: any) { showToast('Error: ' + (e.response?.data?.message || e.message), 'danger'); }
  };

  // ── Export ────────────────────────────────────────────────────────────────

  const exportCSV = () => {
    if (!selectedBudget || lineItems.length === 0) return;
    const header = ['Account Code','Account Name','Type','Department','Cost Center',...MONTH_LABELS,'Annual Total'];
    const rows = lineItems.map(li => [
      li.account_code, li.account_name || '', li.account_type || '', li.department || '', li.cost_center || '',
      ...MONTHS.map(m => (li as any)[m]), li.annual_total || lineTotal(li),
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${selectedBudget.budget_name.replace(/\s+/g, '_')}_line_items.csv`;
    a.click(); showToast('CSV exported');
  };

  // ── Computed ──────────────────────────────────────────────────────────────

  const fiscalYears = [...new Set(budgets.map(b => b.fiscal_year))].sort((a, b) => b - a);
  const filteredBudgets = budgets.filter(b => {
    if (fyFilter !== 'all' && b.fiscal_year !== fyFilter) return false;
    if (typeFilter !== 'all' && b.budget_type !== typeFilter) return false;
    if (listSearch && !b.budget_name.toLowerCase().includes(listSearch.toLowerCase())) return false;
    return true;
  });
  const statusCount = (s: string) => budgets.filter(b => b.status === s).length;
  const sumByType = (type: string) => {
    const r = summary.find(s => s.account_type === type);
    return r ? parseFloat(r.total_amount) || 0 : 0;
  };
  const totalRevenue = sumByType('revenue');
  const totalExpense = sumByType('expense');
  const netIncome = totalRevenue - totalExpense;
  const monthlyTotals = MONTHS.map(m => lineItems.reduce((s, li) => s + ((li as any)[m] || 0), 0));
  const deptNames = [...new Set(deptSummary.map(d => d.department))];
  const deptTotals = deptNames.map(dept =>
    deptSummary.filter(d => d.department === dept).reduce((s, d) => s + (parseFloat(d.total_amount) || 0), 0)
  );
  const applyDist = () => {
    if (!liDistributionTotal) return;
    setLineItemForm((prev: any) => applyDistribution(prev, liDistributionTotal, prev.distribution));
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* KPI Strip */}
      <div className="row g-2 mb-3">
        {[
          { label: 'Total Budgets',  value: budgets.length,          icon: 'bi-cash-stack',     color: 'text-bg-primary'   },
          { label: 'Draft',          value: statusCount('draft'),     icon: 'bi-pencil-square',  color: 'text-bg-secondary' },
          { label: 'Submitted',      value: statusCount('submitted'), icon: 'bi-hourglass-split',color: 'text-bg-warning'   },
          { label: 'Approved',       value: statusCount('approved'),  icon: 'bi-check-circle',   color: 'text-bg-success'   },
          { label: 'Locked',         value: statusCount('locked'),    icon: 'bi-lock',           color: 'text-bg-info'      },
          { label: 'Fiscal Years',   value: fiscalYears.length,       icon: 'bi-calendar-range', color: 'text-bg-dark'      },
        ].map(k => (
          <div key={k.label} className="col-6 col-sm-4 col-lg-2">
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
        {/* ── Budget List ─────────────────────────────────────────────── */}
        <div className="col-xl-4 col-lg-4 col-md-5">
          <div className="card h-100">
            <div className="card-header">
              <h3 className="card-title mb-0"><i className="bi bi-list-ul me-2"></i>Budgets</h3>
              <div className="card-tools">
                <button className="btn btn-primary btn-sm" onClick={() => { setShowNewBudgetPanel(true); setSelectedBudget(null); }}>
                  <i className="bi bi-plus-lg me-1"></i>New
                </button>
              </div>
            </div>
            <div className="card-body p-2 border-bottom">
              <input className="form-control form-control-sm mb-2" placeholder="Search budgets…"
                value={listSearch} onChange={e => setListSearch(e.target.value)} />
              <div className="row g-1">
                <div className="col-6">
                  <select className="form-select form-select-sm" value={fyFilter}
                    onChange={e => setFyFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}>
                    <option value="all">All Years</option>
                    {fiscalYears.map(y => <option key={y} value={y}>FY{y}</option>)}
                  </select>
                </div>
                <div className="col-6">
                  <select className="form-select form-select-sm" value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}>
                    <option value="all">All Types</option>
                    {BUDGET_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="card-body p-0" style={{ maxHeight: 540, overflowY: 'auto' }}>
              {listLoading && (
                <div className="text-center py-4">
                  <div className="spinner-border spinner-border-sm text-primary"></div>
                  <p className="small text-muted mt-1">Loading…</p>
                </div>
              )}
              {!listLoading && filteredBudgets.length === 0 && (
                <div className="text-center text-muted py-5">
                  <i className="bi bi-folder-x d-block mb-2" style={{ fontSize: '2rem' }}></i>
                  No budgets found
                </div>
              )}
              <div className="list-group list-group-flush">
                {filteredBudgets.map(b => (
                  <div key={b.id}
                    className={`list-group-item list-group-item-action ${selectedBudget?.id === b.id ? 'active' : ''}`}
                    style={{ cursor: 'pointer' }} onClick={() => handleSelectBudget(b)}>
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="flex-grow-1 me-2" style={{ minWidth: 0 }}>
                        <h6 className="mb-0 text-truncate" title={b.budget_name}>{b.budget_name}</h6>
                        <small className={selectedBudget?.id === b.id ? 'text-white-50' : 'text-muted'}>
                          FY{b.fiscal_year} &bull; <span className="text-capitalize">{b.budget_type}</span>
                        </small>
                      </div>
                      <div className="d-flex align-items-center gap-1">
                        <StatusBadge status={b.status} />
                        {b.status !== 'locked' && (
                          <button
                            className={`btn btn-sm ${selectedBudget?.id === b.id ? 'btn-outline-light' : 'btn-outline-danger'}`}
                            style={{ padding: '1px 6px' }}
                            onClick={e => { e.stopPropagation(); handleDeleteBudget(b); }}>
                            <i className="bi bi-trash"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Detail Panel ─────────────────────────────────────────────── */}
        <div className="col-xl-8 col-lg-8 col-md-7" ref={detailRef}>

          {/* New Budget Form */}
          {showNewBudgetPanel && (
            <div className="card mb-3">
              <div className="card-header">
                <h3 className="card-title"><i className="bi bi-plus-circle me-2"></i>Create New Budget</h3>
                <div className="card-tools">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowNewBudgetPanel(false)}>
                    <i className="bi bi-x-lg"></i>
                  </button>
                </div>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label fw-semibold">Budget Name <span className="text-danger">*</span></label>
                  <input className="form-control" value={newBudget.budget_name}
                    onChange={e => setNewBudget({ ...newBudget, budget_name: e.target.value })}
                    placeholder="e.g., FY2027 Annual Budget" />
                </div>
                <div className="row mb-3">
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">Fiscal Year</label>
                    <input type="number" className="form-control" value={newBudget.fiscal_year}
                      onChange={e => setNewBudget({ ...newBudget, fiscal_year: parseInt(e.target.value) })} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">Budget Type</label>
                    <select className="form-select" value={newBudget.budget_type}
                      onChange={e => setNewBudget({ ...newBudget, budget_type: e.target.value })}>
                      {BUDGET_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                  <div className="col-md-4 d-flex align-items-end">
                    <div className="d-flex gap-2 w-100">
                      <button className="btn btn-secondary flex-grow-1" onClick={() => setShowNewBudgetPanel(false)}>Cancel</button>
                      <button className="btn btn-primary flex-grow-1" disabled={!newBudget.budget_name.trim()} onClick={handleCreateBudget}>
                        <i className="bi bi-check-lg me-1"></i>Create
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="form-label fw-semibold">Description</label>
                  <textarea className="form-control" rows={2} value={newBudget.description}
                    onChange={e => setNewBudget({ ...newBudget, description: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!selectedBudget && !showNewBudgetPanel && (
            <div className="card">
              <div className="card-body text-center text-muted py-5">
                <i className="bi bi-arrow-left-circle d-block mb-3" style={{ fontSize: '3rem' }}></i>
                <h5>Select a budget to view details</h5>
                <p className="small">Or click <strong>New</strong> to create one</p>
              </div>
            </div>
          )}

          {/* Budget Detail */}
          {selectedBudget && !showNewBudgetPanel && (
            <>
              {/* Header */}
              <div className="card mb-3">
                <div className="card-header">
                  <h3 className="card-title text-truncate mb-0" title={selectedBudget.budget_name}>{selectedBudget.budget_name}</h3>
                  <div className="card-tools d-flex gap-1 flex-wrap">
                    {selectedBudget.status === 'draft' && (
                      <>
                        <button className="btn btn-sm btn-success" onClick={() => setShowLineItemModal(true)}>
                          <i className="bi bi-plus-lg me-1"></i>Add Line
                        </button>
                        <button className="btn btn-sm btn-warning" onClick={() => workflowAction('submit')}>
                          <i className="bi bi-send me-1"></i>Submit
                        </button>
                      </>
                    )}
                    {selectedBudget.status === 'submitted' && (
                      <>
                        <button className="btn btn-sm btn-success" onClick={() => workflowAction('approve')}>
                          <i className="bi bi-check-lg me-1"></i>Approve
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => setShowRejectModal(true)}>
                          <i className="bi bi-x-lg me-1"></i>Reject
                        </button>
                      </>
                    )}
                    {selectedBudget.status === 'approved' && (
                      <button className="btn btn-sm btn-info text-white" onClick={() => workflowAction('lock')}>
                        <i className="bi bi-lock me-1"></i>Lock
                      </button>
                    )}
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowCopyModal(true)} title="Copy to new fiscal year">
                      <i className="bi bi-copy me-1"></i>Copy
                    </button>
                    {(selectedBudget.status === 'locked' || selectedBudget.status === 'approved') && (
                      <Link to="/reports/budget-vs-actual" className="btn btn-sm btn-outline-primary">
                        <i className="bi bi-bar-chart me-1"></i>BvA
                      </Link>
                    )}
                  </div>
                </div>
                <div className="card-body py-2">
                  <div className="d-flex flex-wrap gap-2 align-items-center mb-1">
                    <span className="badge text-bg-light border text-dark">FY{selectedBudget.fiscal_year}</span>
                    <span className="badge text-bg-light border text-dark text-capitalize">{selectedBudget.budget_type}</span>
                    <StatusBadge status={selectedBudget.status} />
                    {selectedBudget.approved_by && (
                      <small className="text-muted"><i className="bi bi-person-check me-1"></i>{selectedBudget.approved_by}</small>
                    )}
                  </div>
                  <StatusStepper status={selectedBudget.status} />
                  {selectedBudget.notes && (
                    <div className="alert alert-warning py-2 mb-0 mt-1 d-flex align-items-center">
                      <i className="bi bi-exclamation-triangle me-2"></i>{selectedBudget.notes}
                    </div>
                  )}
                  {selectedBudget.description && (
                    <p className="text-muted small mb-0 mt-1">{selectedBudget.description}</p>
                  )}
                </div>
              </div>

              {detailLoading && (
                <div className="text-center py-4">
                  <div className="spinner-border text-primary"></div>
                  <p className="mt-2 text-muted small">Loading budget details…</p>
                </div>
              )}
              {detailError && !detailLoading && (
                <div className="alert alert-danger d-flex align-items-center">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>
                  {detailError}
                  <button className="btn btn-sm btn-outline-danger ms-2" onClick={() => fetchDetail(selectedBudget.id)}>Retry</button>
                </div>
              )}

              {/* Summary KPIs */}
              {!detailLoading && summary.length > 0 && (
                <div className="row g-2 mb-3">
                  <div className="col-md-4">
                    <div className="info-box mb-0">
                      <span className="info-box-icon text-bg-success"><i className="bi bi-graph-up-arrow"></i></span>
                      <div className="info-box-content">
                        <span className="info-box-text">Budgeted Revenue</span>
                        <span className="info-box-number">{fmtShort(totalRevenue)}</span>
                        <span className="progress-description text-muted small">{summary.find(s => s.account_type === 'revenue')?.line_item_count || 0} items</span>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="info-box mb-0">
                      <span className="info-box-icon text-bg-danger"><i className="bi bi-graph-down-arrow"></i></span>
                      <div className="info-box-content">
                        <span className="info-box-text">Budgeted Expense</span>
                        <span className="info-box-number">{fmtShort(totalExpense)}</span>
                        <span className="progress-description text-muted small">{summary.find(s => s.account_type === 'expense')?.line_item_count || 0} items</span>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="info-box mb-0">
                      <span className={`info-box-icon ${netIncome >= 0 ? 'text-bg-primary' : 'text-bg-danger'}`}>
                        <i className={`bi ${netIncome >= 0 ? 'bi-wallet2' : 'bi-exclamation-diamond'}`}></i>
                      </span>
                      <div className="info-box-content">
                        <span className="info-box-text">Net Income</span>
                        <span className="info-box-number">{fmtShort(netIncome)}</span>
                        <span className={`progress-description small ${netIncome >= 0 ? 'text-success' : 'text-danger'}`}>
                          {netIncome >= 0 ? 'Surplus' : 'Deficit'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabbed Detail */}
              {!detailLoading && (
                <div className="card">
                  <div className="card-header p-0">
                    <ul className="nav nav-tabs card-header-tabs px-3">
                      {(['overview','lineitems','departments','monthly'] as const).map(tab => (
                        <li key={tab} className="nav-item">
                          <button className={`nav-link ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                            {tab === 'overview'    && <><i className="bi bi-info-circle me-1"></i>Overview</>}
                            {tab === 'lineitems'   && <><i className="bi bi-list-ol me-1"></i>Line Items <span className="badge text-bg-secondary ms-1">{lineItems.length}</span></>}
                            {tab === 'departments' && <><i className="bi bi-building me-1"></i>Departments</>}
                            {tab === 'monthly'     && <><i className="bi bi-calendar3 me-1"></i>Monthly</>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="card-body">

                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                      <div>
                        <dl className="row mb-3">
                          <dt className="col-sm-4 text-muted">Budget Name</dt>   <dd className="col-sm-8">{selectedBudget.budget_name}</dd>
                          <dt className="col-sm-4 text-muted">Fiscal Year</dt>   <dd className="col-sm-8">FY{selectedBudget.fiscal_year}</dd>
                          <dt className="col-sm-4 text-muted">Type</dt>           <dd className="col-sm-8 text-capitalize">{selectedBudget.budget_type}</dd>
                          <dt className="col-sm-4 text-muted">Status</dt>         <dd className="col-sm-8"><StatusBadge status={selectedBudget.status} /></dd>
                          <dt className="col-sm-4 text-muted">Created By</dt>    <dd className="col-sm-8">{selectedBudget.created_by || '—'}</dd>
                          {selectedBudget.approved_by && <>
                            <dt className="col-sm-4 text-muted">Approved By</dt><dd className="col-sm-8">{selectedBudget.approved_by}</dd>
                          </>}
                          {selectedBudget.approved_at && <>
                            <dt className="col-sm-4 text-muted">Approved At</dt>
                            <dd className="col-sm-8">{new Date(selectedBudget.approved_at).toLocaleDateString('th-TH')}</dd>
                          </>}
                          {selectedBudget.locked_at && <>
                            <dt className="col-sm-4 text-muted">Locked At</dt>
                            <dd className="col-sm-8">{new Date(selectedBudget.locked_at).toLocaleDateString('th-TH')}</dd>
                          </>}
                          {selectedBudget.description && <>
                            <dt className="col-sm-4 text-muted">Description</dt><dd className="col-sm-8">{selectedBudget.description}</dd>
                          </>}
                        </dl>
                        {summary.length > 0 && (
                          <>
                            <h6 className="text-muted small text-uppercase fw-bold mb-2">Summary by Account Type</h6>
                            <table className="table table-sm table-bordered mb-0">
                              <thead className="table-light">
                                <tr><th>Account Type</th><th className="text-end">Total</th><th className="text-end">Items</th><th className="text-end">Depts</th></tr>
                              </thead>
                              <tbody>
                                {summary.map(s => (
                                  <tr key={s.account_type}>
                                    <td className="text-capitalize">{s.account_type || '—'}</td>
                                    <td className="text-end fw-semibold">{fmt(s.total_amount)}</td>
                                    <td className="text-end">{s.line_item_count}</td>
                                    <td className="text-end">{s.department_count}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </>
                        )}
                      </div>
                    )}

                    {/* Line Items Tab */}
                    {activeTab === 'lineitems' && (
                      <div>
                        <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                          <h6 className="mb-0">
                            {lineItems.length > 0 ? (
                              <>
                                <span className="text-muted small">Annual Total: </span>
                                <strong>{fmt(lineItems.reduce((s, li) => s + (li.annual_total || lineTotal(li)), 0))}</strong>
                              </>
                            ) : 'No line items'}
                          </h6>
                          <div className="d-flex gap-2">
                            {selectedBudget.status === 'draft' && (
                              <button className="btn btn-sm btn-success" onClick={() => setShowLineItemModal(true)}>
                                <i className="bi bi-plus-lg me-1"></i>Add Line
                              </button>
                            )}
                            {lineItems.length > 0 && (
                              <button className="btn btn-sm btn-outline-secondary" onClick={exportCSV}>
                                <i className="bi bi-download me-1"></i>CSV
                              </button>
                            )}
                          </div>
                        </div>
                        {lineItems.length === 0 ? (
                          <div className="text-center text-muted py-5">
                            <i className="bi bi-inbox d-block mb-2" style={{ fontSize: '2.5rem' }}></i>
                            <p>No line items. {selectedBudget.status === 'draft' ? 'Click "Add Line" to get started.' : ''}</p>
                          </div>
                        ) : (
                          <div className="table-responsive">
                            <table className="table table-hover table-sm table-striped mb-0">
                              <thead className="table-dark">
                                <tr>
                                  <th>Account</th><th>Dept</th><th>CC</th>
                                  <th className="text-end">Q1</th><th className="text-end">Q2</th>
                                  <th className="text-end">Q3</th><th className="text-end">Q4</th>
                                  <th className="text-end">Annual</th><th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {lineItems.map(item => {
                                  const annual = item.annual_total || lineTotal(item);
                                  const totalAll = lineItems.reduce((s, li) => s + (li.annual_total || lineTotal(li)), 0);
                                  const pct = totalAll > 0 ? (annual / totalAll) * 100 : 0;
                                  return (
                                    <tr key={item.id}>
                                      <td>
                                        <code className="text-primary">{item.account_code}</code>
                                        <br /><small className="text-muted" style={{ fontSize: '0.73rem' }}>{item.account_name || ''}</small>
                                        {item.account_type && (
                                          <><br /><span className="badge text-bg-light border text-muted" style={{ fontSize: '0.65rem' }}>{item.account_type}</span></>
                                        )}
                                      </td>
                                      <td className="text-muted small">{item.department || '—'}</td>
                                      <td className="text-muted small">{item.cost_center || '—'}</td>
                                      <td className="text-end">{fmtShort(q(item, 1))}</td>
                                      <td className="text-end">{fmtShort(q(item, 2))}</td>
                                      <td className="text-end">{fmtShort(q(item, 3))}</td>
                                      <td className="text-end">{fmtShort(q(item, 4))}</td>
                                      <td className="text-end">
                                        <strong>{fmtShort(annual)}</strong>
                                        <div className="progress mt-1" style={{ height: 3 }}>
                                          <div className="progress-bar bg-primary" style={{ width: `${pct}%` }}></div>
                                        </div>
                                      </td>
                                      <td>
                                        <div className="btn-group btn-group-sm">
                                          <button className="btn btn-outline-primary" onClick={() => setEditingLineItem(item)} title="Edit">
                                            <i className="bi bi-pencil"></i>
                                          </button>
                                          {selectedBudget.status === 'draft' && (
                                            <button className="btn btn-outline-danger" onClick={() => handleDeleteLineItem(item.id)} title="Delete">
                                              <i className="bi bi-trash"></i>
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot className="table-secondary fw-bold">
                                <tr>
                                  <td colSpan={3}>TOTAL</td>
                                  <td className="text-end">{fmtShort(lineItems.reduce((s, li) => s + q(li, 1), 0))}</td>
                                  <td className="text-end">{fmtShort(lineItems.reduce((s, li) => s + q(li, 2), 0))}</td>
                                  <td className="text-end">{fmtShort(lineItems.reduce((s, li) => s + q(li, 3), 0))}</td>
                                  <td className="text-end">{fmtShort(lineItems.reduce((s, li) => s + q(li, 4), 0))}</td>
                                  <td className="text-end">{fmtShort(lineItems.reduce((s, li) => s + (li.annual_total || lineTotal(li)), 0))}</td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Departments Tab */}
                    {activeTab === 'departments' && (
                      <div>
                        {deptSummary.length === 0 ? (
                          <div className="text-center text-muted py-5">
                            <i className="bi bi-building d-block mb-2" style={{ fontSize: '2.5rem' }}></i>
                            <p>No department data. Add line items with department names.</p>
                          </div>
                        ) : (
                          <>
                            {deptNames.length > 1 && (
                              <div className="mb-4" style={{ height: 280 }}>
                                <Bar
                                  data={{
                                    labels: deptNames,
                                    datasets: [{
                                      label: 'Budget Amount',
                                      data: deptTotals,
                                      backgroundColor: deptNames.map((_, i) => `hsl(${(i * 47) % 360}, 60%, 60%)`),
                                      borderRadius: 4,
                                    }],
                                  }}
                                  options={{
                                    responsive: true, maintainAspectRatio: false,
                                    plugins: { legend: { display: false }, title: { display: true, text: 'Budget by Department' } },
                                    scales: { y: { ticks: { callback: (v: any) => fmtShort(v) } } },
                                  }}
                                />
                              </div>
                            )}
                            <div className="table-responsive">
                              <table className="table table-sm table-bordered">
                                <thead className="table-light">
                                  <tr><th>Department</th><th>Account Type</th><th className="text-end">Amount</th></tr>
                                </thead>
                                <tbody>
                                  {deptSummary.map((d, i) => (
                                    <tr key={i}>
                                      <td>{d.department}</td>
                                      <td className="text-capitalize">{d.account_type || '—'}</td>
                                      <td className="text-end">{fmt(d.total_amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="table-secondary fw-bold">
                                  <tr>
                                    <td colSpan={2}>TOTAL</td>
                                    <td className="text-end">{fmt(deptSummary.reduce((s, d) => s + (parseFloat(d.total_amount) || 0), 0))}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Monthly Tab */}
                    {activeTab === 'monthly' && (
                      <div>
                        {lineItems.length === 0 ? (
                          <div className="text-center text-muted py-5">
                            <i className="bi bi-calendar3 d-block mb-2" style={{ fontSize: '2.5rem' }}></i>
                            <p>No monthly data. Add line items first.</p>
                          </div>
                        ) : (
                          <>
                            <div className="mb-4" style={{ height: 300 }}>
                              <Bar
                                data={{
                                  labels: MONTH_LABELS,
                                  datasets: [{
                                    label: 'Monthly Budget',
                                    data: monthlyTotals,
                                    backgroundColor: 'rgba(54, 162, 235, 0.7)',
                                    borderColor: 'rgba(54, 162, 235, 1)',
                                    borderWidth: 1, borderRadius: 4,
                                  }],
                                }}
                                options={{
                                  responsive: true, maintainAspectRatio: false,
                                  plugins: { legend: { display: false }, title: { display: true, text: `Monthly Budget — ${selectedBudget.budget_name}` } },
                                  scales: { y: { ticks: { callback: (v: any) => fmtShort(v) } } },
                                }}
                              />
                            </div>
                            <div className="table-responsive">
                              <table className="table table-sm table-bordered text-center">
                                <thead className="table-light">
                                  <tr>{MONTH_LABELS.map(m => <th key={m}>{m}</th>)}<th>Total</th></tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    {monthlyTotals.map((v, i) => <td key={i}>{fmtShort(v)}</td>)}
                                    <td className="fw-bold">{fmtShort(monthlyTotals.reduce((a, b) => a + b, 0))}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Add Line Item Modal ──────────────────────────────────────────── */}
      {showLineItemModal && ReactDOM.createPortal(
        <div className="modal d-block" tabIndex={-1}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', position: 'fixed', inset: 0, zIndex: 9999 }}>
          <div className="modal-dialog modal-xl modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title"><i className="bi bi-plus-circle me-2"></i>Add Budget Line Item</h5>
                <button className="btn-close" onClick={() => setShowLineItemModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="row g-3 mb-3">
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">Account Code <span className="text-danger">*</span></label>
                    {coaAccounts.length > 0 ? (
                      <select className="form-select" value={lineItemForm.account_code}
                        onChange={e => {
                          const acc = coaAccounts.find(a => a.account_code === e.target.value);
                          setLineItemForm({ ...lineItemForm, account_code: e.target.value, _account_name: acc?.account_name, _account_type: acc?.account_type });
                        }}>
                        <option value="">— Select Account —</option>
                        {coaAccounts.filter(a => a.is_active !== false).map(a => (
                          <option key={a.account_code} value={a.account_code}>
                            {a.account_code} — {a.account_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input className="form-control" value={lineItemForm.account_code}
                        onChange={e => setLineItemForm({ ...lineItemForm, account_code: e.target.value })}
                        placeholder="e.g., 5000" />
                    )}
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">Department</label>
                    <input className="form-control" value={lineItemForm.department || ''}
                      onChange={e => setLineItemForm({ ...lineItemForm, department: e.target.value })}
                      placeholder="e.g., Finance, Sales" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">Cost Center</label>
                    <input className="form-control" value={lineItemForm.cost_center || ''}
                      onChange={e => setLineItemForm({ ...lineItemForm, cost_center: e.target.value })}
                      placeholder="e.g., CC-001" />
                  </div>
                </div>
                {/* Distribution Tool */}
                <div className="card bg-light mb-3">
                  <div className="card-body py-2 px-3">
                    <h6 className="mb-2 text-muted small text-uppercase fw-bold">
                      <i className="bi bi-sliders me-1"></i>Quick Distribution
                    </h6>
                    <div className="row g-2 align-items-end">
                      <div className="col-md-4">
                        <label className="form-label small mb-1">Annual Total Amount</label>
                        <input type="number" className="form-control form-control-sm"
                          value={liDistributionTotal || ''}
                          onChange={e => setLiDistributionTotal(parseFloat(e.target.value) || 0)}
                          placeholder="Enter total" />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label small mb-1">Pattern</label>
                        <select className="form-select form-select-sm" value={lineItemForm.distribution}
                          onChange={e => setLineItemForm({ ...lineItemForm, distribution: e.target.value })}>
                          <option value="equal">Equal (Monthly)</option>
                          <option value="q1heavy">Q1 Heavy (Jan–Mar)</option>
                          <option value="q4heavy">Q4 Heavy (Oct–Dec)</option>
                          <option value="firsthalf">First Half Heavy</option>
                          <option value="secondhalf">Second Half Heavy</option>
                        </select>
                      </div>
                      <div className="col-md-4">
                        <button className="btn btn-sm btn-primary w-100" onClick={applyDist} disabled={!liDistributionTotal}>
                          <i className="bi bi-magic me-1"></i>Apply
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <h6 className="mb-2 fw-semibold">Monthly Amounts</h6>
                <div className="row g-2">
                  {MONTHS.map((m, i) => (
                    <div key={m} className="col-md-2 col-sm-3 col-4">
                      <label className="form-label small mb-1 text-muted">{MONTH_LABELS[i]}</label>
                      <input type="number" className="form-control form-control-sm text-end"
                        value={lineItemForm[m] || 0}
                        onChange={e => setLineItemForm({ ...lineItemForm, [m]: parseFloat(e.target.value) || 0 })} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-end text-muted small">
                  Annual Total: <strong className="text-dark">{fmt(MONTHS.reduce((s, m) => s + (lineItemForm[m] || 0), 0))}</strong>
                </div>
                <div className="mt-2">
                  <label className="form-label small fw-semibold">Notes</label>
                  <input className="form-control form-control-sm" value={lineItemForm.notes || ''}
                    onChange={e => setLineItemForm({ ...lineItemForm, notes: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowLineItemModal(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={!lineItemForm.account_code} onClick={handleAddLineItem}>
                  <i className="bi bi-check-lg me-1"></i>Add Line Item
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Edit Line Item Modal ─────────────────────────────────────────── */}
      {editingLineItem && ReactDOM.createPortal(
        <div className="modal d-block" tabIndex={-1}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', position: 'fixed', inset: 0, zIndex: 9999 }}>
          <div className="modal-dialog modal-xl modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-pencil me-2"></i>Edit: <code>{editingLineItem.account_code}</code>
                  {editingLineItem.account_name && <> — {editingLineItem.account_name}</>}
                  {editingLineItem.department && <small className="text-muted ms-2">({editingLineItem.department})</small>}
                </h5>
                <button className="btn-close" onClick={() => setEditingLineItem(null)}></button>
              </div>
              <div className="modal-body">
                <h6 className="mb-2 fw-semibold">Monthly Amounts</h6>
                <div className="row g-2">
                  {MONTHS.map((m, i) => (
                    <div key={m} className="col-md-2 col-sm-3 col-4">
                      <label className="form-label small mb-1 text-muted">{MONTH_LABELS[i]}</label>
                      <input type="number" className="form-control form-control-sm text-end"
                        value={(editingLineItem as any)[m] || 0}
                        onChange={e => setEditingLineItem({ ...editingLineItem, [m]: parseFloat(e.target.value) || 0 } as LineItem)} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-end text-muted small">
                  Annual Total: <strong className="text-dark">{fmt(lineTotal(editingLineItem))}</strong>
                </div>
                <div className="mt-3">
                  <label className="form-label small fw-semibold">Notes</label>
                  <input className="form-control form-control-sm" value={editingLineItem.notes || ''}
                    onChange={e => setEditingLineItem({ ...editingLineItem, notes: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setEditingLineItem(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleUpdateLineItem}>
                  <i className="bi bi-check-lg me-1"></i>Update
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Copy Budget Modal ─────────────────────────────────────────────── */}
      {showCopyModal && selectedBudget && ReactDOM.createPortal(
        <div className="modal d-block" tabIndex={-1}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', position: 'fixed', inset: 0, zIndex: 9999 }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title"><i className="bi bi-copy me-2"></i>Copy Budget</h5>
                <button className="btn-close" onClick={() => setShowCopyModal(false)}></button>
              </div>
              <div className="modal-body">
                <p className="text-muted small">
                  Copying <strong>{selectedBudget.budget_name}</strong> with all line items to a new budget.
                </p>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">New Fiscal Year</label>
                    <input type="number" className="form-control" value={copyForm.newFiscalYear}
                      onChange={e => setCopyForm({ ...copyForm, newFiscalYear: parseInt(e.target.value) })} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Budget Type</label>
                    <select className="form-select" value={copyForm.newBudgetType}
                      onChange={e => setCopyForm({ ...copyForm, newBudgetType: e.target.value })}>
                      {BUDGET_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowCopyModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleCopyBudget}>
                  <i className="bi bi-copy me-1"></i>Copy Budget
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Reject Budget Modal ───────────────────────────────────────────── */}
      {showRejectModal && selectedBudget && ReactDOM.createPortal(
        <div className="modal d-block" tabIndex={-1}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', position: 'fixed', inset: 0, zIndex: 9999 }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title"><i className="bi bi-x-circle me-2"></i>Reject Budget</h5>
                <button className="btn-close btn-close-white" onClick={() => setShowRejectModal(false)}></button>
              </div>
              <div className="modal-body">
                <p>Rejecting: <strong>{selectedBudget.budget_name}</strong></p>
                <label className="form-label fw-semibold">Reason for Rejection <span className="text-danger">*</span></label>
                <textarea className="form-control" rows={3} value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Provide a clear reason for rejection…" />
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowRejectModal(false)}>Cancel</button>
                <button className="btn btn-danger" disabled={!rejectReason.trim()} onClick={handleReject}>
                  <i className="bi bi-x-lg me-1"></i>Confirm Reject
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
};

export default Budget;
