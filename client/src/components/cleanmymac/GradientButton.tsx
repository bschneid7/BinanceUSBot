import React from 'react';

interface GradientButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  gradient?: 'cyan' | 'pink' | 'green' | 'purple';
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
}

export const GradientButton: React.FC<GradientButtonProps> = ({
  children,
  onClick,
  gradient = 'cyan',
  disabled = false,
  className = '',
  icon
}) => {
  return (
    <button
      className={`cmm-btn cmm-btn-${gradient} ${className}`}
      onClick={onClick}
      disabled={disabled}
      type="button"
    >
      {icon && <span>{icon}</span>}
      {children}
    </button>
  );
};
