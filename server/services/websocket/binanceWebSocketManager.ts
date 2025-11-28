import WebSocket from 'ws';
import EventEmitter from 'events';
import { eventStore } from '../eventStore';

interface TickerUpdate {
  symbol: string;
  price: string;
  timestamp: number;
}

interface WebSocketConfig {
  baseUrl: string;
  reconnectDelay: number;
  pingInterval: number;
}

/**
 * Manages WebSocket connections to Binance for real-time price feeds
 * Eliminates rate limiting by using WebSocket streams instead of REST API polling
 */
export class BinanceWebSocketManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private subscribedSymbols: Set<string> = new Set();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;
  private isShuttingDown: boolean = false;
  private lastPrices: Map<string, { price: number; timestamp: number }> = new Map();

  constructor(config?: Partial<WebSocketConfig>) {
    super();
    this.config = {
      baseUrl: config?.baseUrl || 'wss://stream.binance.us:9443',
      reconnectDelay: config?.reconnectDelay || 5000,
      pingInterval: config?.pingInterval || 30000,
    };
  }

  /**
   * Connect to Binance WebSocket and subscribe to ticker streams
   */
  async connect(symbols: string[]): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WebSocketManager] Already connected or connecting');
      return;
    }

    this.isConnecting = true;
    this.subscribedSymbols = new Set(symbols.map(s => s.toLowerCase()));

    try {
      // Build stream URL for all symbols
      const streams = Array.from(this.subscribedSymbols).map(s => `${s}@ticker`).join('/');
      const url = `${this.config.baseUrl}/stream?streams=${streams}`;

      console.log(`[WebSocketManager] Connecting to ${url}`);
      console.log(`[WebSocketManager] Subscribing to ${this.subscribedSymbols.size} symbols`);

      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        console.log('[WebSocketManager] ✅ Connected to Binance WebSocket');
        this.isConnecting = false;
        this.startPing();
        this.emit('connected');

        // Record connection event
        eventStore.recordEvent({
          type: 'WEBSOCKET_CONNECTED',
          aggregateType: 'SYSTEM',
          aggregateId: 'websocket-manager',
          data: {
            subscribedSymbols: Array.from(this.subscribedSymbols),
            timestamp: Date.now(),
          },
        });
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('[WebSocketManager] Error parsing message:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('[WebSocketManager] WebSocket error:', error);
        this.emit('error', error);
      });

      this.ws.on('close', () => {
        console.log('[WebSocketManager] WebSocket closed');
        this.isConnecting = false;
        this.stopPing();

        if (!this.isShuttingDown) {
          console.log(`[WebSocketManager] Reconnecting in ${this.config.reconnectDelay}ms...`);
          this.scheduleReconnect();
        }

        this.emit('disconnected');
      });

      this.ws.on('pong', () => {
        // Connection is alive
      });

    } catch (error) {
      console.error('[WebSocketManager] Connection error:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
      throw error;
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: any): void {
    if (message.stream && message.data) {
      const data = message.data;

      // Handle ticker updates
      if (message.stream.includes('@ticker')) {
        const ticker: TickerUpdate = {
          symbol: data.s, // Symbol (e.g., BTCUSDT)
          price: data.c,  // Current price
          timestamp: data.E, // Event time
        };

        // Store latest price
        this.lastPrices.set(ticker.symbol, {
          price: parseFloat(ticker.price),
          timestamp: ticker.timestamp,
        });

        // Emit price update event
        this.emit('ticker', ticker);
        this.emit(`ticker:${ticker.symbol}`, ticker);
      }
    }
  }

  /**
   * Get latest price for a symbol from WebSocket cache
   */
  getLatestPrice(symbol: string): { price: number; timestamp: number } | null {
    return this.lastPrices.get(symbol.toUpperCase()) || null;
  }

  /**
   * Get all latest prices
   */
  getAllLatestPrices(): Map<string, { price: number; timestamp: number }> {
    return new Map(this.lastPrices);
  }

  /**
   * Add symbols to subscription
   */
  async addSymbols(symbols: string[]): Promise<void> {
    const newSymbols = symbols.filter(s => !this.subscribedSymbols.has(s.toLowerCase()));

    if (newSymbols.length === 0) {
      return;
    }

    console.log(`[WebSocketManager] Adding ${newSymbols.length} new symbols`);
    newSymbols.forEach(s => this.subscribedSymbols.add(s.toLowerCase()));

    // Reconnect with updated symbol list
    await this.reconnect();
  }

  /**
   * Remove symbols from subscription
   */
  async removeSymbols(symbols: string[]): Promise<void> {
    symbols.forEach(s => this.subscribedSymbols.delete(s.toLowerCase()));
    console.log(`[WebSocketManager] Removed ${symbols.length} symbols`);

    // Reconnect with updated symbol list
    await this.reconnect();
  }

  /**
   * Reconnect WebSocket
   */
  private async reconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
    }

    const symbols = Array.from(this.subscribedSymbols);
    await this.connect(symbols);
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(async () => {
      console.log('[WebSocketManager] Attempting to reconnect...');
      const symbols = Array.from(this.subscribedSymbols);
      await this.connect(symbols);
    }, this.config.reconnectDelay);
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.config.pingInterval);
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection status
   */
  getStatus(): {
    connected: boolean;
    subscribedSymbols: number;
    cachedPrices: number;
    lastUpdate: number | null;
  } {
    const prices = Array.from(this.lastPrices.values());
    const lastUpdate = prices.length > 0
      ? Math.max(...prices.map(p => p.timestamp))
      : null;

    return {
      connected: this.isConnected(),
      subscribedSymbols: this.subscribedSymbols.size,
      cachedPrices: this.lastPrices.size,
      lastUpdate,
    };
  }

  /**
   * Gracefully shutdown WebSocket connection
   */
  async shutdown(): Promise<void> {
    console.log('[WebSocketManager] Shutting down...');
    this.isShuttingDown = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopPing();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.lastPrices.clear();
    this.subscribedSymbols.clear();

    console.log('[WebSocketManager] Shutdown complete');
  }
}

// Singleton instance
export const binanceWebSocketManager = new BinanceWebSocketManager();
