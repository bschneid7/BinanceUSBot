import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TradeHistoryTable } from '@/components/trades/TradeHistoryTable';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getTradeHistory } from '@/api/trading';
import { Trade } from '@/types/trading';
import { useToast } from '@/hooks/useToast';
import { History, Filter } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function TradeHistory() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [playbookFilter, setPlaybookFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const { toast } = useToast();

  const loadTrades = useCallback(async () => {
    try {
      const filters: Record<string, string> = {};
      if (playbookFilter !== 'all') filters.playbook = playbookFilter;
      if (outcomeFilter !== 'all') filters.outcome = outcomeFilter;

      const response = await getTradeHistory(filters);
      setTrades(response.trades);
      setLoading(false);
    } catch (error: unknown) {
      console.error('Error loading trades:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load trade history';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
      setLoading(false);
    }
  }, [playbookFilter, outcomeFilter, toast]);

  useEffect(() => {
    loadTrades();
  }, [loadTrades]);

  const handleReset = () => {
    setPlaybookFilter('all');
    setOutcomeFilter('all');
  };

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
            <History className="h-8 w-8" />
            Trade History
          </h1>
          <p className="text-muted-foreground">Historical trades with filtering</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleReset}>
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Playbook</label>
              <Select value={playbookFilter} onValueChange={setPlaybookFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Playbooks</SelectItem>
                  <SelectItem value="A">Breakout (A)</SelectItem>
                  <SelectItem value="B">VWAP (B)</SelectItem>
                  <SelectItem value="C">Event (C)</SelectItem>
                  <SelectItem value="D">Dip (D)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Outcome</label>
              <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Outcomes</SelectItem>
                  <SelectItem value="WIN">Wins</SelectItem>
                  <SelectItem value="LOSS">Losses</SelectItem>
                  <SelectItem value="BREAKEVEN">Breakeven</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trade Details</CardTitle>
        </CardHeader>
        <CardContent>
          <TradeHistoryTable trades={trades} />
        </CardContent>
      </Card>
    </div>
  );
}