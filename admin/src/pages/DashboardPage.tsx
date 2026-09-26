import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdminStatsOverview, AdminChartsReport } from '../types/admin';
import { StatCard } from '../components/StatCard';
import { ChartCard } from '../components/ChartCard';
import { StatusBadge } from '../components/StatusBadge';
import {
  Users,
  FolderGit2,
  Film,
  HardDrive,
  Sparkles,
  Video,
  Coins,
  CreditCard,
  RefreshCw,
  Clock,
  ArrowUpRight,
} from 'lucide-react';

interface DashboardPageProps {
  onNavigate: (path: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState<AdminStatsOverview | null>(null);
  const [charts, setCharts] = useState<AdminChartsReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [s, c] = await Promise.all([api.getStatsOverview(), api.getCharts()]);
      setStats(s);
      setCharts(c);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000); // 15s auto-refresh
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb > 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform Executive Telemetry</h1>
          <p className="page-subtitle">
            Real-time multi-tenant health, job execution queues, and cloud storage metrics
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw size={14} className={isRefreshing ? 'pulse' : ''} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh Telemetry'}</span>
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onNavigate('/system')}
          >
            <span>Live Health Probes</span>
            <ArrowUpRight size={14} />
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="stats-grid">
        <StatCard
          title="Platform Users"
          value={stats ? stats.totalUsers.toLocaleString() : '-'}
          subtitle={`${stats?.activeUsers || 0} active accounts`}
          icon={<Users size={20} />}
          change="+12% this week"
        />
        <StatCard
          title="Active Projects"
          value={stats ? stats.totalProjects.toLocaleString() : '-'}
          subtitle="Timelines & sequences"
          icon={<FolderGit2 size={20} />}
          change="+8% this week"
        />
        <StatCard
          title="Media Assets"
          value={stats ? stats.totalMediaAssets.toLocaleString() : '-'}
          subtitle={`Storage: ${formatBytes(stats?.storageUsageBytes || 0)}`}
          icon={<Film size={20} />}
        />
        <StatCard
          title="Cloud Storage"
          value={formatBytes(stats?.storageUsageBytes || 0)}
          subtitle="S3 / MinIO Object Storage"
          icon={<HardDrive size={20} />}
        />
        <StatCard
          title="AI Executions"
          value={stats ? stats.totalAiJobs.toLocaleString() : '-'}
          subtitle={`${stats?.completedAiJobs || 0} ok • ${stats?.failedAiJobs || 0} err`}
          icon={<Sparkles size={20} />}
        />
        <StatCard
          title="Render Exports"
          value={stats ? stats.totalRenderJobs.toLocaleString() : '-'}
          subtitle={`${stats?.completedRenderJobs || 0} ok • ${stats?.failedRenderJobs || 0} err`}
          icon={<Video size={20} />}
        />
        <StatCard
          title="Credits Consumed"
          value={stats ? stats.totalCreditsConsumed.toLocaleString() : '-'}
          subtitle="AI and render usage"
          icon={<Coins size={20} />}
        />
        <StatCard
          title="Subscriptions"
          value={
            stats
              ? typeof stats.activeSubscriptions === 'object' && stats.activeSubscriptions !== null
                ? (
                    (stats.activeSubscriptions as any).free +
                    (stats.activeSubscriptions as any).pro +
                    (stats.activeSubscriptions as any).studio
                  ).toLocaleString()
                : Number(stats.activeSubscriptions).toLocaleString()
              : '-'
          }
          subtitle={
            stats && typeof stats.activeSubscriptions === 'object'
              ? `${(stats.activeSubscriptions as any).pro || 0} Pro • ${(stats.activeSubscriptions as any).studio || 0} Studio`
              : 'Active recurring tiers'
          }
          icon={<CreditCard size={20} />}
        />
      </div>

      {/* Charts Section */}
      <div className="dashboard-charts-grid">
        <ChartCard
          title="Platform Users Growth"
          subtitle="Cumulative registered creators over past 14 days"
          data={charts?.usersGrowth || []}
          type="area"
          color="#6366f1"
          unit="users"
        />
        <ChartCard
          title="AI Processing Volume"
          subtitle="Daily AI inference requests across all models"
          data={charts?.aiJobsVolume || []}
          type="bar"
          color="#a855f7"
          unit="jobs"
        />
      </div>

      {/* Second Charts Row */}
      <div className="dashboard-charts-grid">
        <ChartCard
          title="Video Render & Export Tasks"
          subtitle="Daily timeline exports rendered via FFmpeg workers"
          data={charts?.renderJobsVolume || []}
          type="bar"
          color="#06b6d4"
          unit="renders"
        />
        <ChartCard
          title="Cloud Storage Consumption"
          subtitle="Daily storage utilization in megabytes"
          data={charts?.storageGrowthMb || []}
          type="area"
          color="#10b981"
          unit="MB"
        />
      </div>

      {/* Recent Activity Feed */}
      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Live Platform Events</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Real-time activity across users, multi-modal AI generation, and media renders
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('/audit-logs')}>
            View All Audit Logs
          </button>
        </div>

        {stats?.recentActivity && stats.recentActivity.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {stats.recentActivity.map((act) => (
              <div
                key={act.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: 8,
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      background:
                        act.type === 'ai_job'
                          ? 'rgba(168, 85, 247, 0.15)'
                          : act.type === 'render_job'
                          ? 'rgba(6, 182, 212, 0.15)'
                          : 'rgba(99, 102, 241, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color:
                        act.type === 'ai_job'
                          ? '#c084fc'
                          : act.type === 'render_job'
                          ? '#22d3ee'
                          : '#818cf8',
                    }}
                  >
                    {act.type === 'ai_job' ? <Sparkles size={16} /> : <Video size={16} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{act.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Actor: <code>{act.actor || 'system'}</code> • ID: <code>{act.id.slice(0, 8)}...</code>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <StatusBadge status={act.status} />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} />
                    {new Date(act.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            No recent activity recorded yet
          </div>
        )}
      </div>
    </div>
  );
};
