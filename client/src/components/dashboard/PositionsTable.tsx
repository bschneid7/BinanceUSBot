import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Position } from '@/types/trading';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface PositionsTableProps {
  positions: Position[];
}

export function PositionsTable({ positions }: PositionsTableProps) {
  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) return '$0.00';
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const formatR = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) return '0.00R';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
  };

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
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Entry</TableHead>
            <TableHead>Current</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Notional</TableHead>
            <TableHead>Stop</TableHead>
            <TableHead>P&L ($)</TableHead>
            <TableHead>P&L (R)</TableHead>
            <TableHead>Playbook</TableHead>
            <TableHead>Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted-foreground">
                No active positions
              </TableCell>
            </TableRow>
          ) : (
            positions.map((position) => {
              const notional = position.quantity * (position.current_price || position.entry_price);
              const isProfitable = (position.unrealized_pnl || 0) >= 0;

              return (
                <TableRow key={position._id}>
                  <TableCell className="font-medium">{position.symbol}</TableCell>
                  <TableCell>{formatCurrency(position.entry_price)}</TableCell>
                  <TableCell>{formatCurrency(position.current_price || position.entry_price)}</TableCell>
                  <TableCell>{position.quantity.toFixed(4)}</TableCell>
                  <TableCell>{formatCurrency(notional)}</TableCell>
                  <TableCell>{formatCurrency(position.stop_price)}</TableCell>
                  <TableCell className={isProfitable ? 'text-green-600' : 'text-red-600'}>
                    {isProfitable ? <TrendingUp className="inline h-4 w-4 mr-1" /> : <TrendingDown className="inline h-4 w-4 mr-1" />}
                    {formatCurrency(position.unrealized_pnl || 0)}
                  </TableCell>
                  <TableCell className={isProfitable ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                    {formatR(position.unrealized_r || 0)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{getPlaybookName(position.playbook)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{position.hold_time}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}