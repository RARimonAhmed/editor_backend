import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdminSubscriptionView } from '../types/admin';
import { DataTable, Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { CreditCard, RefreshCw, Check, Zap } from 'lucide-react';

export const SubscriptionsPage: React.FC = () => {
  const [subs, setSubs] = useState<AdminSubscriptionView[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSubs = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSubscriptions();
      setSubs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSubs();
  }, []);

  const tiers = [
    {
      name: 'Starter Plan',
      price: '$0 / mo',
      credits: '50 free initial credits',
      features: ['1080p 30fps export', 'Standard AI models', '1 GB cloud storage', 'Community support'],
      color: '#94a3b8',
    },
    {
      name: 'Creator Pro',
      price: '$19 / mo',
      credits: '500 monthly AI credits',
      features: ['4K 60fps ProRes exports', 'Fast Gemini & OpenAI models', '50 GB cloud storage', 'Priority rendering'],
      color: '#6366f1',
      popular: true,
    },
    {
      name: 'Studio Enterprise',
      price: '$49 / mo',
      credits: '2,500 monthly AI credits',
      features: ['8K HDR multi-track exports', 'Real-time collaborative editing', '500 GB cloud storage', 'Custom AI fine-tuning'],
      color: '#a855f7',
    },
  ];

  const columns: Column<AdminSubscriptionView>[] = [
    {
      key: 'tier',
      header: 'Plan Tier',
      render: (s) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(99, 102, 241, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8',
            }}
          >
            <Zap size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>
              {s.tier} Plan
            </div>
            <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>ID: {s.id.slice(0, 12)}...</code>
          </div>
        </div>
      ),
    },
    {
      key: 'userId',
      header: 'Customer',
      render: (s) => <code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.userId}</code>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: 'priceUsd',
      header: 'Billing Rate',
      render: (s) => (
        <span style={{ fontWeight: 700, color: '#fff' }}>
          ${s.priceUsd} / {s.interval}
        </span>
      ),
    },
    {
      key: 'currentPeriodEnd',
      header: 'Renews On',
      render: (s) => (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {new Date(s.currentPeriodEnd).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'cancelAtPeriodEnd',
      header: 'Auto-Renew',
      render: (s) => (
        <span style={{ fontSize: 12, color: s.cancelAtPeriodEnd ? 'var(--danger)' : 'var(--success)' }}>
          {s.cancelAtPeriodEnd ? 'Cancels at period end' : 'Active Recurring'}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <CreditCard size={26} />
            Subscription Tiers & Recurring Revenue
          </h1>
          <p className="page-subtitle">
            Customer recurring plans, billing cycles, auto-renewals, and entitlement tiers.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadSubs} disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? 'pulse' : ''} />
          <span>Refresh Subscriptions</span>
        </button>
      </div>

      {/* Plan Tiers Showcase */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 28 }}>
        {tiers.map((t, idx) => (
          <div
            key={idx}
            className="card"
            style={{
              borderTop: `3px solid ${t.color}`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{t.name}</span>
                {t.popular && <span className="badge badge-purple">Most Popular</span>}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{t.price}</div>
              <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, marginBottom: 16 }}>{t.credits}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {t.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <Check size={14} color="var(--success)" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Active Subscriptions Table */}
      <div className="card">
        <DataTable
          columns={columns}
          data={subs}
          isLoading={isLoading}
          searchPlaceholder="Search active subscribers..."
          searchFilter={(s, q) =>
            s.tier.toLowerCase().includes(q.toLowerCase()) ||
            s.userId.toLowerCase().includes(q.toLowerCase()) ||
            s.status.toLowerCase().includes(q.toLowerCase())
          }
        />
      </div>
    </div>
  );
};
