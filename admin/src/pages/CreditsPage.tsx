import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import {
  AdminCreditTransactionView,
  AdminCreditsTelemetryReport,
  AdminCreditWalletView,
  AdminSuspiciousCreditFailure,
} from '../types/admin';
import { DataTable, Column } from '../components/DataTable';
import {
  Coins,
  Plus,
  RefreshCw,
  ArrowDownRight,
  ArrowUpRight,
  RotateCcw,
  AlertOctagon,
  ShieldAlert,
  Wallet,
  Zap,
} from 'lucide-react';
import { Modal } from '../components/Modal';

export const CreditsPage: React.FC = () => {
  const [telemetry, setTelemetry] = useState<AdminCreditsTelemetryReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [grantModalOpen, setGrantModalOpen] = useState(false);

  // Form
  const [targetUserId, setTargetUserId] = useState('');
  const [amount, setAmount] = useState(100);
  const [reason, setReason] = useState('Promotional loyalty credit');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadCredits = async () => {
    setIsLoading(true);
    try {
      const data = await api.getCredits();
      setTelemetry(data);
      if (data.wallets && data.wallets.length > 0 && !targetUserId) {
        setTargetUserId(data.wallets[0].userId);
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
      setStatusMsg(`Successfully granted ${amount} credits to ${targetUserId}. New balance: ${res.newBalance}`);
      setGrantModalOpen(false);
      loadCredits();
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const walletColumns: Column<AdminCreditWalletView>[] = [
    {
      key: 'email',
      header: 'Customer Wallet',
      render: (w) => (
        <div>
          <div style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>{w.email}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {w.name ? `${w.name} • ` : ''}
            <code>{w.userId}</code>
          </div>
        </div>
      ),
    },
    {
      key: 'subscriptionTier',
      header: 'Tier',
      render: (w) => (
        <span
          className={`badge ${
            w.subscriptionTier === 'studio'
              ? 'badge-purple'
              : w.subscriptionTier === 'pro'
              ? 'badge-healthy'
              : 'badge-queued'
          }`}
          style={{ textTransform: 'capitalize' }}
        >
          {w.subscriptionTier}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Available Balance',
      render: (w) => (
        <span style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Coins size={15} />
          {w.balance.toLocaleString()} credits
        </span>
      ),
    },
    {
      key: 'totalConsumed',
      header: 'Consumed',
      render: (w) => (
        <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>
          -{w.totalConsumed.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'lastActive',
      header: 'Last Active',
      render: (w) => (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {new Date(w.lastActive).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      render: (w) => (
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setTargetUserId(w.userId);
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
            <span style={{ fontWeight: 600, textTransform: 'capitalize', fontSize: 13 }}>
              {t.type.replace('_', ' ')}
            </span>
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
            fontSize: 13,
            color: t.amount < 0 ? 'var(--danger)' : 'var(--success)',
          }}
        >
          {t.amount > 0 ? `+${t.amount}` : t.amount} credits
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Memo / Operation',
      render: (t) => <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t.description}</span>,
    },
    {
      key: 'userId',
      header: 'Wallet Owner',
      render: (t) => <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.userId}</code>,
    },
    {
      key: 'createdAt',
      header: 'Recorded Date',
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
            Credits, Wallets & Monetization Center
          </h1>
          <p className="page-subtitle">
            Customer balance reserves, credit issuance, usage consumption, refund telemetry, and anomaly detection.
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

      {/* KPI Cards: Issued, Consumed, Refunded, Current Wallets */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(16, 185, 129, 0.15)',
              color: 'var(--success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowUpRight size={22} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>TOTAL CREDITS ISSUED</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>
              {(telemetry?.totalIssued || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: 'var(--success)' }}>Granted & purchased</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#818cf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowDownRight size={22} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>TOTAL CONSUMED</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>
              {(telemetry?.totalConsumed || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: '#818cf8' }}>AI jobs & render exports</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(245, 158, 11, 0.15)',
              color: 'var(--warning)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RotateCcw size={22} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>TOTAL REFUNDED</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>
              {(telemetry?.totalRefunded || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: 'var(--warning)' }}>Failed job compensations</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(245, 158, 11, 0.12)',
              color: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Wallet size={22} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>CURRENT WALLETS RESERVE</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b' }}>
              {(telemetry?.totalCirculatingCredits || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {telemetry?.totalWallets || 0} active customer wallets
            </div>
          </div>
        </div>
      </div>

      {/* Suspicious Failures & Fraud Alerts */}
      {telemetry?.suspiciousFailures && telemetry.suspiciousFailures.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <ShieldAlert size={20} color="var(--warning)" />
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: 0 }}>
              Suspicious Failures & Security Anomalies
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            {telemetry.suspiciousFailures.map((failure) => (
              <div
                key={failure.id}
                className="card"
                style={{
                  borderLeft: `4px solid ${failure.severity === 'HIGH' ? 'var(--danger)' : 'var(--warning)'}`,
                  background: 'rgba(255, 255, 255, 0.02)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      className={`badge ${failure.severity === 'HIGH' ? 'badge-down' : 'badge-warning'}`}
                      style={{ fontSize: 10 }}
                    >
                      {failure.severity} SEVERITY
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Anomaly: <strong>{failure.anomalyType}</strong>
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(failure.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <div style={{ fontSize: 13, color: '#fff', marginBottom: 8, fontWeight: 500 }}>
                  {failure.reason}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>
                  <div>
                    User: <code>{failure.userId}</code>
                    {failure.userEmail ? ` (${failure.userEmail})` : ''}
                  </div>
                  <div style={{ color: 'var(--danger)', fontWeight: 700 }}>
                    Attempted: {failure.attemptedAmount} credits
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer Wallets */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12, color: '#fff' }}>
          Customer Wallets & Available Reserves
        </h2>
        <div className="card">
          <DataTable
            columns={walletColumns}
            data={telemetry?.wallets || []}
            isLoading={isLoading}
            searchPlaceholder="Search customer wallet by email, name, or ID..."
            searchFilter={(w, q) =>
              w.email.toLowerCase().includes(q.toLowerCase()) ||
              w.userId.toLowerCase().includes(q.toLowerCase()) ||
              Boolean(w.name && w.name.toLowerCase().includes(q.toLowerCase()))
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
            data={telemetry?.ledger || []}
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
            <button className="btn btn-primary" onClick={handleGrant} disabled={isSubmitting || !targetUserId}>
              {isSubmitting ? 'Granting...' : `Confirm Grant (+${amount} credits)`}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Target User Wallet ID
            </label>
            <input
              type="text"
              className="input"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              placeholder="e.g. usr_123 or select from wallet list"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Credit Amount
            </label>
            <input
              type="number"
              className="input"
              value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
              min={1}
              max={10000}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Administrative Reason / Ledger Memo
            </label>
            <input
              type="text"
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Promotional loyalty credit, customer compensation"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
