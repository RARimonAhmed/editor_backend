import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdminJobView } from '../types/admin';
import { DataTable, Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { Server, RefreshCw, Eye, AlertTriangle } from 'lucide-react';
import { Modal } from '../components/Modal';

export const JobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<AdminJobView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<AdminJobView | null>(null);

  const loadJobs = async () => {
    setIsLoading(true);
    try {
      const data = await api.getJobs();
      setJobs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 10000); // 10s auto-refresh
    return () => clearInterval(interval);
  }, []);

  const columns: Column<AdminJobView>[] = [
    {
      key: 'id',
      header: 'Job ID & Type',
      render: (j) => (
        <div>
          <div style={{ fontWeight: 600, color: '#fff' }}>{j.jobType}</div>
          <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{j.id.slice(0, 16)}...</code>
        </div>
      ),
    },
    {
      key: 'userId',
      header: 'User',
      render: (j) => <code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{j.userId.slice(0, 12)}...</code>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (j) => <StatusBadge status={j.status} />,
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (j) => (
        <div style={{ width: 130 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span>{j.progress}%</span>
            <span style={{ color: 'var(--text-muted)' }}>{j.status}</span>
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
                    : 'var(--primary)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'creditCost',
      header: 'Credit Cost',
      render: (j) => <span>{j.creditCost} credits</span>,
    },
    {
      key: 'createdAt',
      header: 'Created At',
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
          <span>Payload</span>
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Server size={26} />
            Distributed Job Queue Engine
          </h1>
          <p className="page-subtitle">
            BullMQ & Redis asynchronous task workers (media transcoding, exports, STT transcription, and AI generation).
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadJobs} disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? 'pulse' : ''} />
          <span>Refresh Queue</span>
        </button>
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          data={jobs}
          isLoading={isLoading}
          searchPlaceholder="Search jobs by ID, type, or user..."
          searchFilter={(j, q) =>
            j.id.toLowerCase().includes(q.toLowerCase()) ||
            j.jobType.toLowerCase().includes(q.toLowerCase()) ||
            j.userId.toLowerCase().includes(q.toLowerCase()) ||
            j.status.toLowerCase().includes(q.toLowerCase())
          }
        />
      </div>

      {/* Payload Modal */}
      <Modal
        isOpen={Boolean(selectedJob)}
        onClose={() => setSelectedJob(null)}
        title={`Job Telemetry: ${selectedJob?.id}`}
        maxWidth={640}
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
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>JOB TYPE</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{selectedJob.jobType}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>STATUS</div>
                <div style={{ marginTop: 2 }}>
                  <StatusBadge status={selectedJob.status} />
                </div>
              </div>
            </div>

            {selectedJob.errorMessage && (
              <div
                style={{
                  background: 'var(--danger-bg)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  padding: 12,
                  borderRadius: 8,
                  color: 'var(--danger)',
                  fontSize: 13,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                }}
              >
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 600 }}>Execution Failure Message</div>
                  <div style={{ fontSize: 12, marginTop: 2 }}>{selectedJob.errorMessage}</div>
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>INPUT PAYLOAD</div>
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
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>OUTPUT RESULT</div>
                <pre
                  style={{
                    background: '#0b0f19',
                    padding: 12,
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle)',
                    fontSize: 12,
                    color: '#10b981',
                    maxHeight: 180,
                    overflowY: 'auto',
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
