import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdminAuditLogEntry } from '../types/admin';
import { DataTable, Column } from '../components/DataTable';
import { ShieldCheck, RefreshCw, Eye, Key } from 'lucide-react';
import { Modal } from '../components/Modal';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AdminAuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AdminAuditLogEntry | null>(null);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const data = await api.getAuditLogs();
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const columns: Column<AdminAuditLogEntry>[] = [
    {
      key: 'action',
      header: 'Security Event Action',
      render: (l) => {
        let badgeClass = 'badge-purple';
        if (l.action.includes('LOGIN')) badgeClass = 'badge-healthy';
        if (l.action.includes('CREDIT')) badgeClass = 'badge-warning';
        if (l.action.includes('DELETE') || l.action.includes('REVOKE')) badgeClass = 'badge-down';

        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`badge ${badgeClass}`} style={{ fontSize: 11 }}>
              {l.action}
            </span>
          </div>
        );
      },
    },
    {
      key: 'actorId',
      header: 'Actor ID',
      render: (l) => <code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{l.actorId}</code>,
    },
    {
      key: 'targetId',
      header: 'Target ID',
      render: (l) => (
        <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.targetId || '-'}</code>
      ),
    },
    {
      key: 'timestamp',
      header: 'Timestamp',
      render: (l) => (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {new Date(l.timestamp).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (l) => (
        <button className="btn btn-secondary btn-sm" onClick={() => setSelectedLog(l)}>
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
            <ShieldCheck size={26} />
            Security & Operational Audit Trail
          </h1>
          <p className="page-subtitle">
            Immutable system audit logs tracking privileged admin actions, role modifications, and credit grants.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadLogs} disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? 'pulse' : ''} />
          <span>Refresh Audit Trail</span>
        </button>
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          data={logs}
          isLoading={isLoading}
          searchPlaceholder="Search audit logs by action, actor, or target..."
          searchFilter={(l, q) =>
            l.action.toLowerCase().includes(q.toLowerCase()) ||
            l.actorId.toLowerCase().includes(q.toLowerCase()) ||
            Boolean(l.targetId && l.targetId.toLowerCase().includes(q.toLowerCase()))
          }
        />
      </div>

      {/* Audit Log Details Modal */}
      <Modal
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title={`Audit Entry: ${selectedLog?.action}`}
        footer={
          <button className="btn btn-secondary" onClick={() => setSelectedLog(null)}>
            Close
          </button>
        }
      >
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>EVENT ACTION</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{selectedLog.action}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>ACTOR (ADMIN / SYSTEM)</div>
                <code style={{ fontSize: 12, color: '#818cf8' }}>{selectedLog.actorId}</code>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>TARGET ENTITY</div>
                <code style={{ fontSize: 12, color: '#e2e8f0' }}>{selectedLog.targetId || 'N/A'}</code>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>RECORDED AT</div>
              <div style={{ fontSize: 13, color: '#fff' }}>{new Date(selectedLog.timestamp).toISOString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>AUDIT PAYLOAD METADATA</div>
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
                {JSON.stringify(selectedLog.details || {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
