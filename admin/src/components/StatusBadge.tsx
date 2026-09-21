import React from 'react';

interface StatusBadgeProps {
  status: string;
  pulse?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, pulse = false }) => {
  const norm = (status || '').toLowerCase();

  let badgeClass = 'badge-info';
  if (['healthy', 'active', 'completed', 'success', 'ready'].includes(norm)) {
    badgeClass = 'badge-healthy';
  } else if (['degraded', 'running', 'processing', 'pro', 'in_progress'].includes(norm)) {
    badgeClass = 'badge-degraded';
  } else if (['down', 'failed', 'suspended', 'error', 'deleted'].includes(norm)) {
    badgeClass = 'badge-down';
  } else if (['admin', 'superadmin'].includes(norm)) {
    badgeClass = 'badge-admin';
  } else if (['queued', 'pending', 'waiting', 'user'].includes(norm)) {
    badgeClass = 'badge-queued';
  }

  const shouldPulse = pulse || ['running', 'processing', 'degraded'].includes(norm);

  return (
    <span className={`badge ${badgeClass}`}>
      <span className={`status-dot ${shouldPulse ? 'pulse' : ''}`} />
      {status}
    </span>
  );
};
