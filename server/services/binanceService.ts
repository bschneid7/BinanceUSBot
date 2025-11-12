import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import Bottleneck from 'bottleneck';
import webSocketService from './webSocketService';
import rateLimitManager from './rateLimitManager';

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

interface CachedPrice {
  price: number;
  timestamp: number;
}

interface CachedBalance {
  balance: number;
  timestamp: number;
}

interface CachedKline {
  data: BinanceKlineData[];
  timestamp: number;
}

class BinanceService {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private client: AxiosInstance;
  private timeOffsetMs: number = 0;
  private lastTimeSync: number = 0;
  private recvWindowMs: number = 5000;
  
  // Price caching with TTL
  private priceCache: Map<string, CachedPrice> = new Map();
  private readonly PRICE_CACHE_TTL = 30000; // 30 seconds
  
  // Balance caching with TTL
  private balanceCache: Map<string, CachedBalance> = new Map();
  private readonly BALANCE_CACHE_TTL = 10000; // 10 seconds
  
  // Kline caching with TTL (aggressive caching to reduce API weight)
  private klineCache: Map<string, CachedKline> = new Map();
  private readonly KLINE_CACHE_TTL = 300000; // 5 minutes (300 seconds)
  
  // Retry configuration
  private readonly MAX_RETRIES = 5;
  private readonly BASE_RETRY_DELAY = 1000; // 1 second
  
  // ✅ Rate limiting (Binance limits: 1200 requests/minute, 10 orders/second)
  private limiter: Bottleneck;
  private orderLimiter: Bottleneck;

  constructor() {
    this.apiKey = process.env.BINANCE_US_API_KEY || '';
    this.apiSecret = process.env.BINANCE_US_API_SECRET || '';
    this.baseUrl = process.env.BINANCE_US_BASE_URL || 'https://api.binance.us';

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
    });
    
    // ✅ Initialize rate limiters
    // General API limiter: 1200 requests per minute
    this.limiter = new Bottleneck({
      reservoir: 1200,                    // Initial capacity
      reservoirRefreshAmount: 1200,       // Refill amount
      reservoirRefreshInterval: 60 * 1000, // Refill every minute
      maxConcurrent: 5,                   // Max concurrent requests
      minTime: 50                         // Min 50ms between requests
    });
    
    // Order limiter: 10 orders per second (stricter)
    this.orderLimiter = new Bottleneck({
      reservoir: 10,
      reservoirRefreshAmount: 10,
      reservoirRefreshInterval: 1000,     // Refill every second
      maxConcurrent: 1,                   // One order at a time
      minTime: 100                        // Min 100ms between orders
    });
    
    // Handle rate limit errors
    this.limiter.on('failed', async (error, jobInfo) => {
      const rateLimitError = error?.response?.status === 429 || error?.code === -1003;
      if (rateLimitError) {
        console.warn('[BinanceService] Rate limit hit, pausing for 60 seconds');
        await this.limiter.stop({ dropWaitingJobs: false });
        await new Promise(resolve => setTimeout(resolve, 60000));
        await this.limiter.start();
        return 60000; // Retry after 60 seconds
      }
    });

    console.log('[BinanceService] Initialized with base URL:', this.baseUrl);
    console.log('[BinanceService] ✅ Rate limiting enabled: 1200 req/min, 10 orders/sec');
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
   * Retry a function with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation',
    maxAttempts: number = this.MAX_RETRIES
  ): Promise<T> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        const isLastAttempt = attempt === maxAttempts - 1;
        
        // Don't retry on certain errors
        if (error.response?.status === 401 || error.response?.status === 403) {
          console.error(`[BinanceService] ${operationName} failed with auth error, not retrying`);
          throw error;
        }
        
        if (isLastAttempt) {
          console.error(`[BinanceService] ${operationName} failed after ${maxAttempts} attempts`);
          throw error;
        }
        
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const delay = this.BASE_RETRY_DELAY * Math.pow(2, attempt);
        console.warn(
          `[BinanceService] ${operationName} attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
          error.message
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error(`${operationName} failed after ${maxAttempts} attempts`);
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
   * Get API weight for endpoint (Binance weight system)
   */
  private getEndpointWeight(endpoint: string, params: Record<string, unknown> = {}): number {
    // Account endpoints
    if (endpoint.includes('/api/v3/account')) return 10;
    if (endpoint.includes('/api/v3/myTrades')) return 10;
    
    // Order endpoints
    if (endpoint.includes('/api/v3/order')) return 1;
    if (endpoint.includes('/api/v3/openOrders')) return 3;
    if (endpoint.includes('/api/v3/allOrders')) return 10;
    
    // Market data endpoints
    if (endpoint.includes('/api/v3/klines')) {
      const limit = Number(params.limit) || 500;
      return limit <= 100 ? 1 : limit <= 500 ? 2 : 5;
    }
    if (endpoint.includes('/api/v3/ticker/24hr')) return 1;
    if (endpoint.includes('/api/v3/ticker/price')) return 1;
    if (endpoint.includes('/api/v3/depth')) return 1;
    
    // Default weight
    return 1;
  }

  /**
   * Make signed request to Binance API with retry logic and rate limiting
   * ✅ ENHANCED: Now uses both Bottleneck (concurrency) and RateLimitManager (weight-based)
   */
  private async signedRequest(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<unknown> {
    // ✅ Calculate endpoint weight
    const weight = this.getEndpointWeight(endpoint, params);
    
    // ✅ Acquire weight-based rate limit permission first
    await rateLimitManager.acquire(weight);
    
    // ✅ Then use Bottleneck for concurrency control
    const isOrderEndpoint = endpoint.includes('/api/v3/order');
    const limiter = isOrderEndpoint ? this.orderLimiter : this.limiter;
    
    return await limiter.schedule(async () => {
      return await this._signedRequestInternal(method, endpoint, params);
    });
  }
  
  /**
   * Internal signed request implementation (called by rate limiter)
   */
  private async _signedRequestInternal(
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
    return await this.retryWithBackoff(async () => {
      try {
        const response = await this.client.get('/api/v3/ticker/24hr', {
          params: { symbol },
        });
        return response.data as BinanceTickerData;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const errorType = status ? (status >= 500 ? '5xx Server' : status >= 400 ? '4xx Client' : 'Network') : 'Timeout';
          console.error(
            `[BinanceService] [${errorType}] getTicker(${symbol}) failed:`,
            error.response?.data || error.message
          );
        }
        throw error;
      }
    }, `getTicker(${symbol})`);
  }

  /**
   * Get klines/candlestick data
   */
  async getKlines(
    symbol: string,
    interval: string,
    limit: number = 100
  ): Promise<BinanceKlineData[]> {
    // Check cache first to reduce API weight
    const cacheKey = `${symbol}_${interval}_${limit}`;
    const now = Date.now();
    const cached = this.klineCache.get(cacheKey);
    
    if (cached && (now - cached.timestamp) < this.KLINE_CACHE_TTL) {
      // Cache hit - return cached klines
      return cached.data;
    }
    
    // Cache miss - fetch from API
    return await this.retryWithBackoff(async () => {
      try {
        const response = await this.client.get('/api/v3/klines', {
          params: { symbol, interval, limit },
        });
        const klines = response.data.map((kline: unknown[]) => ({
          openTime: kline[0],
          open: kline[1],
          high: kline[2],
          low: kline[3],
          close: kline[4],
          volume: kline[5],
          closeTime: kline[6],
        }));
        
        // Update cache
        this.klineCache.set(cacheKey, { data: klines, timestamp: now });
        
        return klines;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const errorType = status ? (status >= 500 ? '5xx Server' : status >= 400 ? '4xx Client' : 'Network') : 'Timeout';
          console.error(
            `[BinanceService] [${errorType}] getKlines(${symbol}, ${interval}) failed:`,
            error.response?.data || error.message
          );
        }
        
        // On error, try to return stale cache if available
        if (cached) {
          console.warn(`[BinanceService] Returning stale kline cache for ${symbol} (${Math.floor((now - cached.timestamp) / 1000)}s old)`);
          return cached.data;
        }
        
        throw error;
      }
    }, `getKlines(${symbol}, ${interval})`);
  }

  /**
   * Get order book depth
   */
  async getOrderBookDepth(symbol: string, limit: number = 20): Promise<{
    bids: Array<[string, string]>;
    asks: Array<[string, string]>;
  }> {
    return await this.retryWithBackoff(async () => {
      try {
        const response = await this.client.get('/api/v3/depth', {
          params: { symbol, limit },
        });
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const errorType = status ? (status >= 500 ? '5xx Server' : status >= 400 ? '4xx Client' : 'Network') : 'Timeout';
          console.error(
            `[BinanceService] [${errorType}] getOrderBookDepth(${symbol}) failed:`,
            error.response?.data || error.message
          );
        }
        throw error;
      }
    }, `getOrderBookDepth(${symbol})`);
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

    // Wrap in retry logic for reliability
    return await this.retryWithBackoff(async () => {
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
    }, `placeOrder(${params.symbol} ${params.side})`);
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
   * Get current ticker price for a symbol (with WebSocket + caching)
   */
  async getTickerPrice(symbol: string): Promise<{ symbol: string; price: string } | null> {
    // Try WebSocket first (real-time, no API call)
    if (webSocketService.isConnected()) {
      const wsPrice = webSocketService.getLatestPrice(symbol);
      if (wsPrice !== null) {
        return { symbol, price: wsPrice.toString() };
      }
    }
    
    // Fallback to cache
    const cached = this.priceCache.get(symbol);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < this.PRICE_CACHE_TTL) {
      // Cache hit - return cached price
      return { symbol, price: cached.price.toString() };
    }
    
    // Last resort - fetch from REST API
    try {
      const response = await this.client.get('/api/v3/ticker/price', {
        params: { symbol },
      });
      
      // Update cache
      const price = parseFloat(response.data.price);
      this.priceCache.set(symbol, { price, timestamp: now });
      
      return response.data;
    } catch (error) {
      // Return null if symbol not found (instead of throwing)
      return null;
    }
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
      // userDataStream endpoint uses API Key authentication ONLY
      // No signature or timestamp required!
      if (!this.isConfigured()) {
        throw new Error('Binance API credentials not configured');
      }

      const response = await this.client.post(
        '/api/v3/userDataStream',
        null, // No body
        {
          headers: {
            'X-MBX-APIKEY': this.apiKey,
          },
          // No params - API key only!
        }
      );

      return response.data.listenKey;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('[BinanceService] Error creating listen key:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        });
      } else {
        console.error('[BinanceService] Error creating listen key:', error);
      }
      throw error;
    }
  }

  /**
   * Keep alive a listen key (ping every 30 minutes)
   */
  async keepAliveListenKey(listenKey: string): Promise<void> {
    try {
      if (!this.isConfigured()) {
        throw new Error('Binance API credentials not configured');
      }

      // userDataStream endpoint uses API Key authentication ONLY
      await this.client.put(
        '/api/v3/userDataStream',
        null,
        {
          headers: {
            'X-MBX-APIKEY': this.apiKey,
          },
          params: {
            listenKey, // Only listenKey parameter
          },
        }
      );
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
      if (!this.isConfigured()) {
        throw new Error('Binance API credentials not configured');
      }

      // userDataStream endpoint uses API Key authentication ONLY
      await this.client.delete(
        '/api/v3/userDataStream',
        {
          headers: {
            'X-MBX-APIKEY': this.apiKey,
          },
          params: {
            listenKey, // Only listenKey parameter
          },
        }
      );
    } catch (error) {
      console.error('[BinanceService] Error deleting listen key:', error);
      throw error;
    }
  }

  /**
   * Check if BNB is being used for trading fees (25% discount)
   */
  async isUsingBNBForFees(): Promise<boolean> {
    try {
      const response = await this.signedRequest('GET', '/sapi/v1/bnbBurn', {});
      return (response as any).spotBNBBurn === true;
    } catch (error) {
      console.warn('[BinanceService] Could not check BNB burn status:', error);
      return false; // Assume not using BNB if API fails
    }
  }

  /**
   * Get actual trading fee for a symbol (accounting for BNB discount)
   */
  async getActualFee(symbol: string): Promise<number> {
    const baseFee = 0.001; // 0.1% default Binance.US fee
    
    try {
      // Check if using BNB for fees
      const usingBNB = await this.isUsingBNBForFees();
      
      if (usingBNB) {
        // Get BNB balance
        const accountInfo = await this.getAccountInfo();
        const bnbBalance = accountInfo.balances.find(b => b.asset === 'BNB');
        const bnbAmount = bnbBalance ? parseFloat(bnbBalance.free) : 0;
        
        // If we have BNB, apply 25% discount
        if (bnbAmount > 0.001) { // Minimum BNB to cover fees
          console.log(`[BinanceService] BNB fee discount active (${bnbAmount} BNB available)`);
          return baseFee * 0.75; // 25% discount = 0.075% fee
        }
      }
      
      return baseFee;
    } catch (error) {
      console.warn('[BinanceService] Error calculating actual fee, using base fee:', error);
      return baseFee;
    }
  }

  /**
   * Get balance for a specific asset (with caching)
   */
  async getBalance(asset: string): Promise<number> {
    // Check cache first
    const cached = this.balanceCache.get(asset);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < this.BALANCE_CACHE_TTL) {
      return cached.balance;
    }
    
    // Cache miss - fetch from API
    try {
      const accountInfo = await this.getAccountInfo();
      const assetBalance = accountInfo.balances.find(b => b.asset === asset);
      const balance = assetBalance ? parseFloat(assetBalance.free) : 0;
      
      // Update cache
      this.balanceCache.set(asset, { balance, timestamp: now });
      
      return balance;
    } catch (error) {
      console.error(`[BinanceService] Error fetching balance for ${asset}:`, error);
      return 0;
    }
  }
}

export default new BinanceService();
