import binanceService from '../binanceService';
import { multiTimeframeAnalysis } from './multiTimeframeAnalysis';

interface PositionSizeParams {
  symbol: string;
  accountEquity: number;
  basePositionSize: number; // Base size as percentage (e.g., 5 for 5%)
  maxPositionSize: number; // Max size as percentage (e.g., 10 for 10%)
  minPositionSize: number; // Min size as percentage (e.g., 2 for 2%)
}

interface RiskMetrics {
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
}

interface PositionSizeResult {
  positionSizeUSD: number;
  positionSizePercent: number;
  riskScore: number; // 0-100 (higher = riskier)
  adjustmentFactors: {
    volatility: number;
    confidence: number;
    portfolio: number;
    performance: number;
  };
  recommendation: string;
}

/**
 * Risk-Adjusted Position Sizing Service
 * Dynamically adjusts position sizes based on multiple risk factors
 */
export class RiskAdjustedSizing {
  private performanceCache: Map<string, RiskMetrics> = new Map();
  private readonly CACHE_TTL = 3600000; // 1 hour

  /**
   * Calculate optimal position size with risk adjustments
   */
  async calculatePositionSize(params: PositionSizeParams): Promise<PositionSizeResult> {
    console.log(`[RiskAdjustedSizing] Calculating position size for ${params.symbol}`);

    // Get multi-timeframe analysis
    const mtfAnalysis = await multiTimeframeAnalysis.analyze(params.symbol);

    // Calculate adjustment factors
    const volatilityFactor = await this.calculateVolatilityAdjustment(params.symbol);
    const confidenceFactor = this.calculateConfidenceAdjustment(mtfAnalysis.confidence);
    const portfolioFactor = await this.calculatePortfolioAdjustment(params.symbol);
    const performanceFactor = await this.calculatePerformanceAdjustment(params.symbol);

    // Combined adjustment (geometric mean to avoid extreme values)
    const combinedFactor = Math.pow(
      volatilityFactor * confidenceFactor * portfolioFactor * performanceFactor,
      0.25
    );

    // Apply adjustment to base position size
    let adjustedPercent = params.basePositionSize * combinedFactor;

    // Clamp to min/max bounds
    adjustedPercent = Math.max(params.minPositionSize, Math.min(params.maxPositionSize, adjustedPercent));

    const positionSizeUSD = (params.accountEquity * adjustedPercent) / 100;

    // Calculate risk score
    const riskScore = this.calculateRiskScore({
      volatilityFactor,
      confidenceFactor,
      portfolioFactor,
      performanceFactor,
    });

    const recommendation = this.generateRecommendation(riskScore, adjustedPercent, params);

    return {
      positionSizeUSD,
      positionSizePercent: adjustedPercent,
      riskScore,
      adjustmentFactors: {
        volatility: volatilityFactor,
        confidence: confidenceFactor,
        portfolio: portfolioFactor,
        performance: performanceFactor,
      },
      recommendation,
    };
  }

  /**
   * Volatility-based adjustment
   * Lower volatility = larger position, higher volatility = smaller position
   */
  private async calculateVolatilityAdjustment(symbol: string): Promise<number> {
    try {
      // Get recent price data
      const klines = await binanceService.getKlines(symbol, '1h', 100);
      if (!klines || klines.length < 20) return 1.0;

      const closes = klines.map((k: any) => parseFloat(k[4]));

      // Calculate returns
      const returns = [];
      for (let i = 1; i < closes.length; i++) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }

      // Calculate volatility (standard deviation)
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      const volatility = Math.sqrt(variance);

      // Normalize volatility to adjustment factor
      // Typical crypto volatility: 0.01-0.05 (1-5%)
      // Low volatility (< 2%) = 1.2x position
      // Medium volatility (2-4%) = 1.0x position
      // High volatility (> 4%) = 0.8x position

      if (volatility < 0.02) return 1.2;
      if (volatility < 0.04) return 1.0;
      if (volatility < 0.06) return 0.8;
      return 0.6;

    } catch (error) {
      console.error(`[RiskAdjustedSizing] Error calculating volatility for ${symbol}:`, error);
      return 1.0; // Neutral on error
    }
  }

  /**
   * Confidence-based adjustment
   * Higher confidence = larger position
   */
  private calculateConfidenceAdjustment(confidence: number): number {
    // Confidence is 0-100
    // < 50 = 0.7x position
    // 50-70 = 1.0x position
    // 70-85 = 1.2x position
    // > 85 = 1.4x position

    if (confidence < 50) return 0.7;
    if (confidence < 70) return 1.0;
    if (confidence < 85) return 1.2;
    return 1.4;
  }

  /**
   * Portfolio concentration adjustment
   * Reduce size if already heavily exposed to this asset
   */
  private async calculatePortfolioAdjustment(symbol: string): Promise<number> {
    try {
      // Get current positions
      const positions = await this.getCurrentPositions();
      const totalEquity = await this.getTotalEquity();

      // Find existing position for this symbol
      const existingPosition = positions.find(p => p.symbol === symbol);

      if (!existingPosition) return 1.0; // No existing position

      const exposurePercent = (existingPosition.valueUSD / totalEquity) * 100;

      // Reduce position size if already exposed
      // < 5% exposure = 1.0x
      // 5-10% exposure = 0.8x
      // 10-15% exposure = 0.6x
      // > 15% exposure = 0.4x

      if (exposurePercent < 5) return 1.0;
      if (exposurePercent < 10) return 0.8;
      if (exposurePercent < 15) return 0.6;
      return 0.4;

    } catch (error) {
      console.error(`[RiskAdjustedSizing] Error calculating portfolio adjustment:`, error);
      return 1.0;
    }
  }

  /**
   * Performance-based adjustment
   * Better historical performance = larger position
   */
  private async calculatePerformanceAdjustment(symbol: string): Promise<number> {
    try {
      const metrics = await this.getPerformanceMetrics(symbol);

      if (!metrics) return 1.0;

      // Calculate performance score
      let score = 0;

      // Win rate component (0-40 points)
      score += metrics.winRate * 0.4;

      // Sharpe ratio component (0-30 points)
      // Sharpe > 2 = excellent, 1-2 = good, 0-1 = poor
      if (metrics.sharpeRatio > 2) score += 30;
      else if (metrics.sharpeRatio > 1) score += 20;
      else if (metrics.sharpeRatio > 0) score += 10;

      // Risk/reward component (0-30 points)
      const riskRewardRatio = Math.abs(metrics.avgWin / metrics.avgLoss);
      if (riskRewardRatio > 2) score += 30;
      else if (riskRewardRatio > 1.5) score += 20;
      else if (riskRewardRatio > 1) score += 10;

      // Convert score to adjustment factor
      // < 30 = 0.7x
      // 30-60 = 1.0x
      // 60-80 = 1.2x
      // > 80 = 1.4x

      if (score < 30) return 0.7;
      if (score < 60) return 1.0;
      if (score < 80) return 1.2;
      return 1.4;

    } catch (error) {
      console.error(`[RiskAdjustedSizing] Error calculating performance adjustment:`, error);
      return 1.0;
    }
  }

  /**
   * Calculate overall risk score
   */
  private calculateRiskScore(factors: {
    volatilityFactor: number;
    confidenceFactor: number;
    portfolioFactor: number;
    performanceFactor: number;
  }): number {
    // Lower factors = higher risk
    // Convert factors to risk scores (inverse relationship)

    const volatilityRisk = (2 - factors.volatilityFactor) * 25; // 0-50
    const confidenceRisk = (2 - factors.confidenceFactor) * 20; // 0-40
    const portfolioRisk = (2 - factors.portfolioFactor) * 15; // 0-30
    const performanceRisk = (2 - factors.performanceFactor) * 10; // 0-20

    const totalRisk = volatilityRisk + confidenceRisk + portfolioRisk + performanceRisk;

    return Math.max(0, Math.min(100, totalRisk));
  }

  /**
   * Generate recommendation based on risk score
   */
  private generateRecommendation(
    riskScore: number,
    positionPercent: number,
    params: PositionSizeParams
  ): string {
    if (riskScore < 30) {
      return `Low risk (${riskScore.toFixed(0)}/100). Position size ${positionPercent.toFixed(1)}% is appropriate.`;
    }

    if (riskScore < 60) {
      return `Medium risk (${riskScore.toFixed(0)}/100). Position size ${positionPercent.toFixed(1)}% is acceptable.`;
    }

    if (riskScore < 80) {
      return `High risk (${riskScore.toFixed(0)}/100). Position size reduced to ${positionPercent.toFixed(1)}%. Consider skipping.`;
    }

    return `Very high risk (${riskScore.toFixed(0)}/100). Position size minimized to ${positionPercent.toFixed(1)}%. Strongly consider skipping.`;
  }

  /**
   * Get current positions from database
   */
  private async getCurrentPositions(): Promise<any[]> {
    try {
      const response = await fetch('http://localhost:3000/api/positions');
      const data = await response.json();
      return data.positions || [];
    } catch (error) {
      console.error('[RiskAdjustedSizing] Error fetching positions:', error);
      return [];
    }
  }

  /**
   * Get total account equity
   */
  private async getTotalEquity(): Promise<number> {
    try {
      const response = await fetch('http://localhost:3000/api/account/equity');
      const data = await response.json();
      return data.totalEquity || 0;
    } catch (error) {
      console.error('[RiskAdjustedSizing] Error fetching equity:', error);
      return 0;
    }
  }

  /**
   * Get performance metrics for symbol
   */
  private async getPerformanceMetrics(symbol: string): Promise<RiskMetrics | null> {
    try {
      // Check cache
      if (this.performanceCache.has(symbol)) {
        return this.performanceCache.get(symbol)!;
      }

      // Fetch closed trades for this symbol
      const response = await fetch(`http://localhost:3000/api/trades?symbol=${symbol}&status=CLOSED`);
      const data = await response.json();
      const trades = data.trades || [];

      if (trades.length < 5) return null; // Need at least 5 trades for meaningful metrics

      // Calculate metrics
      const wins = trades.filter((t: any) => t.pnl > 0);
      const losses = trades.filter((t: any) => t.pnl < 0);

      const winRate = (wins.length / trades.length) * 100;
      const avgWin = wins.length > 0 ? wins.reduce((sum: number, t: any) => sum + t.pnl, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((sum: number, t: any) => sum + Math.abs(t.pnl), 0) / losses.length : 0;

      // Calculate Sharpe ratio (simplified)
      const returns = trades.map((t: any) => t.pnl);
      const avgReturn = returns.reduce((a: number, b: number) => a + b, 0) / returns.length;
      const stdDev = Math.sqrt(
        returns.reduce((sum: number, r: number) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
      );
      const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

      // Calculate max drawdown
      let peak = 0;
      let maxDrawdown = 0;
      let cumulative = 0;

      for (const trade of trades) {
        cumulative += trade.pnl;
        if (cumulative > peak) peak = cumulative;
        const drawdown = ((peak - cumulative) / peak) * 100;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }

      const metrics: RiskMetrics = {
        volatility: stdDev,
        sharpeRatio,
        maxDrawdown,
        winRate,
        avgWin,
        avgLoss,
      };

      // Cache metrics
      this.performanceCache.set(symbol, metrics);

      // Clear cache after TTL
      setTimeout(() => {
        this.performanceCache.delete(symbol);
      }, this.CACHE_TTL);

      return metrics;

    } catch (error) {
      console.error(`[RiskAdjustedSizing] Error fetching performance metrics:`, error);
      return null;
    }
  }
}

// Singleton instance
export const riskAdjustedSizing = new RiskAdjustedSizing();
