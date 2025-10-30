import logger from "../utils/logger";
import { binanceService } from "./binanceService";
import Position from "../models/Position";

interface CorrelationPair {
  symbol1: string;
  symbol2: string;
  correlation: number;
  period: number;
  timestamp: Date;
}

interface ConcentrationRisk {
  hasRisk: boolean;
  highlyCorrelatedPairs: CorrelationPair[];
  averageCorrelation: number;
  maxCorrelation: number;
  reason?: string;
}

export class CorrelationAnalyzer {
  private correlationCache = new Map<string, { correlation: number; timestamp: Date }>();
  private cacheTTL = 60 * 60 * 1000; // 1 hour
  
  // Thresholds
  private highCorrelationThreshold = 0.7;
  private maxHighlyCorrelatedPairs = 2;

  /**
   * Calculate correlation between two symbols
   */
  async calculateCorrelation(symbol1: string, symbol2: string, days: number = 30): Promise<number> {
    const cacheKey = `${symbol1}-${symbol2}-${days}`;
    
    // Check cache
    const cached = this.correlationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp.getTime() < this.cacheTTL) {
      return cached.correlation;
    }

    try {
      // Get historical data for both symbols
      const interval = "1d";
      const limit = days;
      
      const [klines1, klines2] = await Promise.all([
        binanceService.getKlines(symbol1, interval, limit),
        binanceService.getKlines(symbol2, interval, limit)
      ]);

      // Extract close prices
      const prices1 = klines1.map(k => parseFloat(k[4])); // Close price
      const prices2 = klines2.map(k => parseFloat(k[4]));

      // Calculate returns
      const returns1 = this.calculateReturns(prices1);
      const returns2 = this.calculateReturns(prices2);

      // Calculate correlation
      const correlation = this.pearsonCorrelation(returns1, returns2);

      // Cache result
      this.correlationCache.set(cacheKey, {
        correlation,
        timestamp: new Date()
      });

      return correlation;
    } catch (error) {
      logger.error(`Error calculating correlation between ${symbol1} and ${symbol2}:`, error);
      return 0; // Return 0 on error
    }
  }

  /**
   * Calculate returns from prices
   */
  private calculateReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return returns;
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;

    const sumX = x.slice(0, n).reduce((a, b) => a + b, 0);
    const sumY = y.slice(0, n).reduce((a, b) => a + b, 0);
    const sumXY = x.slice(0, n).reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.slice(0, n).reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.slice(0, n).reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (denominator === 0) return 0;

    return numerator / denominator;
  }

  /**
   * Get correlations for all open positions
   */
  async getPositionCorrelations(days: number = 30): Promise<CorrelationPair[]> {
    try {
      const positions = await Position.find({ status: "open" });
      const correlations: CorrelationPair[] = [];

      // Calculate pairwise correlations
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const correlation = await this.calculateCorrelation(
            positions[i].symbol,
            positions[j].symbol,
            days
          );

          correlations.push({
            symbol1: positions[i].symbol,
            symbol2: positions[j].symbol,
            correlation,
            period: days,
            timestamp: new Date()
          });
        }
      }

      // Sort by correlation (descending)
      correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

      return correlations;
    } catch (error) {
      logger.error("Error getting position correlations:", error);
      return [];
    }
  }

  /**
   * Check for concentration risk
   */
  async hasConcentrationRisk(): Promise<ConcentrationRisk> {
    try {
      const correlations = await this.getPositionCorrelations();

      if (correlations.length === 0) {
        return {
          hasRisk: false,
          highlyCorrelatedPairs: [],
          averageCorrelation: 0,
          maxCorrelation: 0
        };
      }

      // Find highly correlated pairs
      const highlyCorrelated = correlations.filter(
        c => Math.abs(c.correlation) > this.highCorrelationThreshold
      );

      // Calculate average and max correlation
      const avgCorrelation = correlations.reduce((sum, c) => sum + Math.abs(c.correlation), 0) / correlations.length;
      const maxCorrelation = Math.max(...correlations.map(c => Math.abs(c.correlation)));

      // Determine if theres concentration risk
      const hasRisk = highlyCorrelated.length > this.maxHighlyCorrelatedPairs;

      let reason: string | undefined;
      if (hasRisk) {
        reason = `${highlyCorrelated.length} pairs with correlation > ${this.highCorrelationThreshold} (limit: ${this.maxHighlyCorrelatedPairs})`;
      }

      if (hasRisk) {
        logger.warn("Concentration risk detected", {
          highlyCorrelatedPairs: highlyCorrelated.length,
          averageCorrelation: avgCorrelation.toFixed(3),
          maxCorrelation: maxCorrelation.toFixed(3)
        });
      }

      return {
        hasRisk,
        highlyCorrelatedPairs: highlyCorrelated,
        averageCorrelation: avgCorrelation,
        maxCorrelation,
        reason
      };
    } catch (error) {
      logger.error("Error checking concentration risk:", error);
      return {
        hasRisk: false,
        highlyCorrelatedPairs: [],
        averageCorrelation: 0,
        maxCorrelation: 0,
        reason: "Error checking concentration risk"
      };
    }
  }

  /**
   * Get correlation matrix for all positions
   */
  async getCorrelationMatrix(days: number = 30): Promise<{
    symbols: string[];
    matrix: number[][];
  }> {
    try {
      const positions = await Position.find({ status: "open" });
      const symbols = positions.map(p => p.symbol);
      const n = symbols.length;
      
      // Initialize matrix
      const matrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
      
      // Fill diagonal with 1s (correlation with self)
      for (let i = 0; i < n; i++) {
        matrix[i][i] = 1;
      }
      
      // Calculate pairwise correlations
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const corr = await this.calculateCorrelation(symbols[i], symbols[j], days);
          matrix[i][j] = corr;
          matrix[j][i] = corr; // Symmetric
        }
      }
      
      return { symbols, matrix };
    } catch (error) {
      logger.error("Error getting correlation matrix:", error);
      return { symbols: [], matrix: [] };
    }
  }

  /**
   * Update thresholds
   */
  updateThresholds(config: {
    highCorrelationThreshold?: number;
    maxHighlyCorrelatedPairs?: number;
  }): void {
    if (config.highCorrelationThreshold !== undefined) {
      this.highCorrelationThreshold = config.highCorrelationThreshold;
    }
    if (config.maxHighlyCorrelatedPairs !== undefined) {
      this.maxHighlyCorrelatedPairs = config.maxHighlyCorrelatedPairs;
    }
    
    logger.info("Correlation analyzer thresholds updated", {
      highCorrelationThreshold: this.highCorrelationThreshold,
      maxHighlyCorrelatedPairs: this.maxHighlyCorrelatedPairs
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.correlationCache.clear();
    logger.info("Correlation cache cleared");
  }
}

export const correlationAnalyzer = new CorrelationAnalyzer();
