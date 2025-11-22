/**
 * Adaptive Position Sizer
 * Dynamically adjusts position sizes based on:
 * - ML confidence scores
 * - Market regime
 * - Account volatility
 * - Win rate history
 * - Risk/reward ratio
 */

import logger from '../../utils/logger';
import { metricsService } from '../metricsService';
import { MarketRegime, RegimeAnalysis } from './marketRegimeDetector';
import { FilteredSignal } from './advancedSignalFilter';

export interface PositionSizeConfig {
  baseRiskPerTrade: number; // Base % of equity to risk (e.g., 0.02 = 2%)
  maxRiskPerTrade: number; // Maximum % of equity to risk
  minRiskPerTrade: number; // Minimum % of equity to risk
  confidenceScaling: boolean; // Scale by ML confidence
  regimeScaling: boolean; // Scale by market regime
  volatilityScaling: boolean; // Scale by account volatility
  winRateScaling: boolean; // Scale by recent win rate
  kellyFraction: number; // Kelly Criterion fraction (0-1)
}

export interface PositionSizeInput {
  signal: FilteredSignal;
  regime: RegimeAnalysis;
  currentEquity: number;
  entryPrice: number;
  stopLossPrice: number;
  recentWinRate?: number;
  accountVolatility?: number;
}

export interface PositionSizeResult {
  quantity: number;
  riskAmount: number;
  riskPercent: number;
  positionValue: number;
  reasoning: string[];
  scalingFactors: {
    confidence: number;
    regime: number;
    volatility: number;
    winRate: number;
    kelly: number;
    final: number;
  };
}

class AdaptivePositionSizer {
  private static instance: AdaptivePositionSizer;
  private config: PositionSizeConfig;

  private constructor() {
    this.config = {
      baseRiskPerTrade: 0.02, // 2% base risk
      maxRiskPerTrade: 0.05, // 5% max risk
      minRiskPerTrade: 0.005, // 0.5% min risk
      confidenceScaling: true,
      regimeScaling: true,
      volatilityScaling: true,
      winRateScaling: true,
      kellyFraction: 0.25 // Conservative Kelly (25% of full Kelly)
    };
  }

  static getInstance(): AdaptivePositionSizer {
    if (!AdaptivePositionSizer.instance) {
      AdaptivePositionSizer.instance = new AdaptivePositionSizer();
    }
    return AdaptivePositionSizer.instance;
  }

  /**
   * Calculate optimal position size
   */
  async calculatePositionSize(input: PositionSizeInput): Promise<PositionSizeResult> {
    try {
      const reasoning: string[] = [];
      const scalingFactors = {
        confidence: 1.0,
        regime: 1.0,
        volatility: 1.0,
        winRate: 1.0,
        kelly: 1.0,
        final: 1.0
      };

      // Start with base risk
      let riskPercent = this.config.baseRiskPerTrade;
      reasoning.push(`Base risk: ${(riskPercent * 100).toFixed(2)}%`);

      // 1. Scale by ML confidence
      if (this.config.confidenceScaling && input.signal.mlConfidence) {
        scalingFactors.confidence = this.calculateConfidenceScaling(input.signal.mlConfidence);
        riskPercent *= scalingFactors.confidence;
        reasoning.push(`Confidence scaling: ${scalingFactors.confidence.toFixed(2)}x (confidence: ${(input.signal.mlConfidence * 100).toFixed(1)}%)`);
      }

      // 2. Scale by market regime
      if (this.config.regimeScaling) {
        scalingFactors.regime = input.regime.tradingRecommendation.positionSizeMultiplier;
        riskPercent *= scalingFactors.regime;
        reasoning.push(`Regime scaling: ${scalingFactors.regime.toFixed(2)}x (${input.regime.regime})`);
      }

      // 3. Scale by account volatility
      if (this.config.volatilityScaling && input.accountVolatility) {
        scalingFactors.volatility = this.calculateVolatilityScaling(input.accountVolatility);
        riskPercent *= scalingFactors.volatility;
        reasoning.push(`Volatility scaling: ${scalingFactors.volatility.toFixed(2)}x (volatility: ${input.accountVolatility.toFixed(1)}%)`);
      }

      // 4. Scale by win rate
      if (this.config.winRateScaling && input.recentWinRate !== undefined) {
        scalingFactors.winRate = this.calculateWinRateScaling(input.recentWinRate);
        riskPercent *= scalingFactors.winRate;
        reasoning.push(`Win rate scaling: ${scalingFactors.winRate.toFixed(2)}x (win rate: ${(input.recentWinRate * 100).toFixed(1)}%)`);
      }

      // 5. Kelly Criterion adjustment
      if (input.recentWinRate !== undefined) {
        const avgWin = 1.5; // Assume 1.5R average win
        const avgLoss = 1.0; // 1R average loss
        scalingFactors.kelly = this.calculateKellyCriterion(input.recentWinRate, avgWin, avgLoss);
        riskPercent *= scalingFactors.kelly;
        reasoning.push(`Kelly adjustment: ${scalingFactors.kelly.toFixed(2)}x`);
      }

      // Apply limits
      riskPercent = Math.max(this.config.minRiskPerTrade, Math.min(this.config.maxRiskPerTrade, riskPercent));
      reasoning.push(`Final risk (after limits): ${(riskPercent * 100).toFixed(2)}%`);

      // Calculate position size
      const riskAmount = input.currentEquity * riskPercent;
      const stopDistance = Math.abs(input.entryPrice - input.stopLossPrice);
      const stopDistancePercent = stopDistance / input.entryPrice;
      
      // Calculate risk-based quantity
      const riskBasedQuantity = riskAmount / stopDistance;
      
      // Also calculate exposure-based quantity to respect portfolio limits
      // Assume max 75% exposure across 6 positions = 12.5% per position
      const maxExposurePct = 0.75;
      const maxPositions = 6;
      const maxNotionalPerPosition = (input.currentEquity * maxExposurePct) / maxPositions;
      const exposureBasedQuantity = maxNotionalPerPosition / input.entryPrice;
      
      // Use the SMALLER of the two to respect both risk and exposure limits
      const quantity = Math.min(riskBasedQuantity, exposureBasedQuantity);
      const positionValue = quantity * input.entryPrice;
      
      // Log if exposure limit is constraining the position
      if (quantity < riskBasedQuantity) {
        reasoning.push(`Exposure limit applied: ${quantity.toFixed(6)} (was ${riskBasedQuantity.toFixed(6)} from risk calc)`);
        logger.warn(`[AdaptivePositionSizer] ${input.signal.symbol} position constrained by exposure limit: ${(positionValue / input.currentEquity * 100).toFixed(1)}% of equity`);
      }

      // Calculate final scaling factor
      scalingFactors.final = riskPercent / this.config.baseRiskPerTrade;

      logger.info(`[AdaptivePositionSizer] ${input.signal.symbol}`, {
        riskPercent: (riskPercent * 100).toFixed(2) + '%',
        quantity: quantity.toFixed(6),
        positionValue: positionValue.toFixed(2),
        finalScaling: scalingFactors.final.toFixed(2)
      });

      metricsService.setGauge('position_size_scaling', scalingFactors.final, { symbol: input.signal.symbol });
      metricsService.setGauge('position_risk_percent', riskPercent * 100, { symbol: input.signal.symbol });

      return {
        quantity,
        riskAmount,
        riskPercent,
        positionValue,
        reasoning,
        scalingFactors
      };
    } catch (error: any) {
      logger.error('[AdaptivePositionSizer] Error calculating position size:', error);
      
      // Fallback to conservative sizing
      const riskAmount = input.currentEquity * this.config.minRiskPerTrade;
      const stopDistance = Math.abs(input.entryPrice - input.stopLossPrice);
      const quantity = riskAmount / stopDistance;

      return {
        quantity,
        riskAmount,
        riskPercent: this.config.minRiskPerTrade,
        positionValue: quantity * input.entryPrice,
        reasoning: ['Error occurred - using minimum risk'],
        scalingFactors: {
          confidence: 1.0,
          regime: 1.0,
          volatility: 1.0,
          winRate: 1.0,
          kelly: 1.0,
          final: 1.0
        }
      };
    }
  }

  /**
   * Calculate confidence-based scaling
   * High confidence = larger position
   */
  private calculateConfidenceScaling(confidence: number): number {
    // Map confidence (0-1) to scaling (0.5-1.5)
    // confidence 0.5 = 0.5x
    // confidence 0.7 = 1.0x
    // confidence 1.0 = 1.5x
    
    if (confidence < 0.5) {
      return 0.5;
    } else if (confidence < 0.7) {
      // Linear from 0.5x to 1.0x
      return 0.5 + (confidence - 0.5) / 0.2 * 0.5;
    } else {
      // Linear from 1.0x to 1.5x
      return 1.0 + (confidence - 0.7) / 0.3 * 0.5;
    }
  }

  /**
   * Calculate volatility-based scaling
   * High volatility = smaller position
   */
  private calculateVolatilityScaling(volatility: number): number {
    // volatility in % (e.g., 50 = 50% annual volatility)
    
    if (volatility < 30) {
      return 1.2; // Low volatility - increase size
    } else if (volatility < 50) {
      return 1.0; // Normal volatility
    } else if (volatility < 70) {
      return 0.85; // High volatility - reduce size
    } else {
      return 0.6; // Very high volatility - significantly reduce
    }
  }

  /**
   * Calculate win rate-based scaling
   * Higher win rate = larger position
   */
  private calculateWinRateScaling(winRate: number): number {
    // winRate from 0-1
    
    if (winRate < 0.3) {
      return 0.6; // Poor win rate - reduce size
    } else if (winRate < 0.45) {
      return 0.8; // Below average
    } else if (winRate < 0.55) {
      return 1.0; // Average
    } else if (winRate < 0.65) {
      return 1.2; // Good win rate
    } else {
      return 1.4; // Excellent win rate
    }
  }

  /**
   * Calculate Kelly Criterion
   * Optimal position size based on edge and win rate
   */
  private calculateKellyCriterion(winRate: number, avgWin: number, avgLoss: number): number {
    // Kelly % = (W * R - L) / R
    // W = win rate, L = loss rate, R = avg win / avg loss
    
    const lossRate = 1 - winRate;
    const winLossRatio = avgWin / avgLoss;
    
    let kelly = (winRate * winLossRatio - lossRate) / winLossRatio;
    
    // Apply Kelly fraction for safety
    kelly *= this.config.kellyFraction;
    
    // Kelly can be negative (no edge) or > 1 (huge edge)
    // Clamp to reasonable range
    return Math.max(0.5, Math.min(1.5, 1 + kelly));
  }

  /**
   * Calculate position size for grid trading
   * Distributes capital across multiple levels
   */
  async calculateGridPositionSize(
    totalEquity: number,
    gridLevels: number,
    priceRange: { min: number; max: number },
    currentPrice: number,
    regime: RegimeAnalysis
  ): Promise<{ sizePerLevel: number; totalAllocation: number }> {
    // Allocate % of equity to grid
    let gridAllocation = 0.3; // Default 30% of equity

    // Adjust based on regime
    if (regime.regime === 'RANGING') {
      gridAllocation = 0.4; // Ranging is ideal for grid
    } else if (regime.regime.includes('TREND')) {
      gridAllocation = 0.2; // Reduce in trending markets
    }

    const totalAllocation = totalEquity * gridAllocation;
    const sizePerLevel = totalAllocation / gridLevels;

    logger.info(`[AdaptivePositionSizer] Grid sizing`, {
      gridLevels,
      gridAllocation: (gridAllocation * 100).toFixed(1) + '%',
      sizePerLevel: sizePerLevel.toFixed(2),
      totalAllocation: totalAllocation.toFixed(2)
    });

    return {
      sizePerLevel,
      totalAllocation
    };
  }

  /**
   * Calculate maximum position size based on liquidity
   */
  calculateMaxPositionByLiquidity(
    symbol: string,
    avgDailyVolume: number,
    currentPrice: number
  ): number {
    // Don't exceed 1% of daily volume
    const maxVolumeUSD = avgDailyVolume * currentPrice * 0.01;
    const maxQuantity = maxVolumeUSD / currentPrice;

    logger.info(`[AdaptivePositionSizer] Liquidity limit for ${symbol}`, {
      avgDailyVolume: avgDailyVolume.toFixed(2),
      maxQuantity: maxQuantity.toFixed(6)
    });

    return maxQuantity;
  }

  /**
   * Validate position size against constraints
   */
  validatePositionSize(
    quantity: number,
    entryPrice: number,
    minNotional: number,
    maxNotional: number,
    minQty: number,
    maxQty: number
  ): { valid: boolean; adjustedQuantity?: number; reason?: string } {
    const notional = quantity * entryPrice;

    // Check quantity limits
    if (quantity < minQty) {
      return {
        valid: false,
        adjustedQuantity: minQty,
        reason: `Quantity ${quantity.toFixed(6)} below minimum ${minQty}`
      };
    }

    if (quantity > maxQty) {
      return {
        valid: false,
        adjustedQuantity: maxQty,
        reason: `Quantity ${quantity.toFixed(6)} above maximum ${maxQty}`
      };
    }

    // Check notional limits
    if (notional < minNotional) {
      return {
        valid: false,
        adjustedQuantity: minNotional / entryPrice,
        reason: `Notional $${notional.toFixed(2)} below minimum $${minNotional}`
      };
    }

    if (notional > maxNotional) {
      return {
        valid: false,
        adjustedQuantity: maxNotional / entryPrice,
        reason: `Notional $${notional.toFixed(2)} above maximum $${maxNotional}`
      };
    }

    return { valid: true };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PositionSizeConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[AdaptivePositionSizer] Configuration updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): PositionSizeConfig {
    return { ...this.config };
  }

  /**
   * Calculate portfolio heat (total risk across all positions)
   */
  calculatePortfolioHeat(
    openPositions: Array<{ riskAmount: number }>,
    currentEquity: number
  ): number {
    const totalRisk = openPositions.reduce((sum, pos) => sum + pos.riskAmount, 0);
    return totalRisk / currentEquity;
  }

  /**
   * Check if new position would exceed portfolio heat limit
   */
  canAddPosition(
    newPositionRisk: number,
    openPositions: Array<{ riskAmount: number }>,
    currentEquity: number,
    maxPortfolioHeat: number = 0.10 // 10% max total risk
  ): { allowed: boolean; currentHeat: number; newHeat: number; reason?: string } {
    const currentHeat = this.calculatePortfolioHeat(openPositions, currentEquity);
    const newHeat = (currentHeat * currentEquity + newPositionRisk) / currentEquity;

    if (newHeat > maxPortfolioHeat) {
      return {
        allowed: false,
        currentHeat,
        newHeat,
        reason: `Would exceed portfolio heat limit: ${(newHeat * 100).toFixed(2)}% > ${(maxPortfolioHeat * 100).toFixed(2)}%`
      };
    }

    return {
      allowed: true,
      currentHeat,
      newHeat
    };
  }
}

export const adaptivePositionSizer = AdaptivePositionSizer.getInstance();
