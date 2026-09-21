import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  change?: string;
  isPositive?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  subtitle,
  change,
  isPositive = true,
}) => {
  return (
    <div className="stat-card">
      <div>
        <div className="stat-card-header">
          <span className="stat-card-title">{title}</span>
          <div className="stat-card-icon">{icon}</div>
        </div>
        <div className="stat-card-value">{value}</div>
      </div>
      <div className="stat-card-footer">
        {change && (
          <span style={{ color: isPositive ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
            {isPositive ? '↑' : '↓'} {change}
          </span>
        )}
        {subtitle && <span>{subtitle}</span>}
      </div>
    </div>
  );
};
