import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trade } from '@/types/trading';
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { Fragment } from 'react';

interface TradeHistoryTableProps {
  trades: Trade[];
}

export function TradeHistoryTable({ trades }: TradeHistoryTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const formatCurrency = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatR = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;

  const getPlaybookName = (playbook: string) => {
    const names = {
      A: 'Breakout',
      B: 'VWAP',
      C: 'Event',
      D: 'Dip'
    };
    return names[playbook as keyof typeof names] || playbook;
  };

  const getOutcomeIcon = (outcome: Trade['outcome']) => {
    if (outcome === 'WIN') return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (outcome === 'LOSS') return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-600" />;
  };

  const getOutcomeBadge = (outcome: Trade['outcome']) => {
    const variants = {
      WIN: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      LOSS: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      BREAKEVEN: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    };
    return <Badge className={variants[outcome]}>{outcome}</Badge>;
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]"></TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Symbol</TableHead>
            <TableHead>Playbook</TableHead>
            <TableHead>Entry</TableHead>
            <TableHead>Exit</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>P&L ($)</TableHead>
            <TableHead>P&L (R)</TableHead>
            <TableHead>Fees</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Outcome</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="text-center text-muted-foreground">
                No trades found
              </TableCell>
            </TableRow>
          ) : (
            trades.map((trade) => {
              const isExpanded = expandedRow === trade._id;
              const isProfitable = trade.pnl_usd >= 0;

              return (
                <Fragment key={trade._id}>
                  <TableRow className="cursor-pointer hover:bg-accent/50" onClick={() => setExpandedRow(isExpanded ? null : trade._id)}>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                    <TableCell>{format(new Date(trade.date), 'MM/dd HH:mm')}</TableCell>
                    <TableCell className="font-medium">{trade.symbol}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getPlaybookName(trade.playbook)}</Badge>
                    </TableCell>
                    <TableCell>{formatCurrency(trade.entry_price)}</TableCell>
                    <TableCell>{formatCurrency(trade.exit_price)}</TableCell>
                    <TableCell>{trade.quantity.toFixed(4)}</TableCell>
                    <TableCell className={isProfitable ? 'text-green-600' : 'text-red-600'}>
                      {getOutcomeIcon(trade.outcome)}
                      {formatCurrency(trade.pnl_usd)}
                    </TableCell>
                    <TableCell className={isProfitable ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>{formatR(trade.pnl_r)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatCurrency(trade.fees)}</TableCell>
                    <TableCell className="text-muted-foreground">{trade.hold_time}</TableCell>
                    <TableCell>{getOutcomeBadge(trade.outcome)}</TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={12} className="bg-muted/50">
                        <div className="p-4">
                          <h4 className="font-semibold mb-2">Trade Notes</h4>
                          <p className="text-sm text-muted-foreground">{trade.notes || 'No notes available'}</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}