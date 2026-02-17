import React, { useEffect, useState } from 'react';
import api from '../api/client';

interface BudgetItem {
  id: string; budget_name: string; fiscal_year: number; budget_type: string; status: string;
  description?: string; created_by?: string; approved_by?: string; approved_at?: string; notes?: string; created_at: string;
}
interface LineItem {
  id: string; account_code: string; account_name?: string; account_type?: string; department?: string; cost_center?: string;
  january: number; february: number; march: number; april: number; may: number; june: number;
  july: number; august: number; september: number; october: number; november: number; december: number;
  annual_total: number; notes?: string;
}
interface Summary { account_type: string; total_amount: string; department_count: string; line_item_count: string; }

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'] as const;

const Budget: React.FC = () => {
  const [budgets, setBudgets] = useState<BudgetItem[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<BudgetItem | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLineItemModal, setShowLineItemModal] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<LineItem | null>(null);
  const [newBudget, setNewBudget] = useState({ budget_name: '', fiscal_year: new Date().getFullYear() + 1, budget_type: 'annual', description: '' });
  const [newLineItem, setNewLineItem] = useState<Partial<LineItem>>({
    account_code: '', department: '', january: 0, february: 0, march: 0, april: 0, may: 0, june: 0,
    july: 0, august: 0, september: 0, october: 0, november: 0, december: 0
  });

  useEffect(() => { fetchBudgets() }, []);

  const fetchBudgets = async () => { try { const r = await api.get('/budgets'); setBudgets(r.data) } catch (e) { console.error('Error:', e) } };

  const fetchBudgetDetails = async (id: string) => {
    try {
      const [b, l, s] = await Promise.all([api.get(`/budgets/${id}`), api.get(`/budgets/${id}/line-items`), api.get(`/budgets/${id}/summary`)]);
      setSelectedBudget(b.data); setLineItems(l.data); setSummary(s.data);
    } catch (e) { console.error('Error:', e) }
  };

  const handleSelectBudget = (b: BudgetItem) => { setSelectedBudget(b); fetchBudgetDetails(b.id) };

  const handleAddBudget = async () => {
    try { await api.post('/budgets', newBudget); setShowAddModal(false); setNewBudget({ budget_name: '', fiscal_year: new Date().getFullYear() + 1, budget_type: 'annual', description: '' }); fetchBudgets(); }
    catch (e: any) { alert('Error: ' + (e.response?.data?.message || e.message)) }
  };

  const handleAddLineItem = async () => {
    if (!selectedBudget) return;
    try { await api.post(`/budgets/${selectedBudget.id}/line-items`, newLineItem); setShowLineItemModal(false);
      setNewLineItem({ account_code: '', department: '', january: 0, february: 0, march: 0, april: 0, may: 0, june: 0, july: 0, august: 0, september: 0, october: 0, november: 0, december: 0 });
      fetchBudgetDetails(selectedBudget.id);
    } catch (e: any) { alert('Error: ' + (e.response?.data?.message || e.message)) }
  };

  const handleUpdateLineItem = async () => {
    if (!selectedBudget || !editingLineItem) return;
    const d: any = {}; MONTHS.forEach(m => d[m] = (editingLineItem as any)[m]); d.notes = editingLineItem.notes;
    try { await api.put(`/budgets/${selectedBudget.id}/line-items/${editingLineItem.id}`, d); setEditingLineItem(null); fetchBudgetDetails(selectedBudget.id) }
    catch (e) { alert('Error updating line item') }
  };

  const handleDeleteLineItem = async (id: string) => {
    if (!selectedBudget || !confirm('Delete this line item?')) return;
    try { await api.delete(`/budgets/${selectedBudget.id}/line-items/${id}`); fetchBudgetDetails(selectedBudget.id) } catch (e) { console.error(e) }
  };

  const handleSubmit = async () => {
    if (!selectedBudget || !confirm('Submit budget for approval?')) return;
    try { await api.post(`/budgets/${selectedBudget.id}/submit`, { userId: 'current-user' }); fetchBudgets(); fetchBudgetDetails(selectedBudget.id) }
    catch (e: any) { alert('Error: ' + (e.response?.data?.message || e.message)) }
  };
  const handleApprove = async () => {
    if (!selectedBudget || !confirm('Approve this budget?')) return;
    try { await api.post(`/budgets/${selectedBudget.id}/approve`, { userId: 'current-user' }); fetchBudgets(); fetchBudgetDetails(selectedBudget.id) }
    catch (e: any) { alert('Error: ' + (e.response?.data?.message || e.message)) }
  };
  const handleLock = async () => {
    if (!selectedBudget || !confirm('Lock this budget? This cannot be undone.')) return;
    try { await api.post(`/budgets/${selectedBudget.id}/lock`, {}); fetchBudgets(); fetchBudgetDetails(selectedBudget.id) }
    catch (e: any) { alert('Error: ' + (e.response?.data?.message || e.message)) }
  };

  const fmt = (v: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(typeof v === 'string' ? parseFloat(v) : v);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { draft: 'text-bg-secondary', submitted: 'text-bg-warning', approved: 'text-bg-success', rejected: 'text-bg-danger', locked: 'text-bg-info' };
    return <span className={`badge ${map[s] || 'text-bg-secondary'}`}>{s.toUpperCase()}</span>;
  };

  const monthsGrid = (item: Record<string, any>, setter: (v: any) => void) => (
    <div className="row g-2">
      {MONTHS.map(m => (
        <div key={m} className="col-md-3 col-sm-4 col-6">
          <label className="form-label small text-capitalize">{m.slice(0, 3)}</label>
          <input type="number" className="form-control form-control-sm" value={item[m] || 0}
            onChange={e => setter({ ...item, [m]: parseFloat(e.target.value) || 0 })} />
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title"><i className="bi bi-piggy-bank me-2"></i>Budget Management</h3>
        </div>
      </div>

      <div className="row">
        <div className="col-md-4">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Budgets</h3>
              <div className="card-tools">
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
                  <i className="bi bi-plus-lg me-1"></i>New Budget
                </button>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="list-group list-group-flush">
                {budgets.length === 0 && <div className="list-group-item text-center text-muted py-4">No budgets found</div>}
                {budgets.map(b => (
                  <div key={b.id} className={`list-group-item list-group-item-action ${selectedBudget?.id === b.id ? 'active' : ''}`}
                    onClick={() => handleSelectBudget(b)} style={{ cursor: 'pointer' }}>
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <h6 className="mb-1">{b.budget_name}</h6>
                        <small className={selectedBudget?.id === b.id ? '' : 'text-muted'}>FY{b.fiscal_year} &bull; {b.budget_type}</small>
                      </div>
                      {statusBadge(b.status)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-8">
          {selectedBudget ? (
            <>
              <div className="card mb-3">
                <div className="card-header">
                  <h3 className="card-title">{selectedBudget.budget_name}</h3>
                  <div className="card-tools d-flex gap-2 align-items-center">
                    {selectedBudget.status === 'draft' && (
                      <>
                        <button className="btn btn-success btn-sm" onClick={() => setShowLineItemModal(true)}><i className="bi bi-plus-lg me-1"></i>Add Line</button>
                        <button className="btn btn-warning btn-sm" onClick={handleSubmit}><i className="bi bi-send me-1"></i>Submit</button>
                      </>
                    )}
                    {selectedBudget.status === 'submitted' && <button className="btn btn-success btn-sm" onClick={handleApprove}><i className="bi bi-check-lg me-1"></i>Approve</button>}
                    {selectedBudget.status === 'approved' && <button className="btn btn-info btn-sm" onClick={handleLock}><i className="bi bi-lock me-1"></i>Lock</button>}
                  </div>
                </div>
                <div className="card-body py-2">
                  <span className="me-3">FY{selectedBudget.fiscal_year}</span>
                  <span className="me-3 badge text-bg-light text-capitalize">{selectedBudget.budget_type}</span>
                  {statusBadge(selectedBudget.status)}
                  {selectedBudget.description && <p className="text-muted small mt-2 mb-0">{selectedBudget.description}</p>}
                </div>
              </div>

              {summary.length > 0 && (
                <div className="row mb-3">
                  {summary.map(s => (
                    <div key={s.account_type} className="col-md-4 col-sm-6">
                      <div className="info-box">
                        <span className={`info-box-icon ${s.account_type === 'revenue' ? 'text-bg-success' : s.account_type === 'expense' ? 'text-bg-danger' : 'text-bg-info'}`}>
                          <i className={`bi ${s.account_type === 'revenue' ? 'bi-graph-up-arrow' : s.account_type === 'expense' ? 'bi-graph-down-arrow' : 'bi-wallet2'}`}></i>
                        </span>
                        <div className="info-box-content">
                          <span className="info-box-text text-capitalize">{s.account_type}</span>
                          <span className="info-box-number">{fmt(s.total_amount)}</span>
                          <small className="text-muted">{s.line_item_count} items &bull; {s.department_count} depts</small>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="card">
                <div className="card-header">
                  <h3 className="card-title"><i className="bi bi-list-ol me-2"></i>Line Items</h3>
                  <div className="card-tools"><span className="badge text-bg-secondary">{lineItems.length} items</span></div>
                </div>
                {lineItems.length === 0 ? (
                  <div className="card-body text-center text-muted py-5">
                    <i className="bi bi-inbox d-block mb-2" style={{ fontSize: '2.5rem' }}></i>
                    <p>No line items yet. Add one to get started.</p>
                  </div>
                ) : (
                  <div className="card-body p-0">
                    <div className="table-responsive">
                      <table className="table table-hover table-striped mb-0">
                        <thead className="table-light">
                          <tr><th>Account</th><th>Dept</th><th className="text-end">Q1</th><th className="text-end">Q2</th><th className="text-end">Q3</th><th className="text-end">Q4</th><th className="text-end">Annual</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                          {lineItems.map(item => (
                            <tr key={item.id}>
                              <td><code>{item.account_code}</code><br /><small className="text-muted">{item.account_name}</small></td>
                              <td>{item.department || '-'}</td>
                              <td className="text-end">{fmt(item.january + item.february + item.march)}</td>
                              <td className="text-end">{fmt(item.april + item.may + item.june)}</td>
                              <td className="text-end">{fmt(item.july + item.august + item.september)}</td>
                              <td className="text-end">{fmt(item.october + item.november + item.december)}</td>
                              <td className="text-end fw-bold">{fmt(item.annual_total)}</td>
                              <td>
                                <div className="btn-group btn-group-sm">
                                  <button className="btn btn-outline-primary" onClick={() => setEditingLineItem(item)} title="Edit"><i className="bi bi-pencil"></i></button>
                                  {selectedBudget.status === 'draft' && <button className="btn btn-outline-danger" onClick={() => handleDeleteLineItem(item.id)} title="Delete"><i className="bi bi-trash"></i></button>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="card">
              <div className="card-body text-center text-muted py-5">
                <i className="bi bi-arrow-left-circle d-block mb-2" style={{ fontSize: '3rem' }}></i>
                <h5>Select a budget to view details</h5>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog"><div className="modal-content">
            <div className="modal-header"><h5 className="modal-title"><i className="bi bi-plus-circle me-2"></i>Create New Budget</h5><button className="btn-close" onClick={() => setShowAddModal(false)}></button></div>
            <div className="modal-body">
              <div className="mb-3"><label className="form-label">Budget Name</label><input className="form-control" value={newBudget.budget_name} onChange={e => setNewBudget({ ...newBudget, budget_name: e.target.value })} placeholder="e.g., FY2026 Annual Budget" /></div>
              <div className="row mb-3">
                <div className="col-md-6"><label className="form-label">Fiscal Year</label><input type="number" className="form-control" value={newBudget.fiscal_year} onChange={e => setNewBudget({ ...newBudget, fiscal_year: parseInt(e.target.value) })} /></div>
                <div className="col-md-6"><label className="form-label">Budget Type</label><select className="form-select" value={newBudget.budget_type} onChange={e => setNewBudget({ ...newBudget, budget_type: e.target.value })}><option value="annual">Annual</option><option value="revised">Revised</option><option value="supplemental">Supplemental</option></select></div>
              </div>
              <div className="mb-3"><label className="form-label">Description</label><textarea className="form-control" rows={3} value={newBudget.description} onChange={e => setNewBudget({ ...newBudget, description: e.target.value })} /></div>
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleAddBudget}><i className="bi bi-check-lg me-1"></i>Create</button></div>
          </div></div>
        </div>
      )}

      {showLineItemModal && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg"><div className="modal-content">
            <div className="modal-header"><h5 className="modal-title"><i className="bi bi-plus-circle me-2"></i>Add Budget Line Item</h5><button className="btn-close" onClick={() => setShowLineItemModal(false)}></button></div>
            <div className="modal-body">
              <div className="row mb-3">
                <div className="col-md-6"><label className="form-label">Account Code</label><input className="form-control" value={newLineItem.account_code} onChange={e => setNewLineItem({ ...newLineItem, account_code: e.target.value })} placeholder="e.g., 5100" /></div>
                <div className="col-md-6"><label className="form-label">Department</label><input className="form-control" value={newLineItem.department} onChange={e => setNewLineItem({ ...newLineItem, department: e.target.value })} placeholder="e.g., Sales" /></div>
              </div>
              <h6 className="mb-3">Monthly Breakdown</h6>
              {monthsGrid(newLineItem, setNewLineItem)}
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowLineItemModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleAddLineItem}><i className="bi bi-check-lg me-1"></i>Add Line Item</button></div>
          </div></div>
        </div>
      )}

      {editingLineItem && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg"><div className="modal-content">
            <div className="modal-header"><h5 className="modal-title"><i className="bi bi-pencil me-2"></i>Edit Line Item</h5><button className="btn-close" onClick={() => setEditingLineItem(null)}></button></div>
            <div className="modal-body">
              <p><code>{editingLineItem.account_code}</code> - {editingLineItem.account_name}</p>
              <h6 className="mb-3">Monthly Breakdown</h6>
              {monthsGrid(editingLineItem, setEditingLineItem)}
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setEditingLineItem(null)}>Cancel</button><button className="btn btn-primary" onClick={handleUpdateLineItem}><i className="bi bi-check-lg me-1"></i>Update</button></div>
          </div></div>
        </div>
      )}
    </>
  );
};

export default Budget;
