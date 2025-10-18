import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';

interface BinanceTickerData {
  symbol: string;
  lastPrice: string;
  volume: string;
  quoteVolume: string;
  bidPrice: string;
  askPrice: string;
  bidQty: string;
  askQty: string;
}

interface BinanceKlineData {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
}

interface BinanceOrderResponse {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  fills?: Array<{
    price: string;
    qty: string;
    commission: string;
    commissionAsset: string;
  }>;
}

interface BinanceAccountInfo {
  balances: Array<{
    asset: string;
    free: string;
    locked: string;
  }>;
}

class BinanceService {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private client: AxiosInstance;

  constructor() {
    this.apiKey = process.env.BINANCE_US_API_KEY || '';
    this.apiSecret = process.env.BINANCE_US_API_SECRET || '';
    this.baseUrl = process.env.BINANCE_US_BASE_URL || 'https://api.binance.us';

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
    });

    console.log('[BinanceService] Initialized with base URL:', this.baseUrl);
  }

  /**
   * Check if API credentials are configured
   */
  isConfigured(): boolean {
    return !!(this.apiKey && this.apiSecret);
  }

  /**
   * Generate signature for authenticated requests
   */
  private generateSignature(queryString: string): string {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  /**
   * Make signed request to Binance API
   */
  private async signedRequest(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<unknown> {
    if (!this.isConfigured()) {
      throw new Error('Binance API credentials not configured');
    }

    const timestamp = Date.now();
    const queryParams = { ...params, timestamp };
    const queryString = new URLSearchParams(
      queryParams as Record<string, string>
    ).toString();
    const signature = this.generateSignature(queryString);

    const config = {
      headers: {
        'X-MBX-APIKEY': this.apiKey,
      },
      params: {
        ...queryParams,
        signature,
      },
    };

    try {
      const response =
        method === 'GET'
          ? await this.client.get(endpoint, config)
          : method === 'POST'
          ? await this.client.post(endpoint, null, config)
          : await this.client.delete(endpoint, config);

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `[BinanceService] API error on ${method} ${endpoint}:`,
          error.response?.data || error.message
        );
        throw new Error(
          error.response?.data?.msg ||
            error.message ||
            'Binance API request failed'
        );
      }
      throw error;
    }
  }

  /**
   * Get 24hr ticker data for a symbol
   */
  async getTicker(symbol: string): Promise<BinanceTickerData> {
    try {
      const response = await this.client.get('/api/v3/ticker/24hr', {
        params: { symbol },
      });
      return response.data as BinanceTickerData;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `[BinanceService] Error fetching ticker for ${symbol}:`,
          error.response?.data || error.message
        );
      }
      throw error;
    }
  }

  /**
   * Get klines/candlestick data
   */
  async getKlines(
    symbol: string,
    interval: string,
    limit: number = 100
  ): Promise<BinanceKlineData[]> {
    try {
      const response = await this.client.get('/api/v3/klines', {
        params: { symbol, interval, limit },
      });
      return response.data.map((kline: unknown[]) => ({
        openTime: kline[0],
        open: kline[1],
        high: kline[2],
        low: kline[3],
        close: kline[4],
        volume: kline[5],
        closeTime: kline[6],
      }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `[BinanceService] Error fetching klines for ${symbol}:`,
          error.response?.data || error.message
        );
      }
      throw error;
    }
  }

  /**
   * Get order book depth
   */
  async getOrderBookDepth(symbol: string, limit: number = 20): Promise<{
    bids: Array<[string, string]>;
    asks: Array<[string, string]>;
  }> {
    try {
      const response = await this.client.get('/api/v3/depth', {
        params: { symbol, limit },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `[BinanceService] Error fetching order book for ${symbol}:`,
          error.response?.data || error.message
        );
      }
      throw error;
    }
  }

  /**
   * Place a new order
   */
  async placeOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET' | 'STOP_LOSS_LIMIT';
    quantity: number;
    price?: number;
    stopPrice?: number;
    timeInForce?: 'GTC' | 'IOC' | 'FOK';
    newClientOrderId?: string;
  }): Promise<BinanceOrderResponse> {
    console.log('[BinanceService] Placing order:', params);

    const orderParams: Record<string, unknown> = {
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: params.quantity,
    };

    if (params.price) orderParams.price = params.price;
    if (params.stopPrice) orderParams.stopPrice = params.stopPrice;
    if (params.timeInForce) orderParams.timeInForce = params.timeInForce;
    if (params.newClientOrderId)
      orderParams.newClientOrderId = params.newClientOrderId;

    const response = await this.signedRequest(
      'POST',
      '/api/v3/order',
      orderParams
    );
    console.log('[BinanceService] Order placed successfully:', response);
    return response as BinanceOrderResponse;
  }

  /**
   * Cancel an order
   */
  async cancelOrder(
    symbol: string,
    orderId: number
  ): Promise<unknown> {
    console.log(`[BinanceService] Cancelling order ${orderId} for ${symbol}`);

    const response = await this.signedRequest('DELETE', '/api/v3/order', {
      symbol,
      orderId,
    });

    console.log('[BinanceService] Order cancelled successfully:', response);
    return response;
  }

  /**
   * Get order status
   */
  async getOrder(symbol: string, orderId: number): Promise<unknown> {
    return await this.signedRequest('GET', '/api/v3/order', {
      symbol,
      orderId,
    });
  }

  /**
   * Get all open orders for a symbol
   */
  async getOpenOrders(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : {};
    return (await this.signedRequest(
      'GET',
      '/api/v3/openOrders',
      params
    )) as unknown[];
  }

  /**
   * Get account information
   */
  async getAccountInfo(): Promise<BinanceAccountInfo> {
    return (await this.signedRequest(
      'GET',
      '/api/v3/account',
      {}
    )) as BinanceAccountInfo;
  }

  /**
   * Test connectivity to the API
   */
  async ping(): Promise<boolean> {
    try {
      await this.client.get('/api/v3/ping');
      return true;
    } catch (error) {
      console.error('[BinanceService] Ping failed:', error);
      return false;
    }
  }

  /**
   * Get server time
   */
  async getServerTime(): Promise<number> {
    try {
      const response = await this.client.get('/api/v3/time');
      return response.data.serverTime;
    } catch (error) {
      console.error('[BinanceService] Error fetching server time:', error);
      throw error;
    }
  }

  /**
   * Calculate ATR (Average True Range) from klines
   */
  calculateATR(klines: BinanceKlineData[], period: number = 14): number {
    if (klines.length < period + 1) {
      throw new Error(`Not enough klines for ATR calculation (need ${period + 1})`);
    }

    const trueRanges: number[] = [];

    for (let i = 1; i < klines.length; i++) {
      const high = parseFloat(klines[i].high);
      const low = parseFloat(klines[i].low);
      const prevClose = parseFloat(klines[i - 1].close);

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );

      trueRanges.push(tr);
    }

    // Simple moving average of true ranges
    const atr = trueRanges.slice(-period).reduce((sum, tr) => sum + tr, 0) / period;

    return atr;
  }

  /**
   * Calculate VWAP from klines
   */
  calculateVWAP(klines: BinanceKlineData[]): number {
    let totalPriceVolume = 0;
    let totalVolume = 0;

    klines.forEach(kline => {
      const typical = (parseFloat(kline.high) + parseFloat(kline.low) + parseFloat(kline.close)) / 3;
      const volume = parseFloat(kline.volume);
      totalPriceVolume += typical * volume;
      totalVolume += volume;
    });

    return totalVolume > 0 ? totalPriceVolume / totalVolume : 0;
  }
}

export default new BinanceService();
