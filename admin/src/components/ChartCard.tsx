import React, { useState } from 'react';

interface DataPoint {
  date: string;
  value: number;
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  data: DataPoint[];
  type?: 'area' | 'bar';
  color?: string;
  unit?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  data,
  type = 'area',
  color = '#6366f1',
  unit = '',
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No telemetry data available</div>
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 10);
  const range = max - min || 1;

  const width = 500;
  const height = 180;
  const padding = 20;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  // Calculate points
  const points = data.map((d, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * chartW;
    const y = height - padding - ((d.value - min) / range) * chartH;
    return { x, y, data: d };
  });

  // Area Path
  let pathD = '';
  if (points.length > 0) {
    pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cx = (prev.x + curr.x) / 2;
      pathD += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
    }
  }
  const areaD = `${pathD} L ${points[points.length - 1]?.x} ${height - padding} L ${points[0]?.x} ${height - padding} Z`;

  const gradientId = `gradient-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          {hoveredPoint ? (
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: color }}>
                {hoveredPoint.value.toLocaleString()} {unit}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hoveredPoint.date}</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
                {(values[values.length - 1] ?? 0).toLocaleString()} {unit}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Latest reading</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ width: '100%', height: 180 }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.4" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
          <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.08)" />

          {type === 'area' ? (
            <>
              <path d={areaD} fill={`url(#${gradientId})`} />
              <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
              {points.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r="3.5"
                  fill="#0b0f19"
                  stroke={color}
                  strokeWidth="2"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredPoint(p.data)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              ))}
            </>
          ) : (
            points.map((p, i) => {
              const barW = Math.max(chartW / points.length - 8, 8);
              const barH = height - padding - p.y;
              return (
                <rect
                  key={i}
                  x={p.x - barW / 2}
                  y={p.y}
                  width={barW}
                  height={Math.max(barH, 2)}
                  rx="3"
                  fill={hoveredPoint === p.data ? '#fff' : color}
                  opacity={hoveredPoint && hoveredPoint !== p.data ? 0.4 : 0.85}
                  style={{ cursor: 'pointer', transition: 'opacity 0.2s, fill 0.2s' }}
                  onMouseEnter={() => setHoveredPoint(p.data)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              );
            })
          )}
        </svg>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        <span>{data[0]?.date}</span>
        <span>{data[Math.floor(data.length / 2)]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
};
