import React from 'react';

interface PositionCardProps {
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  iconGradient?: 'cyan' | 'pink' | 'green' | 'purple';
}

export const PositionCard: React.FC<PositionCardProps> = ({
  symbol,
  side,
  entryPrice,
  currentPrice,
  quantity,
  pnl,
  pnlPercent,
  iconGradient = 'cyan'
}) => {
  const isProfitable = pnl >= 0;
  const symbolInitial = symbol.substring(0, 1);

  return (
    <div className="cmm-position-card">
      <div className="cmm-position-header">
        <div className={`cmm-position-icon ${iconGradient}`}>
          {symbolInitial}
        </div>
        <div>
          <div className="cmm-position-symbol">{symbol}</div>
          <div className="cmm-position-side">{side}</div>
        </div>
      </div>

      <div className="cmm-position-details">
        <div className="cmm-position-detail">
          <span className="cmm-position-detail-label">Entry</span>
          <span className="cmm-position-detail-value">
            ${entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="cmm-position-detail">
          <span className="cmm-position-detail-label">Current</span>
          <span className="cmm-position-detail-value">
            ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="cmm-position-detail">
          <span className="cmm-position-detail-label">P&L</span>
          <span className={`cmm-position-pnl ${isProfitable ? 'positive' : 'negative'}`}>
            {isProfitable ? '+' : ''}${Math.abs(pnl).toFixed(2)}
            <br />
            <small style={{ fontSize: '0.875rem' }}>
              ({isProfitable ? '+' : ''}{pnlPercent.toFixed(2)}%)
            </small>
          </span>
        </div>
      </div>
    </div>
  );
};
