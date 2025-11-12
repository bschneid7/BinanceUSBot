/**
 * Market Regime Detector
 * Identifies current market conditions (trending, ranging, volatile, etc.)
 * Adapts trading strategy based on detected regime
 */

import logger from '../../utils/logger';
import { metricsService } from '../metricsService';
import { CandleData } from './patternRecognition';

export type MarketRegime = 
  | 'STRONG_UPTREND'
  | 'UPTREND'
  | 'WEAK_UPTREND'
  | 'RANGING'
  | 'WEAK_DOWNTREND'
  | 'DOWNTREND'
  | 'STRONG_DOWNTREND'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY';

export interface RegimeAnalysis {
  regime: MarketRegime;
  confidence: number; // 0-1
  trendStrength: number; // -1 to 1 (negative = down, positive = up)
  volatility: number; // Percentage
  momentum: number; // -1 to 1
  characteristics: string[];
  tradingRecommendation: {
    strategy: 'TREND_FOLLOWING' | 'MEAN_REVERSION' | 'BREAKOUT' | 'CONSERVATIVE';
    positionSizeMultiplier: number; // 0.5 to 1.5
    stopLossMultiplier: number; // 0.8 to 1.5
    takeProf itMultiplier: number; // 0.8 to 1.5
  };
}

class MarketRegimeDetector {
  private static instance: MarketRegimeDetector;
  private regimeHistory: Map<string, RegimeAnalysis[]> = new Map();
  private readonly HISTORY_LENGTH = 10;

  private constructor() {}

  static getInstance(): MarketRegimeDetector {
    if (!MarketRegimeDetector.instance) {
      MarketRegimeDetector.instance = new MarketRegimeDetector();
    }
    return MarketRegimeDetector.instance;
  }

  /**
   * Detect current market regime
   */
  async detectRegime(symbol: string, candles: CandleData[]): Promise<RegimeAnalysis> {
    try {
      if (candles.length < 20) {
        logger.warn(`[MarketRegime] Insufficient data for ${symbol}`);
        return this.getDefaultRegime();
      }

      // Calculate regime indicators
      const trendStrength = this.calculateTrendStrength(candles);
      const volatility = this.calculateVolatility(candles);
      const momentum = this.calculateMomentum(candles);
      const adx = this.calculateADX(candles);
      const atr = this.calculateATR(candles);

      // Determine regime
      const regime = this.classifyRegime(trendStrength, volatility, momentum, adx);
      const confidence = this.calculateConfidence(trendStrength, volatility, adx);
      const characteristics = this.getCharacteristics(regime, trendStrength, volatility, momentum);
      const tradingRecommendation = this.getRecommendation(regime, volatility, trendStrength);

      const analysis: RegimeAnalysis = {
        regime,
        confidence,
        trendStrength,
        volatility,
        momentum,
        characteristics,
        tradingRecommendation
      };

      // Store in history
      this.updateHistory(symbol, analysis);

      logger.info(`[MarketRegime] ${symbol}: ${regime}`, {
        confidence: confidence.toFixed(3),
        trendStrength: trendStrength.toFixed(3),
        volatility: volatility.toFixed(2) + '%',
        strategy: tradingRecommendation.strategy
      });

      metricsService.setGauge('market_regime_confidence', confidence, { symbol });
      metricsService.setGauge('market_trend_strength', trendStrength, { symbol });
      metricsService.setGauge('market_volatility', volatility, { symbol });

      return analysis;
    } catch (error: any) {
      logger.error('[MarketRegime] Error detecting regime:', error);
      return this.getDefaultRegime();
    }
  }

  /**
   * Calculate trend strength using linear regression
   */
  private calculateTrendStrength(candles: CandleData[]): number {
    const closes = candles.map(c => c.close);
    const len = closes.length;

    // Linear regression
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < len; i++) {
      sumX += i;
      sumY += closes[i];
      sumXY += i * closes[i];
      sumX2 += i * i;
    }

    const slope = (len * sumXY - sumX * sumY) / (len * sumX2 - sumX * sumX);
    const avgPrice = sumY / len;
    
    // Normalize slope to -1 to 1 range
    const normalizedSlope = (slope / avgPrice) * len;
    return Math.max(-1, Math.min(1, normalizedSlope));
  }

  /**
   * Calculate volatility (standard deviation of returns)
   */
  private calculateVolatility(candles: CandleData[]): number {
    const returns: number[] = [];
    
    for (let i = 1; i < candles.length; i++) {
      const ret = (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
      returns.push(ret);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Annualized volatility (assuming hourly candles)
    return stdDev * Math.sqrt(24 * 365) * 100;
  }

  /**
   * Calculate momentum using rate of change
   */
  private calculateMomentum(candles: CandleData[]): number {
    const len = candles.length;
    const period = Math.min(14, len);
    
    const current = candles[len - 1].close;
    const past = candles[len - period].close;
    
    const roc = (current - past) / past;
    
    // Normalize to -1 to 1
    return Math.max(-1, Math.min(1, roc * 10));
  }

  /**
   * Calculate Average Directional Index (ADX)
   * Measures trend strength (0-100)
   */
  private calculateADX(candles: CandleData[], period: number = 14): number {
    if (candles.length < period + 1) return 0;

    const trueRanges: number[] = [];
    const plusDMs: number[] = [];
    const minusDMs: number[] = [];

    // Calculate True Range and Directional Movements
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      const prevHigh = candles[i - 1].high;
      const prevLow = candles[i - 1].low;

      // True Range
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);

      // Directional Movements
      const highDiff = high - prevHigh;
      const lowDiff = prevLow - low;

      const plusDM = highDiff > lowDiff && highDiff > 0 ? highDiff : 0;
      const minusDM = lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0;

      plusDMs.push(plusDM);
      minusDMs.push(minusDM);
    }

    // Calculate smoothed averages
    const atr = this.smoothedAverage(trueRanges, period);
    const plusDI = (this.smoothedAverage(plusDMs, period) / atr) * 100;
    const minusDI = (this.smoothedAverage(minusDMs, period) / atr) * 100;

    // Calculate DX and ADX
    const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
    
    return Math.min(100, dx);
  }

  /**
   * Calculate Average True Range (ATR)
   */
  private calculateATR(candles: CandleData[], period: number = 14): number {
    if (candles.length < period + 1) return 0;

    const trueRanges: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    return this.smoothedAverage(trueRanges, period);
  }

  /**
   * Calculate smoothed average (Wilder's smoothing)
   */
  private smoothedAverage(values: number[], period: number): number {
    if (values.length < period) return 0;

    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += values[i];
    }
    let smoothed = sum / period;

    for (let i = period; i < values.length; i++) {
      smoothed = (smoothed * (period - 1) + values[i]) / period;
    }

    return smoothed;
  }

  /**
   * Classify market regime based on indicators
   */
  private classifyRegime(
    trendStrength: number,
    volatility: number,
    momentum: number,
    adx: number
  ): MarketRegime {
    // High volatility regime
    if (volatility > 80) {
      return 'HIGH_VOLATILITY';
    }

    // Low volatility regime
    if (volatility < 20 && adx < 20) {
      return 'LOW_VOLATILITY';
    }

    // Ranging market (weak trend)
    if (adx < 25 && Math.abs(trendStrength) < 0.3) {
      return 'RANGING';
    }

    // Trending markets
    if (trendStrength > 0.6 && adx > 40) {
      return 'STRONG_UPTREND';
    } else if (trendStrength > 0.3 && adx > 25) {
      return 'UPTREND';
    } else if (trendStrength > 0.1) {
      return 'WEAK_UPTREND';
    } else if (trendStrength < -0.6 && adx > 40) {
      return 'STRONG_DOWNTREND';
    } else if (trendStrength < -0.3 && adx > 25) {
      return 'DOWNTREND';
    } else if (trendStrength < -0.1) {
      return 'WEAK_DOWNTREND';
    }

    return 'RANGING';
  }

  /**
   * Calculate confidence in regime classification
   */
  private calculateConfidence(trendStrength: number, volatility: number, adx: number): number {
    let confidence = 0.5;

    // Strong ADX increases confidence
    if (adx > 40) {
      confidence += 0.3;
    } else if (adx > 25) {
      confidence += 0.2;
    }

    // Strong trend strength increases confidence
    if (Math.abs(trendStrength) > 0.6) {
      confidence += 0.2;
    }

    // Moderate volatility increases confidence
    if (volatility > 30 && volatility < 70) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }

  /**
   * Get regime characteristics
   */
  private getCharacteristics(
    regime: MarketRegime,
    trendStrength: number,
    volatility: number,
    momentum: number
  ): string[] {
    const characteristics: string[] = [];

    // Trend characteristics
    if (Math.abs(trendStrength) > 0.6) {
      characteristics.push('Strong directional movement');
    } else if (Math.abs(trendStrength) < 0.2) {
      characteristics.push('Weak directional movement');
    }

    // Volatility characteristics
    if (volatility > 70) {
      characteristics.push('High volatility - increased risk');
    } else if (volatility < 30) {
      characteristics.push('Low volatility - stable conditions');
    }

    // Momentum characteristics
    if (Math.abs(momentum) > 0.7) {
      characteristics.push('Strong momentum');
    } else if (Math.abs(momentum) < 0.3) {
      characteristics.push('Weak momentum');
    }

    // Regime-specific characteristics
    switch (regime) {
      case 'STRONG_UPTREND':
        characteristics.push('Ideal for trend following');
        characteristics.push('Consider trailing stops');
        break;
      case 'STRONG_DOWNTREND':
        characteristics.push('Avoid long positions');
        characteristics.push('Consider short opportunities');
        break;
      case 'RANGING':
        characteristics.push('Ideal for mean reversion');
        characteristics.push('Trade support/resistance');
        break;
      case 'HIGH_VOLATILITY':
        characteristics.push('Reduce position sizes');
        characteristics.push('Widen stop losses');
        break;
      case 'LOW_VOLATILITY':
        characteristics.push('Potential for breakout');
        characteristics.push('Consider breakout strategies');
        break;
    }

    return characteristics;
  }

  /**
   * Get trading recommendations based on regime
   */
  private getRecommendation(
    regime: MarketRegime,
    volatility: number,
    trendStrength: number
  ): RegimeAnalysis['tradingRecommendation'] {
    let strategy: RegimeAnalysis['tradingRecommendation']['strategy'];
    let positionSizeMultiplier = 1.0;
    let stopLossMultiplier = 1.0;
    let takeProfitMultiplier = 1.0;

    switch (regime) {
      case 'STRONG_UPTREND':
      case 'STRONG_DOWNTREND':
        strategy = 'TREND_FOLLOWING';
        positionSizeMultiplier = 1.3;
        stopLossMultiplier = 1.2;
        takeProfitMultiplier = 1.5;
        break;

      case 'UPTREND':
      case 'DOWNTREND':
        strategy = 'TREND_FOLLOWING';
        positionSizeMultiplier = 1.1;
        stopLossMultiplier = 1.0;
        takeProfitMultiplier = 1.2;
        break;

      case 'RANGING':
        strategy = 'MEAN_REVERSION';
        positionSizeMultiplier = 1.0;
        stopLossMultiplier = 0.9;
        takeProfitMultiplier = 0.9;
        break;

      case 'LOW_VOLATILITY':
        strategy = 'BREAKOUT';
        positionSizeMultiplier = 1.2;
        stopLossMultiplier = 0.8;
        takeProfitMultiplier = 1.3;
        break;

      case 'HIGH_VOLATILITY':
        strategy = 'CONSERVATIVE';
        positionSizeMultiplier = 0.6;
        stopLossMultiplier = 1.5;
        takeProfitMultiplier = 1.5;
        break;

      default:
        strategy = 'CONSERVATIVE';
        positionSizeMultiplier = 0.8;
        stopLossMultiplier = 1.0;
        takeProfitMultiplier = 1.0;
    }

    // Adjust for volatility
    if (volatility > 70) {
      positionSizeMultiplier *= 0.7;
      stopLossMultiplier *= 1.3;
    } else if (volatility < 30) {
      positionSizeMultiplier *= 1.1;
      stopLossMultiplier *= 0.9;
    }

    return {
      strategy,
      positionSizeMultiplier: Math.max(0.5, Math.min(1.5, positionSizeMultiplier)),
      stopLossMultiplier: Math.max(0.8, Math.min(1.5, stopLossMultiplier)),
      takeProfitMultiplier: Math.max(0.8, Math.min(1.5, takeProfitMultiplier))
    };
  }

  /**
   * Get default regime (fallback)
   */
  private getDefaultRegime(): RegimeAnalysis {
    return {
      regime: 'RANGING',
      confidence: 0.5,
      trendStrength: 0,
      volatility: 50,
      momentum: 0,
      characteristics: ['Insufficient data for analysis'],
      tradingRecommendation: {
        strategy: 'CONSERVATIVE',
        positionSizeMultiplier: 0.8,
        stopLossMultiplier: 1.0,
        takeProfitMultiplier: 1.0
      }
    };
  }

  /**
   * Update regime history
   */
  private updateHistory(symbol: string, analysis: RegimeAnalysis): void {
    if (!this.regimeHistory.has(symbol)) {
      this.regimeHistory.set(symbol, []);
    }

    const history = this.regimeHistory.get(symbol)!;
    history.push(analysis);

    // Keep only recent history
    if (history.length > this.HISTORY_LENGTH) {
      history.shift();
    }
  }

  /**
   * Get regime history for a symbol
   */
  getHistory(symbol: string): RegimeAnalysis[] {
    return this.regimeHistory.get(symbol) || [];
  }

  /**
   * Check if regime has changed recently
   */
  hasRegimeChanged(symbol: string): boolean {
    const history = this.getHistory(symbol);
    if (history.length < 2) return false;

    const current = history[history.length - 1];
    const previous = history[history.length - 2];

    return current.regime !== previous.regime;
  }
}

export const marketRegimeDetector = MarketRegimeDetector.getInstance();
