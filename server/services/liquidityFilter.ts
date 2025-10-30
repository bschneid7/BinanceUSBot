import { binanceService } from "./binanceService";
import logger from "../utils/logger";

interface LiquidityMetrics {
  volume24h: number;
  bidDepth: number;
  askDepth: number;
  spreadBps: number;
  isLiquid: boolean;
  reason?: string;
}

export class LiquidityFilter {
  // Minimum 24h volume threshold (in USDT)
  private minVolume24h = 1000000; // $1M
  
  // Minimum order book depth (in USDT)
  private minBidAskDepth = 50000; // $50k on each side
  
  // Maximum spread threshold (in basis points)
  private maxSpreadBps = 10; // 0.1%
  
  // Cache for liquidity checks (5 minute TTL)
  private cache = new Map<string, { metrics: LiquidityMetrics; timestamp: number }>();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Check if a symbol meets liquidity requirements
   */
  async isLiquid(symbol: string): Promise<LiquidityMetrics> {
    // Check cache first
    const cached = this.cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.metrics;
    }

    try {
      // Get 24h volume
      const ticker24h = await binanceService.get24hrTicker(symbol);
      const volume24h = parseFloat(ticker24h.quoteVolume); // Volume in USDT

      // Get order book depth
      const orderBook = await binanceService.getOrderBook(symbol, 100);
      
      // Calculate bid/ask depth (sum of first 20 levels)
      const bidDepth = orderBook.bids
        .slice(0, 20)
        .reduce((sum, [price, qty]) => sum + parseFloat(price) * parseFloat(qty), 0);
      
      const askDepth = orderBook.asks
        .slice(0, 20)
        .reduce((sum, [price, qty]) => sum + parseFloat(price) * parseFloat(qty), 0);

      // Get current ticker for spread
      const ticker = await binanceService.getSymbolPrice(symbol);
      const currentPrice = parseFloat(ticker.price);
      
      // Calculate spread from order book
      const bestBid = parseFloat(orderBook.bids[0][0]);
      const bestAsk = parseFloat(orderBook.asks[0][0]);
      const spreadBps = ((bestAsk - bestBid) / currentPrice) * 10000;

      // Check all conditions
      const volumeCheck = volume24h >= this.minVolume24h;
      const bidDepthCheck = bidDepth >= this.minBidAskDepth;
      const askDepthCheck = askDepth >= this.minBidAskDepth;
      const spreadCheck = spreadBps <= this.maxSpreadBps;

      const isLiquid = volumeCheck && bidDepthCheck && askDepthCheck && spreadCheck;

      let reason: string | undefined;
      if (!isLiquid) {
        const failures: string[] = [];
        if (!volumeCheck) failures.push(`volume ${volume24h.toFixed(0)} < ${this.minVolume24h}`);
        if (!bidDepthCheck) failures.push(`bid depth ${bidDepth.toFixed(0)} < ${this.minBidAskDepth}`);
        if (!askDepthCheck) failures.push(`ask depth ${askDepth.toFixed(0)} < ${this.minBidAskDepth}`);
        if (!spreadCheck) failures.push(`spread ${spreadBps.toFixed(2)}bps > ${this.maxSpreadBps}bps`);
        reason = failures.join(", ");
      }

      const metrics: LiquidityMetrics = {
        volume24h,
        bidDepth,
        askDepth,
        spreadBps,
        isLiquid,
        reason
      };

      // Cache the result
      this.cache.set(symbol, { metrics, timestamp: Date.now() });

      logger.info(`Liquidity check for ${symbol}: ${isLiquid ? "PASS" : "FAIL"}`, {
        volume24h,
        bidDepth: bidDepth.toFixed(0),
        askDepth: askDepth.toFixed(0),
        spreadBps: spreadBps.toFixed(2),
        reason
      });

      return metrics;
    } catch (error) {
      logger.error(`Error checking liquidity for ${symbol}:`, error);
      // On error, assume liquid to avoid blocking trades
      return {
        volume24h: 0,
        bidDepth: 0,
        askDepth: 0,
        spreadBps: 0,
        isLiquid: true,
        reason: "Error checking liquidity, assuming liquid"
      };
    }
  }

  /**
   * Clear cache for a symbol or all symbols
   */
  clearCache(symbol?: string): void {
    if (symbol) {
      this.cache.delete(symbol);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Update thresholds dynamically
   */
  updateThresholds(config: {
    minVolume24h?: number;
    minBidAskDepth?: number;
    maxSpreadBps?: number;
  }): void {
    if (config.minVolume24h !== undefined) this.minVolume24h = config.minVolume24h;
    if (config.minBidAskDepth !== undefined) this.minBidAskDepth = config.minBidAskDepth;
    if (config.maxSpreadBps !== undefined) this.maxSpreadBps = config.maxSpreadBps;
    
    logger.info("Liquidity filter thresholds updated", {
      minVolume24h: this.minVolume24h,
      minBidAskDepth: this.minBidAskDepth,
      maxSpreadBps: this.maxSpreadBps
    });
  }
}

export const liquidityFilter = new LiquidityFilter();
