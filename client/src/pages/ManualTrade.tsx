import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { Hand, TrendingUp, TrendingDown, X } from 'lucide-react';
import api from '@/api/api';

interface Symbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
}

interface Position {
  _id: string;
  symbol: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  status: string;
}

export default function ManualTrade() {
  const [symbols, setSymbols] = useState<Symbol[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  // Form state
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [symbolsRes, positionsRes] = await Promise.all([
        api.get('/manual-trade/available-symbols'),
        api.get('/positions')
      ]);

      setSymbols(symbolsRes.data.symbols || []);
      setPositions(positionsRes.data.positions || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load trading data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedSymbol || !quantity) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    if (orderType === 'LIMIT' && !price) {
      toast({
        title: 'Validation Error',
        description: 'Price is required for limit orders',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      const orderData: any = {
        symbol: selectedSymbol,
        side,
        type: orderType,
        quantity: parseFloat(quantity)
      };

      if (orderType === 'LIMIT') {
        orderData.price = parseFloat(price);
      }

      const response = await api.post('/manual-trade/place-order', orderData);

      toast({
        title: 'Order Placed Successfully',
        description: `${side} ${quantity} ${selectedSymbol} at ${orderType === 'MARKET' ? 'market price' : `$${price}`}`,
      });

      // Reset form
      setQuantity('');
      setPrice('');
      
      // Reload positions
      await loadData();
    } catch (error: any) {
      console.error('Error placing order:', error);
      toast({
        title: 'Order Failed',
        description: error.response?.data?.error || error.message || 'Failed to place order',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClosePosition = async (positionId: string, symbol: string, quantity: number) => {
    if (!confirm(`Close position for ${symbol}?`)) {
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/manual-trade/close-position/${positionId}`, {});

      toast({
        title: 'Position Closed',
        description: `Successfully closed ${symbol} position`,
      });

      // Reload positions
      await loadData();
    } catch (error: any) {
      console.error('Error closing position:', error);
      toast({
        title: 'Close Failed',
        description: error.response?.data?.error || error.message || 'Failed to close position',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Hand className="h-8 w-8" />
          Manual Trading
        </h1>
        <p className="text-muted-foreground">Place manual orders and manage positions</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Place Order Form */}
        <Card>
          <CardHeader>
            <CardTitle>Place Order</CardTitle>
            <CardDescription>Execute manual buy or sell orders</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePlaceOrder} className="space-y-4">
              {/* Symbol Selection */}
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol</Label>
                <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                  <SelectTrigger id="symbol">
                    <SelectValue placeholder="Select a symbol" />
                  </SelectTrigger>
                  <SelectContent>
                    {symbols.map((sym) => (
                      <SelectItem key={sym.symbol} value={sym.symbol}>
                        {sym.symbol} ({sym.baseAsset}/{sym.quoteAsset})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Side Selection */}
              <div className="space-y-2">
                <Label>Side</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={side === 'BUY' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setSide('BUY')}
                  >
                    <TrendingUp className="mr-2 h-4 w-4" />
                    Buy
                  </Button>
                  <Button
                    type="button"
                    variant={side === 'SELL' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setSide('SELL')}
                  >
                    <TrendingDown className="mr-2 h-4 w-4" />
                    Sell
                  </Button>
                </div>
              </div>

              {/* Order Type */}
              <div className="space-y-2">
                <Label htmlFor="orderType">Order Type</Label>
                <Select value={orderType} onValueChange={(value: 'MARKET' | 'LIMIT') => setOrderType(value)}>
                  <SelectTrigger id="orderType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKET">Market</SelectItem>
                    <SelectItem value="LIMIT">Limit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Quantity */}
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>

              {/* Price (for limit orders) */}
              {orderType === 'LIMIT' && (
                <div className="space-y-2">
                  <Label htmlFor="price">Price (USD)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                  />
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full"
                disabled={submitting || loading}
              >
                {submitting ? 'Placing Order...' : `Place ${side} Order`}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Quick Close Positions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Close Positions</CardTitle>
            <CardDescription>Close open positions with one click</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading positions...</p>
            ) : positions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open positions</p>
            ) : (
              <div className="space-y-3">
                {positions.map((position) => (
                  <div
                    key={position._id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-semibold">{position.symbol}</div>
                      <div className="text-sm text-muted-foreground">
                        Qty: {position.quantity.toFixed(4)} @ ${position.entry_price.toFixed(4)}
                      </div>
                      <div className={`text-sm font-medium ${position.unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        P&L: ${position.unrealized_pnl?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleClosePosition(position._id, position.symbol, position.quantity)}
                      disabled={submitting}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Close
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>Important Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• <strong>Market Orders:</strong> Execute immediately at the current market price</p>
          <p>• <strong>Limit Orders:</strong> Execute only at your specified price or better</p>
          <p>• <strong>Quick Close:</strong> Closes positions using market orders for immediate execution</p>
          <p>• <strong>Fees:</strong> All orders are subject to Binance.US trading fees</p>
          <p className="text-yellow-600 dark:text-yellow-500">
            ⚠️ <strong>Warning:</strong> Manual trades bypass the bot's risk management. Trade carefully!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

