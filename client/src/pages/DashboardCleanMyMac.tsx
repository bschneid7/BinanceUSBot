import { useEffect, useState, useCallback } from 'react';
import { Play, Pause, Shield, TrendingUp, Activity } from 'lucide-react';
import { getBotStatus, getActivePositions } from '@/api/trading';
import { BotStatus, Position } from '@/types/trading';
import { useToast } from '@/hooks/useToast';
import { 
  CircularProgress, 
  MetricCard, 
  PositionCard, 
  StrategyBadge,
  GradientButton
} from '@/components/cleanmymac';
import '@/styles/cleanmymac.css';

export function DashboardCleanMyMac() {
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadDashboardData = useCallback(async () => {
    try {
      const [statusRes, positionsRes] = await Promise.all([
        getBotStatus(),
        getActivePositions()
      ]);

      setBotStatus(statusRes || null);
      setPositions(positionsRes?.positions || []);
      setLoading(false);
    } catch (error: unknown) {
      console.error('Error loading dashboard data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load dashboard data';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 5000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  if (loading || !botStatus) {
    return (
      <div className="cmm-dashboard">
        <div className="cmm-content">
          <div className="flex items-center justify-center h-screen">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate metrics
  const equity = botStatus.equity || 0;
  const startingCapital = botStatus.startingCapital || equity;
  const totalPnl = equity - startingCapital;
  const totalPnlPercent = ((totalPnl / startingCapital) * 100);
  
  // Calculate win rate (mock for now - you can add real data)
  const winRate = 58;
  const avgR = 2.1;
  const riskStatus = botStatus.reserveLevel >= 25 ? 'Healthy' : 'Warning';

  // Strategy gradients
  const strategyGradients: Array<'cyan' | 'pink' | 'green' | 'purple' | 'blue'> = ['cyan', 'pink', 'green', 'purple', 'blue'];
  const positionGradients: Array<'cyan' | 'pink' | 'green' | 'purple'> = ['cyan', 'pink', 'green', 'purple'];

  return (
    <div className="cmm-dashboard">
      <div className="cmm-content">
        {/* Equity Display */}
        <div className="cmm-equity-section cmm-fade-in">
          <div className="cmm-equity-value">
            ${equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="cmm-equity-label">Total Equity</div>
          <div className={`cmm-equity-change ${totalPnl >= 0 ? 'positive' : 'negative'}`}>
            {totalPnl >= 0 ? '+' : ''}${Math.abs(totalPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {' '}
            ({totalPnl >= 0 ? '+' : ''}{totalPnlPercent.toFixed(2)}%)
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="cmm-metrics-grid">
          <MetricCard
            icon={<CircularProgress value={winRate} gradient="cyan" subtitle="trades" />}
            label="Win Rate"
            value={`${botStatus.openPositions || 0} active`}
            className="cmm-fade-in-delay-1"
          />
          <MetricCard
            icon={
              <div style={{ 
                width: '120px', 
                height: '120px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <TrendingUp size={64} style={{ 
                  color: '#FF6B9D',
                  filter: 'drop-shadow(0 0 20px rgba(255, 107, 157, 0.5))'
                }} />
              </div>
            }
            label="Performance"
            value={`${avgR} Avg R`}
            className="cmm-fade-in-delay-2"
          />
          <MetricCard
            icon={
              <div style={{ 
                width: '120px', 
                height: '120px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <Shield size={64} style={{ 
                  color: '#5FD3A8',
                  filter: 'drop-shadow(0 0 20px rgba(95, 211, 168, 0.5))'
                }} />
              </div>
            }
            label="Risk Status"
            value={riskStatus}
            className="cmm-fade-in-delay-3"
          />
        </div>

        {/* Active Strategies */}
        <section className="cmm-strategies-section cmm-fade-in-delay-4">
          <h2 className="cmm-section-header">Active Strategies</h2>
          <div className="cmm-strategies-grid">
            {['Strategy A', 'Strategy B', 'Strategy C', 'Strategy D', 'Grid'].map((name, index) => (
              <StrategyBadge
                key={name}
                name={name}
                active={true}
                gradient={strategyGradients[index % strategyGradients.length]}
              />
            ))}
          </div>
        </section>

        {/* Open Positions */}
        {positions.length > 0 && (
          <section className="cmm-fade-in-delay-4">
            <h2 className="cmm-section-header">Open Positions</h2>
            <div className="cmm-positions-grid">
              {positions.slice(0, 8).map((position, index) => {
                const currentPrice = position.current_price || position.entry_price;
                const pnl = position.unrealized_pnl || 0;
                const pnlPercent = position.unrealized_pnl_pct || 0;

                return (
                  <PositionCard
                    key={position.id}
                    symbol={position.symbol}
                    side={position.side}
                    entryPrice={position.entry_price}
                    currentPrice={currentPrice}
                    quantity={position.quantity}
                    pnl={pnl}
                    pnlPercent={pnlPercent}
                    iconGradient={positionGradients[index % positionGradients.length]}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Action Button */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          marginTop: 'var(--cmm-spacing-xl)',
          marginBottom: 'var(--cmm-spacing-xl)'
        }} className="cmm-fade-in-delay-4">
          <GradientButton
            gradient="cyan"
            icon={botStatus.status === 'running' ? <Pause size={20} /> : <Play size={20} />}
          >
            {botStatus.status === 'running' ? 'Pause Trading' : 'Start Trading'}
          </GradientButton>
        </div>

        {/* Additional Stats */}
        <div className="cmm-metrics-grid cmm-fade-in-delay-4" style={{ marginTop: 'var(--cmm-spacing-xl)' }}>
          <div className="cmm-glass-card cmm-glass-card-sm">
            <div style={{ textAlign: 'center' }}>
              <div style={{ 
                fontSize: '2rem', 
                fontWeight: '600', 
                color: 'var(--cmm-text-primary)',
                marginBottom: '8px'
              }}>
                ${botStatus.availableCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ 
                fontSize: '0.875rem', 
                color: 'var(--cmm-text-secondary)' 
              }}>
                Available Capital
              </div>
            </div>
          </div>

          <div className="cmm-glass-card cmm-glass-card-sm">
            <div style={{ textAlign: 'center' }}>
              <div style={{ 
                fontSize: '2rem', 
                fontWeight: '600', 
                color: botStatus.dailyPnl >= 0 ? 'var(--cmm-success-light)' : 'var(--cmm-error-light)',
                marginBottom: '8px'
              }}>
                {botStatus.dailyPnl >= 0 ? '+' : ''}${botStatus.dailyPnl.toFixed(2)}
              </div>
              <div style={{ 
                fontSize: '0.875rem', 
                color: 'var(--cmm-text-secondary)' 
              }}>
                Daily P&L
              </div>
            </div>
          </div>

          <div className="cmm-glass-card cmm-glass-card-sm">
            <div style={{ textAlign: 'center' }}>
              <div style={{ 
                fontSize: '2rem', 
                fontWeight: '600', 
                color: 'var(--cmm-text-primary)',
                marginBottom: '8px'
              }}>
                {botStatus.reserveLevel.toFixed(1)}%
              </div>
              <div style={{ 
                fontSize: '0.875rem', 
                color: 'var(--cmm-text-secondary)' 
              }}>
                Reserve Level
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
