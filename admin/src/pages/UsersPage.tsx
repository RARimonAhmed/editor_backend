import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdminUserView } from '../types/admin';
import { DataTable, Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { Users, Shield, Edit3, Coins, Check, RefreshCw } from 'lucide-react';

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AdminUserView | null>(null);
  const [editRoleModalOpen, setEditRoleModalOpen] = useState(false);
  const [creditModalOpen, setCreditModalOpen] = useState(false);

  // Form states
  const [newRole, setNewRole] = useState('user');
  const [newStatus, setNewStatus] = useState('active');
  const [creditAmount, setCreditAmount] = useState(50);
  const [creditReason, setCreditReason] = useState('Admin compensation');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleOpenEditRole = (user: AdminUserView) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setNewStatus(user.status);
    setEditRoleModalOpen(true);
  };

  const handleSaveRole = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    try {
      await api.updateUserRole(selectedUser.id, newRole, newStatus);
      setMessage({ type: 'success', text: `User ${selectedUser.email} role updated to ${newRole}` });
      setEditRoleModalOpen(false);
      loadUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update user role' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenCreditModal = (user: AdminUserView) => {
    setSelectedUser(user);
    setCreditAmount(50);
    setCreditReason('Administrative bonus');
    setCreditModalOpen(true);
  };

  const handleGrantCredits = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    try {
      const res = await api.grantCredits(selectedUser.id, creditAmount, creditReason);
      setMessage({
        type: 'success',
        text: `Granted ${creditAmount} credits to ${selectedUser.email}. New balance: ${res.newBalance}`,
      });
      setCreditModalOpen(false);
      loadUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to grant credits' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<AdminUserView>[] = [
    {
      key: 'email',
      header: 'User Account',
      render: (u) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            {u.displayName ? u.displayName[0].toUpperCase() : u.email[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#fff' }}>{u.displayName || 'No Name'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role (RBAC)',
      render: (u) => <StatusBadge status={u.role} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => <StatusBadge status={u.status} />,
    },
    {
      key: 'creditBalance',
      header: 'Credits',
      render: (u) => (
        <span style={{ fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Coins size={14} color="#f59e0b" />
          {u.creditBalance.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'projectsCount',
      header: 'Projects',
      render: (u) => <span>{u.projectsCount}</span>,
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (u) => (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {new Date(u.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (u) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleOpenEditRole(u)}
            title="Modify Role & Status"
          >
            <Edit3 size={13} />
            <span>Role</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleOpenCreditModal(u)}
            title="Grant Bonus Credits"
          >
            <Coins size={13} color="#f59e0b" />
            <span>Credits</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Users size={26} />
            User Management & RBAC
          </h1>
          <p className="page-subtitle">
            Manage customer accounts, grant privileges (admin, pro, user), monitor balances, and enforce security policies.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadUsers} disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? 'pulse' : ''} />
          <span>Refresh Users</span>
        </button>
      </div>

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
          <span>{message.text}</span>
          <button
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
            onClick={() => setMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className="card">
        <DataTable
          columns={columns}
          data={users}
          isLoading={isLoading}
          searchPlaceholder="Search by name, email, or role..."
          searchFilter={(user, q) =>
            user.email.toLowerCase().includes(q.toLowerCase()) ||
            user.displayName.toLowerCase().includes(q.toLowerCase()) ||
            user.role.toLowerCase().includes(q.toLowerCase())
          }
        />
      </div>

      {/* Edit Role Modal */}
      <Modal
        isOpen={editRoleModalOpen}
        onClose={() => setEditRoleModalOpen(false)}
        title={`Edit Role & Permissions: ${selectedUser?.email}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEditRoleModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSaveRole} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Update Permissions'}
            </button>
          </>
        }
      >
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
            Assigned Platform Role
          </label>
          <select
            className="form-select"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
          >
            <option value="user">User (Standard Tier)</option>
            <option value="pro">Pro (Creator Tier with Higher Rate Limits)</option>
            <option value="admin">Administrator (Platform Operations)</option>
            <option value="superadmin">Super Administrator (Full System Root)</option>
          </select>
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
            Account Status
          </label>
          <select
            className="form-select"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
          >
            <option value="active">Active (Full Access)</option>
            <option value="suspended">Suspended (Blocked from Ingestion/Exports)</option>
            <option value="pending_verification">Pending Verification</option>
          </select>
        </div>
      </Modal>

      {/* Grant Credits Modal */}
      <Modal
        isOpen={creditModalOpen}
        onClose={() => setCreditModalOpen(false)}
        title={`Grant Credits: ${selectedUser?.email}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCreditModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleGrantCredits} disabled={isSubmitting}>
              {isSubmitting ? 'Processing...' : 'Grant Credits Now'}
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
            Audit Reason / Note
          </label>
          <input
            type="text"
            className="form-input"
            value={creditReason}
            onChange={(e) => setCreditReason(e.target.value)}
            placeholder="e.g. Compensation for failed export job or promotional bonus"
          />
        </div>
      </Modal>
    </div>
  );
};
