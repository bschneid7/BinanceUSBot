import Redis from 'ioredis';
import { binanceWebSocketManager } from './binanceWebSocketManager';
import binanceService from '../binanceService';

// Create Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

/**
 * Price Cache Service
 * Provides instant price lookups using WebSocket-fed Redis cache
 * Falls back to REST API if cache miss
 */
export class PriceCacheService {
  private readonly PRICE_PREFIX = 'price:';
  private readonly PRICE_TTL = 10; // 10 seconds TTL
  private isInitialized = false;

  /**
   * Initialize price cache with WebSocket updates
   */
  async initialize(symbols: string[]): Promise<void> {
    if (this.isInitialized) {
      console.log('[PriceCacheService] Already initialized');
      return;
    }

    console.log(`[PriceCacheService] Initializing with ${symbols.length} symbols`);

    // Connect WebSocket manager
    await binanceWebSocketManager.connect(symbols);

    // Listen for ticker updates and cache them
    binanceWebSocketManager.on('ticker', async (ticker) => {
      await this.cachePrice(ticker.symbol, parseFloat(ticker.price));
    });

    // Initial price fetch for all symbols
    await this.warmCache(symbols);

    this.isInitialized = true;
    console.log('[PriceCacheService] ✅ Initialized successfully');
  }

  /**
   * Warm cache with initial prices
   */
  private async warmCache(symbols: string[]): Promise<void> {
    console.log('[PriceCacheService] Warming cache with initial prices...');

    try {
      // Try to get all prices from WebSocket cache first
      const wsPrices = binanceWebSocketManager.getAllLatestPrices();

      if (wsPrices.size > 0) {
        // Cache WebSocket prices
        const pipeline = redis.pipeline();
        for (const [symbol, data] of wsPrices.entries()) {
          pipeline.setex(
            `${this.PRICE_PREFIX}${symbol}`,
            this.PRICE_TTL,
            data.price.toString()
          );
        }
        await pipeline.exec();
        console.log(`[PriceCacheService] Cached ${wsPrices.size} prices from WebSocket`);
      }

      // For any missing symbols, fetch from REST API (batched)
      const missingSymbols = symbols.filter(s => !wsPrices.has(s.toUpperCase()));

      if (missingSymbols.length > 0) {
        console.log(`[PriceCacheService] Fetching ${missingSymbols.length} missing prices from REST API`);

        // Fetch in batches to avoid rate limits
        const batchSize = 10;
        for (let i = 0; i < missingSymbols.length; i += batchSize) {
          const batch = missingSymbols.slice(i, i + batchSize);

          await Promise.all(batch.map(async (symbol) => {
            try {
              const price = await binanceService.getTickerPrice(symbol);
              await this.cachePrice(symbol, parseFloat(price));
            } catch (error) {
              console.error(`[PriceCacheService] Error fetching price for ${symbol}:`, error);
            }
          }));

          // Small delay between batches
          if (i + batchSize < missingSymbols.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }

    } catch (error) {
      console.error('[PriceCacheService] Error warming cache:', error);
    }
  }

  /**
   * Cache a price in Redis
   */
  private async cachePrice(symbol: string, price: number): Promise<void> {
    try {
      await redis.setex(
        `${this.PRICE_PREFIX}${symbol.toUpperCase()}`,
        this.PRICE_TTL,
        price.toString()
      );
    } catch (error) {
      console.error(`[PriceCacheService] Error caching price for ${symbol}:`, error);
    }
  }

  /**
   * Get price for a symbol (< 1ms from cache, fallback to API)
   */
  async getPrice(symbol: string): Promise<number> {
    const normalizedSymbol = symbol.toUpperCase();

    try {
      // Try cache first
      const cached = await redis.get(`${this.PRICE_PREFIX}${normalizedSymbol}`);

      if (cached) {
        return parseFloat(cached);
      }

      // Cache miss - try WebSocket cache
      const wsPrice = binanceWebSocketManager.getLatestPrice(normalizedSymbol);

      if (wsPrice && Date.now() - wsPrice.timestamp < 5000) {
        // WebSocket price is fresh (< 5 seconds old)
        await this.cachePrice(normalizedSymbol, wsPrice.price);
        return wsPrice.price;
      }

      // Fallback to REST API
      console.log(`[PriceCacheService] Cache miss for ${normalizedSymbol}, fetching from API`);
      const price = await binanceService.getTickerPrice(normalizedSymbol);
      const priceNum = parseFloat(price);

      // Cache the result
      await this.cachePrice(normalizedSymbol, priceNum);

      return priceNum;

    } catch (error) {
      console.error(`[PriceCacheService] Error getting price for ${symbol}:`, error);

      // Last resort - try WebSocket cache even if stale
      const wsPrice = binanceWebSocketManager.getLatestPrice(normalizedSymbol);
      if (wsPrice) {
        console.log(`[PriceCacheService] Using stale WebSocket price for ${normalizedSymbol}`);
        return wsPrice.price;
      }

      throw error;
    }
  }

  /**
   * Get multiple prices efficiently
   */
  async getPrices(symbols: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();

    try {
      // Try to get all from cache first
      const normalizedSymbols = symbols.map(s => s.toUpperCase());
      const keys = normalizedSymbols.map(s => `${this.PRICE_PREFIX}${s}`);

      const cached = await redis.mget(...keys);

      const missing: string[] = [];

      cached.forEach((price, index) => {
        const symbol = normalizedSymbols[index];
        if (price) {
          prices.set(symbol, parseFloat(price));
        } else {
          missing.push(symbol);
        }
      });

      // For missing prices, try WebSocket cache
      if (missing.length > 0) {
        const wsPrices = binanceWebSocketManager.getAllLatestPrices();

        missing.forEach(symbol => {
          const wsPrice = wsPrices.get(symbol);
          if (wsPrice && Date.now() - wsPrice.timestamp < 5000) {
            prices.set(symbol, wsPrice.price);
            this.cachePrice(symbol, wsPrice.price); // Cache it
          }
        });
      }

      // If still missing, fetch from API (should be rare)
      const stillMissing = missing.filter(s => !prices.has(s));

      if (stillMissing.length > 0) {
        console.log(`[PriceCacheService] Fetching ${stillMissing.length} prices from API`);

        await Promise.all(stillMissing.map(async (symbol) => {
          try {
            const price = await this.getPrice(symbol);
            prices.set(symbol, price);
          } catch (error) {
            console.error(`[PriceCacheService] Error fetching ${symbol}:`, error);
          }
        }));
      }

    } catch (error) {
      console.error('[PriceCacheService] Error getting multiple prices:', error);
    }

    return prices;
  }

  /**
   * Add new symbols to the cache
   */
  async addSymbols(symbols: string[]): Promise<void> {
    await binanceWebSocketManager.addSymbols(symbols);
    await this.warmCache(symbols);
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    cacheHits: number;
    cacheMisses: number;
    wsConnected: boolean;
    cachedSymbols: number;
  }> {
    const wsStatus = binanceWebSocketManager.getStatus();

    // Count cached prices
    const keys = await redis.keys(`${this.PRICE_PREFIX}*`);

    return {
      cacheHits: 0, // Would need to track this separately
      cacheMisses: 0, // Would need to track this separately
      wsConnected: wsStatus.connected,
      cachedSymbols: keys.length,
    };
  }

  /**
   * Clear price cache
   */
  async clearCache(): Promise<void> {
    const keys = await redis.keys(`${this.PRICE_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    console.log(`[PriceCacheService] Cleared ${keys.length} cached prices`);
  }

  /**
   * Shutdown price cache service
   */
  async shutdown(): Promise<void> {
    console.log('[PriceCacheService] Shutting down...');
    await binanceWebSocketManager.shutdown();
    this.isInitialized = false;
  }
}

// Singleton instance
export const priceCacheService = new PriceCacheService();
