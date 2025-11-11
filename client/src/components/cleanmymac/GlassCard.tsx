import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  hover = true,
  onClick
}) => {
  const hoverClass = hover ? '' : 'hover:transform-none hover:shadow-none';
  
  return (
    <div
      className={`cmm-glass-card ${hoverClass} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
};

export const GlassCardSmall: React.FC<GlassCardProps> = ({
  children,
  className = '',
  hover = true,
  onClick
}) => {
  const hoverClass = hover ? '' : 'hover:transform-none hover:shadow-none';
  
  return (
    <div
      className={`cmm-glass-card cmm-glass-card-sm ${hoverClass} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
};
