import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdminCreditTransactionView } from '../types/admin';
import { DataTable, Column } from '../components/DataTable';
import { Coins, Plus, RefreshCw, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Modal } from '../components/Modal';

export const CreditsPage: React.FC = () => {
  const [balances, setBalances] = useState<Array<{ userId: string; email: string; balance: number }>>([]);
  const [ledger, setLedger] = useState<AdminCreditTransactionView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [grantModalOpen, setGrantModalOpen] = useState(false);

  // Form
  const [targetUserId, setTargetUserId] = useState('');
  const [amount, setAmount] = useState(100);
  const [reason, setReason] = useState('Promotional bonus');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadCredits = async () => {
    setIsLoading(true);
    try {
      const data = await api.getCredits();
      setBalances(data.balances || []);
      setLedger(data.ledger || []);
      if (data.balances && data.balances.length > 0 && !targetUserId) {
        setTargetUserId(data.balances[0].userId);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCredits();
  }, []);

  const handleGrant = async () => {
    if (!targetUserId) return;
    setIsSubmitting(true);
    try {
      const res = await api.grantCredits(targetUserId, amount, reason);
      setStatusMsg(`Successfully credited ${amount} units. New balance: ${res.newBalance}`);
      setGrantModalOpen(false);
      loadCredits();
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const balanceColumns: Column<{ userId: string; email: string; balance: number }>[] = [
    {
      key: 'email',
      header: 'Customer Account',
      render: (b) => (
        <div>
          <div style={{ fontWeight: 600, color: '#fff' }}>{b.email}</div>
          <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.userId}</code>
        </div>
      ),
    },
    {
      key: 'balance',
      header: 'Available Balance',
      render: (b) => (
        <span style={{ fontSize: 15, fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Coins size={16} />
          {b.balance.toLocaleString()} credits
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (b) => (
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setTargetUserId(b.userId);
            setGrantModalOpen(true);
          }}
        >
          <Plus size={13} />
          <span>Grant</span>
        </button>
      ),
    },
  ];

  const ledgerColumns: Column<AdminCreditTransactionView>[] = [
    {
      key: 'type',
      header: 'Transaction Type',
      render: (t) => {
        const isDeduction = t.amount < 0;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: isDeduction ? 'var(--danger-bg)' : 'var(--success-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isDeduction ? 'var(--danger)' : 'var(--success)',
              }}
            >
              {isDeduction ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
            </div>
            <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{t.type.replace('_', ' ')}</span>
          </div>
        );
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (t) => (
        <span
          style={{
            fontWeight: 700,
            color: t.amount < 0 ? 'var(--danger)' : 'var(--success)',
          }}
        >
          {t.amount > 0 ? `+${t.amount}` : t.amount} credits
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Memo / Description',
      render: (t) => <span style={{ color: 'var(--text-secondary)' }}>{t.description}</span>,
    },
    {
      key: 'userId',
      header: 'User ID',
      render: (t) => <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.userId.slice(0, 14)}...</code>,
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (t) => (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {new Date(t.createdAt).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Coins size={26} />
            Credits & Usage Monetization
          </h1>
          <p className="page-subtitle">
            User credit wallets, transaction audits, consumption billing, and administrative grants.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={loadCredits} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'pulse' : ''} />
            <span>Refresh Wallets</span>
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setGrantModalOpen(true)}>
            <Plus size={14} />
            <span>Grant Credits</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 20,
            background: 'var(--info-bg)',
            color: 'var(--info)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>{statusMsg}</span>
          <button
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
            onClick={() => setStatusMsg(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* User Wallets */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12, color: '#fff' }}>
          Customer Wallets & Balances
        </h2>
        <div className="card">
          <DataTable
            columns={balanceColumns}
            data={balances}
            isLoading={isLoading}
            searchPlaceholder="Search customer wallet..."
            searchFilter={(b, q) =>
              b.email.toLowerCase().includes(q.toLowerCase()) || b.userId.toLowerCase().includes(q.toLowerCase())
            }
          />
        </div>
      </div>

      {/* Transaction Ledger */}
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12, color: '#fff' }}>
          Ledger Transactions (Debit & Credit Audits)
        </h2>
        <div className="card">
          <DataTable
            columns={ledgerColumns}
            data={ledger}
            isLoading={isLoading}
            searchPlaceholder="Search ledger records..."
            searchFilter={(t, q) =>
              t.description.toLowerCase().includes(q.toLowerCase()) ||
              t.type.toLowerCase().includes(q.toLowerCase()) ||
              t.userId.toLowerCase().includes(q.toLowerCase())
            }
          />
        </div>
      </div>

      {/* Grant Credits Modal */}
      <Modal
        isOpen={grantModalOpen}
        onClose={() => setGrantModalOpen(false)}
        title="Admin Credit Grant"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setGrantModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleGrant} disabled={isSubmitting}>
              {isSubmitting ? 'Granting...' : 'Confirm Grant'}
            </button>
          </>
        }
      >
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
            Recipient Account
          </label>
          <select
            className="form-select"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
          >
            {balances.map((b) => (
              <option key={b.userId} value={b.userId}>
                {b.email} (Current: {b.balance} credits)
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
            Credit Quantity
          </label>
          <input
            type="number"
            className="form-input"
            min={1}
            value={amount}
            onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
            Audit Reason
          </label>
          <input
            type="text"
            className="form-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. VIP onboarding grant or subscription top-up"
          />
        </div>
      </Modal>
    </div>
  );
};
