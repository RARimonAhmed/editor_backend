import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdminAuditLogEntry } from '../types/admin';
import { DataTable, Column } from '../components/DataTable';
import { ShieldCheck, RefreshCw, Eye, Shield, Globe, Lock } from 'lucide-react';
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
      header: 'Security Action',
      render: (l) => {
        let badgeClass = 'badge-purple';
        if (l.action.includes('LOGIN') || l.action.includes('SUCCESS')) badgeClass = 'badge-healthy';
        if (l.action.includes('CREDIT') || l.action.includes('SETTING')) badgeClass = 'badge-warning';
        if (l.action.includes('DELETE') || l.action.includes('REVOKE') || l.action.includes('FAIL')) badgeClass = 'badge-down';

        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`badge ${badgeClass}`} style={{ fontSize: 11, letterSpacing: '0.02em' }}>
              {l.action}
            </span>
          </div>
        );
      },
    },
    {
      key: 'actorId',
      header: 'Admin / Actor',
      render: (l) => (
        <div>
          <div style={{ fontWeight: 600, color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Shield size={13} color="var(--primary)" />
            {l.actorEmail || l.actorId}
          </div>
          <code style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l.actorId}</code>
        </div>
      ),
    },
    {
      key: 'resource',
      header: 'Resource',
      render: (l) => {
        const resName = l.resource || l.targetType || 'SYSTEM';
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 700,
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {resName}
          </span>
        );
      },
    },
    {
      key: 'targetId',
      header: 'Resource ID',
      render: (l) => (
        <code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {l.resourceId || l.targetId || '-'}
        </code>
      ),
    },
    {
      key: 'ipAddress',
      header: 'IP Metadata',
      render: (l) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)' }}>
          <Globe size={13} color="var(--text-muted)" />
          <span>{l.ipAddress || '127.0.0.1'}</span>
        </div>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      render: (l) => {
        const res = (l.result || 'SUCCESS').toUpperCase();
        const isSuccess = res === 'SUCCESS';
        const isDenied = res === 'DENIED';
        return (
          <span
            className={`badge ${isSuccess ? 'badge-healthy' : isDenied ? 'badge-warning' : 'badge-down'}`}
            style={{ fontSize: 11 }}
          >
            {res}
          </span>
        );
      },
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
      header: 'Audit Payload',
      render: (l) => (
        <button className="btn btn-secondary btn-sm" onClick={() => setSelectedLog(l)}>
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
            <ShieldCheck size={26} />
            Security & Operational Audit Trail
          </h1>
          <p className="page-subtitle">
            Immutable, non-repudiable audit logs tracking privileged admin actions, role modifications, credit grants, and system events.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadLogs} disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? 'pulse' : ''} />
          <span>Refresh Audit Trail</span>
        </button>
      </div>

      {/* Security notice */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: 'rgba(99, 102, 241, 0.08)',
          borderRadius: 8,
          border: '1px solid rgba(99, 102, 241, 0.2)',
          marginBottom: 20,
          fontSize: 13,
          color: '#c7d2fe',
        }}
      >
        <Lock size={18} color="#818cf8" style={{ flexShrink: 0 }} />
        <span>
          <strong>Cryptographic Secret Isolation Enforced:</strong> All database credentials, Stripe private keys, JWT signing keys, and external AI provider tokens are automatically redacted and masked before audit persistence.
        </span>
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          data={logs}
          isLoading={isLoading}
          searchPlaceholder="Search audit logs by action, actor email, resource, or IP..."
          searchFilter={(l, q) => {
            const query = q.toLowerCase();
            return (
              l.action.toLowerCase().includes(query) ||
              l.actorId.toLowerCase().includes(query) ||
              Boolean(l.actorEmail && l.actorEmail.toLowerCase().includes(query)) ||
              Boolean(l.resource && l.resource.toLowerCase().includes(query)) ||
              Boolean(l.targetId && l.targetId.toLowerCase().includes(query)) ||
              Boolean(l.ipAddress && l.ipAddress.toLowerCase().includes(query))
            );
          }}
        />
      </div>

      {/* Audit Log Details Modal */}
      <Modal
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title={`Audit Event: ${selectedLog?.action}`}
        footer={
          <button className="btn btn-secondary" onClick={() => setSelectedLog(null)}>
            Close
          </button>
        }
      >
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>EVENT ACTION</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{selectedLog.action}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ACTOR (ADMIN / SYSTEM)</div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>{selectedLog.actorEmail || selectedLog.actorId}</div>
                <code style={{ fontSize: 11, color: '#818cf8' }}>{selectedLog.actorId}</code>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>RESOURCE TARGET</div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>{selectedLog.resource || selectedLog.targetType || 'SYSTEM'}</div>
                <code style={{ fontSize: 11, color: '#e2e8f0' }}>{selectedLog.resourceId || selectedLog.targetId || 'N/A'}</code>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>IP ADDRESS METADATA</div>
                <div style={{ fontSize: 13, color: '#fff' }}>{selectedLog.ipAddress || '127.0.0.1'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>RESULT STATUS</div>
                <span className={`badge ${selectedLog.result === 'SUCCESS' ? 'badge-healthy' : 'badge-warning'}`}>
                  {selectedLog.result || 'SUCCESS'}
                </span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>RECORDED AT</div>
              <div style={{ fontSize: 13, color: '#fff' }}>{new Date(selectedLog.timestamp).toISOString()}</div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                SANITIZED AUDIT PAYLOAD (SECRETS REDACTED)
              </div>
              <pre
                style={{
                  background: '#0b0f19',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border-subtle)',
                  fontSize: 12,
                  color: '#94a3b8',
                  maxHeight: 220,
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
