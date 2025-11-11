import React from 'react';
import { GlassCard } from './GlassCard';

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  label,
  value,
  className = ''
}) => {
  return (
    <GlassCard className={`cmm-metric-card ${className}`}>
      <div className="cmm-metric-icon">{icon}</div>
      <div className="cmm-metric-label">{label}</div>
      <div className="cmm-metric-value">{value}</div>
    </GlassCard>
  );
};
