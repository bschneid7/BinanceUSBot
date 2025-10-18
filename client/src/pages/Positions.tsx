import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PositionsTable } from '@/components/dashboard/PositionsTable';
import { getActivePositions } from '@/api/trading';
import { Position } from '@/types/trading';
import { useToast } from '@/hooks/useToast';
import { Activity } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function Positions() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadPositions = useCallback(async () => {
    try {
      const response = await getActivePositions();
      setPositions(response.positions);
      setLoading(false);
    } catch (error: unknown) {
      console.error('Error loading positions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load positions';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadPositions();
    const interval = setInterval(loadPositions, 3000);
    return () => clearInterval(interval);
  }, [loadPositions]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-8 w-8" />
            Active Positions
          </h1>
          <p className="text-muted-foreground">Real-time position monitoring</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{positions.length}</div>
          <div className="text-sm text-muted-foreground">Open Positions</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Position Details</CardTitle>
        </CardHeader>
        <CardContent>
          <PositionsTable positions={positions} />
        </CardContent>
      </Card>
    </div>
  );
}