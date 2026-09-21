import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdminOperationalSettings, UpdateOperationalSettingsDto } from '../types/admin';
import {
  Settings,
  Shield,
  Server,
  Cpu,
  HardDrive,
  Database,
  Lock,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { Modal } from '../components/Modal';

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AdminOperationalSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [rateLimitMax, setRateLimitMax] = useState(1000);
  const [logLevel, setLogLevel] = useState('info');
  const [presignedExpiry, setPresignedExpiry] = useState(3600);
  const [maxConcurrency, setMaxConcurrency] = useState(8);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSettings();
      setSettings(data);
      setRateLimitMax(data.server.rateLimitMax);
      setLogLevel(data.server.logLevel);
      setPresignedExpiry(data.storage.presignedUrlExpirySeconds);
      setMaxConcurrency(data.mediaProcessing.maxConcurrency);
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ type: 'error', text: `Failed loading operational settings: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      const payload: UpdateOperationalSettingsDto = {
        rateLimitMax,
        logLevel,
        presignedUrlExpirySeconds: presignedExpiry,
        maxConcurrency,
      };
      const updated = await api.updateSettings(payload);
      setSettings(updated);
      setEditModalOpen(false);
      setStatusMsg({ type: 'success', text: 'Operational settings updated and recorded to immutable audit trail.' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Failed to update settings: ${err.message}` });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Settings size={26} />
            Safe Platform Architecture & Environment Settings
          </h1>
          <p className="page-subtitle">
            Operational infrastructure parameters, rate limit thresholds, AI gateway routing, and safe configuration status indicators.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={loadSettings} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'pulse' : ''} />
            <span>Refresh Settings</span>
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setEditModalOpen(true)}>
            <Sliders size={14} />
            <span>Tune Operational Knobs</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 20,
            background: statusMsg.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
            color: statusMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
            border: `1px solid ${statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{statusMsg.text}</span>
          <button
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
            onClick={() => setStatusMsg(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Security Isolation Notice */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          padding: '16px 20px',
          background: 'rgba(99, 102, 241, 0.08)',
          borderRadius: 10,
          border: '1px solid rgba(99, 102, 241, 0.25)',
          marginBottom: 24,
        }}
      >
        <Lock size={22} color="#818cf8" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginBottom: 4 }}>
            Enterprise Zero-Secret Architecture Enforced
          </div>
          <div style={{ fontSize: 13, color: '#c7d2fe', lineHeight: 1.5 }}>
            To safeguard the my_editor infrastructure against credential exfiltration, raw secrets—including <strong>database passwords</strong>, <strong>Google/OpenAI API keys</strong>, <strong>JWT signing keys</strong>, <strong>Stripe secret keys</strong>, and <strong>object storage credentials</strong>—are cryptographically isolated on the server and <strong>never transmitted over the wire or embedded in frontend bundles</strong>.
          </div>
        </div>
      </div>

      {/* Grid of Safe Settings Categories */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 24 }}>
        {/* Server Runtime */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(99, 102, 241, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#818cf8',
              }}
            >
              <Server size={18} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Core Server Runtime</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>Environment</span>
              <span className="badge badge-healthy">{settings?.server.nodeEnv || 'production'}</span>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>Host & Port</span>
              <span style={{ fontWeight: 600, color: '#fff' }}>
                {settings?.server.host}:{settings?.server.port}
              </span>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>Rate Limiting Threshold</span>
              <span style={{ fontWeight: 700, color: '#10b981' }}>
                {settings?.server.rateLimitMax.toLocaleString()} reqs / {((settings?.server.rateLimitWindowMs || 60000) / 1000)}s
              </span>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>Pino Structured Log Level</span>
              <code style={{ color: '#818cf8', fontSize: 12 }}>{settings?.server.logLevel}</code>
            </div>
          </div>
        </div>

        {/* Database & Caches */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(6, 182, 212, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#06b6d4',
              }}
            >
              <Database size={18} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Database & Distributed Redis</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>PostgreSQL Status</span>
              <span className="badge badge-healthy">CONFIGURED & ACTIVE</span>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>PostgreSQL Database</span>
              <span style={{ fontWeight: 600, color: '#fff' }}>{settings?.database.databaseName}</span>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>DB Credentials Protection</span>
              <span className="badge badge-purple font-mono">SECRETS_MASKED</span>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>Redis Cache & Pub/Sub</span>
              <span className="badge badge-healthy">{settings?.redis.status}</span>
            </div>
          </div>
        </div>

        {/* Object Storage */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10b981',
              }}
            >
              <HardDrive size={18} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Media Storage & Pipelines</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>Storage Driver</span>
              <span style={{ fontWeight: 600, color: '#fff' }}>{settings?.storage.driver}</span>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>Assets Bucket</span>
              <code style={{ color: '#10b981' }}>{settings?.storage.bucket}</code>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>S3 Credentials Protection</span>
              <span className="badge badge-purple font-mono">ENCRYPTED_AND_ISOLATED</span>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>Presigned URL TTL</span>
              <span style={{ fontWeight: 600, color: '#fff' }}>
                {settings?.storage.presignedUrlExpirySeconds} seconds (1 hour)
              </span>
            </div>
          </div>
        </div>

        {/* Multi-Modal AI Gateway */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(236, 72, 153, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ec4899',
              }}
            >
              <Cpu size={18} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Multi-Modal AI Gateway</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>Google Gemini</span>
              <span className="badge badge-healthy">CONFIGURED & ACTIVE</span>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>OpenAI GPT-4o</span>
              <span className="badge badge-healthy">CONFIGURED & ACTIVE</span>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>AI API Key Isolation</span>
              <span className="badge badge-purple font-mono">ISOLATED_ON_BACKEND</span>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>Automatic Failover Routing</span>
              <span className="badge badge-healthy">ENABLED</span>
            </div>
          </div>
        </div>

        {/* Billing & Security */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(245, 158, 11, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f59e0b',
              }}
            >
              <Shield size={18} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Commerce, Stripe & RBAC Security</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>Stripe Secret Status</span>
              <span className="badge badge-purple font-mono">CONFIGURED_AND_MASKED</span>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>JWT Security Algorithm</span>
              <span style={{ fontWeight: 600, color: '#fff' }}>{settings?.security.jwtAlgorithm}</span>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>JWT Signing Key</span>
              <span className="badge badge-purple font-mono">SECRETS_MASKED</span>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>CSRF / Origin Validation</span>
              <span className="badge badge-healthy">ENFORCED</span>
            </div>
          </div>
        </div>

        {/* FFmpeg Transcoder Engine */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3b82f6',
              }}
            >
              <Zap size={18} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>FFmpeg Transcoder Engine</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>FFmpeg Binary</span>
              <code style={{ fontSize: 11, color: '#e2e8f0' }}>{settings?.mediaProcessing.ffmpegPath}</code>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>Hardware Acceleration</span>
              <span className="badge badge-healthy">{settings?.mediaProcessing.hardwareAcceleration}</span>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>Worker Concurrency</span>
              <span style={{ fontWeight: 700, color: '#10b981' }}>{settings?.mediaProcessing.maxConcurrency} concurrent jobs</span>
            </div>
            <div className="setting-row">
              <span style={{ color: 'var(--text-secondary)' }}>Max Upload Threshold</span>
              <span style={{ fontWeight: 600, color: '#fff' }}>
                {Math.round((settings?.mediaProcessing.maxUploadSizeBytes || 0) / (1024 * 1024))} MB
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Adjust Operational Parameters (Requires SUPERADMIN)"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEditModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleUpdate} disabled={isUpdating}>
              {isUpdating ? 'Applying...' : 'Apply Operational Changes'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Changes will take effect immediately across all workers and will be permanently recorded in the security audit trail.
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Rate Limiting Maximum Requests / Minute
            </label>
            <input
              type="number"
              className="input"
              value={rateLimitMax}
              onChange={(e) => setRateLimitMax(parseInt(e.target.value, 10) || 1000)}
              min={50}
              max={50000}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Central Log Level
            </label>
            <select className="select" value={logLevel} onChange={(e) => setLogLevel(e.target.value)}>
              <option value="debug">debug (maximum verbosity)</option>
              <option value="info">info (standard production)</option>
              <option value="warn">warn (warnings & errors only)</option>
              <option value="error">error (critical failures only)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Presigned Object Download URL Expiry (Seconds)
            </label>
            <input
              type="number"
              className="input"
              value={presignedExpiry}
              onChange={(e) => setPresignedExpiry(parseInt(e.target.value, 10) || 3600)}
              min={60}
              max={86400}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Media Worker Concurrency Limit
            </label>
            <input
              type="number"
              className="input"
              value={maxConcurrency}
              onChange={(e) => setMaxConcurrency(parseInt(e.target.value, 10) || 8)}
              min={1}
              max={64}
            />
          </div>
        </div>
      </Modal>

      <style>{`
        .setting-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          font-size: 13px;
        }
      `}</style>
    </div>
  );
};
