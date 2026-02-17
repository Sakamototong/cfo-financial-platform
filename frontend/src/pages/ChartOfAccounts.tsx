import React, { useState, useEffect } from 'react';
import api from '../api/client';

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  parent_account_code: string | null;
  normal_balance: string;
  level: number;
  is_active: boolean;
  children?: Account[];
}

interface Template {
  id: string;
  template_name: string;
  industry: string;
  description: string;
}

const accountTypeBadge = (type: string) => {
  const map: Record<string, string> = {
    asset: 'text-bg-primary',
    liability: 'text-bg-warning',
    equity: 'text-bg-info',
    revenue: 'text-bg-success',
    expense: 'text-bg-danger',
  };
  return <span className={`badge ${map[type] || 'text-bg-secondary'} text-capitalize`}>{type}</span>;
};

const ChartOfAccounts: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [hierarchy, setHierarchy] = useState<Account[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'tree'>('tree');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Account[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const [newAccount, setNewAccount] = useState({
    account_code: '',
    account_name: '',
    account_type: 'asset',
    parent_account_code: '',
    normal_balance: 'debit',
    description: ''
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [accountsRes, hierarchyRes, templatesRes] = await Promise.all([
        api.get('/coa'),
        api.get('/coa/hierarchy'),
        api.get('/coa/templates')
      ]);
      setAccounts(accountsRes.data);
      setHierarchy(hierarchyRes.data);
      setTemplates(templatesRes.data);
      const rootCodes = hierarchyRes.data.map((a: Account) => a.account_code);
      setExpandedNodes(new Set(rootCodes));
    } catch (error) {
      console.error('Error fetching COA data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) { setSearchResults([]); return; }
    try {
      const response = await api.get(`/coa/search?q=${encodeURIComponent(query)}`);
      setSearchResults(response.data);
    } catch (error) { console.error('Search error:', error); }
  };

  const handleAddAccount = async () => {
    try {
      await api.post('/coa', newAccount);
      alert('Account created successfully!');
      setShowAddModal(false);
      setNewAccount({ account_code: '', account_name: '', account_type: 'asset', parent_account_code: '', normal_balance: 'debit', description: '' });
      fetchData();
    } catch (error: any) {
      alert(`Error: ${error.response?.data?.message || 'Failed to create account'}`);
    }
  };

  const handleApplyTemplate = async (templateId: string) => {
    if (!confirm('This will add accounts from the template. Continue?')) return;
    try {
      await api.post(`/coa/templates/${templateId}/apply`);
      alert('Template applied successfully!');
      setShowTemplateModal(false);
      fetchData();
    } catch (error: any) {
      alert(`Error: ${error.response?.data?.message || 'Failed to apply template'}`);
    }
  };

  const toggleNode = (accountCode: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(accountCode)) newExpanded.delete(accountCode);
    else newExpanded.add(accountCode);
    setExpandedNodes(newExpanded);
  };

  const renderTreeNode = (account: Account, depth: number = 0): JSX.Element => {
    const hasChildren = account.children && account.children.length > 0;
    const isExpanded = expandedNodes.has(account.account_code);

    return (
      <div key={account.id}>
        <div
          className="d-flex align-items-center py-1 border-bottom"
          style={{ paddingLeft: `${depth * 24 + 8}px`, cursor: hasChildren ? 'pointer' : 'default' }}
          onClick={() => hasChildren && toggleNode(account.account_code)}
        >
          <span className="me-2" style={{ width: 20, textAlign: 'center' }}>
            {hasChildren && <i className={`bi bi-chevron-${isExpanded ? 'down' : 'right'} small`}></i>}
          </span>
          <code className="me-2">{account.account_code}</code>
          <span className="me-2 flex-grow-1">{account.account_name}</span>
          {accountTypeBadge(account.account_type)}
        </div>
        {hasChildren && isExpanded && (
          <div>{account.children!.map(child => renderTreeNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-body text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
          <p className="mt-2 text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Page Header */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title"><i className="bi bi-journal-bookmark me-2"></i>Chart of Accounts</h3>
          <div className="card-tools d-flex gap-2">
            <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowTemplateModal(true)}>
              <i className="bi bi-file-earmark-text me-1"></i>Use Template
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
              <i className="bi bi-plus-lg me-1"></i>Add Account
            </button>
          </div>
        </div>
      </div>

      {/* Search + View Toggle */}
      <div className="card mb-3">
        <div className="card-body py-2">
          <div className="d-flex gap-3 align-items-center">
            <div className="input-group flex-grow-1">
              <span className="input-group-text"><i className="bi bi-search"></i></span>
              <input
                type="text"
                className="form-control"
                placeholder="Search accounts... (code or name)"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            <div className="btn-group">
              <button className={`btn btn-outline-primary btn-sm ${view === 'tree' ? 'active' : ''}`} onClick={() => setView('tree')}>
                <i className="bi bi-diagram-3 me-1"></i>Tree
              </button>
              <button className={`btn btn-outline-primary btn-sm ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
                <i className="bi bi-list-ul me-1"></i>List
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="card mb-3 border-warning">
          <div className="card-header bg-warning-subtle">
            <h3 className="card-title"><i className="bi bi-search me-2"></i>Search Results ({searchResults.length})</h3>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-sm table-hover mb-0">
                <thead className="table-light">
                  <tr><th>Code</th><th>Name</th><th>Type</th></tr>
                </thead>
                <tbody>
                  {searchResults.map(account => (
                    <tr key={account.id}>
                      <td><code>{account.account_code}</code></td>
                      <td>{account.account_name}</td>
                      <td>{accountTypeBadge(account.account_type)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className={`bi ${view === 'tree' ? 'bi-diagram-3' : 'bi-list-ul'} me-2`}></i>
            {view === 'tree' ? 'Account Hierarchy' : 'All Accounts'}
          </h3>
          <div className="card-tools"><span className="badge text-bg-secondary">{accounts.length} accounts</span></div>
        </div>
        {view === 'tree' ? (
          <div className="card-body p-0">
            {hierarchy.length === 0 ? (
              <div className="text-center text-muted py-5">
                <i className="bi bi-inbox d-block mb-2" style={{ fontSize: '2.5rem' }}></i>
                <p>No accounts found. Add accounts or apply a template.</p>
              </div>
            ) : (
              <div>{hierarchy.map(account => renderTreeNode(account))}</div>
            )}
          </div>
        ) : (
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover table-striped mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Parent</th>
                    <th>Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(account => (
                    <tr key={account.id}>
                      <td><code>{account.account_code}</code></td>
                      <td>{account.account_name}</td>
                      <td>{accountTypeBadge(account.account_type)}</td>
                      <td><code className="text-muted">{account.parent_account_code || '-'}</code></td>
                      <td className="text-capitalize">{account.normal_balance}</td>
                      <td>
                        <span className={`badge ${account.is_active ? 'text-bg-success' : 'text-bg-secondary'}`}>
                          {account.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title"><i className="bi bi-plus-circle me-2"></i>Add New Account</h5>
                <button className="btn-close" onClick={() => setShowAddModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Account Code *</label>
                  <input type="text" className="form-control" value={newAccount.account_code}
                    onChange={(e) => setNewAccount({...newAccount, account_code: e.target.value})} placeholder="1000" />
                </div>
                <div className="mb-3">
                  <label className="form-label">Account Name *</label>
                  <input type="text" className="form-control" value={newAccount.account_name}
                    onChange={(e) => setNewAccount({...newAccount, account_name: e.target.value})} placeholder="Cash and Bank" />
                </div>
                <div className="row mb-3">
                  <div className="col-md-6">
                    <label className="form-label">Type *</label>
                    <select className="form-select" value={newAccount.account_type}
                      onChange={(e) => setNewAccount({...newAccount, account_type: e.target.value})}>
                      <option value="asset">Asset</option>
                      <option value="liability">Liability</option>
                      <option value="equity">Equity</option>
                      <option value="revenue">Revenue</option>
                      <option value="expense">Expense</option>
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Normal Balance *</label>
                    <select className="form-select" value={newAccount.normal_balance}
                      onChange={(e) => setNewAccount({...newAccount, normal_balance: e.target.value})}>
                      <option value="debit">Debit</option>
                      <option value="credit">Credit</option>
                    </select>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label">Parent Account Code</label>
                  <input type="text" className="form-control" value={newAccount.parent_account_code}
                    onChange={(e) => setNewAccount({...newAccount, parent_account_code: e.target.value})} placeholder="Leave empty for root" />
                </div>
                <div className="mb-3">
                  <label className="form-label">Description</label>
                  <textarea className="form-control" rows={2} value={newAccount.description}
                    onChange={(e) => setNewAccount({...newAccount, description: e.target.value})} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAddAccount}><i className="bi bi-check-lg me-1"></i>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title"><i className="bi bi-file-earmark-text me-2"></i>Choose a Template</h5>
                <button className="btn-close" onClick={() => setShowTemplateModal(false)}></button>
              </div>
              <div className="modal-body">
                <p className="text-muted">Select an industry template to quickly set up your chart of accounts.</p>
                <div className="list-group">
                  {templates.map(template => (
                    <div
                      key={template.id}
                      className="list-group-item list-group-item-action"
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleApplyTemplate(template.id)}
                    >
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <h6 className="mb-1">{template.template_name}</h6>
                          <small className="text-muted text-capitalize">{template.industry}</small>
                          {template.description && <p className="text-muted small mb-0 mt-1">{template.description}</p>}
                        </div>
                        <i className="bi bi-chevron-right text-muted"></i>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowTemplateModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChartOfAccounts;
