import WebSocket from 'ws';
import logger from '../utils/logger';

interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
}

type PriceCallback = (update: PriceUpdate) => void;

/**
 * WebSocket service for real-time price streaming from Binance
 * Provides sub-second price updates for all subscribed symbols
 */
export class WebSocketService {
  private ws: WebSocket | null = null;
  private baseUrl: string;
  private subscribedSymbols: Set<string> = new Set();
  private priceCallbacks: Map<string, Set<PriceCallback>> = new Map();
  private latestPrices: Map<string, PriceUpdate> = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 5000; // 5 seconds
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;

  constructor() {
    this.baseUrl = process.env.BINANCE_US_WS_URL || 'wss://stream.binance.us:9443';
  }

  /**
   * Connect to Binance WebSocket stream
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      logger.info('[WebSocketService] Already connected or connecting');
      return;
    }

    this.isConnecting = true;

    try {
      // Build stream URL with all subscribed symbols
      const streams = Array.from(this.subscribedSymbols)
        .map(symbol => `${symbol.toLowerCase()}@ticker`)
        .join('/');

      const url = streams ? `${this.baseUrl}/stream?streams=${streams}` : this.baseUrl;

      logger.info(`[WebSocketService] Connecting to ${url}`);
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        logger.info('[WebSocketService] Connected successfully');
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.startPingInterval();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          logger.error({ err: error }, '[WebSocketService] Error parsing message');
        }
      });

      this.ws.on('error', (error) => {
        logger.error({ err: error }, '[WebSocketService] WebSocket error');
        this.isConnecting = false;
      });

      this.ws.on('close', () => {
        logger.warn('[WebSocketService] Connection closed');
        this.isConnecting = false;
        this.stopPingInterval();
        this.attemptReconnect();
      });

    } catch (error) {
      logger.error({ err: error }, '[WebSocketService] Connection failed');
      this.isConnecting = false;
      this.attemptReconnect();
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: any): void {
    // Handle stream format: { stream: "btcusd@ticker", data: {...} }
    if (message.stream && message.data) {
      const data = message.data;
      const symbol = data.s; // Symbol (e.g., "BTCUSD")
      const price = parseFloat(data.c); // Current price

      if (symbol && price > 0) {
        const update: PriceUpdate = {
          symbol,
          price,
          timestamp: Date.now(),
        };

        // Store latest price
        this.latestPrices.set(symbol, update);

        // Notify all callbacks for this symbol
        const callbacks = this.priceCallbacks.get(symbol);
        if (callbacks) {
          callbacks.forEach(callback => {
            try {
              callback(update);
            } catch (error) {
              logger.error({ err: error, symbol }, '[WebSocketService] Error in price callback');
            }
          });
        }
      }
    }
  }

  /**
   * Subscribe to price updates for a symbol
   */
  subscribe(symbol: string, callback: PriceCallback): void {
    const upperSymbol = symbol.toUpperCase();

    // Add symbol to subscribed set
    if (!this.subscribedSymbols.has(upperSymbol)) {
      this.subscribedSymbols.add(upperSymbol);
      logger.info(`[WebSocketService] Subscribed to ${upperSymbol}`);

      // Reconnect to include new symbol
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.reconnect();
      }
    }

    // Add callback
    if (!this.priceCallbacks.has(upperSymbol)) {
      this.priceCallbacks.set(upperSymbol, new Set());
    }
    this.priceCallbacks.get(upperSymbol)!.add(callback);
  }

  /**
   * Unsubscribe from price updates for a symbol
   */
  unsubscribe(symbol: string, callback: PriceCallback): void {
    const upperSymbol = symbol.toUpperCase();
    const callbacks = this.priceCallbacks.get(upperSymbol);

    if (callbacks) {
      callbacks.delete(callback);

      // If no more callbacks, remove symbol
      if (callbacks.size === 0) {
        this.priceCallbacks.delete(upperSymbol);
        this.subscribedSymbols.delete(upperSymbol);
        logger.info(`[WebSocketService] Unsubscribed from ${upperSymbol}`);

        // Reconnect to remove symbol from stream
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.reconnect();
        }
      }
    }
  }

  /**
   * Get latest price for a symbol (from cache)
   */
  getLatestPrice(symbol: string): number | null {
    const update = this.latestPrices.get(symbol.toUpperCase());
    return update ? update.price : null;
  }

  /**
   * Get latest price update with timestamp
   */
  getLatestPriceUpdate(symbol: string): PriceUpdate | null {
    return this.latestPrices.get(symbol.toUpperCase()) || null;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Reconnect (close and reopen connection)
   */
  private reconnect(): void {
    if (this.ws) {
      this.ws.close();
    }
    setTimeout(() => this.connect(), 1000);
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('[WebSocketService] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    logger.info(`[WebSocketService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    this.stopPingInterval();

    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 60000); // Ping every 60 seconds
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Disconnect and clean up
   */
  disconnect(): void {
    logger.info('[WebSocketService] Disconnecting...');
    this.stopPingInterval();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscribedSymbols.clear();
    this.priceCallbacks.clear();
    this.latestPrices.clear();
  }
}

export default new WebSocketService();

