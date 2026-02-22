import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import api from '../api/client';
import { useAbortController, isAbortError } from '../hooks/useApi';
import { useTenant } from '../components/TenantContext';
import { useUser } from '../components/UserContext';
import { hasMinRole } from '../components/RequireRole';

// ─── Types ────────────────────────────────────────────────────────────────────
type UserRole = 'admin' | 'analyst' | 'viewer';

interface TenantUser {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  phone?: string;
  bio?: string;
  role: UserRole;
  is_active: boolean;
  last_login?: string;
  created_at?: string;
  updated_at?: string;
}

interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  invited_by: string;
  status: 'pending' | 'accepted' | 'expired';
  expires_at: string;
  created_at: string;
  accepted_at?: string;
}

interface TransferRequest {
  id: string;
  current_owner_email: string;
  new_owner_email: string;
  reason?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  requested_at: string;
  responded_at?: string;
  response_message?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLES: UserRole[] = ['admin', 'analyst', 'viewer'];

const ROLE_BADGE: Record<string, string> = {
  admin:          'text-bg-danger',
  analyst:        'text-bg-info',
  viewer:         'text-bg-secondary',
  finance_user:   'text-bg-primary',
  finance_manager:'text-bg-warning',
  super_admin:    'text-bg-dark',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', analyst: 'Analyst', viewer: 'Viewer',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function avatarLetter(u: TenantUser) {
  return (u.full_name || u.email || '?')[0].toUpperCase();
}
function avatarColor(email: string) {
  const colors = ['#4e73df','#e74a3b','#1cc88a','#f6c23e','#36b9cc','#858796'];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
function isExpired(d: string) {
  return new Date(d) < new Date();
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
export default function Users() {
  const { tenantId } = useTenant();
  const { user: currentUser, role: currentRole } = useUser();
  const isAdmin = hasMinRole(currentRole, 'admin');
  const { getSignal } = useAbortController();

  // ── Users state ──────────────────────────────────────────────────────────
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // ── Invitations state ────────────────────────────────────────────────────
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);

  // ── Transfer requests ────────────────────────────────────────────────────
  const [transfers, setTransfers] = useState<TransferRequest[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'users' | 'invitations' | 'ownership'>('users');

  // ── Create User modal ────────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', full_name: '', role: 'analyst' as UserRole, phone: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Invite User modal ────────────────────────────────────────────────────
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'analyst' as UserRole });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<string | null>(null);

  // ── Edit Role modal ──────────────────────────────────────────────────────
  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('analyst');
  const [editingSaving, setEditingSaving] = useState(false);

  // ── View User modal ──────────────────────────────────────────────────────
  const [viewingUser, setViewingUser] = useState<TenantUser | null>(null);

  // ── Transfer Ownership modal ─────────────────────────────────────────────
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({ new_owner_email: '', reason: '' });
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  // ── Toast ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' | 'warning' } | null>(null);
  const toastTimer = useRef<any>(null);
  const showToast = (msg: string, type: 'success' | 'danger' | 'warning' = 'success') => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  };

  // ── Load Users ───────────────────────────────────────────────────────────
  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    if (!tenantId) { setUsers([]); return; }
    setLoadingUsers(true); setUsersError(null);
    try {
      const res = await api.get('/users', { signal });
      setUsers(res.data || []);
    } catch (e: any) {
      if (!isAbortError(e)) setUsersError(e.response?.data?.message || e.message || 'Failed to load users');
    } finally { setLoadingUsers(false); }
  }, [tenantId]);

  const loadInvitations = useCallback(async (signal?: AbortSignal) => {
    if (!isAdmin) return;
    setLoadingInvitations(true);
    try {
      const res = await api.get('/users/invitations', { signal });
      setInvitations(res.data || []);
    } catch (e) { if (!isAbortError(e)) setInvitations([]); }
    finally { setLoadingInvitations(false); }
  }, [isAdmin]);

  const loadTransfers = useCallback(async (signal?: AbortSignal) => {
    if (!isAdmin) return;
    setLoadingTransfers(true);
    try {
      const res = await api.get('/users/transfer-ownership/all', { signal });
      setTransfers(res.data || []);
    } catch (e) { if (!isAbortError(e)) setTransfers([]); }
    finally { setLoadingTransfers(false); }
  }, [isAdmin]);

  useEffect(() => {
    const sig = getSignal();
    loadUsers(sig);
    loadInvitations(sig);
    loadTransfers(sig);
  }, [loadUsers, loadInvitations, loadTransfers]);

  // ── Create User ──────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.email || !createForm.full_name) return;
    setCreating(true); setCreateError(null);
    try {
      await api.post('/users', { ...createForm, is_active: true });
      setShowCreateModal(false);
      setCreateForm({ email: '', full_name: '', role: 'analyst', phone: '' });
      await loadUsers();
      showToast(`User ${createForm.full_name} created successfully`);
    } catch (e: any) {
      setCreateError(e.response?.data?.message || e.message || 'Failed to create user');
    } finally { setCreating(false); }
  };

  // ── Invite User ──────────────────────────────────────────────────────────
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.email) return;
    setInviting(true); setInviteError(null); setInviteResult(null);
    try {
      const res = await api.post('/users/invite', inviteForm);
      setInviteResult(res.data?.invitation_url || 'Invitation sent!');
      setInviteForm({ email: '', role: 'analyst' });
      await loadInvitations();
      showToast(`Invitation sent to ${inviteForm.email}`);
    } catch (e: any) {
      setInviteError(e.response?.data?.message || e.message || 'Failed to send invitation');
    } finally { setInviting(false); }
  };

  // ── Change Role ──────────────────────────────────────────────────────────
  const handleRoleSave = async () => {
    if (!editingUser) return;
    setEditingSaving(true);
    try {
      await api.put(`/users/${editingUser.id}/role`, { role: editRole });
      setEditingUser(null);
      await loadUsers();
      showToast('Role updated successfully');
    } catch (e: any) {
      showToast('Error: ' + (e.response?.data?.message || e.message), 'danger');
    } finally { setEditingSaving(false); }
  };

  // ── Deactivate / Reactivate ───────────────────────────────────────────────
  const handleToggleActive = async (u: TenantUser) => {
    if (!confirm(`${u.is_active ? 'Deactivate' : 'Reactivate'} user "${u.full_name || u.email}"?`)) return;
    try {
      if (u.is_active) {
        await api.put(`/users/${u.id}/deactivate`);
        showToast(`${u.full_name || u.email} deactivated`, 'warning');
      } else {
        // Reactivate by upserting with is_active = true
        await api.post('/users', { ...u, is_active: true });
        showToast(`${u.full_name || u.email} reactivated`);
      }
      await loadUsers();
    } catch (e: any) {
      showToast('Error: ' + (e.response?.data?.message || e.message), 'danger');
    }
  };

  // ── Transfer Ownership ────────────────────────────────────────────────────
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferring(true); setTransferError(null);
    try {
      await api.post('/users/transfer-ownership', transferForm);
      setShowTransferModal(false);
      setTransferForm({ new_owner_email: '', reason: '' });
      await loadTransfers();
      showToast('Ownership transfer initiated');
    } catch (e: any) {
      setTransferError(e.response?.data?.message || e.message || 'Failed to initiate transfer');
    } finally { setTransferring(false); }
  };

  const handleCancelTransfer = async (id: string) => {
    if (!confirm('Cancel this ownership transfer request?')) return;
    try {
      await api.post(`/users/transfer-ownership/${id}/cancel`);
      await loadTransfers();
      showToast('Transfer request cancelled', 'warning');
    } catch (e: any) {
      showToast('Error: ' + (e.response?.data?.message || e.message), 'danger');
    }
  };

  // ── Copy to Clipboard ─────────────────────────────────────────────────────
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'));
  };

  // ── Computed ──────────────────────────────────────────────────────────────
  const filteredUsers = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (activeFilter === 'active' && !u.is_active) return false;
    if (activeFilter === 'inactive' && u.is_active) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        u.email.toLowerCase().includes(q) ||
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const countByRole = (r: UserRole) => users.filter(u => u.role === r).length;
  const activeUsers = users.filter(u => u.is_active).length;
  const inactiveUsers = users.filter(u => !u.is_active).length;
  const pendingInvites = invitations.filter(i => i.status === 'pending').length;
  const pendingTransfers = transfers.filter(t => t.status === 'pending').length;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* KPI Strip */}
      <div className="row g-2 mb-3">
        {[
          { label: 'Total Users',     value: users.length,        icon: 'bi-people-fill',        color: 'text-bg-primary'   },
          { label: 'Active',          value: activeUsers,          icon: 'bi-person-check-fill',  color: 'text-bg-success'   },
          { label: 'Inactive',        value: inactiveUsers,        icon: 'bi-person-x-fill',      color: 'text-bg-secondary' },
          { label: 'Admins',          value: countByRole('admin'), icon: 'bi-shield-fill-check',  color: 'text-bg-danger'    },
          { label: 'Analysts',        value: countByRole('analyst'),icon:'bi-bar-chart-fill',     color: 'text-bg-info'      },
          { label: 'Pending Invites', value: pendingInvites,       icon: 'bi-envelope-check',     color: 'text-bg-warning'   },
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

      {/* Tabs */}
      <div className="card">
        <div className="card-header p-0">
          <ul className="nav nav-tabs card-header-tabs px-3">
            <li className="nav-item">
              <button className={`nav-link ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
                <i className="bi bi-people me-1"></i>Users
                <span className="badge text-bg-secondary ms-1">{users.length}</span>
              </button>
            </li>
            {isAdmin && (
              <>
                <li className="nav-item">
                  <button className={`nav-link ${activeTab === 'invitations' ? 'active' : ''}`} onClick={() => setActiveTab('invitations')}>
                    <i className="bi bi-envelope me-1"></i>Invitations
                    {pendingInvites > 0 && <span className="badge text-bg-warning ms-1">{pendingInvites}</span>}
                  </button>
                </li>
                <li className="nav-item">
                  <button className={`nav-link ${activeTab === 'ownership' ? 'active' : ''}`} onClick={() => setActiveTab('ownership')}>
                    <i className="bi bi-arrow-left-right me-1"></i>Ownership Transfer
                    {pendingTransfers > 0 && <span className="badge text-bg-danger ms-1">{pendingTransfers}</span>}
                  </button>
                </li>
              </>
            )}
          </ul>
        </div>

        {/* ── Users Tab ────────────────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div>
            {/* Toolbar */}
            <div className="card-body border-bottom py-2 px-3">
              <div className="row g-2 align-items-center">
                <div className="col-md-4 col-sm-6">
                  <input className="form-control form-control-sm"
                    placeholder="ค้นหาชื่อ, อีเมล, เบอร์โทร…"
                    value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="col-auto">
                  <select className="form-select form-select-sm" value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value as any)}>
                    <option value="all">All Roles</option>
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
                <div className="col-auto">
                  <select className="form-select form-select-sm" value={activeFilter}
                    onChange={e => setActiveFilter(e.target.value as any)}>
                    <option value="all">All Status</option>
                    <option value="active">Active Only</option>
                    <option value="inactive">Inactive Only</option>
                  </select>
                </div>
                <div className="col-auto ms-auto d-flex gap-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={loadUsers} disabled={loadingUsers} title="Refresh">
                    <i className={`bi bi-arrow-clockwise ${loadingUsers ? 'spin' : ''}`}></i>
                  </button>
                  {isAdmin && (
                    <>
                      <button className="btn btn-sm btn-outline-primary" onClick={() => setShowInviteModal(true)}>
                        <i className="bi bi-envelope-plus me-1"></i>Invite
                      </button>
                      <button className="btn btn-sm btn-primary" onClick={() => setShowCreateModal(true)}>
                        <i className="bi bi-person-plus me-1"></i>Add User
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Error */}
            {usersError && (
              <div className="card-body pt-3 pb-0">
                <div className="alert alert-danger py-2 d-flex align-items-center small">
                  <i className="bi bi-exclamation-triangle me-2"></i>{usersError}
                  <button className="btn btn-sm btn-outline-danger ms-2" onClick={loadUsers}>Retry</button>
                </div>
              </div>
            )}

            {/* Users Table */}
            <div className="card-body p-0">
              {loadingUsers ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary"></div>
                  <p className="mt-2 text-muted small">กำลังโหลด…</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center text-muted py-5">
                  <i className="bi bi-people d-block mb-2" style={{ fontSize: '2.5rem' }}></i>
                  <h5>{users.length === 0 ? 'ยังไม่มีผู้ใช้' : 'ไม่พบผู้ใช้ที่ตรงกับการค้นหา'}</h5>
                  {users.length === 0 && isAdmin && (
                    <button className="btn btn-primary mt-2" onClick={() => setShowCreateModal(true)}>
                      <i className="bi bi-person-plus me-1"></i>Add First User
                    </button>
                  )}
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>#</th>
                        <th>User</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Last Login</th>
                        <th>Joined</th>
                        {isAdmin && <th style={{ width: 160 }}>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u, i) => (
                        <tr key={u.id} className={!u.is_active ? 'opacity-50' : ''}>
                          <td className="text-muted small">{i + 1}</td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <div className="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
                                style={{ width: 36, height: 36, fontSize: 14, background: avatarColor(u.email) }}>
                                {avatarLetter(u)}
                              </div>
                              <div>
                                <div className="fw-semibold" style={{ fontSize: '0.9rem' }}>
                                  {u.full_name}
                                  {u.email === currentUser?.email && (
                                    <span className="badge text-bg-light border text-muted ms-1" style={{ fontSize: '0.65rem' }}>You</span>
                                  )}
                                </div>
                                <div className="text-muted" style={{ fontSize: '0.78rem' }}>{u.email}</div>
                                {u.phone && <div className="text-muted" style={{ fontSize: '0.73rem' }}><i className="bi bi-telephone me-1"></i>{u.phone}</div>}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${ROLE_BADGE[u.role] || 'text-bg-secondary'}`}>
                              {ROLE_LABELS[u.role] || u.role}
                            </span>
                          </td>
                          <td>
                            {u.is_active ? (
                              <span className="badge text-bg-success"><i className="bi bi-check-circle me-1"></i>Active</span>
                            ) : (
                              <span className="badge text-bg-secondary"><i className="bi bi-x-circle me-1"></i>Inactive</span>
                            )}
                          </td>
                          <td className="text-muted small">{fmtDateTime(u.last_login)}</td>
                          <td className="text-muted small">{fmtDate(u.created_at)}</td>
                          {isAdmin && (
                            <td>
                              <div className="btn-group btn-group-sm">
                                <button className="btn btn-outline-secondary" title="View Profile"
                                  onClick={() => setViewingUser(u)}>
                                  <i className="bi bi-eye"></i>
                                </button>
                                <button className="btn btn-outline-primary" title="Change Role"
                                  onClick={() => { setEditingUser(u); setEditRole(u.role); }}
                                  disabled={u.email === currentUser?.email}>
                                  <i className="bi bi-person-gear"></i>
                                </button>
                                <button
                                  className={`btn ${u.is_active ? 'btn-outline-warning' : 'btn-outline-success'}`}
                                  title={u.is_active ? 'Deactivate' : 'Reactivate'}
                                  onClick={() => handleToggleActive(u)}
                                  disabled={u.email === currentUser?.email}>
                                  <i className={`bi ${u.is_active ? 'bi-person-dash' : 'bi-person-check'}`}></i>
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="card-footer py-2">
              <small className="text-muted">
                <i className="bi bi-info-circle me-1"></i>
                แสดง <strong>{filteredUsers.length}</strong> จาก {users.length} ผู้ใช้
                {(roleFilter !== 'all' || activeFilter !== 'all' || search) && ' (กรองแล้ว)'}
              </small>
            </div>
          </div>
        )}

        {/* ── Invitations Tab ───────────────────────────────────────────────── */}
        {activeTab === 'invitations' && isAdmin && (
          <div>
            <div className="card-body border-bottom py-2 px-3 d-flex justify-content-between align-items-center">
              <h6 className="mb-0 text-muted small fw-bold text-uppercase">
                <i className="bi bi-envelope me-1"></i>Pending &amp; History
              </h6>
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-outline-secondary" onClick={loadInvitations} title="Refresh">
                  <i className={`bi bi-arrow-clockwise ${loadingInvitations ? 'spin' : ''}`}></i>
                </button>
                <button className="btn btn-sm btn-primary" onClick={() => setShowInviteModal(true)}>
                  <i className="bi bi-envelope-plus me-1"></i>New Invitation
                </button>
              </div>
            </div>
            <div className="card-body p-0">
              {loadingInvitations ? (
                <div className="text-center py-5"><div className="spinner-border spinner-border-sm text-primary"></div></div>
              ) : invitations.length === 0 ? (
                <div className="text-center text-muted py-5">
                  <i className="bi bi-envelope-x d-block mb-2" style={{ fontSize: '2.5rem' }}></i>
                  <p>ยังไม่มีคำเชิญ</p>
                  <button className="btn btn-sm btn-primary" onClick={() => setShowInviteModal(true)}>
                    <i className="bi bi-envelope-plus me-1"></i>Send First Invitation
                  </button>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Email</th><th>Role</th><th>Status</th><th>Invited By</th><th>Expires</th><th>Sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invitations.map(inv => (
                        <tr key={inv.id}>
                          <td className="fw-semibold">{inv.email}</td>
                          <td><span className={`badge ${ROLE_BADGE[inv.role] || 'text-bg-secondary'}`}>{ROLE_LABELS[inv.role] || inv.role}</span></td>
                          <td>
                            {inv.status === 'pending' && !isExpired(inv.expires_at) && (
                              <span className="badge text-bg-warning">Pending</span>
                            )}
                            {inv.status === 'pending' && isExpired(inv.expires_at) && (
                              <span className="badge text-bg-secondary">Expired</span>
                            )}
                            {inv.status === 'accepted' && (
                              <span className="badge text-bg-success">Accepted</span>
                            )}
                            {inv.status === 'expired' && (
                              <span className="badge text-bg-secondary">Expired</span>
                            )}
                          </td>
                          <td className="text-muted small">{inv.invited_by}</td>
                          <td className={`small ${isExpired(inv.expires_at) && inv.status === 'pending' ? 'text-danger' : 'text-muted'}`}>
                            {fmtDate(inv.expires_at)}
                          </td>
                          <td className="text-muted small">{fmtDate(inv.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Ownership Transfer Tab ────────────────────────────────────────── */}
        {activeTab === 'ownership' && isAdmin && (
          <div>
            <div className="card-body border-bottom py-2 px-3 d-flex justify-content-between align-items-center">
              <h6 className="mb-0 text-muted small fw-bold text-uppercase">
                <i className="bi bi-arrow-left-right me-1"></i>Ownership Transfer Requests
              </h6>
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-outline-secondary" onClick={loadTransfers} title="Refresh">
                  <i className={`bi bi-arrow-clockwise ${loadingTransfers ? 'spin' : ''}`}></i>
                </button>
                <button className="btn btn-sm btn-warning" onClick={() => setShowTransferModal(true)}>
                  <i className="bi bi-arrow-left-right me-1"></i>Initiate Transfer
                </button>
              </div>
            </div>

            {/* Notice box */}
            <div className="card-body pb-0">
              <div className="alert alert-info py-2 small d-flex align-items-start gap-2 mb-3">
                <i className="bi bi-info-circle-fill mt-1 flex-shrink-0"></i>
                <div>
                  <strong>การโอน Ownership</strong> จะเปลี่ยนสิทธิ์ admin หลักของ tenant ไปยังผู้ใช้คนอื่น
                  ผู้รับต้องยืนยัน (accept) ก่อนถึงจะมีผล เจ้าของปัจจุบันยังคงเป็น admin จนกว่าจะถูกยืนยัน
                </div>
              </div>
            </div>

            <div className="card-body p-0">
              {loadingTransfers ? (
                <div className="text-center py-5"><div className="spinner-border spinner-border-sm text-primary"></div></div>
              ) : transfers.length === 0 ? (
                <div className="text-center text-muted py-5">
                  <i className="bi bi-arrow-left-right d-block mb-2" style={{ fontSize: '2.5rem' }}></i>
                  <p>ยังไม่มีคำขอโอน ownership</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>จาก</th><th>ไปยัง</th><th>สถานะ</th><th>เหตุผล</th><th>วันที่ขอ</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.map(t => (
                        <tr key={t.id}>
                          <td className="small">{t.current_owner_email}</td>
                          <td className="small fw-semibold">{t.new_owner_email}</td>
                          <td>
                            {t.status === 'pending' && <span className="badge text-bg-warning">Pending</span>}
                            {t.status === 'accepted' && <span className="badge text-bg-success">Accepted</span>}
                            {t.status === 'rejected' && <span className="badge text-bg-danger">Rejected</span>}
                            {t.status === 'cancelled' && <span className="badge text-bg-secondary">Cancelled</span>}
                          </td>
                          <td className="text-muted small" style={{ maxWidth: 200 }}>
                            <span className="text-truncate d-block" title={t.reason}>{t.reason || '—'}</span>
                          </td>
                          <td className="text-muted small">{fmtDate(t.requested_at)}</td>
                          <td>
                            {t.status === 'pending' && (
                              <button className="btn btn-sm btn-outline-danger py-0" style={{ fontSize: '0.75rem' }}
                                onClick={() => handleCancelTransfer(t.id)}>
                                <i className="bi bi-x me-1"></i>Cancel
                              </button>
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
        )}
      </div>

      {/* ── Role Reference Card ──────────────────────────────────────────────── */}
      <div className="card mt-3">
        <div className="card-header py-2">
          <h3 className="card-title small text-uppercase text-muted mb-0 fw-bold">
            <i className="bi bi-shield-check me-1"></i>สิทธิ์แต่ละ Role ในระบบ CFO
          </h3>
        </div>
        <div className="card-body py-3">
          <div className="row g-3">
            {[
              {
                role: 'admin',
                color: 'text-bg-danger',
                label: 'Admin',
                desc: 'จัดการ users, สร้าง/แก้ไข/ลบข้อมูลทั้งหมด, approve งบการเงิน, lock budget, โอน ownership',
                canDo: ['จัดการ Users', 'Approve Financial Statements', 'Lock Budgets', 'ETL Import', 'Admin Settings', 'Billing'],
              },
              {
                role: 'analyst',
                color: 'text-bg-info',
                label: 'Analyst',
                desc: 'สร้าง/แก้ไข scenario, projection, ETL, COA, budget, workflow แต่ไม่สามารถ approve หรือจัดการ users',
                canDo: ['Scenarios & Projections', 'COA', 'Budgets', 'ETL Import', 'Consolidation', 'Dimensions'],
              },
              {
                role: 'viewer',
                color: 'text-bg-secondary',
                label: 'Viewer',
                desc: 'อ่านอย่างเดียว: ดูงบการเงิน, รายงาน, company profile แต่ไม่สามารถแก้ไขข้อมูลใดๆ',
                canDo: ['Dashboard', 'Financial Statements (read)', 'Reports (read)', 'Company Profile (read)'],
              },
            ].map(r => (
              <div key={r.role} className="col-md-4">
                <div className="card border h-100">
                  <div className={`card-header py-2 ${r.color}`}>
                    <h6 className="mb-0 small fw-bold">
                      <i className="bi bi-shield me-1"></i>{r.label}
                    </h6>
                  </div>
                  <div className="card-body py-2 px-3">
                    <p className="text-muted small mb-2">{r.desc}</p>
                    <ul className="list-unstyled mb-0 small">
                      {r.canDo.map(c => (
                        <li key={c} className="d-flex align-items-center gap-2 mb-1">
                          <i className="bi bi-check-circle-fill text-success flex-shrink-0" style={{ fontSize: '0.75rem' }}></i>
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Create User Modal ──────────────────────────────────────────────── */}
      {showCreateModal && ReactDOM.createPortal(
        <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowCreateModal(false); setCreateError(null); } }}>
          <div style={{ width: '100%', maxWidth: 540, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
            <form onSubmit={handleCreate}>
              <div style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="d-flex align-items-center gap-2">
                  <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    <i className="bi bi-person-plus text-white"></i>
                  </div>
                  <div>
                    <div className="fw-bold text-white" style={{ fontSize: '1rem', lineHeight: 1.2 }}>Add New User</div>
                    <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem' }}>สร้าง user ใหม่เข้าระบบทันที</div>
                  </div>
                </div>
                <button type="button" className="btn-close btn-close-white" onClick={() => { setShowCreateModal(false); setCreateError(null); }}></button>
              </div>
              <div className="modal-body" style={{ padding: '1.5rem' }}>
                {createError && (
                  <div className="alert alert-danger py-2 small d-flex align-items-center mb-3">
                    <i className="bi bi-exclamation-triangle me-2"></i>{createError}
                  </div>
                )}
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label fw-semibold">Email <span className="text-danger">*</span></label>
                    <input type="email" className="form-control" value={createForm.email}
                      onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                      placeholder="user@example.com" required autoFocus />
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-semibold">Full Name <span className="text-danger">*</span></label>
                    <input type="text" className="form-control" value={createForm.full_name}
                      onChange={e => setCreateForm({ ...createForm, full_name: e.target.value })}
                      placeholder="ชื่อ-นามสกุล" required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Role <span className="text-danger">*</span></label>
                    <select className="form-select" value={createForm.role}
                      onChange={e => setCreateForm({ ...createForm, role: e.target.value as UserRole })}>
                      <option value="admin">Admin — Full access</option>
                      <option value="analyst">Analyst — Create / Edit financial data</option>
                      <option value="viewer">Viewer — Read only</option>
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Phone</label>
                    <input type="tel" className="form-control" value={createForm.phone}
                      onChange={e => setCreateForm({ ...createForm, phone: e.target.value })}
                      placeholder="เบอร์โทรศัพท์" />
                  </div>
                </div>
                <div className="mt-3 p-2 bg-light rounded small text-muted">
                  <i className="bi bi-info-circle me-1"></i>
                  User จะถูกสร้างในระบบทันที สามารถ login ได้ผ่าน auth provider ที่ตั้งค่าไว้
                </div>
              </div>
              <div style={{ borderTop: '1px solid #e9ecef', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn btn-outline-secondary" onClick={() => { setShowCreateModal(false); setCreateError(null); }}><i className="bi bi-x-lg me-1"></i>Cancel</button>
                <button type="submit" className="btn btn-primary px-4" disabled={creating || !createForm.email || !createForm.full_name}>
                  {creating ? <><span className="spinner-border spinner-border-sm me-1"></span>Creating…</> : <><i className="bi bi-check-circle me-1"></i>Create User</>}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── Invite User Modal ──────────────────────────────────────────────── */}
      {showInviteModal && ReactDOM.createPortal(
        <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowInviteModal(false); setInviteError(null); setInviteResult(null); } }}>
          <div style={{ width: '100%', maxWidth: 480, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
            <form onSubmit={handleInvite}>
              <div style={{ background: 'linear-gradient(135deg,#198754,#0f5132)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="d-flex align-items-center gap-2">
                  <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    <i className="bi bi-envelope-plus text-white"></i>
                  </div>
                  <div>
                    <div className="fw-bold text-white" style={{ fontSize: '1rem', lineHeight: 1.2 }}>Send Invitation</div>
                    <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem' }}>คำเชิญจะหมดอายุใน 7 วัน</div>
                  </div>
                </div>
                <button type="button" className="btn-close btn-close-white" onClick={() => { setShowInviteModal(false); setInviteError(null); setInviteResult(null); }}></button>
              </div>
              <div className="modal-body" style={{ padding: '1.5rem' }}>
                {inviteError && (
                  <div className="alert alert-danger py-2 small d-flex align-items-center mb-3">
                    <i className="bi bi-exclamation-triangle me-2"></i>{inviteError}
                  </div>
                )}
                {inviteResult && (
                  <div className="alert alert-success py-2 small mb-3">
                    <i className="bi bi-check-circle me-2"></i>
                    <strong>Invitation created!</strong><br />
                    <div className="mt-1 d-flex align-items-center gap-2">
                      <code style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>{inviteResult}</code>
                      <button type="button" className="btn btn-sm btn-outline-success py-0 flex-shrink-0"
                        onClick={() => copyToClipboard(inviteResult)}>
                        <i className="bi bi-copy"></i>
                      </button>
                    </div>
                  </div>
                )}
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label fw-semibold">Email <span className="text-danger">*</span></label>
                    <input type="email" className="form-control" value={inviteForm.email}
                      onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                      placeholder="user@example.com" required autoFocus />
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-semibold">Role</label>
                    <select className="form-select" value={inviteForm.role}
                      onChange={e => setInviteForm({ ...inviteForm, role: e.target.value as UserRole })}>
                      <option value="admin">Admin — Full access</option>
                      <option value="analyst">Analyst — Create / Edit financial data</option>
                      <option value="viewer">Viewer — Read only</option>
                    </select>
                  </div>
                </div>
              </div>
              <div style={{ borderTop: '1px solid #e9ecef', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn btn-outline-secondary" onClick={() => { setShowInviteModal(false); setInviteError(null); setInviteResult(null); }}><i className="bi bi-x-lg me-1"></i>Close</button>
                <button type="submit" className="btn btn-success px-4" disabled={inviting || !inviteForm.email}>
                  {inviting ? <><span className="spinner-border spinner-border-sm me-1"></span>Sending…</> : <><i className="bi bi-send me-1"></i>Send Invitation</>}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── Change Role Modal ──────────────────────────────────────────────── */}
      {editingUser && ReactDOM.createPortal(
        <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setEditingUser(null) }}>
          <div style={{ width: '100%', maxWidth: 480, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
            <div style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="d-flex align-items-center gap-2">
                <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  <i className="bi bi-person-gear text-white"></i>
                </div>
                <div>
                  <div className="fw-bold text-white" style={{ fontSize: '1rem', lineHeight: 1.2 }}>Change Role</div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem' }}>{editingUser.full_name || editingUser.email}</div>
                </div>
              </div>
              <button type="button" className="btn-close btn-close-white" onClick={() => setEditingUser(null)}></button>
            </div>
            <div className="modal-body" style={{ padding: '1.5rem' }}>
              <div className="d-flex align-items-center gap-3 mb-4 p-3 bg-light rounded">
                <div className="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
                  style={{ width: 44, height: 44, fontSize: 18, background: avatarColor(editingUser.email) }}>
                  {avatarLetter(editingUser)}
                </div>
                <div>
                  <div className="fw-semibold">{editingUser.full_name}</div>
                  <div className="text-muted small">{editingUser.email}</div>
                  <div className="mt-1">
                    <span className={`badge ${ROLE_BADGE[editingUser.role]}`}>ปัจจุบัน: {ROLE_LABELS[editingUser.role]}</span>
                  </div>
                </div>
              </div>
              <label className="form-label fw-semibold">เปลี่ยนเป็น Role <span className="text-danger">*</span></label>
              <select className="form-select" value={editRole} onChange={e => setEditRole(e.target.value as UserRole)}>
                <option value="admin">Admin — Full access</option>
                <option value="analyst">Analyst — Create / Edit financial data</option>
                <option value="viewer">Viewer — Read only</option>
              </select>
            </div>
            <div style={{ borderTop: '1px solid #e9ecef', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn btn-outline-secondary" onClick={() => setEditingUser(null)}><i className="bi bi-x-lg me-1"></i>Cancel</button>
              <button className="btn btn-primary px-4" disabled={editingSaving || editRole === editingUser.role} onClick={handleRoleSave}>
                {editingSaving ? <><span className="spinner-border spinner-border-sm me-1"></span>Saving…</> : <><i className="bi bi-check-circle me-1"></i>Update Role</>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── View User Modal ──────────────────────────────────────────────────── */}
      {viewingUser && ReactDOM.createPortal(
        <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setViewingUser(null) }}>
          <div style={{ width: '100%', maxWidth: 480, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
            <div style={{ background: `linear-gradient(135deg,${avatarColor(viewingUser.email)},${avatarColor(viewingUser.email)}cc)`, padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              <button type="button" className="btn-close btn-close-white" style={{ position: 'absolute', top: 12, right: 12 }} onClick={() => setViewingUser(null)}></button>
              <div className="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold mb-2"
                style={{ width: 64, height: 64, fontSize: 26, background: 'rgba(255,255,255,0.25)', border: '3px solid rgba(255,255,255,0.6)' }}>
                {avatarLetter(viewingUser)}
              </div>
              <div className="fw-bold text-white" style={{ fontSize: '1.1rem' }}>{viewingUser.full_name}</div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.82rem' }}>{viewingUser.email}</div>
              <div className="mt-2 d-flex gap-1">
                <span className={`badge ${ROLE_BADGE[viewingUser.role]}`}>{ROLE_LABELS[viewingUser.role]}</span>
                {viewingUser.is_active
                  ? <span className="badge text-bg-success">Active</span>
                  : <span className="badge text-bg-secondary">Inactive</span>}
              </div>
            </div>
            <div className="modal-body" style={{ padding: '1.25rem 1.5rem' }}>
              <dl className="row mb-0">
                <dt className="col-5 text-muted small">User ID</dt>
                <dd className="col-7 small">
                  <div className="d-flex align-items-center gap-1">
                    <code style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>{viewingUser.id}</code>
                    <button className="btn btn-link btn-sm p-0 flex-shrink-0" onClick={() => copyToClipboard(viewingUser.id)}>
                      <i className="bi bi-copy text-muted" style={{ fontSize: '0.75rem' }}></i>
                    </button>
                  </div>
                </dd>
                {viewingUser.phone && <>
                  <dt className="col-5 text-muted small">Phone</dt>
                  <dd className="col-7 small">{viewingUser.phone}</dd>
                </>}
                {viewingUser.bio && <>
                  <dt className="col-5 text-muted small">Bio</dt>
                  <dd className="col-7 small">{viewingUser.bio}</dd>
                </>}
                <dt className="col-5 text-muted small">Last Login</dt>
                <dd className="col-7 small">{fmtDateTime(viewingUser.last_login)}</dd>
                <dt className="col-5 text-muted small">Joined</dt>
                <dd className="col-7 small">{fmtDate(viewingUser.created_at)}</dd>
                <dt className="col-5 text-muted small">Last Updated</dt>
                <dd className="col-7 small mb-0">{fmtDate(viewingUser.updated_at)}</dd>
              </dl>
            </div>
            <div style={{ borderTop: '1px solid #e9ecef', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn btn-outline-secondary" onClick={() => setViewingUser(null)}><i className="bi bi-x-lg me-1"></i>Close</button>
              {isAdmin && viewingUser.email !== currentUser?.email && (
                <button className="btn btn-primary px-4" onClick={() => { setViewingUser(null); setEditingUser(viewingUser); setEditRole(viewingUser.role); }}>
                  <i className="bi bi-person-gear me-1"></i>Change Role
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Transfer Ownership Modal ──────────────────────────────────────── */}
      {showTransferModal && ReactDOM.createPortal(
        <div style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowTransferModal(false); setTransferError(null); } }}>
          <div style={{ width: '100%', maxWidth: 520, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: '#fff' }}>
            <form onSubmit={handleTransfer}>
              <div style={{ background: 'linear-gradient(135deg,#c97400,#7d4800)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="d-flex align-items-center gap-2">
                  <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    <i className="bi bi-arrow-left-right text-white"></i>
                  </div>
                  <div>
                    <div className="fw-bold text-white" style={{ fontSize: '1rem', lineHeight: 1.2 }}>Initiate Ownership Transfer</div>
                    <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem' }}>ผู้รับต้องยืนยันก่อนถึงจะมีผล</div>
                  </div>
                </div>
                <button type="button" className="btn-close btn-close-white" onClick={() => { setShowTransferModal(false); setTransferError(null); }}></button>
              </div>
              <div className="modal-body" style={{ padding: '1.5rem' }}>
                <div className="alert alert-warning py-2 small mb-3 d-flex align-items-start gap-2">
                  <i className="bi bi-exclamation-triangle-fill flex-shrink-0 mt-1"></i>
                  <span>การโอน Ownership จะส่งคำขอไปยังผู้รับ คุณยังคงเป็น admin จนกว่าผู้รับจะยืนยัน</span>
                </div>
                {transferError && (
                  <div className="alert alert-danger py-2 small d-flex align-items-center mb-3">
                    <i className="bi bi-exclamation-triangle me-2"></i>{transferError}
                  </div>
                )}
                <div className="mb-3">
                  <label className="form-label fw-semibold">ผู้รับ Ownership <span className="text-danger">*</span></label>
                  <select className="form-select" value={transferForm.new_owner_email}
                    onChange={e => setTransferForm({ ...transferForm, new_owner_email: e.target.value })} required>
                    <option value="">— เลือก User ที่ต้องการโอนให้ —</option>
                    {users.filter(u => u.is_active && u.email !== currentUser?.email).map(u => (
                      <option key={u.id} value={u.email}>{u.full_name} ({u.email})</option>
                    ))}
                  </select>
                  <div className="form-text">เลือกจากผู้ใช้ที่ active อยู่ใน tenant นี้เท่านั้น</div>
                </div>
                <div className="mb-0">
                  <label className="form-label fw-semibold">เหตุผล (ถ้ามี)</label>
                  <textarea className="form-control" rows={2} value={transferForm.reason}
                    onChange={e => setTransferForm({ ...transferForm, reason: e.target.value })}
                    placeholder="ระบุเหตุผลที่ต้องการโอน ownership" />
                </div>
              </div>
              <div style={{ borderTop: '1px solid #e9ecef', background: '#f8f9fa', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn btn-outline-secondary" onClick={() => { setShowTransferModal(false); setTransferError(null); }}><i className="bi bi-x-lg me-1"></i>Cancel</button>
                <button type="submit" className="btn btn-warning px-4" disabled={transferring || !transferForm.new_owner_email}>
                  {transferring ? <><span className="spinner-border spinner-border-sm me-1"></span>Sending…</> : <><i className="bi bi-arrow-left-right me-1"></i>Initiate Transfer</>}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {toast && <ToastAlert msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
