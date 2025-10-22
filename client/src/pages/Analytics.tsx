import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EquityCurveChart } from '@/components/analytics/EquityCurveChart';
import { getPerformanceMetrics, getEquityCurve } from '@/api/trading';
import { useToast } from '@/hooks/useToast';
import { BarChart3, AlertTriangle, TrendingUp, TrendingDown, DollarSign, Target } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

// Type for the actual backend response
interface BackendMetrics {
  startingEquity: number;
  currentEquity: number;
  totalPnl: number;
  totalPnlPct: number;
  dailyPnl: number;
  weeklyPnl: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
}

export function Analytics() {
  const [metrics, setMetrics] = useState<BackendMetrics | null>(null);
  const [equityCurve, setEquityCurve] = useState<Array<{ date: string; equity: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [metricsRes, curveRes] = await Promise.all([
        getPerformanceMetrics(),
        getEquityCurve(30)
      ]);

      if (metricsRes?.metrics && typeof metricsRes.metrics === 'object') {
        setMetrics(metricsRes.metrics as BackendMetrics);
      } else {
        console.warn('Received invalid or missing metrics data:', metricsRes);
        setMetrics(null);
      }

      if (curveRes?.data && Array.isArray(curveRes.data)) {
        setEquityCurve(curveRes.data);
      } else {
        console.warn('Received invalid or missing equity curve data:', curveRes);
        setEquityCurve([]);
      }

      if (!metricsRes?.metrics || !curveRes?.data) {
        setError('Failed to load some or all analytics data.');
        toast({
          title: 'Partial Data Load',
          description: 'Could not load all analytics data.',
          variant: 'destructive',
        });
      }

    } catch (error: unknown) {
      console.error('Error loading analytics:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load analytics data';
      setError(errorMessage);
      toast({
        title: 'Error Loading Analytics',
        description: errorMessage,
        variant: 'destructive'
      });
      setMetrics(null);
      setEquityCurve([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Loading State
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  // Error State
  if (error && !metrics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2 text-destructive">Failed to Load Analytics</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={loadAnalytics}>
          Retry Loading
        </Button>
      </div>
    );
  }

  // No Metrics Data State
  if (!metrics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center">
        <BarChart3 className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold mb-2">No Analytics Data Available</h2>
        <p className="text-muted-foreground mb-4">Performance metrics could not be loaded or calculated yet.</p>
        {error && <p className="text-sm text-destructive mb-4">{error}</p>}
        <Button onClick={loadAnalytics}>
          Try Reloading
        </Button>
      </div>
    );
  }

  // Success State
  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;
  const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Page Title */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-8 w-8" />
          Analytics
        </h1>
        <p className="text-muted-foreground">Performance metrics and visualizations</p>
      </div>

      {/* Partial Error Warning */}
      {error && metrics && (
        <div className="p-4 bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 rounded-md text-yellow-800 dark:text-yellow-200 text-sm">
          <AlertTriangle className="inline h-4 w-4 mr-2" />
          {error} Some parts of the page might be incomplete.
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Equity</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.currentEquity)}</div>
            <p className="text-xs text-muted-foreground">
              Starting: {formatCurrency(metrics.startingEquity)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(metrics.totalPnl)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatPercent(metrics.totalPnlPct)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(metrics.winRate * 100)}</div>
            <p className="text-xs text-muted-foreground">
              Profit Factor: {metrics.profitFactor.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Max Drawdown</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(metrics.maxDrawdown)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatPercent(metrics.maxDrawdownPct)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Equity Curve Chart */}
      {equityCurve.length > 0 ? (
        <EquityCurveChart data={equityCurve} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Equity Curve</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center text-muted-foreground">
            No equity data available to display the chart.
          </CardContent>
        </Card>
      )}

      {/* Period Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Daily P&L:</span>
                <span className={`font-semibold ${metrics.dailyPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(metrics.dailyPnl)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Weekly P&L:</span>
                <span className={`font-semibold ${metrics.weeklyPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(metrics.weeklyPnl)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Advanced Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Sharpe Ratio:</span>
              <span className="font-semibold">{metrics.sharpeRatio.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Profit Factor:</span>
              <span className="font-semibold">{metrics.profitFactor.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

