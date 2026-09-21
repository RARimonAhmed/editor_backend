import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdminAIJobView } from '../types/admin';
import { DataTable, Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { Sparkles, RefreshCw, Eye, Cpu, DollarSign } from 'lucide-react';
import { Modal } from '../components/Modal';

export const AIJobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<AdminAIJobView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<AdminAIJobView | null>(null);

  const loadAIJobs = async () => {
    setIsLoading(true);
    try {
      const data = await api.getAIJobs();
      setJobs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAIJobs();
    const interval = setInterval(loadAIJobs, 12000);
    return () => clearInterval(interval);
  }, []);

  const columns: Column<AdminAIJobView>[] = [
    {
      key: 'type',
      header: 'AI Capability',
      render: (j) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(168, 85, 247, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#c084fc',
            }}
          >
            <Sparkles size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#fff' }}>{j.type}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ID: {j.id.slice(0, 12)}...</div>
          </div>
        </div>
      ),
    },
    {
      key: 'provider',
      header: 'Provider / Model',
      render: (j) => (
        <div>
          <span
            className="badge badge-queued"
            style={{ textTransform: 'uppercase', fontSize: 10, padding: '2px 6px' }}
          >
            {j.provider}
          </span>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{j.model}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (j) => <StatusBadge status={j.status} />,
    },
    {
      key: 'tokens',
      header: 'Token Usage',
      render: (j) => (
        <div style={{ fontSize: 12 }}>
          <span style={{ color: '#fff', fontWeight: 600 }}>
            {((j.inputTokens || 0) + (j.outputTokens || 0)).toLocaleString()}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 4 }}>
            ({j.inputTokens || 0} in / {j.outputTokens || 0} out)
          </span>
        </div>
      ),
    },
    {
      key: 'estimatedCostUsd',
      header: 'Estimated Cost',
      render: (j) => (
        <span style={{ fontSize: 12, fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center' }}>
          ${(j.estimatedCostUsd || 0).toFixed(4)}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Timestamp',
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
          <span>Details</span>
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Sparkles size={26} />
            Multi-Modal AI Gateway Operations
          </h1>
          <p className="page-subtitle">
            Google Gemini & OpenAI inference telemetry, prompt validation, and cost tracking.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadAIJobs} disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? 'pulse' : ''} />
          <span>Refresh AI Jobs</span>
        </button>
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          data={jobs}
          isLoading={isLoading}
          searchPlaceholder="Search by model, provider, capability, or user..."
          searchFilter={(j, q) =>
            j.type.toLowerCase().includes(q.toLowerCase()) ||
            j.provider.toLowerCase().includes(q.toLowerCase()) ||
            j.model.toLowerCase().includes(q.toLowerCase()) ||
            j.userId.toLowerCase().includes(q.toLowerCase())
          }
        />
      </div>

      {/* AI Job Details Modal */}
      <Modal
        isOpen={Boolean(selectedJob)}
        onClose={() => setSelectedJob(null)}
        title={`AI Inference Telemetry: ${selectedJob?.id}`}
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
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>AI PROVIDER</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', textTransform: 'uppercase' }}>
                  {selectedJob.provider}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>MODEL IDENTIFIER</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#a855f7' }}>{selectedJob.model}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>CAPABILITY TYPE</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{selectedJob.type}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>ESTIMATED COST</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>
                  ${(selectedJob.estimatedCostUsd || 0).toFixed(5)} USD
                </div>
              </div>
            </div>

            {selectedJob.prompt && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>PROMPT / CONTEXT</div>
                <pre
                  style={{
                    background: '#0b0f19',
                    padding: 12,
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle)',
                    fontSize: 12,
                    color: '#e2e8f0',
                    maxHeight: 160,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {selectedJob.prompt}
                </pre>
              </div>
            )}

            {selectedJob.errorMessage && (
              <div
                style={{
                  background: 'var(--danger-bg)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  padding: 12,
                  borderRadius: 8,
                  color: 'var(--danger)',
                  fontSize: 13,
                }}
              >
                {selectedJob.errorMessage}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
