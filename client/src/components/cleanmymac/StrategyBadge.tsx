import React from 'react';

interface StrategyBadgeProps {
  name: string;
  active?: boolean;
  gradient?: 'cyan' | 'pink' | 'green' | 'purple' | 'blue';
  onClick?: () => void;
}

export const StrategyBadge: React.FC<StrategyBadgeProps> = ({
  name,
  active = true,
  gradient = 'cyan',
  onClick
}) => {
  const initial = name.substring(0, 1).toUpperCase();

  return (
    <div 
      className="cmm-strategy-badge"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className={`cmm-strategy-icon cmm-position-icon ${gradient}`}>
        {initial}
      </div>
      <span>{name}</span>
      {active && (
        <span style={{ 
          width: '8px', 
          height: '8px', 
          borderRadius: '50%', 
          background: 'var(--cmm-success)',
          display: 'inline-block'
        }} />
      )}
    </div>
  );
};
