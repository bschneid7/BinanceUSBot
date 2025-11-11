import React from 'react';

interface CircularProgressProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  gradient?: 'cyan' | 'pink' | 'green' | 'purple' | 'blue';
  label?: string;
  subtitle?: string;
}

const gradientColors = {
  cyan: { start: '#4ECDC4', end: '#44D9E6' },
  pink: { start: '#FF6B9D', end: '#FF8A80' },
  green: { start: '#5FD3A8', end: '#4CAF50' },
  purple: { start: '#9D50BB', end: '#6E48AA' },
  blue: { start: '#667EEA', end: '#764BA2' }
};

export const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  size = 120,
  strokeWidth = 10,
  gradient = 'cyan',
  label,
  subtitle
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(Math.max(value, 0), 100) / 100) * circumference;
  const colors = gradientColors[gradient];
  const gradientId = `gradient-${gradient}-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="cmm-circular-progress" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.start} />
            <stop offset="100%" stopColor={colors.end} />
          </linearGradient>
        </defs>
        <circle
          className="cmm-circular-progress-bg"
          cx={size / 2}
          cy={size / 2}
          r={radius}
        />
        <circle
          className="cmm-circular-progress-bar"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="cmm-circular-progress-text">
        {label || `${Math.round(value)}%`}
      </div>
      {subtitle && (
        <div className="cmm-circular-progress-subtitle">{subtitle}</div>
      )}
    </div>
  );
};
