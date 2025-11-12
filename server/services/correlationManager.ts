/**
 * Correlation Manager Service
 * 
 * Prevents over-concentration in correlated assets by analyzing price correlations
 * and limiting positions in highly correlated symbols.
 */

import { logger } from '../utils/structuredLogger';

interface PriceData {
  symbol: string;
  prices: number[];
  timestamp: number[];
}

interface CorrelationResult {
  symbol1: string;
  symbol2: string;
  correlation: number;
  isHighlyCorrelated: boolean;
}

interface Position {
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  value: number;
}

export class CorrelationManager {
  private correlationThreshold: number;
  private maxCorrelatedExposure: number;
  private correlationCache: Map<string, Map<string, { correlation: number; timestamp: number }>>;
  private cacheTTL: number; // milliseconds

  constructor(
    correlationThreshold: number = 0.7,
    maxCorrelatedExposure: number = 0.3, // 30% of portfolio
    cacheTTL: number = 3600000 // 1 hour
  ) {
    this.correlationThreshold = correlationThreshold;
    this.maxCorrelatedExposure = maxCorrelatedExposure;
    this.correlationCache = new Map();
    this.cacheTTL = cacheTTL;
  }

  /**
   * Calculate Pearson correlation coefficient between two price series
   */
  calculateCorrelation(prices1: number[], prices2: number[]): number {
    if (prices1.length !== prices2.length || prices1.length < 2) {
      logger.warn({
        event: 'correlation_calculation_failed',
        reason: 'invalid_price_data',
        length1: prices1.length,
        length2: prices2.length
      });
      return 0;
    }

    const n = prices1.length;

    // Calculate means
    const mean1 = prices1.reduce((sum, val) => sum + val, 0) / n;
    const mean2 = prices2.reduce((sum, val) => sum + val, 0) / n;

    // Calculate correlation
    let numerator = 0;
    let denominator1 = 0;
    let denominator2 = 0;

    for (let i = 0; i < n; i++) {
      const diff1 = prices1[i] - mean1;
      const diff2 = prices2[i] - mean2;

      numerator += diff1 * diff2;
      denominator1 += diff1 * diff1;
      denominator2 += diff2 * diff2;
    }

    const denominator = Math.sqrt(denominator1 * denominator2);

    if (denominator === 0) {
      return 0;
    }

    const correlation = numerator / denominator;

    return correlation;
  }

  /**
   * Get correlation from cache or calculate if not cached
   */
  private getCachedCorrelation(symbol1: string, symbol2: string): number | null {
    const now = Date.now();

    // Check cache for symbol1 -> symbol2
    if (this.correlationCache.has(symbol1)) {
      const symbol1Cache = this.correlationCache.get(symbol1)!;
      if (symbol1Cache.has(symbol2)) {
        const cached = symbol1Cache.get(symbol2)!;
        if (now - cached.timestamp < this.cacheTTL) {
          return cached.correlation;
        }
      }
    }

    // Check cache for symbol2 -> symbol1 (correlation is symmetric)
    if (this.correlationCache.has(symbol2)) {
      const symbol2Cache = this.correlationCache.get(symbol2)!;
      if (symbol2Cache.has(symbol1)) {
        const cached = symbol2Cache.get(symbol1)!;
        if (now - cached.timestamp < this.cacheTTL) {
          return cached.correlation;
        }
      }
    }

    return null;
  }

  /**
   * Cache correlation result
   */
  private cacheCorrelation(symbol1: string, symbol2: string, correlation: number): void {
    if (!this.correlationCache.has(symbol1)) {
      this.correlationCache.set(symbol1, new Map());
    }

    this.correlationCache.get(symbol1)!.set(symbol2, {
      correlation,
      timestamp: Date.now()
    });

    logger.debug({
      event: 'correlation_cached',
      symbol1,
      symbol2,
      correlation
    });
  }

  /**
   * Calculate correlation between two symbols
   */
  async calculateSymbolCorrelation(
    symbol1: string,
    symbol2: string,
    priceData1: number[],
    priceData2: number[]
  ): Promise<number> {
    // Check cache first
    const cached = this.getCachedCorrelation(symbol1, symbol2);
    if (cached !== null) {
      return cached;
    }

    // Calculate correlation
    const correlation = this.calculateCorrelation(priceData1, priceData2);

    // Cache result
    this.cacheCorrelation(symbol1, symbol2, correlation);

    logger.info({
      event: 'correlation_calculated',
      symbol1,
      symbol2,
      correlation: correlation.toFixed(4),
      isHighlyCorrelated: Math.abs(correlation) >= this.correlationThreshold
    });

    return correlation;
  }

  /**
   * Check if a new position would violate correlation limits
   */
  async validateNewPosition(
    newSymbol: string,
    newPositionValue: number,
    existingPositions: Position[],
    getPriceData: (symbol: string, periods: number) => Promise<number[]>
  ): Promise<{ allowed: boolean; reason?: string; correlatedSymbols?: string[] }> {
    if (existingPositions.length === 0) {
      return { allowed: true };
    }

    const totalPortfolioValue = existingPositions.reduce((sum, pos) => sum + pos.value, 0) + newPositionValue;

    // Get price data for new symbol
    const newSymbolPrices = await getPriceData(newSymbol, 100);

    const correlatedPositions: { symbol: string; correlation: number; value: number }[] = [];

    // Check correlation with each existing position
    for (const position of existingPositions) {
      const existingSymbolPrices = await getPriceData(position.symbol, 100);

      const correlation = await this.calculateSymbolCorrelation(
        newSymbol,
        position.symbol,
        newSymbolPrices,
        existingSymbolPrices
      );

      if (Math.abs(correlation) >= this.correlationThreshold) {
        correlatedPositions.push({
          symbol: position.symbol,
          correlation,
          value: position.value
        });
      }
    }

    // If no high correlations, allow the position
    if (correlatedPositions.length === 0) {
      logger.info({
        event: 'position_validation',
        newSymbol,
        result: 'allowed',
        reason: 'no_high_correlations'
      });
      return { allowed: true };
    }

    // Calculate total correlated exposure
    const correlatedExposure = correlatedPositions.reduce((sum, pos) => sum + pos.value, 0);
    const totalCorrelatedExposure = correlatedExposure + newPositionValue;
    const correlatedExposurePercent = totalCorrelatedExposure / totalPortfolioValue;

    logger.info({
      event: 'correlation_check',
      newSymbol,
      correlatedPositions: correlatedPositions.map(p => ({
        symbol: p.symbol,
        correlation: p.correlation.toFixed(4)
      })),
      correlatedExposure: totalCorrelatedExposure.toFixed(2),
      correlatedExposurePercent: (correlatedExposurePercent * 100).toFixed(2) + '%',
      maxAllowed: (this.maxCorrelatedExposure * 100).toFixed(2) + '%'
    });

    // Check if correlated exposure exceeds limit
    if (correlatedExposurePercent > this.maxCorrelatedExposure) {
      const correlatedSymbols = correlatedPositions.map(p => p.symbol);

      logger.warn({
        event: 'position_rejected',
        newSymbol,
        reason: 'excessive_correlated_exposure',
        correlatedSymbols,
        correlatedExposurePercent: (correlatedExposurePercent * 100).toFixed(2) + '%',
        maxAllowed: (this.maxCorrelatedExposure * 100).toFixed(2) + '%'
      });

      return {
        allowed: false,
        reason: `Excessive correlated exposure (${(correlatedExposurePercent * 100).toFixed(1)}% > ${(this.maxCorrelatedExposure * 100).toFixed(1)}%)`,
        correlatedSymbols
      };
    }

    logger.info({
      event: 'position_validation',
      newSymbol,
      result: 'allowed',
      reason: 'within_correlation_limits',
      correlatedExposurePercent: (correlatedExposurePercent * 100).toFixed(2) + '%'
    });

    return { allowed: true };
  }

  /**
   * Get correlation matrix for all positions
   */
  async getCorrelationMatrix(
    symbols: string[],
    getPriceData: (symbol: string, periods: number) => Promise<number[]>
  ): Promise<Map<string, Map<string, number>>> {
    const matrix = new Map<string, Map<string, number>>();

    for (const symbol1 of symbols) {
      matrix.set(symbol1, new Map());

      for (const symbol2 of symbols) {
        if (symbol1 === symbol2) {
          matrix.get(symbol1)!.set(symbol2, 1.0);
          continue;
        }

        const prices1 = await getPriceData(symbol1, 100);
        const prices2 = await getPriceData(symbol2, 100);

        const correlation = await this.calculateSymbolCorrelation(
          symbol1,
          symbol2,
          prices1,
          prices2
        );

        matrix.get(symbol1)!.set(symbol2, correlation);
      }
    }

    return matrix;
  }

  /**
   * Clear correlation cache
   */
  clearCache(): void {
    this.correlationCache.clear();
    logger.info({
      event: 'correlation_cache_cleared'
    });
  }
}

// Export singleton instance
export const correlationManager = new CorrelationManager();
