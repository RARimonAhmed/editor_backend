import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdminSubscriptionsReport, AdminSubscriptionView } from '../types/admin';
import { DataTable, Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import {
  CreditCard,
  RefreshCw,
  Zap,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Radio,
} from 'lucide-react';

export const SubscriptionsPage: React.FC = () => {
  const [report, setReport] = useState<AdminSubscriptionsReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSubs = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSubscriptions();
      setReport(data);
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
      name: 'Starter Plan (Free)',
      tier: 'free',
      price: '$0 / mo',
      credits: '50 free credits',
      features: ['1080p 30fps export', 'Standard AI models', '1 GB storage'],
      color: '#94a3b8',
    },
    {
      name: 'Creator Pro',
      tier: 'pro',
      price: '$19 / mo',
      credits: '500 monthly credits',
      features: ['4K 60fps ProRes exports', 'Fast Gemini & OpenAI models', '50 GB storage'],
      color: '#6366f1',
      popular: true,
    },
    {
      name: 'Studio Enterprise',
      tier: 'studio',
      price: '$49 / mo',
      credits: '2,500 monthly credits',
      features: ['8K HDR multi-track exports', 'Real-time collaborative editing', '500 GB storage'],
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
              background:
                s.tier === 'studio'
                  ? 'rgba(168, 85, 247, 0.15)'
                  : s.tier === 'pro'
                  ? 'rgba(99, 102, 241, 0.15)'
                  : 'rgba(148, 163, 184, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color:
                s.tier === 'studio'
                  ? '#c084fc'
                  : s.tier === 'pro'
                  ? '#818cf8'
                  : '#94a3b8',
            }}
          >
            <Zap size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>
              {s.tier} Plan
            </div>
            <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>ID: {s.id}</code>
          </div>
        </div>
      ),
    },
    {
      key: 'userId',
      header: 'Customer ID',
      render: (s) => <code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.userId}</code>,
    },
    {
      key: 'status',
      header: 'Subscription Status',
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
      header: 'Renewal Date',
      render: (s) => (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {new Date(s.currentPeriodEnd).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'cancelAtPeriodEnd',
      header: 'Auto-Renew Status',
      render: (s) => (
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: s.cancelAtPeriodEnd ? 'var(--danger)' : 'var(--success)',
          }}
        >
          {s.cancelAtPeriodEnd ? 'Cancels at Period End' : 'Active Recurring'}
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
            Subscription Tiers & Recurring Billing
          </h1>
          <p className="page-subtitle">
            Customer recurring subscriptions, tier breakdowns, cancellation tracking, and Stripe webhook connectivity.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadSubs} disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? 'pulse' : ''} />
          <span>Refresh Subscriptions</span>
        </button>
      </div>

      {/* Top Telemetry KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>FREE TIER</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#94a3b8', marginTop: 4 }}>
            {report?.tierBreakdown.free ?? 0}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Standard accounts</div>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>PRO TIER</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#818cf8', marginTop: 4 }}>
            {report?.tierBreakdown.pro ?? 0}
          </div>
          <div style={{ fontSize: 11, color: '#818cf8' }}>$19/mo Creator Pro</div>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>STUDIO TIER</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#c084fc', marginTop: 4 }}>
            {report?.tierBreakdown.studio ?? 0}
          </div>
          <div style={{ fontSize: 11, color: '#c084fc' }}>$49/mo Enterprise</div>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ACTIVE RECURRING</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--success)', marginTop: 4 }}>
            {report?.statusBreakdown.active ?? 0}
          </div>
          <div style={{ fontSize: 11, color: 'var(--success)' }}>Billing successfully</div>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>CANCELLED</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--danger)', marginTop: 4 }}>
            {report?.statusBreakdown.cancelled ?? 0}
          </div>
          <div style={{ fontSize: 11, color: 'var(--danger)' }}>Churn / scheduled cancel</div>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>EXPIRED</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#64748b', marginTop: 4 }}>
            {report?.statusBreakdown.expired ?? 0}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Terminated cycles</div>
        </div>
      </div>

      {/* Stripe Webhook Connectivity Status */}
      {report?.webhookStatus && (
        <div
          className="card"
          style={{
            marginBottom: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            background: 'rgba(99, 102, 241, 0.05)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'var(--success-bg)',
                color: 'var(--success)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Radio size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                  Stripe Webhook Pipeline:
                </span>
                <span className="badge badge-healthy" style={{ fontSize: 11 }}>
                  {report.webhookStatus.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Endpoint: <code>{report.webhookStatus.endpoint}</code>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, fontSize: 12 }}>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>LAST EVENT</div>
              <div style={{ color: '#fff', fontWeight: 600 }}>
                {new Date(report.webhookStatus.lastEventReceived).toLocaleTimeString()}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>FAILURES</div>
              <div style={{ color: report.webhookStatus.failureCount > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                {report.webhookStatus.failureCount} failed
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>LATENCY</div>
              <div style={{ color: '#10b981', fontWeight: 700 }}>
                {report.webhookStatus.latencyMs} ms
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscriptions Table */}
      <div className="card">
        <DataTable
          columns={columns}
          data={report?.subscriptions || []}
          isLoading={isLoading}
          searchPlaceholder="Search subscriptions by customer ID or tier..."
          searchFilter={(s, q) =>
            s.userId.toLowerCase().includes(q.toLowerCase()) ||
            s.tier.toLowerCase().includes(q.toLowerCase()) ||
            s.status.toLowerCase().includes(q.toLowerCase())
          }
        />
      </div>
    </div>
  );
};
