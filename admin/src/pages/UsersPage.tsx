import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { AdminUserView, AdminUserDetailView } from '../types/admin';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import {
  Users,
  Search,
  Filter,
  RefreshCw,
  Coins,
  Shield,
  Eye,
  Key,
  Copy,
  CheckCircle,
  AlertTriangle,
  FolderGit2,
  Film,
  Sparkles,
  History,
  Laptop,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  Clock,
  Activity,
  CreditCard,
  X,
} from 'lucide-react';

export const UsersPage: React.FC = () => {
  // Main listing & pagination states
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Filter & Search states
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [subFilter, setSubFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'createdAt' | 'lastActive' | 'name'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Inspector states
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserView | null>(null);
  const [userDetails, setUserDetails] = useState<AdminUserDetailView | null>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'profile' | 'sessions' | 'projects' | 'media' | 'ai' | 'credits' | 'audit'
  >('profile');

  // Action Modals
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [newRole, setNewRole] = useState('USER');
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('active');
  const [statusReason, setStatusReason] = useState('');
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState(100);
  const [creditReason, setCreditReason] = useState('Compensation for platform downtime');
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [targetSessionId, setTargetSessionId] = useState<string | undefined>(undefined);

  // UX states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load users from backend
  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getUsers({
        search: search.trim() || undefined,
        role: roleFilter,
        status: statusFilter,
        subscription: subFilter,
        sortBy,
        sortOrder,
        page,
        pageSize,
      });
      setUsers(res.users);
      setTotal(res.total);
      setTotalPages(res.totalPages || Math.ceil(res.total / pageSize) || 1);
    } catch (err: any) {
      console.error('Failed to load users:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to fetch platform users' });
    } finally {
      setIsLoading(false);
    }
  }, [search, roleFilter, statusFilter, subFilter, sortBy, sortOrder, page, pageSize]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Load User Details
  const handleOpenInspector = async (user: AdminUserView, initialTab = 'profile') => {
    setSelectedUser(user);
    setActiveTab(initialTab as any);
    setInspectorOpen(true);
    setInspectorLoading(true);
    try {
      const details = await api.getUserDetails(user.id);
      setUserDetails(details);
    } catch (err: any) {
      setMessage({ type: 'error', text: `Failed to load details: ${err.message}` });
    } finally {
      setInspectorLoading(false);
    }
  };

  // Copy helper
  const handleCopyId = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Role Action
  const handleOpenRoleModal = (user: AdminUserView, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedUser(user);
    setNewRole(user.role.toUpperCase());
    setRoleModalOpen(true);
  };

  const handleSaveRole = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    try {
      await api.updateUserRole(selectedUser.id, newRole);
      setMessage({
        type: 'success',
        text: `Role for ${selectedUser.email} successfully updated to ${newRole}. Security audit log logged.`,
      });
      setRoleModalOpen(false);
      loadUsers();
      if (inspectorOpen && selectedUser.id) {
        handleOpenInspector(selectedUser, activeTab);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update user role' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status Action (Enable / Suspend)
  const handleOpenStatusModal = (user: AdminUserView, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedUser(user);
    setNewStatus(user.status === 'active' ? 'suspended' : 'active');
    setStatusReason(user.status === 'active' ? 'Violation of Terms of Service / Abuse' : 'Account restored by admin');
    setStatusModalOpen(true);
  };

  const handleSaveStatus = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    try {
      await api.updateUserStatus(selectedUser.id, newStatus, statusReason);
      setMessage({
        type: 'success',
        text: `Account for ${selectedUser.email} is now ${newStatus.toUpperCase()}. Audit log recorded.`,
      });
      setStatusModalOpen(false);
      loadUsers();
      if (inspectorOpen) {
        handleOpenInspector(selectedUser, activeTab);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update account status' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Credit Action
  const handleOpenCreditModal = (user: AdminUserView, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedUser(user);
    setCreditAmount(100);
    setCreditReason('Administrative platform grant');
    setCreditModalOpen(true);
  };

  const handleGrantCredits = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    try {
      const res = await api.grantCredits(selectedUser.id, creditAmount, creditReason);
      setMessage({
        type: 'success',
        text: `Granted ${creditAmount} credits to ${selectedUser.email}. New Balance: ${res.newBalance}.`,
      });
      setCreditModalOpen(false);
      loadUsers();
      if (inspectorOpen) {
        handleOpenInspector(selectedUser, activeTab);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to grant credits' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Session Revocation
  const handleOpenRevokeModal = (user: AdminUserView, sessionId?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedUser(user);
    setTargetSessionId(sessionId);
    setRevokeModalOpen(true);
  };

  const handleConfirmRevoke = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    try {
      const res = await api.revokeUserSessions(selectedUser.id, targetSessionId);
      setMessage({
        type: 'success',
        text: res.message || `Revoked sessions for ${selectedUser.email}. Audit trail persisted.`,
      });
      setRevokeModalOpen(false);
      if (inspectorOpen) {
        handleOpenInspector(selectedUser, 'sessions');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to revoke user session(s)' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Users size={26} />
            User Management & Enterprise Identity
          </h1>
          <p className="page-subtitle">
            Query real accounts, inspect active devices, manage RBAC privileges, enforce security suspensions, and audit ledger activity.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={loadUsers} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'pulse' : ''} />
            <span>Sync Live Users</span>
          </button>
        </div>
      </div>

      {/* Global Alert Notification */}
      {message && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 20,
            background: message.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
            color: message.type === 'success' ? 'var(--success)' : 'var(--danger)',
            border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {message.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            <span style={{ fontSize: 13, fontWeight: 500 }}>{message.text}</span>
          </div>
          <button
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
            onClick={() => setMessage(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div className="filter-bar" style={{ margin: 0 }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 240 }}>
            <Search
              size={15}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: 36, width: '100%' }}
              placeholder="Search by name, email, or user ID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Role Filter */}
          <div style={{ minWidth: 140 }}>
            <select
              className="form-select"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Role: All</option>
              <option value="USER">User</option>
              <option value="PRO">Pro</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPERADMIN">Superadmin</option>
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ minWidth: 140 }}>
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Status: All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="pending_verification">Pending</option>
            </select>
          </div>

          {/* Subscription Tier Filter */}
          <div style={{ minWidth: 150 }}>
            <select
              className="form-select"
              value={subFilter}
              onChange={(e) => {
                setSubFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Plan: All Tiers</option>
              <option value="free">Free Starter</option>
              <option value="pro">Pro Creator</option>
              <option value="studio">Studio Tier</option>
            </select>
          </div>

          {/* Sort By Dropdown */}
          <div style={{ minWidth: 160 }}>
            <select
              className="form-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="createdAt">Sort: Created Date</option>
              <option value="lastActive">Sort: Last Active</option>
              <option value="name">Sort: Name (A-Z)</option>
            </select>
          </div>

          {/* Sort Order Toggle */}
          <button
            className="btn btn-secondary btn-sm"
            style={{ height: 38 }}
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            title={`Toggle order: currently ${sortOrder === 'desc' ? 'Descending' : 'Ascending'}`}
          >
            <ArrowUpDown size={14} />
            <span>{sortOrder === 'desc' ? 'Desc' : 'Asc'}</span>
          </button>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: 140 }}>User ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last Active</th>
                <th>Plan</th>
                <th>Credits</th>
                <th style={{ textAlign: 'center' }}>Projects</th>
                <th style={{ textAlign: 'right', minWidth: 260 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '40px 0' }}>
                    <div className="loading-spinner" />
                    <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>Querying platform database...</div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
                    <Users size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
                    <div style={{ fontSize: 14, fontWeight: 600 }}>No users matched the search/filter criteria</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Try broadening your search query or resetting filters.</div>
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr
                    key={u.id}
                    style={{ cursor: 'pointer', transition: 'background 0.15s ease' }}
                    onClick={() => handleOpenInspector(u)}
                  >
                    {/* User ID */}
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <code style={{ fontSize: 11, color: '#94a3b8' }}>
                          {u.id.length > 12 ? `${u.id.slice(0, 10)}...` : u.id}
                        </code>
                        <button
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: copiedId === u.id ? 'var(--success)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: 2,
                          }}
                          onClick={(e) => handleCopyId(u.id, e)}
                          title="Copy Full UUID"
                        >
                          {copiedId === u.id ? <CheckCircle size={13} /> : <Copy size={13} />}
                        </button>
                      </div>
                    </td>

                    {/* Name & Avatar */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background:
                              u.role === 'SUPERADMIN'
                                ? 'linear-gradient(135deg, #ef4444 0%, #ec4899 100%)'
                                : u.role === 'ADMIN'
                                ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
                                : u.role === 'PRO'
                                ? 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)'
                                : 'linear-gradient(135deg, #475569 0%, #64748b 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#fff',
                            flexShrink: 0,
                          }}
                        >
                          {u.displayName ? u.displayName[0].toUpperCase() : u.email[0].toUpperCase()}
                        </div>
                        <div style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>
                          {u.displayName || 'No Name'}
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{u.email}</td>

                    {/* Role */}
                    <td>
                      <StatusBadge status={u.role} />
                    </td>

                    {/* Status */}
                    <td>
                      <StatusBadge status={u.status} />
                    </td>

                    {/* Created Date */}
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>

                    {/* Last Active */}
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
                    </td>

                    {/* Subscription */}
                    <td>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '3px 8px',
                          borderRadius: 4,
                          background:
                            u.subscriptionTier === 'studio'
                              ? 'rgba(168, 85, 247, 0.15)'
                              : u.subscriptionTier === 'pro'
                              ? 'rgba(59, 130, 246, 0.15)'
                              : 'rgba(255, 255, 255, 0.05)',
                          color:
                            u.subscriptionTier === 'studio'
                              ? '#c084fc'
                              : u.subscriptionTier === 'pro'
                              ? '#60a5fa'
                              : '#94a3b8',
                        }}
                      >
                        {u.subscriptionTier}
                      </span>
                    </td>

                    {/* Credits */}
                    <td>
                      <span style={{ fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                        <Coins size={13} color="#f59e0b" />
                        {u.creditBalance.toLocaleString()}
                      </span>
                    </td>

                    {/* Projects Count */}
                    <td style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: '#fff',
                        }}
                      >
                        {u.projectsCount}
                      </span>
                    </td>

                    {/* Actions Toolbar */}
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '5px 10px', fontSize: 12 }}
                          onClick={() => handleOpenInspector(u)}
                          title="Inspect User Details"
                        >
                          <Eye size={12} />
                          <span>Inspect</span>
                        </button>

                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '5px 10px', fontSize: 12 }}
                          onClick={(e) => handleOpenRoleModal(u, e)}
                          title="Change Role & Permissions"
                        >
                          <Shield size={12} />
                          <span>Role</span>
                        </button>

                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '5px 10px', fontSize: 12 }}
                          onClick={(e) => handleOpenCreditModal(u, e)}
                          title="Grant Bonus Credits"
                        >
                          <Coins size={12} color="#f59e0b" />
                          <span>Credits</span>
                        </button>

                        <button
                          className={u.status === 'active' ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
                          style={{
                            padding: '5px 8px',
                            fontSize: 12,
                            borderColor: u.status === 'active' ? 'rgba(239, 68, 68, 0.3)' : undefined,
                            color: u.status === 'active' ? '#ef4444' : undefined,
                          }}
                          onClick={(e) => handleOpenStatusModal(u, e)}
                          title={u.status === 'active' ? 'Suspend Account' : 'Activate Account'}
                        >
                          {u.status === 'active' ? <UserX size={12} /> : <UserCheck size={12} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Footer */}
        <div className="pagination-container">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Showing{' '}
            <strong style={{ color: '#fff' }}>
              {total > 0 ? (page - 1) * pageSize + 1 : 0} - {Math.min(page * pageSize, total)}
            </strong>{' '}
            of <strong style={{ color: '#fff' }}>{total}</strong> users
          </div>

          <div className="pagination-controls">
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page Size:</label>
            <select
              className="form-select"
              style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
              value={pageSize}
              onChange={(e) => {
                setPageSize(parseInt(e.target.value, 10));
                setPage(1);
              }}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>

            <button
              className="btn btn-secondary btn-sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={14} />
              <span>Prev</span>
            </button>

            <span style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '0 8px' }}>
              Page <strong style={{ color: '#fff' }}>{page}</strong> of{' '}
              <strong style={{ color: '#fff' }}>{totalPages}</strong>
            </span>

            <button
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage(page + 1)}
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RICH USER DETAILS INSPECTOR MODAL */}
      {/* ========================================================================= */}
      {inspectorOpen && (
        <Modal
          isOpen={inspectorOpen}
          onClose={() => setInspectorOpen(false)}
          title={`User Inspector: ${selectedUser?.displayName || selectedUser?.email}`}
          className="inspector-modal"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => selectedUser && handleOpenRoleModal(selectedUser)}
                >
                  <Shield size={13} />
                  <span>Change Role</span>
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => selectedUser && handleOpenCreditModal(selectedUser)}
                >
                  <Coins size={13} color="#f59e0b" />
                  <span>Grant Credits</span>
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ color: selectedUser?.status === 'active' ? 'var(--danger)' : 'var(--success)' }}
                  onClick={() => selectedUser && handleOpenStatusModal(selectedUser)}
                >
                  {selectedUser?.status === 'active' ? 'Suspend Account' : 'Activate Account'}
                </button>
              </div>
              <button className="btn btn-secondary" onClick={() => setInspectorOpen(false)}>
                Close
              </button>
            </div>
          }
        >
          {inspectorLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div className="loading-spinner" />
              <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 13 }}>
                Gathering telemetry, sessions, media, and ledger data...
              </div>
            </div>
          ) : userDetails ? (
            <div>
              {/* Tabs Navigation */}
              <div className="tabs-header">
                <button
                  className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
                  onClick={() => setActiveTab('profile')}
                >
                  <Users size={14} />
                  <span>Profile</span>
                </button>
                <button
                  className={`tab-btn ${activeTab === 'sessions' ? 'active' : ''}`}
                  onClick={() => setActiveTab('sessions')}
                >
                  <Laptop size={14} />
                  <span>Sessions ({userDetails.sessions.length})</span>
                </button>
                <button
                  className={`tab-btn ${activeTab === 'projects' ? 'active' : ''}`}
                  onClick={() => setActiveTab('projects')}
                >
                  <FolderGit2 size={14} />
                  <span>Projects ({userDetails.projects.length})</span>
                </button>
                <button
                  className={`tab-btn ${activeTab === 'media' ? 'active' : ''}`}
                  onClick={() => setActiveTab('media')}
                >
                  <Film size={14} />
                  <span>Media ({userDetails.mediaUsage.totalFiles})</span>
                </button>
                <button
                  className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
                  onClick={() => setActiveTab('ai')}
                >
                  <Sparkles size={14} />
                  <span>AI Usage ({userDetails.aiUsage.totalJobs})</span>
                </button>
                <button
                  className={`tab-btn ${activeTab === 'credits' ? 'active' : ''}`}
                  onClick={() => setActiveTab('credits')}
                >
                  <CreditCard size={14} />
                  <span>Credits & Billing</span>
                </button>
                <button
                  className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
                  onClick={() => setActiveTab('audit')}
                >
                  <History size={14} />
                  <span>Audit Trail ({userDetails.auditActivity.length})</span>
                </button>
              </div>

              {/* Tab 1: Profile & Identity */}
              {activeTab === 'profile' && (
                <div>
                  <div className="info-grid">
                    <div className="info-box">
                      <div className="info-label">User ID</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <code style={{ fontSize: 12 }}>{userDetails.profile.id}</code>
                        <button
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                          onClick={() => handleCopyId(userDetails.profile.id)}
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="info-box">
                      <div className="info-label">Assigned Role</div>
                      <StatusBadge status={userDetails.profile.role} />
                    </div>
                    <div className="info-box">
                      <div className="info-label">Account Status</div>
                      <StatusBadge status={userDetails.profile.status} />
                    </div>
                    <div className="info-box">
                      <div className="info-label">Email Verified</div>
                      <div style={{ color: userDetails.profile.emailVerified ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                        {userDetails.profile.emailVerified ? 'Verified' : 'Pending Verification'}
                      </div>
                    </div>
                    <div className="info-box">
                      <div className="info-label">Created At</div>
                      <div className="info-value">{new Date(userDetails.profile.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="info-box">
                      <div className="info-label">Last Login</div>
                      <div className="info-value">
                        {userDetails.profile.lastLoginAt ? new Date(userDetails.profile.lastLoginAt).toLocaleString() : 'Never'}
                      </div>
                    </div>
                    <div className="info-box">
                      <div className="info-label">Timezone & Locale</div>
                      <div className="info-value">
                        {userDetails.profile.timezone || 'UTC'} ({userDetails.profile.locale || 'en-US'})
                      </div>
                    </div>
                    <div className="info-box">
                      <div className="info-label">Biography</div>
                      <div className="info-value" style={{ fontSize: 13, fontWeight: 'normal', color: 'var(--text-secondary)' }}>
                        {userDetails.profile.bio || 'No profile biography provided'}
                      </div>
                    </div>
                  </div>

                  {userDetails.profile.preferences && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                        User Preferences (Client Sync)
                      </div>
                      <pre
                        style={{
                          background: 'rgba(0,0,0,0.3)',
                          padding: 12,
                          borderRadius: 8,
                          fontSize: 12,
                          color: '#a5b4fc',
                          overflowX: 'auto',
                        }}
                      >
                        {JSON.stringify(userDetails.profile.preferences, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Sessions & Devices */}
              {activeTab === 'sessions' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      Active refresh sessions, tokens, and browser fingerprints.
                    </div>
                    {userDetails.sessions.some((s) => s.isActive) && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => selectedUser && handleOpenRevokeModal(selectedUser)}
                      >
                        <Key size={13} />
                        <span>Revoke All Sessions</span>
                      </button>
                    )}
                  </div>

                  {userDetails.sessions.length === 0 ? (
                    <div className="empty-state">
                      <Laptop size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                      <div style={{ fontSize: 13 }}>No active or past sessions on record for this user.</div>
                    </div>
                  ) : (
                    <table className="data-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Session ID</th>
                          <th>Device / Client</th>
                          <th>IP Address</th>
                          <th>Created</th>
                          <th>Expires</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userDetails.sessions.map((s) => (
                          <tr key={s.id}>
                            <td>
                              <code style={{ fontSize: 11 }}>{s.id.slice(0, 14)}...</code>
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              {s.userAgent ? s.userAgent.slice(0, 35) + '...' : s.deviceId || 'Unknown Client'}
                            </td>
                            <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{s.ipAddress || '127.0.0.1'}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {new Date(s.createdAt).toLocaleDateString()}
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {new Date(s.expiresAt).toLocaleDateString()}
                            </td>
                            <td>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  background: s.isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  color: s.isActive ? '#34d399' : '#f87171',
                                }}
                              >
                                {s.isActive ? 'ACTIVE' : 'REVOKED'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {s.isActive && (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '3px 8px', fontSize: 11, color: 'var(--danger)' }}
                                  onClick={() => selectedUser && handleOpenRevokeModal(selectedUser, s.id)}
                                >
                                  Revoke
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Tab 3: Projects */}
              {activeTab === 'projects' && (
                <div>
                  {userDetails.projects.length === 0 ? (
                    <div className="empty-state">
                      <FolderGit2 size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                      <div style={{ fontSize: 13 }}>User has not created any timeline projects yet.</div>
                    </div>
                  ) : (
                    <table className="data-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Status</th>
                          <th>Version</th>
                          <th>Duration</th>
                          <th>Tracks</th>
                          <th>Created</th>
                          <th>Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userDetails.projects.map((p) => (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 600, color: '#fff' }}>{p.title}</td>
                            <td>
                              <StatusBadge status={p.status || 'active'} />
                            </td>
                            <td style={{ fontSize: 12 }}>v{p.version || 1}</td>
                            <td style={{ fontSize: 12 }}>{p.durationSeconds}s</td>
                            <td style={{ fontSize: 12 }}>{p.tracksCount} tracks</td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {new Date(p.createdAt).toLocaleDateString()}
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {new Date(p.updatedAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Tab 4: Media Usage */}
              {activeTab === 'media' && (
                <div>
                  <div className="info-grid" style={{ marginBottom: 16 }}>
                    <div className="info-box">
                      <div className="info-label">Total Files</div>
                      <div className="info-value">{userDetails.mediaUsage.totalFiles}</div>
                    </div>
                    <div className="info-box">
                      <div className="info-label">Total Storage</div>
                      <div className="info-value">
                        {(userDetails.mediaUsage.totalBytes / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                    <div className="info-box">
                      <div className="info-label">Video Assets</div>
                      <div className="info-value">{userDetails.mediaUsage.videoCount}</div>
                    </div>
                    <div className="info-box">
                      <div className="info-label">Audio & Waveforms</div>
                      <div className="info-value">{userDetails.mediaUsage.audioCount}</div>
                    </div>
                  </div>

                  {userDetails.mediaUsage.files.length === 0 ? (
                    <div className="empty-state">
                      <Film size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                      <div style={{ fontSize: 13 }}>No uploaded media assets found in storage.</div>
                    </div>
                  ) : (
                    <table className="data-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>File Name</th>
                          <th>MIME Type</th>
                          <th>Size</th>
                          <th>Resolution</th>
                          <th>Status</th>
                          <th>Uploaded</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userDetails.mediaUsage.files.map((m) => (
                          <tr key={m.id}>
                            <td style={{ fontWeight: 500, color: '#fff' }}>{m.name || m.fileName}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.mimeType}</td>
                            <td style={{ fontSize: 12 }}>{(m.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB</td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {m.width && m.height ? `${m.width}x${m.height}` : '—'}
                            </td>
                            <td>
                              <StatusBadge status={m.status} />
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {new Date(m.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Tab 5: AI & Jobs */}
              {activeTab === 'ai' && (
                <div>
                  <div className="info-grid" style={{ marginBottom: 16 }}>
                    <div className="info-box">
                      <div className="info-label">Total AI Jobs</div>
                      <div className="info-value">{userDetails.aiUsage.totalJobs}</div>
                    </div>
                    <div className="info-box">
                      <div className="info-label">Total Tokens Processed</div>
                      <div className="info-value">{userDetails.aiUsage.totalTokens.toLocaleString()}</div>
                    </div>
                    <div className="info-box">
                      <div className="info-label">Estimated Provider Cost</div>
                      <div className="info-value">${userDetails.aiUsage.estimatedCostUsd.toFixed(4)} USD</div>
                    </div>
                  </div>

                  {userDetails.aiUsage.recentJobs.length === 0 ? (
                    <div className="empty-state">
                      <Sparkles size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                      <div style={{ fontSize: 13 }}>No background AI inference jobs recorded for this user.</div>
                    </div>
                  ) : (
                    <table className="data-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Operation</th>
                          <th>Provider & Model</th>
                          <th>Status</th>
                          <th>Tokens</th>
                          <th>Cost</th>
                          <th>Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userDetails.aiUsage.recentJobs.map((j) => (
                          <tr key={j.id}>
                            <td style={{ fontWeight: 600, color: '#fff' }}>{j.type}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              {j.provider} / {j.model}
                            </td>
                            <td>
                              <StatusBadge status={j.status} />
                            </td>
                            <td style={{ fontSize: 12 }}>{j.tokens?.toLocaleString() || '0'}</td>
                            <td style={{ fontSize: 12 }}>${j.cost?.toFixed(4) || '0.0000'}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {new Date(j.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Tab 6: Credits & Billing */}
              {activeTab === 'credits' && (
                <div>
                  <div className="info-grid" style={{ marginBottom: 16 }}>
                    <div className="info-box">
                      <div className="info-label">Available Balance</div>
                      <div className="info-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Coins size={18} color="#f59e0b" />
                        <span>{userDetails.creditTransactions.balance.toLocaleString()} credits</span>
                      </div>
                    </div>
                    <div className="info-box">
                      <div className="info-label">Current Plan</div>
                      <div className="info-value" style={{ textTransform: 'uppercase' }}>
                        {userDetails.subscription.tier} (${userDetails.subscription.priceUsd}/mo)
                      </div>
                    </div>
                    <div className="info-box">
                      <div className="info-label">Billing Cycle Renewal</div>
                      <div className="info-value">
                        {userDetails.subscription.currentPeriodEnd
                          ? new Date(userDetails.subscription.currentPeriodEnd).toLocaleDateString()
                          : 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Transaction Ledger</div>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => selectedUser && handleOpenCreditModal(selectedUser)}
                    >
                      <Coins size={13} color="#f59e0b" />
                      <span>Issue Administrative Bonus</span>
                    </button>
                  </div>

                  {userDetails.creditTransactions.transactions.length === 0 ? (
                    <div className="empty-state">
                      <Coins size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                      <div style={{ fontSize: 13 }}>No credit ledger entries recorded for this wallet.</div>
                    </div>
                  ) : (
                    <table className="data-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Transaction ID</th>
                          <th>Type</th>
                          <th>Delta</th>
                          <th>Description / Audit Reason</th>
                          <th>Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userDetails.creditTransactions.transactions.map((t: any) => (
                          <tr key={t.id}>
                            <td>
                              <code style={{ fontSize: 11 }}>{t.id.slice(0, 12)}...</code>
                            </td>
                            <td>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>{t.type}</span>
                            </td>
                            <td>
                              <span
                                style={{
                                  fontWeight: 700,
                                  color: t.amount > 0 ? 'var(--success)' : 'var(--danger)',
                                }}
                              >
                                {t.amount > 0 ? `+${t.amount}` : t.amount}
                              </span>
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              {t.description || t.reason || 'General Ledger Transaction'}
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {new Date(t.createdAt).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Tab 7: Security Audit Activity */}
              {activeTab === 'audit' && (
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                    Immutable security audit trail entries referencing this account.
                  </div>

                  {userDetails.auditActivity.length === 0 ? (
                    <div className="empty-state">
                      <History size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                      <div style={{ fontSize: 13 }}>No sensitive security events recorded for this user.</div>
                    </div>
                  ) : (
                    <table className="data-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>Actor</th>
                          <th>Timestamp</th>
                          <th>Audit Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userDetails.auditActivity.map((log) => (
                          <tr key={log.id}>
                            <td>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  background: 'rgba(99, 102, 241, 0.15)',
                                  color: '#818cf8',
                                }}
                              >
                                {log.action}
                              </span>
                            </td>
                            <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{log.actorId}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              {log.details ? (
                                <code style={{ fontSize: 11 }}>{JSON.stringify(log.details)}</code>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* EDIT ROLE MODAL (WITH SUPERADMIN RBAC ESCALATION GUARD) */}
      {/* ========================================================================= */}
      <Modal
        isOpen={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        title={`Change Role: ${selectedUser?.email}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setRoleModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSaveRole} disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Save Privileges'}
            </button>
          </>
        }
      >
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
            Assigned Platform Role
          </label>
          <select className="form-select" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option value="USER">User (Standard Creator Tier)</option>
            <option value="PRO">Pro (Enhanced Concurrency & Higher Storage)</option>
            <option value="ADMIN">Administrator (Platform Operations)</option>
            <option value="SUPERADMIN">Super Administrator (System Root Privileges)</option>
          </select>
        </div>

        {(newRole === 'ADMIN' || newRole === 'SUPERADMIN') && (
          <div
            style={{
              marginTop: 16,
              padding: '12px 14px',
              borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <Shield size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 12, color: '#fca5a5' }}>
              <strong>SUPERADMIN Escalation Constraint:</strong> Promoting a user to an administrative role requires
              SUPERADMIN authority. This operation will be permanently recorded in the security audit ledger.
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* ACCOUNT STATUS MODAL (SUSPEND / ACTIVATE) */}
      {/* ========================================================================= */}
      <Modal
        isOpen={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title={`${newStatus === 'suspended' ? 'Suspend' : 'Activate'} Account: ${selectedUser?.email}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setStatusModalOpen(false)}>
              Cancel
            </button>
            <button
              className={newStatus === 'suspended' ? 'btn btn-danger' : 'btn btn-primary'}
              onClick={handleSaveStatus}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : `Confirm ${newStatus.toUpperCase()}`}
            </button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          {newStatus === 'suspended'
            ? 'Suspending this account will block all media ingestions, timeline exports, and revoke active sessions.'
            : 'Re-activating this account will restore standard platform functionality.'}
        </p>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
            Mandatory Audit Reason
          </label>
          <input
            type="text"
            className="form-input"
            value={statusReason}
            onChange={(e) => setStatusReason(e.target.value)}
            placeholder="e.g. Terms violation or user requested account reactivation"
          />
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* GRANT CREDITS MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={creditModalOpen}
        onClose={() => setCreditModalOpen(false)}
        title={`Grant Bonus Credits: ${selectedUser?.email}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCreditModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleGrantCredits} disabled={isSubmitting}>
              {isSubmitting ? 'Granting...' : 'Grant Credits Now'}
            </button>
          </>
        }
      >
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
            Credit Amount
          </label>
          <input
            type="number"
            className="form-input"
            min={1}
            max={50000}
            value={creditAmount}
            onChange={(e) => setCreditAmount(parseInt(e.target.value, 10) || 0)}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
            Mandatory Audit Reason
          </label>
          <input
            type="text"
            className="form-input"
            value={creditReason}
            onChange={(e) => setCreditReason(e.target.value)}
            placeholder="e.g. Compensation for failed AI job or promotional grant"
          />
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* REVOKE SESSIONS CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={revokeModalOpen}
        onClose={() => setRevokeModalOpen(false)}
        title="Revoke User Session(s)"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setRevokeModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleConfirmRevoke} disabled={isSubmitting}>
              {isSubmitting ? 'Revoking...' : 'Revoke Session(s)'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <AlertTriangle size={24} color="#ef4444" style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, color: '#fff', marginBottom: 6 }}>
              {targetSessionId
                ? `Revoke session ${targetSessionId}?`
                : `Revoke all active sessions for ${selectedUser?.email}?`}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              This will invalidate the stored refresh tokens and immediately kick the client to the login screen on their next request.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
