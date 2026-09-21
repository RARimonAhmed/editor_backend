import React from 'react';
import { Settings, Shield, Server, Cpu, HardDrive, Key, Database } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const configs = [
    {
      group: 'Core Server Runtime',
      icon: Server,
      items: [
        { label: 'Environment', value: 'production (local test cluster)', safe: true },
        { label: 'HTTP Port', value: '4000', safe: true },
        { label: 'CORS Origins', value: 'http://localhost:3000, http://localhost:5173, *', safe: true },
        { label: 'Rate Limiting', value: '1,000 requests / 60 seconds (DDoS protection)', safe: true },
        { label: 'Central Logging', value: 'Pino JSON structured logger with Request-ID tracing', safe: true },
      ],
    },
    {
      group: 'Object Storage & Media Pipeline',
      icon: HardDrive,
      items: [
        { label: 'Storage Driver', value: 'MinIO / AWS S3 S3Compatible Driver', safe: true },
        { label: 'Storage Bucket', value: 'editor-media', safe: true },
        { label: 'Transcoder Engine', value: 'FFmpeg 6.0 static binary with hardware acceleration', safe: true },
        { label: 'Audio Waveform Probe', value: 'FFprobe JSON audio wave generator (800 sample points)', safe: true },
        { label: 'Presigned URL Expiry', value: '3,600 seconds (1 hour)', safe: true },
      ],
    },
    {
      group: 'Multi-Modal AI Gateway',
      icon: Cpu,
      items: [
        { label: 'Google Gemini Pro & Flash', value: 'Configured & Active (Vision, JSON, Text, STT)', safe: true },
        { label: 'OpenAI GPT-4o & Whisper', value: 'Configured & Fallback Active', safe: true },
        { label: 'Server-Side Secret Isolation', value: 'Enforced (No AI API keys exposed to Flutter)', safe: true },
        { label: 'Provider Failover', value: 'Automatic fallback to secondary provider with backoff', safe: true },
      ],
    },
    {
      group: 'Database & Distributed Queue',
      icon: Database,
      items: [
        { label: 'Primary Relational Database', value: 'PostgreSQL 16 (Connection Pool 20 clients)', safe: true },
        { label: 'Cache & Pub/Sub', value: 'Redis Cluster / Standalone (fallback memory active)', safe: true },
        { label: 'Distributed Queue', value: 'BullMQ 5.x (media_processing, render_export, ai_job)', safe: true },
        { label: 'Dead Letter Queue', value: 'Enabled with max 3 automatic retries and backoff', safe: true },
      ],
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Settings size={26} />
            Platform Architecture & Environment Settings
          </h1>
          <p className="page-subtitle">
            System configuration, storage driver parameters, rate limit thresholds, and AI gateway settings.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 24 }}>
        {configs.map((group, idx) => {
          const Icon = group.icon;
          return (
            <div key={idx} className="card">
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
                  <Icon size={18} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{group.group}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {group.items.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      borderRadius: 8,
                      border: '1px solid var(--border-subtle)',
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                    <span style={{ fontWeight: 600, color: '#fff' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
