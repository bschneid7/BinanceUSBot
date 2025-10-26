import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { Receipt, Download, Filter, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface Transaction {
  _id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  total: number;
  fees: number;
  type: string;
  orderId?: string;
  timestamp: string;
}

interface TransactionSummary {
  total: number;
  buys: number;
  sells: number;
  totalFees: number;
  totalVolume: number;
}

// Transaction History Component - for tax reporting
export function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [symbolFilter, setSymbolFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const { toast } = useToast();

  const loadTransactions = useCallback(async () => {
    console.log('[TransactionHistory] Loading transactions...', { symbolFilter, typeFilter });
    try {
      const params = new URLSearchParams();
      if (symbolFilter !== 'all') params.append('symbol', symbolFilter);
      if (typeFilter !== 'all') params.append('type', typeFilter);
      params.append('limit', '1000');

      const response = await fetch(`/api/transactions?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }

      const data = await response.json();
      console.log('[TransactionHistory] Received response:', data);
      setTransactions(data.transactions);
      setSummary(data.summary);
      setLoading(false);
      console.log('[TransactionHistory] Transactions loaded successfully. Count:', data.transactions?.length);
    } catch (error: unknown) {
      console.error('[TransactionHistory] Error loading transactions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load transaction history';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
      setLoading(false);
    }
  }, [symbolFilter, typeFilter, toast]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const handleReset = () => {
    setSymbolFilter('all');
    setTypeFilter('all');
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (symbolFilter !== 'all') params.append('symbol', symbolFilter);
      if (typeFilter !== 'all') params.append('type', typeFilter);

      const response = await fetch(`/api/transactions/export?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to export transactions');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Success',
        description: 'Transactions exported successfully',
      });
    } catch (error: unknown) {
      console.error('[TransactionHistory] Error exporting transactions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to export transactions';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Get unique symbols from transactions
  const symbols = Array.from(new Set(transactions.map(t => t.symbol))).sort();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-8 w-8" />
            Transaction History
          </h1>
          <p className="text-muted-foreground">All order executions for tax reporting</p>
        </div>
        <Button onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total}</div>
              <p className="text-xs text-muted-foreground">
                {summary.buys} buys, {summary.sells} sells
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${summary.totalVolume.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Combined buy/sell volume</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Fees</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${summary.totalFees.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Trading fees paid</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Fee per Trade</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${summary.total > 0 ? (summary.totalFees / summary.total).toFixed(2) : '0.00'}
              </div>
              <p className="text-xs text-muted-foreground">Average transaction fee</p>
            </CardContent>
          </Card>
        </div>
      )}

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
              <label className="text-sm font-medium mb-2 block">Symbol</label>
              <Select value={symbolFilter} onValueChange={setSymbolFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Symbols</SelectItem>
                  {symbols.map(symbol => (
                    <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Type</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="GRID">Grid Trading</SelectItem>
                  <SelectItem value="MANUAL">Manual</SelectItem>
                  <SelectItem value="PLAYBOOK">Playbook</SelectItem>
                  <SelectItem value="STOP_LOSS">Stop Loss</SelectItem>
                  <SelectItem value="TAKE_PROFIT">Take Profit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transaction Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Time</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((tx) => (
                    <TableRow key={tx._id}>
                      <TableCell className="font-mono text-sm">
                        {new Date(tx.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">{tx.symbol}</TableCell>
                      <TableCell>
                        <Badge variant={tx.side === 'BUY' ? 'default' : 'secondary'}>
                          {tx.side}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {tx.quantity.toFixed(4)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${tx.price.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${tx.total.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        ${tx.fees.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{tx.type}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

