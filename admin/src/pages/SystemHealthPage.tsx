import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdminSystemHealthReport } from '../types/admin';
import { StatusBadge } from '../components/StatusBadge';
import {
  Activity,
  RefreshCw,
  Database,
  HardDrive,
  Cpu,
  Layers,
  Sparkles,
  Server,
  Zap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

export const SystemHealthPage: React.FC = () => {
  const [health, setHealth] = useState<AdminSystemHealthReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProbing, setIsProbing] = useState(false);

  const runProbes = async () => {
    setIsProbing(true);
    try {
      const data = await api.getHealth();
      setHealth(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsProbing(false);
    }
  };

  useEffect(() => {
    runProbes();
    const interval = setInterval(runProbes, 15000);
    return () => clearInterval(interval);
  }, []);

  const getServiceIcon = (key: string) => {
    switch (key) {
      case 'api':
        return <Activity size={20} color="#6366f1" />;
      case 'database':
        return <Database size={20} color="#06b6d4" />;
      case 'redis':
        return <Zap size={20} color="#ef4444" />;
      case 'bullmq':
        return <Server size={20} color="#f59e0b" />;
      case 'storage':
        return <HardDrive size={20} color="#10b981" />;
      case 'workers':
        return <Cpu size={20} color="#8b5cf6" />;
      case 'ai_providers':
        return <Sparkles size={20} color="#ec4899" />;
      default:
        return <Layers size={20} color="#94a3b8" />;
    }
  };

  const formatUptime = (seconds: number): string => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${d > 0 ? `${d}d ` : ''}${h > 0 ? `${h}h ` : ''}${m}m ${s}s`;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Activity size={26} />
            Live Infrastructure & Health Probes
          </h1>
          <p className="page-subtitle">
            Real-time ping probes across API layer, PostgreSQL, Redis, BullMQ, Object Storage, Workers, and AI Adapters.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={runProbes} disabled={isProbing}>
          <RefreshCw size={14} className={isProbing ? 'pulse' : ''} />
          <span>{isProbing ? 'Running Probes...' : 'Run Probes Now'}</span>
        </button>
      </div>

      {/* Overall Status Banner */}
      <div
        className="card"
        style={{
          marginBottom: 24,
          background:
            health?.overallStatus === 'HEALTHY'
              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(19, 25, 41, 0.95) 100%)'
              : health?.overallStatus === 'DEGRADED'
              ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(19, 25, 41, 0.95) 100%)'
              : 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(19, 25, 41, 0.95) 100%)',
          border:
            health?.overallStatus === 'HEALTHY'
              ? '1px solid rgba(16, 185, 129, 0.3)'
              : health?.overallStatus === 'DEGRADED'
              ? '1px solid rgba(245, 158, 11, 0.3)'
              : '1px solid rgba(239, 68, 68, 0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background:
                  health?.overallStatus === 'HEALTHY'
                    ? 'var(--success-bg)'
                    : health?.overallStatus === 'DEGRADED'
                    ? 'var(--warning-bg)'
                    : 'var(--danger-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color:
                  health?.overallStatus === 'HEALTHY'
                    ? 'var(--success)'
                    : health?.overallStatus === 'DEGRADED'
                    ? 'var(--warning)'
                    : 'var(--danger)',
              }}
            >
              {health?.overallStatus === 'HEALTHY' ? (
                <CheckCircle2 size={26} />
              ) : health?.overallStatus === 'DEGRADED' ? (
                <AlertTriangle size={26} />
              ) : (
                <XCircle size={26} />
              )}
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
                Platform Operational Status:{' '}
                <span
                  style={{
                    color:
                      health?.overallStatus === 'HEALTHY'
                        ? 'var(--success)'
                        : health?.overallStatus === 'DEGRADED'
                        ? 'var(--warning)'
                        : 'var(--danger)',
                  }}
                >
                  {health?.overallStatus || 'HEALTHY'}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Uptime: {health ? formatUptime(health.uptimeSeconds) : '-'} • Last probe probe run:{' '}
                {health ? new Date(health.timestamp).toLocaleTimeString() : '-'}
              </div>
            </div>
          </div>

          {/* Node Process Memory Readout */}
          <div style={{ display: 'flex', gap: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>HEAP USED</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                {health?.memoryUsageMb.heapUsed || 0} MB
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>HEAP TOTAL</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                {health?.memoryUsageMb.heapTotal || 0} MB
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>RESIDENT SET (RSS)</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                {health?.memoryUsageMb.rss || 0} MB
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Probes Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
        {health?.probes &&
          Object.entries(health.probes).map(([key, probe]) => (
            <div key={key} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'rgba(255, 255, 255, 0.04)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {getServiceIcon(key)}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{probe.service}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Probe Key: {key}</div>
                  </div>
                </div>
                <StatusBadge status={probe.status} />
              </div>

              {/* Latency and Details */}
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  padding: '12px 14px',
                  borderRadius: 8,
                  marginBottom: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 12,
                }}
              >
                <span style={{ color: 'var(--text-secondary)' }}>Probe Latency</span>
                <span style={{ fontWeight: 700, color: '#10b981' }}>{probe.latencyMs.toFixed(2)} ms</span>
              </div>

              {probe.details && (
                <pre
                  style={{
                    background: '#0b0f19',
                    padding: 10,
                    borderRadius: 6,
                    fontSize: 11,
                    color: '#94a3b8',
                    border: '1px solid var(--border-subtle)',
                    overflowX: 'auto',
                    maxHeight: 120,
                  }}
                >
                  {JSON.stringify(probe.details, null, 2)}
                </pre>
              )}
            </div>
          ))}
      </div>
    </div>
  );
};
