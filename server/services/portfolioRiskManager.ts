/**
 * Portfolio Risk Manager
 * Implements institutional-grade risk management
 * Includes VaR, correlation analysis, and portfolio-level controls
 */

import logger from '../utils/logger';
import { metricsService } from './metricsService';
import Position from '../models/Position';
import { Types } from 'mongoose';

export interface PortfolioRiskMetrics {
  // Value at Risk
  var95: number; // 95% VaR (1-day)
  var99: number; // 99% VaR (1-day)
  cvar95: number; // Conditional VaR (Expected Shortfall)
  
  // Portfolio metrics
  totalExposure: number;
  netExposure: number;
  grossExposure: number;
  leverage: number;
  
  // Concentration
  largestPosition: number;
  largestPositionPct: number;
  top3Concentration: number;
  
  // Correlation
  avgCorrelation: number;
  maxCorrelation: number;
  correlationMatrix: Map<string, Map<string, number>>;
  
  // Volatility
  portfolioVolatility: number;
  avgPositionVolatility: number;
}

export interface RiskLimit {
  type: 'VAR' | 'EXPOSURE' | 'CONCENTRATION' | 'CORRELATION' | 'VOLATILITY';
  value: number;
  threshold: number;
  breached: boolean;
}

class PortfolioRiskManager {
  private static instance: PortfolioRiskManager;
  
  // Risk limits
  private limits = {
    maxVar95Pct: 0.05, // Max 5% portfolio VaR
    maxExposurePct: 1.0, // Max 100% of equity
    maxSinglePositionPct: 0.15, // Max 15% in single position
    maxTop3ConcentrationPct: 0.40, // Max 40% in top 3 positions
    maxCorrelation: 0.70, // Max 70% correlation between positions
    maxLeverage: 2.0 // Max 2x leverage
  };

  private constructor() {
    logger.info('[PortfolioRiskManager] Initialized');
  }

  static getInstance(): PortfolioRiskManager {
    if (!PortfolioRiskManager.instance) {
      PortfolioRiskManager.instance = new PortfolioRiskManager();
    }
    return PortfolioRiskManager.instance;
  }

  /**
   * Calculate comprehensive portfolio risk metrics
   */
  async calculateRiskMetrics(userId: Types.ObjectId, equity: number): Promise<PortfolioRiskMetrics> {
    try {
      // Get all open positions
      const positions = await Position.find({
        userId,
        status: 'OPEN'
      });

      if (positions.length === 0) {
        return this.getEmptyMetrics();
      }

      // Calculate exposures
      const exposures = this.calculateExposures(positions, equity);
      
      // Calculate VaR
      const var95 = await this.calculateVaR(positions, equity, 0.95);
      const var99 = await this.calculateVaR(positions, equity, 0.99);
      const cvar95 = await this.calculateCVaR(positions, equity, 0.95);
      
      // Calculate concentration
      const concentration = this.calculateConcentration(positions, equity);
      
      // Calculate correlation
      const correlation = await this.calculateCorrelation(positions);
      
      // Calculate volatility
      const volatility = await this.calculateVolatility(positions, equity);

      const metrics: PortfolioRiskMetrics = {
        var95,
        var99,
        cvar95,
        ...exposures,
        ...concentration,
        ...correlation,
        ...volatility
      };

      // Update Prometheus metrics
      this.updateMetrics(metrics);

      return metrics;

    } catch (error: any) {
      logger.error('[PortfolioRiskManager] Error calculating risk metrics:', error);
      return this.getEmptyMetrics();
    }
  }

  /**
   * Calculate Value at Risk (VaR)
   * Historical simulation method
   */
  private async calculateVaR(
    positions: any[],
    equity: number,
    confidenceLevel: number
  ): Promise<number> {
    // In production, this would use historical price data
    // For now, we'll use a simplified calculation based on position volatility
    
    const positionVaRs = positions.map(pos => {
      const notional = Math.abs(pos.quantity * pos.entryPrice);
      const volatility = pos.volatility || 0.02; // 2% default daily volatility
      
      // VaR = notional * volatility * z-score
      const zScore = confidenceLevel === 0.95 ? 1.645 : 2.326;
      return notional * volatility * zScore;
    });

    // Portfolio VaR (assuming some diversification)
    const sumVaR = positionVaRs.reduce((sum, var_) => sum + var_, 0);
    const diversificationFactor = 0.8; // 20% diversification benefit
    
    return sumVaR * diversificationFactor;
  }

  /**
   * Calculate Conditional VaR (Expected Shortfall)
   */
  private async calculateCVaR(
    positions: any[],
    equity: number,
    confidenceLevel: number
  ): Promise<number> {
    const var95 = await this.calculateVaR(positions, equity, confidenceLevel);
    // CVaR is typically 20-30% higher than VaR
    return var95 * 1.25;
  }

  /**
   * Calculate portfolio exposures
   */
  private calculateExposures(positions: any[], equity: number): {
    totalExposure: number;
    netExposure: number;
    grossExposure: number;
    leverage: number;
  } {
    let longExposure = 0;
    let shortExposure = 0;

    for (const pos of positions) {
      const notional = Math.abs(pos.quantity * pos.entryPrice);
      if (pos.side === 'BUY') {
        longExposure += notional;
      } else {
        shortExposure += notional;
      }
    }

    const netExposure = longExposure - shortExposure;
    const grossExposure = longExposure + shortExposure;
    const leverage = grossExposure / equity;

    return {
      totalExposure: grossExposure,
      netExposure,
      grossExposure,
      leverage
    };
  }

  /**
   * Calculate concentration metrics
   */
  private calculateConcentration(positions: any[], equity: number): {
    largestPosition: number;
    largestPositionPct: number;
    top3Concentration: number;
  } {
    const notionals = positions
      .map(pos => Math.abs(pos.quantity * pos.entryPrice))
      .sort((a, b) => b - a);

    const largestPosition = notionals[0] || 0;
    const largestPositionPct = largestPosition / equity;
    
    const top3 = notionals.slice(0, 3).reduce((sum, n) => sum + n, 0);
    const top3Concentration = top3 / equity;

    return {
      largestPosition,
      largestPositionPct,
      top3Concentration
    };
  }

  /**
   * Calculate correlation matrix
   */
  private async calculateCorrelation(positions: any[]): Promise<{
    avgCorrelation: number;
    maxCorrelation: number;
    correlationMatrix: Map<string, Map<string, number>>;
  }> {
    // In production, this would use historical price data
    // For now, we'll use simplified correlation based on asset class
    
    const correlationMatrix = new Map<string, Map<string, number>>();
    const correlations: number[] = [];

    for (let i = 0; i < positions.length; i++) {
      const symbol1 = positions[i].symbol;
      if (!correlationMatrix.has(symbol1)) {
        correlationMatrix.set(symbol1, new Map());
      }

      for (let j = i + 1; j < positions.length; j++) {
        const symbol2 = positions[j].symbol;
        
        // Simplified correlation (in production, use historical data)
        const corr = this.estimateCorrelation(symbol1, symbol2);
        
        correlationMatrix.get(symbol1)!.set(symbol2, corr);
        correlations.push(corr);
      }
    }

    const avgCorrelation = correlations.length > 0
      ? correlations.reduce((sum, c) => sum + c, 0) / correlations.length
      : 0;
    
    const maxCorrelation = correlations.length > 0
      ? Math.max(...correlations)
      : 0;

    return {
      avgCorrelation,
      maxCorrelation,
      correlationMatrix
    };
  }

  /**
   * Estimate correlation between two symbols
   */
  private estimateCorrelation(symbol1: string, symbol2: string): number {
    // Same symbol = perfect correlation
    if (symbol1 === symbol2) return 1.0;

    // Extract base assets (e.g., BTC from BTCUSD)
    const base1 = symbol1.replace('USD', '').replace('USDT', '');
    const base2 = symbol2.replace('USD', '').replace('USDT', '');

    // Major crypto pairs typically have moderate correlation
    const majorCryptos = ['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'XRP'];
    const isMajor1 = majorCryptos.includes(base1);
    const isMajor2 = majorCryptos.includes(base2);

    if (isMajor1 && isMajor2) {
      return 0.6; // Moderate correlation
    }

    // Altcoins with major crypto
    if (isMajor1 || isMajor2) {
      return 0.4;
    }

    // Altcoins with each other
    return 0.3;
  }

  /**
   * Calculate portfolio volatility
   */
  private async calculateVolatility(positions: any[], equity: number): Promise<{
    portfolioVolatility: number;
    avgPositionVolatility: number;
  }> {
    const volatilities = positions.map(pos => pos.volatility || 0.02);
    
    const avgPositionVolatility = volatilities.length > 0
      ? volatilities.reduce((sum, v) => sum + v, 0) / volatilities.length
      : 0;

    // Portfolio volatility (simplified, assumes some diversification)
    const weights = positions.map(pos => 
      Math.abs(pos.quantity * pos.entryPrice) / equity
    );

    let portfolioVariance = 0;
    for (let i = 0; i < positions.length; i++) {
      portfolioVariance += Math.pow(weights[i] * volatilities[i], 2);
    }

    const portfolioVolatility = Math.sqrt(portfolioVariance);

    return {
      portfolioVolatility,
      avgPositionVolatility
    };
  }

  /**
   * Check risk limits
   */
  async checkRiskLimits(userId: Types.ObjectId, equity: number): Promise<RiskLimit[]> {
    const metrics = await this.calculateRiskMetrics(userId, equity);
    const breaches: RiskLimit[] = [];

    // Check VaR limit
    const var95Pct = metrics.var95 / equity;
    if (var95Pct > this.limits.maxVar95Pct) {
      breaches.push({
        type: 'VAR',
        value: var95Pct,
        threshold: this.limits.maxVar95Pct,
        breached: true
      });
    }

    // Check exposure limit
    const exposurePct = metrics.grossExposure / equity;
    if (exposurePct > this.limits.maxExposurePct) {
      breaches.push({
        type: 'EXPOSURE',
        value: exposurePct,
        threshold: this.limits.maxExposurePct,
        breached: true
      });
    }

    // Check concentration limit
    if (metrics.largestPositionPct > this.limits.maxSinglePositionPct) {
      breaches.push({
        type: 'CONCENTRATION',
        value: metrics.largestPositionPct,
        threshold: this.limits.maxSinglePositionPct,
        breached: true
      });
    }

    // Check correlation limit
    if (metrics.maxCorrelation > this.limits.maxCorrelation) {
      breaches.push({
        type: 'CORRELATION',
        value: metrics.maxCorrelation,
        threshold: this.limits.maxCorrelation,
        breached: true
      });
    }

    return breaches;
  }

  /**
   * Update Prometheus metrics
   */
  private updateMetrics(metrics: PortfolioRiskMetrics): void {
    metricsService.setGauge('portfolio_var_95', metrics.var95);
    metricsService.setGauge('portfolio_var_99', metrics.var99);
    metricsService.setGauge('portfolio_cvar_95', metrics.cvar95);
    metricsService.setGauge('portfolio_leverage', metrics.leverage);
    metricsService.setGauge('portfolio_concentration', metrics.top3Concentration);
    metricsService.setGauge('portfolio_correlation_avg', metrics.avgCorrelation);
    metricsService.setGauge('portfolio_volatility', metrics.portfolioVolatility);
  }

  /**
   * Get empty metrics
   */
  private getEmptyMetrics(): PortfolioRiskMetrics {
    return {
      var95: 0,
      var99: 0,
      cvar95: 0,
      totalExposure: 0,
      netExposure: 0,
      grossExposure: 0,
      leverage: 0,
      largestPosition: 0,
      largestPositionPct: 0,
      top3Concentration: 0,
      avgCorrelation: 0,
      maxCorrelation: 0,
      correlationMatrix: new Map(),
      portfolioVolatility: 0,
      avgPositionVolatility: 0
    };
  }

  /**
   * Update risk limits
   */
  updateLimits(limits: Partial<typeof PortfolioRiskManager.prototype.limits>): void {
    this.limits = { ...this.limits, ...limits };
    logger.info('[PortfolioRiskManager] Risk limits updated', this.limits);
  }

  /**
   * Get current risk limits
   */
  getLimits(): typeof PortfolioRiskManager.prototype.limits {
    return { ...this.limits };
  }
}

export const portfolioRiskManager = PortfolioRiskManager.getInstance();
