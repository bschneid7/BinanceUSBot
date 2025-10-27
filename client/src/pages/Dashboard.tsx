import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusCard } from '@/components/dashboard/StatusCard';
import { BotStatusBadge } from '@/components/dashboard/BotStatusBadge';
import { PositionsTable } from '@/components/dashboard/PositionsTable';
import { SignalsList } from '@/components/dashboard/SignalsList';
import { AlertsList } from '@/components/dashboard/AlertsList';
import GridTradingDashboard from '@/components/GridTradingDashboard';
import BotActivityFeed from '@/components/BotActivityFeed';
import { AlertTriangle, Info } from 'lucide-react';
import { Alert as UIAlert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getBotStatus, getActivePositions, getRecentSignals, getAlerts } from '@/api/trading';
import { BotStatus, Position, Signal, Alert } from '@/types/trading';
import { DollarSign, TrendingUp, TrendingDown, Activity, Wallet, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { Skeleton } from '@/components/ui/skeleton';

export function Dashboard() {
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadDashboardData = useCallback(async () => {
    try {
      const [statusRes, positionsRes, signalsRes, alertsRes] = await Promise.all([
        getBotStatus(),
        getActivePositions(),
        getRecentSignals(10),
        getAlerts(20)
      ]);

      setBotStatus(statusRes || null);
      setPositions(positionsRes?.positions || []);
      setSignals(signalsRes?.signals || []);
      setAlerts(alertsRes?.alerts || []);
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

  const formatCurrency = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatR = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!botStatus) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trading Dashboard</h1>
          <p className="text-muted-foreground">Autonomous Binance.US Spot Trading Bot</p>
        </div>
        <BotStatusBadge status={botStatus.status} />
      </div>

      {/* Layer 4: Dashboard Warning Banners */}
      {botStatus.openPositions >= botStatus.maxPositions && (
        <UIAlert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Bot Blocked - Maximum Positions Reached</AlertTitle>
          <AlertDescription>
            You have {botStatus.openPositions} open positions (limit: {botStatus.maxPositions}). 
            The bot cannot open new trades until positions are closed. Close at least one position to resume trading.
          </AlertDescription>
        </UIAlert>
      )}

      {botStatus.openPositions >= (botStatus.maxPositions * 0.8) && botStatus.openPositions < botStatus.maxPositions && (
        <UIAlert>
          <Info className="h-4 w-4" />
          <AlertTitle>Approaching Position Limit</AlertTitle>
          <AlertDescription>
            You have {botStatus.openPositions} of {botStatus.maxPositions} positions open ({((botStatus.openPositions / botStatus.maxPositions) * 100).toFixed(0)}%). 
            Consider closing some positions to make room for new high-quality signals.
          </AlertDescription>
        </UIAlert>
      )}

      {positions.filter(p => (!p.stop_price || p.stop_price === 0) && p.symbol !== 'APEUSD').length > 0 && (
        <UIAlert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Positions Without Stop-Loss Detected</AlertTitle>
          <AlertDescription>
            {positions.filter(p => (!p.stop_price || p.stop_price === 0) && p.symbol !== 'APEUSD').length} position(s) have no stop-loss set. 
            These will be automatically closed after 24 hours. Set stop-loss immediately to protect your capital.
          </AlertDescription>
        </UIAlert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="Account Equity"
          value={formatCurrency(botStatus.equity)}
          subtitle={`Available: ${formatCurrency(botStatus.availableCapital)}`}
          icon={DollarSign}
          trend="neutral"
        />
        <StatusCard
          title="Daily P&L"
          value={formatCurrency(botStatus.dailyPnl)}
          subtitle={formatR(botStatus.dailyPnlR)}
          icon={botStatus.dailyPnl >= 0 ? TrendingUp : TrendingDown}
          trend={botStatus.dailyPnl >= 0 ? 'up' : 'down'}
        />
        <StatusCard
          title="Weekly P&L"
          value={formatCurrency(botStatus.weeklyPnl)}
          subtitle={formatR(botStatus.weeklyPnlR)}
          icon={botStatus.weeklyPnl >= 0 ? TrendingUp : TrendingDown}
          trend={botStatus.weeklyPnl >= 0 ? 'up' : 'down'}
        />
        <StatusCard
          title="Reserve Level"
          value={formatPercent(botStatus.reserveLevel)}
          subtitle={`Target: 30%`}
          icon={Wallet}
          trend={botStatus.reserveLevel >= 30 ? 'up' : 'down'}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Open Positions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Count:</span>
                <span className="font-semibold">{botStatus.openPositions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Risk:</span>
                <span className="font-semibold">{formatR(botStatus.totalOpenRiskR)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Exposure:</span>
                <span className="font-semibold">{formatPercent(botStatus.totalExposurePct)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Status:</span>
                <span className="font-semibold text-green-600">{botStatus.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Open Positions:</span>
                <span className="font-semibold">{botStatus.openPositions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Reserve:</span>
                <span className="font-semibold">{formatPercent(botStatus.reserveLevel)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Risk Limits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Daily Limit:</span>
                <span className="font-semibold">{formatR(botStatus.dailyPnlR)} / -2.0R</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Weekly Limit:</span>
                <span className="font-semibold">{formatR(botStatus.weeklyPnlR)} / -6.0R</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Max Open Risk:</span>
                <span className="font-semibold">{formatR(botStatus.totalOpenRiskR)} / 2.0R</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <PositionsTable positions={positions} />
        </CardContent>
      </Card>

      {/* Grid Trading Section */}
      <GridTradingDashboard />

      {/* Bot Activity Feed */}
      <BotActivityFeed />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Signals</CardTitle>
          </CardHeader>
          <CardContent>
            <SignalsList signals={signals} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <AlertsList alerts={alerts} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}