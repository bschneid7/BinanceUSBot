import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PerformanceMetrics } from '@/types/trading';
import { TrendingUp, Target, Award, TrendingDown } from 'lucide-react';

interface PerformanceMetricsGridProps {
  metrics: PerformanceMetrics;
}

export function PerformanceMetricsGrid({ metrics }: PerformanceMetricsGridProps) {
  const formatPercent = (value: number) => `${value.toFixed(1)}%`;
  const formatR = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Trades</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.total_trades}</div>
          <p className="text-xs text-muted-foreground">Win Rate: {formatPercent(metrics.win_rate)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Profit Factor</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.profit_factor.toFixed(2)}</div>
          <p className="text-xs text-muted-foreground">Average R: {formatR(metrics.average_r)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Best Trade</CardTitle>
          <Award className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{formatR(metrics.best_trade_r)}</div>
          <p className="text-xs text-muted-foreground">Sharpe: {metrics.sharpe_ratio.toFixed(2)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Max Drawdown</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">{formatR(metrics.max_drawdown_r)}</div>
          <p className="text-xs text-muted-foreground">Worst: {formatR(metrics.worst_trade_r)}</p>
        </CardContent>
      </Card>
    </div>
  );
}