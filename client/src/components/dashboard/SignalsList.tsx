import { Signal } from '@/types/trading';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SignalsListProps {
  signals: Signal[];
}

export function SignalsList({ signals }: SignalsListProps) {
  const getPlaybookName = (playbook: string) => {
    const names = {
      A: 'Breakout',
      B: 'VWAP',
      C: 'Event',
      D: 'Dip'
    };
    return names[playbook as keyof typeof names] || playbook;
  };

  return (
    <div className="space-y-3">
      {signals.length === 0 ? (
        <p className="text-center text-muted-foreground py-4">No recent signals</p>
      ) : (
        signals.map((signal) => (
          <div key={signal._id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
            <div className="flex items-center gap-3">
              {signal.action === 'EXECUTED' ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-yellow-600" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{signal.symbol}</span>
                  <Badge variant="outline">{getPlaybookName(signal.playbook)}</Badge>
                  <Badge variant={signal.action === 'EXECUTED' ? 'default' : 'secondary'}>{signal.action}</Badge>
                </div>
                {signal.reason && <p className="text-sm text-muted-foreground mt-1">{signal.reason}</p>}
                {signal.entry_price && (
                  <p className="text-sm text-muted-foreground mt-1">Entry: ${signal.entry_price.toLocaleString()}</p>
                )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(signal.timestamp), { addSuffix: true })}</span>
          </div>
        ))
      )}
    </div>
  );
}