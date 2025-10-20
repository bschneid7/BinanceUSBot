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

interface BinanceExchangeInfo {
  symbols: Array<{
    symbol: string;
    status: string;
    baseAsset: string;
    quoteAsset: string;
    filters: Array<{
      filterType: string;
      minPrice?: string;
      maxPrice?: string;
      tickSize?: string;
      minQty?: string;
      maxQty?: string;
      stepSize?: string;
      minNotional?: string;
    }>;
  }>;
}

interface SymbolPrecision {
  symbol: string;
  pricePrecision: number;
  quantityPrecision: number;
  minNotional: number;
  minQty: number;
  maxQty: number;
  stepSize: number;
}

class BinanceService {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private client: AxiosInstance;
  private timeOffsetMs: number = 0;
  private lastTimeSync: number = 0;
  private recvWindowMs: number = 5000;

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
   * Sync server time to prevent TIMESTAMP errors
   */
  private async syncTime(): Promise<void> {
    const now = Date.now();
    // Sync every 60 seconds
    if (now - this.lastTimeSync < 60_000) return;
    
    try {
      const { data } = await this.client.get('/api/v3/time');
      this.timeOffsetMs = Number(data.serverTime) - now;
      this.lastTimeSync = now;
      console.log(`[BinanceService] Time synced, offset: ${this.timeOffsetMs}ms`);
    } catch (error) {
      console.error('[BinanceService] Time sync failed:', error);
      // Continue with current offset
    }
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
   * Make signed request to Binance API with retry logic
   */
  private async signedRequest(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<unknown> {
    if (!this.isConfigured()) {
      throw new Error('Binance API credentials not configured');
    }

    // Sync server time
    await this.syncTime();

    const timestamp = Date.now() + this.timeOffsetMs;
    const recvWindow = this.recvWindowMs;
    const queryParams = { ...params, timestamp, recvWindow };
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

    // Retry logic with jittered backoff
    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
          const status = error.response?.status;
          const code = error.response?.data?.code;
          
          // Retry on rate limit or server errors
          const shouldRetry = 
            status === 429 || // Rate limit
            code === -1003 ||  // Too many requests
            code === -1006 ||  // Unexpected response
            status === 503;    // Service unavailable
          
          if (shouldRetry && attempt < maxRetries) {
            // Jittered exponential backoff
            const baseDelay = 300 * (attempt + 1);
            const jitter = Math.floor(Math.random() * 200);
            const delay = baseDelay + jitter;
            
            console.log(
              `[BinanceService] Retry ${attempt + 1}/${maxRetries} after ${delay}ms for ${method} ${endpoint}`
            );
            
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
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
    
    throw new Error(`Binance request failed after ${maxRetries} retries`);
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
    newOrderRespType?: 'ACK' | 'RESULT' | 'FULL';
  }): Promise<BinanceOrderResponse> {
    console.log('[BinanceService] Placing order:', params);

    const orderParams: Record<string, unknown> = {
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: params.quantity,
      newOrderRespType: params.newOrderRespType ?? 'FULL', // Default to FULL for fee data
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

  /**
   * Get exchange information including symbol precision and filters
   */
  async getExchangeInfo(): Promise<BinanceExchangeInfo> {
    try {
      const response = await this.client.get('/api/v3/exchangeInfo');
      return response.data as BinanceExchangeInfo;
    } catch (error) {
      console.error('[BinanceService] Error fetching exchange info:', error);
      throw error;
    }
  }

  /**
   * Get symbol precision and trading rules
   */
  async getSymbolPrecision(symbol: string): Promise<SymbolPrecision | null> {
    try {
      const exchangeInfo = await this.getExchangeInfo();
      const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);

      if (!symbolInfo) {
        console.warn(`[BinanceService] Symbol ${symbol} not found in exchange info`);
        return null;
      }

      // Extract filters
      const priceFilter = symbolInfo.filters.find(f => f.filterType === 'PRICE_FILTER');
      const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
      const minNotionalFilter = symbolInfo.filters.find(
        f => f.filterType === 'MIN_NOTIONAL' || f.filterType === 'NOTIONAL'
      );

      // Calculate precision from tick size and step size
      const tickSize = priceFilter?.tickSize || '0.01';
      const stepSize = lotSizeFilter?.stepSize || '0.00001';

      const pricePrecision = Math.abs(Math.log10(parseFloat(tickSize)));
      const quantityPrecision = Math.abs(Math.log10(parseFloat(stepSize)));

      return {
        symbol,
        pricePrecision: Math.floor(pricePrecision),
        quantityPrecision: Math.floor(quantityPrecision),
        minNotional: parseFloat(minNotionalFilter?.minNotional || '10'),
        minQty: parseFloat(lotSizeFilter?.minQty || '0.00001'),
        maxQty: parseFloat(lotSizeFilter?.maxQty || '9000'),
        stepSize: parseFloat(stepSize),
      };
    } catch (error) {
      console.error(`[BinanceService] Error getting precision for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Adjust quantity to meet symbol precision requirements
   */
  adjustQuantity(quantity: number, precision: SymbolPrecision): number {
    const { stepSize, minQty, maxQty } = precision;

    // Round to step size
    const adjusted = Math.floor(quantity / stepSize) * stepSize;

    // Ensure within bounds
    const bounded = Math.max(minQty, Math.min(maxQty, adjusted));

    // Round to precision
    return parseFloat(bounded.toFixed(precision.quantityPrecision));
  }

  /**
   * Adjust price to meet symbol precision requirements
   */
  adjustPrice(price: number, precision: SymbolPrecision): number {
    return parseFloat(price.toFixed(precision.pricePrecision));
  }

  /**
   * Validate order parameters against symbol rules
   */
  validateOrder(params: {
    symbol: string;
    quantity: number;
    price: number;
    precision: SymbolPrecision;
  }): { valid: boolean; reason?: string } {
    const { quantity, price, precision } = params;

    // Check minimum quantity
    if (quantity < precision.minQty) {
      return {
        valid: false,
        reason: `Quantity ${quantity} below minimum ${precision.minQty}`,
      };
    }

    // Check maximum quantity
    if (quantity > precision.maxQty) {
      return {
        valid: false,
        reason: `Quantity ${quantity} above maximum ${precision.maxQty}`,
      };
    }

    // Check notional value (quantity × price)
    const notional = quantity * price;
    if (notional < precision.minNotional) {
      return {
        valid: false,
        reason: `Notional ${notional.toFixed(2)} below minimum ${precision.minNotional}`,
      };
    }

    return { valid: true };
  }

  /**
   * Get my trades for a symbol
   */
  async getMyTrades(symbol: string, limit: number = 500): Promise<unknown[]> {
    return (await this.signedRequest('GET', '/api/v3/myTrades', {
      symbol,
      limit,
    })) as unknown[];
  }

  /**
   * Get current average price for a symbol
   */
  async getAveragePrice(symbol: string): Promise<{ price: string }> {
    try {
      const response = await this.client.get('/api/v3/avgPrice', {
        params: { symbol },
      });
      return response.data;
    } catch (error) {
      console.error(`[BinanceService] Error fetching average price for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Create a listen key for User Data Stream
   */
  async createListenKey(): Promise<string> {
    try {
      const response = await this.signedRequest('POST', '/api/v3/userDataStream', {});
      return (response as any).listenKey;
    } catch (error) {
      console.error('[BinanceService] Error creating listen key:', error);
      throw error;
    }
  }

  /**
   * Keep alive a listen key (ping every 30 minutes)
   */
  async keepAliveListenKey(listenKey: string): Promise<void> {
    try {
      await this.signedRequest('PUT', '/api/v3/userDataStream', { listenKey });
    } catch (error) {
      console.error('[BinanceService] Error keeping listen key alive:', error);
      throw error;
    }
  }

  /**
   * Delete a listen key
   */
  async deleteListenKey(listenKey: string): Promise<void> {
    try {
      await this.signedRequest('DELETE', '/api/v3/userDataStream', { listenKey });
    } catch (error) {
      console.error('[BinanceService] Error deleting listen key:', error);
      throw error;
    }
  }
}

export default new BinanceService();
