import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EquityCurveChart } from '@/components/analytics/EquityCurveChart';
import { PerformanceMetricsGrid } from '@/components/analytics/PerformanceMetricsGrid';
import { getPerformanceMetrics, getEquityCurve } from '@/api/trading';
import { PerformanceMetrics } from '@/types/trading';
import { useToast } from '@/hooks/useToast';
import { BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function Analytics() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [equityCurve, setEquityCurve] = useState<Array<{ date: string; equity: number }>>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const [metricsRes, curveRes] = await Promise.all([getPerformanceMetrics(), getEquityCurve(30)]);

      setMetrics(metricsRes.metrics);
      setEquityCurve(curveRes.data);
      setLoading(false);
    } catch (error: any) {
      console.error('Error loading analytics:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load analytics',
        variant: 'destructive'
      });
      setLoading(false);
    }
  };

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

  if (!metrics) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-8 w-8" />
          Analytics
        </h1>
        <p className="text-muted-foreground">Performance metrics and visualizations</p>
      </div>

      <PerformanceMetricsGrid metrics={metrics} />

      <EquityCurveChart data={equityCurve} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Trades:</span>
                <span className="font-semibold">{metrics.today_trades}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Wins:</span>
                <span className="font-semibold text-green-600">{metrics.today_wins}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Losses:</span>
                <span className="font-semibold text-red-600">{metrics.today_losses}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Trades:</span>
                <span className="font-semibold">{metrics.week_trades}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Wins:</span>
                <span className="font-semibold text-green-600">{metrics.week_wins}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Losses:</span>
                <span className="font-semibold text-red-600">{metrics.week_losses}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Trades:</span>
                <span className="font-semibold">{metrics.month_trades}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Wins:</span>
                <span className="font-semibold text-green-600">{metrics.month_wins}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Losses:</span>
                <span className="font-semibold text-red-600">{metrics.month_losses}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}