import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdminJobView } from '../types/admin';
import { DataTable, Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { Video, RefreshCw, Eye, Download, CheckCircle2 } from 'lucide-react';
import { Modal } from '../components/Modal';

export const RenderJobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<AdminJobView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<AdminJobView | null>(null);

  const loadRenderJobs = async () => {
    setIsLoading(true);
    try {
      const data = await api.getRenderJobs();
      setJobs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRenderJobs();
    const interval = setInterval(loadRenderJobs, 10000);
    return () => clearInterval(interval);
  }, []);

  const columns: Column<AdminJobView>[] = [
    {
      key: 'id',
      header: 'Export Task',
      render: (j) => {
        const payload = (j.payload || {}) as any;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(6, 182, 212, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#22d3ee',
              }}
            >
              <Video size={16} />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#fff' }}>
                Export {payload.format ? payload.format.toUpperCase() : 'MP4'}
              </div>
              <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{j.id.slice(0, 14)}...</code>
            </div>
          </div>
        );
      },
    },
    {
      key: 'resolution',
      header: 'Format & Res',
      render: (j) => {
        const payload = (j.payload || {}) as any;
        return (
          <div>
            <span style={{ fontWeight: 600, color: '#e2e8f0' }}>
              {payload.resolutionWidth || 1920} × {payload.resolutionHeight || 1080}
            </span>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Codec: {payload.videoCodec || 'H.264 / AAC'}
            </div>
          </div>
        );
      },
    },
    {
      key: 'userId',
      header: 'Creator',
      render: (j) => <code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{j.userId.slice(0, 12)}...</code>,
    },
    {
      key: 'status',
      header: 'Render Status',
      render: (j) => <StatusBadge status={j.status} />,
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (j) => (
        <div style={{ width: 120 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span>{j.progress}%</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 3, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(Math.max(j.progress, 0), 100)}%`,
                background:
                  j.status === 'failed'
                    ? 'var(--danger)'
                    : j.status === 'completed'
                    ? 'var(--success)'
                    : 'var(--info)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Queued At',
      render: (j) => (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {new Date(j.createdAt).toLocaleTimeString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (j) => (
        <button className="btn btn-secondary btn-sm" onClick={() => setSelectedJob(j)}>
          <Eye size={13} />
          <span>Inspect</span>
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Video size={26} />
            Render & Timeline Export Queue
          </h1>
          <p className="page-subtitle">
            FFmpeg hardware-accelerated timeline composition, encoding, and muxing tasks.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadRenderJobs} disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? 'pulse' : ''} />
          <span>Refresh Renders</span>
        </button>
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          data={jobs}
          isLoading={isLoading}
          searchPlaceholder="Search render jobs..."
          searchFilter={(j, q) =>
            j.id.toLowerCase().includes(q.toLowerCase()) ||
            j.userId.toLowerCase().includes(q.toLowerCase()) ||
            j.status.toLowerCase().includes(q.toLowerCase())
          }
        />
      </div>

      {/* Render Inspector Modal */}
      <Modal
        isOpen={Boolean(selectedJob)}
        onClose={() => setSelectedJob(null)}
        title={`Render Job: ${selectedJob?.id}`}
        footer={
          <button className="btn btn-secondary" onClick={() => setSelectedJob(null)}>
            Close
          </button>
        }
      >
        {selectedJob && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>STATUS</div>
                <div style={{ marginTop: 2 }}>
                  <StatusBadge status={selectedJob.status} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>PROGRESS</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{selectedJob.progress}% complete</div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>FFMPEG ENCODE PARAMETERS</div>
              <pre
                style={{
                  background: '#0b0f19',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border-subtle)',
                  fontSize: 12,
                  color: '#94a3b8',
                  maxHeight: 180,
                  overflowY: 'auto',
                }}
              >
                {JSON.stringify(selectedJob.payload, null, 2)}
              </pre>
            </div>

            {selectedJob.result && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>OUTPUT EXPORT ARTIFACT</div>
                <pre
                  style={{
                    background: '#0b0f19',
                    padding: 12,
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle)',
                    fontSize: 12,
                    color: '#22d3ee',
                  }}
                >
                  {JSON.stringify(selectedJob.result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
