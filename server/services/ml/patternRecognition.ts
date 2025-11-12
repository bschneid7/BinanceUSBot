/**
 * Pattern Recognition Service
 * Identifies profitable chart patterns and market structures
 * Improves entry/exit timing using technical pattern analysis
 */

import logger from '../../utils/logger';
import { metricsService } from '../metricsService';

export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Pattern {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0-1
  expectedMove: number; // Expected price move in %
  timeframe: string;
  description: string;
}

export interface PatternSignal {
  patterns: Pattern[];
  recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  confidence: number;
  optimalEntry?: number;
  optimalExit?: number;
  stopLoss?: number;
}

class PatternRecognitionService {
  private static instance: PatternRecognitionService;

  private constructor() {}

  static getInstance(): PatternRecognitionService {
    if (!PatternRecognitionService.instance) {
      PatternRecognitionService.instance = new PatternRecognitionService();
    }
    return PatternRecognitionService.instance;
  }

  /**
   * Analyze candle data and identify patterns
   */
  async analyzePatterns(
    symbol: string,
    candles: CandleData[],
    currentPrice: number
  ): Promise<PatternSignal> {
    try {
      const patterns: Pattern[] = [];

      // Check for various patterns
      patterns.push(...this.detectCandlestickPatterns(candles));
      patterns.push(...this.detectChartPatterns(candles));
      patterns.push(...this.detectSupportResistance(candles, currentPrice));
      patterns.push(...this.detectTrendPatterns(candles));

      // Calculate overall recommendation
      const signal = this.calculateRecommendation(patterns, candles, currentPrice);

      logger.info(`[PatternRecognition] ${symbol}: Found ${patterns.length} patterns`, {
        recommendation: signal.recommendation,
        confidence: signal.confidence.toFixed(3)
      });

      metricsService.setGauge('pattern_recognition_confidence', signal.confidence);
      metricsService.incrementCounter('patterns_detected', patterns.length, { symbol });

      return signal;
    } catch (error: any) {
      logger.error('[PatternRecognition] Error analyzing patterns:', error);
      return {
        patterns: [],
        recommendation: 'HOLD',
        confidence: 0
      };
    }
  }

  /**
   * Detect candlestick patterns
   */
  private detectCandlestickPatterns(candles: CandleData[]): Pattern[] {
    const patterns: Pattern[] = [];
    const len = candles.length;

    if (len < 3) return patterns;

    // Get recent candles
    const c0 = candles[len - 1]; // Current
    const c1 = candles[len - 2]; // Previous
    const c2 = candles[len - 3]; // 2 candles ago

    // Hammer (bullish reversal)
    if (this.isHammer(c0)) {
      patterns.push({
        name: 'Hammer',
        type: 'bullish',
        confidence: 0.70,
        expectedMove: 2.5,
        timeframe: '1h',
        description: 'Bullish reversal pattern with long lower shadow'
      });
    }

    // Shooting Star (bearish reversal)
    if (this.isShootingStar(c0)) {
      patterns.push({
        name: 'Shooting Star',
        type: 'bearish',
        confidence: 0.70,
        expectedMove: -2.5,
        timeframe: '1h',
        description: 'Bearish reversal pattern with long upper shadow'
      });
    }

    // Engulfing patterns
    if (this.isBullishEngulfing(c1, c0)) {
      patterns.push({
        name: 'Bullish Engulfing',
        type: 'bullish',
        confidence: 0.75,
        expectedMove: 3.0,
        timeframe: '1h',
        description: 'Strong bullish reversal - larger green candle engulfs previous red'
      });
    }

    if (this.isBearishEngulfing(c1, c0)) {
      patterns.push({
        name: 'Bearish Engulfing',
        type: 'bearish',
        confidence: 0.75,
        expectedMove: -3.0,
        timeframe: '1h',
        description: 'Strong bearish reversal - larger red candle engulfs previous green'
      });
    }

    // Morning Star (bullish reversal)
    if (this.isMorningStar(c2, c1, c0)) {
      patterns.push({
        name: 'Morning Star',
        type: 'bullish',
        confidence: 0.80,
        expectedMove: 4.0,
        timeframe: '4h',
        description: 'Very strong bullish reversal pattern'
      });
    }

    // Evening Star (bearish reversal)
    if (this.isEveningStar(c2, c1, c0)) {
      patterns.push({
        name: 'Evening Star',
        type: 'bearish',
        confidence: 0.80,
        expectedMove: -4.0,
        timeframe: '4h',
        description: 'Very strong bearish reversal pattern'
      });
    }

    // Doji (indecision)
    if (this.isDoji(c0)) {
      patterns.push({
        name: 'Doji',
        type: 'neutral',
        confidence: 0.60,
        expectedMove: 0,
        timeframe: '1h',
        description: 'Indecision pattern - potential reversal'
      });
    }

    return patterns;
  }

  /**
   * Detect chart patterns (head & shoulders, double top/bottom, etc.)
   */
  private detectChartPatterns(candles: CandleData[]): Pattern[] {
    const patterns: Pattern[] = [];
    const len = candles.length;

    if (len < 20) return patterns;

    // Find swing highs and lows
    const swingHighs = this.findSwingHighs(candles);
    const swingLows = this.findSwingLows(candles);

    // Double Top
    if (this.isDoubleTop(swingHighs, candles)) {
      patterns.push({
        name: 'Double Top',
        type: 'bearish',
        confidence: 0.75,
        expectedMove: -5.0,
        timeframe: '4h',
        description: 'Bearish reversal - price failed to break resistance twice'
      });
    }

    // Double Bottom
    if (this.isDoubleBottom(swingLows, candles)) {
      patterns.push({
        name: 'Double Bottom',
        type: 'bullish',
        confidence: 0.75,
        expectedMove: 5.0,
        timeframe: '4h',
        description: 'Bullish reversal - price bounced from support twice'
      });
    }

    // Ascending Triangle (bullish)
    if (this.isAscendingTriangle(swingHighs, swingLows)) {
      patterns.push({
        name: 'Ascending Triangle',
        type: 'bullish',
        confidence: 0.70,
        expectedMove: 6.0,
        timeframe: '4h',
        description: 'Bullish continuation - higher lows with flat resistance'
      });
    }

    // Descending Triangle (bearish)
    if (this.isDescendingTriangle(swingHighs, swingLows)) {
      patterns.push({
        name: 'Descending Triangle',
        type: 'bearish',
        confidence: 0.70,
        expectedMove: -6.0,
        timeframe: '4h',
        description: 'Bearish continuation - lower highs with flat support'
      });
    }

    return patterns;
  }

  /**
   * Detect support and resistance levels
   */
  private detectSupportResistance(candles: CandleData[], currentPrice: number): Pattern[] {
    const patterns: Pattern[] = [];
    const len = candles.length;

    if (len < 10) return patterns;

    // Find support levels
    const supports = this.findSupportLevels(candles);
    const resistances = this.findResistanceLevels(candles);

    // Check if price is near support
    for (const support of supports) {
      const distance = ((currentPrice - support) / support) * 100;
      if (distance > 0 && distance < 1) {
        patterns.push({
          name: 'Near Support',
          type: 'bullish',
          confidence: 0.65,
          expectedMove: 3.0,
          timeframe: '1h',
          description: `Price near support at $${support.toFixed(2)}`
        });
      }
    }

    // Check if price is near resistance
    for (const resistance of resistances) {
      const distance = ((resistance - currentPrice) / currentPrice) * 100;
      if (distance > 0 && distance < 1) {
        patterns.push({
          name: 'Near Resistance',
          type: 'bearish',
          confidence: 0.65,
          expectedMove: -3.0,
          timeframe: '1h',
          description: `Price near resistance at $${resistance.toFixed(2)}`
        });
      }
    }

    return patterns;
  }

  /**
   * Detect trend patterns
   */
  private detectTrendPatterns(candles: CandleData[]): Pattern[] {
    const patterns: Pattern[] = [];
    const len = candles.length;

    if (len < 10) return patterns;

    // Calculate trend
    const trend = this.calculateTrend(candles);

    if (trend.strength > 0.7) {
      if (trend.direction === 'up') {
        patterns.push({
          name: 'Strong Uptrend',
          type: 'bullish',
          confidence: 0.75,
          expectedMove: 4.0,
          timeframe: '4h',
          description: 'Strong upward momentum detected'
        });
      } else {
        patterns.push({
          name: 'Strong Downtrend',
          type: 'bearish',
          confidence: 0.75,
          expectedMove: -4.0,
          timeframe: '4h',
          description: 'Strong downward momentum detected'
        });
      }
    }

    // Trend reversal detection
    if (this.isTrendReversal(candles)) {
      const lastCandle = candles[len - 1];
      const prevCandle = candles[len - 2];
      const isReversalUp = lastCandle.close > prevCandle.close;

      patterns.push({
        name: 'Trend Reversal',
        type: isReversalUp ? 'bullish' : 'bearish',
        confidence: 0.70,
        expectedMove: isReversalUp ? 3.5 : -3.5,
        timeframe: '4h',
        description: 'Potential trend reversal detected'
      });
    }

    return patterns;
  }

  /**
   * Calculate overall recommendation from patterns
   */
  private calculateRecommendation(
    patterns: Pattern[],
    candles: CandleData[],
    currentPrice: number
  ): PatternSignal {
    if (patterns.length === 0) {
      return {
        patterns: [],
        recommendation: 'HOLD',
        confidence: 0
      };
    }

    // Calculate weighted score
    let bullishScore = 0;
    let bearishScore = 0;
    let totalWeight = 0;

    for (const pattern of patterns) {
      const weight = pattern.confidence;
      totalWeight += weight;

      if (pattern.type === 'bullish') {
        bullishScore += weight;
      } else if (pattern.type === 'bearish') {
        bearishScore += weight;
      }
    }

    const netScore = (bullishScore - bearishScore) / totalWeight;
    const confidence = Math.abs(netScore);

    // Determine recommendation
    let recommendation: PatternSignal['recommendation'];
    if (netScore > 0.6) {
      recommendation = 'STRONG_BUY';
    } else if (netScore > 0.3) {
      recommendation = 'BUY';
    } else if (netScore < -0.6) {
      recommendation = 'STRONG_SELL';
    } else if (netScore < -0.3) {
      recommendation = 'SELL';
    } else {
      recommendation = 'HOLD';
    }

    // Calculate optimal entry/exit
    const optimalEntry = this.calculateOptimalEntry(patterns, currentPrice);
    const optimalExit = this.calculateOptimalExit(patterns, currentPrice);
    const stopLoss = this.calculateStopLoss(patterns, candles, currentPrice);

    return {
      patterns,
      recommendation,
      confidence,
      optimalEntry,
      optimalExit,
      stopLoss
    };
  }

  // Pattern detection helpers

  private isHammer(candle: CandleData): boolean {
    const body = Math.abs(candle.close - candle.open);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    return lowerShadow > body * 2 && upperShadow < body * 0.5;
  }

  private isShootingStar(candle: CandleData): boolean {
    const body = Math.abs(candle.close - candle.open);
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    return upperShadow > body * 2 && lowerShadow < body * 0.5;
  }

  private isBullishEngulfing(prev: CandleData, current: CandleData): boolean {
    return (
      prev.close < prev.open && // Previous is bearish
      current.close > current.open && // Current is bullish
      current.open < prev.close && // Current opens below prev close
      current.close > prev.open // Current closes above prev open
    );
  }

  private isBearishEngulfing(prev: CandleData, current: CandleData): boolean {
    return (
      prev.close > prev.open && // Previous is bullish
      current.close < current.open && // Current is bearish
      current.open > prev.close && // Current opens above prev close
      current.close < prev.open // Current closes below prev open
    );
  }

  private isMorningStar(c1: CandleData, c2: CandleData, c3: CandleData): boolean {
    const body1 = Math.abs(c1.close - c1.open);
    const body2 = Math.abs(c2.close - c2.open);
    const body3 = Math.abs(c3.close - c3.open);

    return (
      c1.close < c1.open && // First candle is bearish
      body2 < body1 * 0.3 && // Second candle is small (star)
      c3.close > c3.open && // Third candle is bullish
      c3.close > (c1.open + c1.close) / 2 // Third closes above midpoint of first
    );
  }

  private isEveningStar(c1: CandleData, c2: CandleData, c3: CandleData): boolean {
    const body1 = Math.abs(c1.close - c1.open);
    const body2 = Math.abs(c2.close - c2.open);
    const body3 = Math.abs(c3.close - c3.open);

    return (
      c1.close > c1.open && // First candle is bullish
      body2 < body1 * 0.3 && // Second candle is small (star)
      c3.close < c3.open && // Third candle is bearish
      c3.close < (c1.open + c1.close) / 2 // Third closes below midpoint of first
    );
  }

  private isDoji(candle: CandleData): boolean {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    return body < range * 0.1;
  }

  private findSwingHighs(candles: CandleData[]): number[] {
    const highs: number[] = [];
    for (let i = 2; i < candles.length - 2; i++) {
      if (
        candles[i].high > candles[i - 1].high &&
        candles[i].high > candles[i - 2].high &&
        candles[i].high > candles[i + 1].high &&
        candles[i].high > candles[i + 2].high
      ) {
        highs.push(candles[i].high);
      }
    }
    return highs;
  }

  private findSwingLows(candles: CandleData[]): number[] {
    const lows: number[] = [];
    for (let i = 2; i < candles.length - 2; i++) {
      if (
        candles[i].low < candles[i - 1].low &&
        candles[i].low < candles[i - 2].low &&
        candles[i].low < candles[i + 1].low &&
        candles[i].low < candles[i + 2].low
      ) {
        lows.push(candles[i].low);
      }
    }
    return lows;
  }

  private isDoubleTop(highs: number[], candles: CandleData[]): boolean {
    if (highs.length < 2) return false;
    const last = highs[highs.length - 1];
    const prev = highs[highs.length - 2];
    return Math.abs(last - prev) / prev < 0.02; // Within 2%
  }

  private isDoubleBottom(lows: number[], candles: CandleData[]): boolean {
    if (lows.length < 2) return false;
    const last = lows[lows.length - 1];
    const prev = lows[lows.length - 2];
    return Math.abs(last - prev) / prev < 0.02; // Within 2%
  }

  private isAscendingTriangle(highs: number[], lows: number[]): boolean {
    if (highs.length < 2 || lows.length < 2) return false;
    // Highs are relatively flat, lows are rising
    const highsFlat = Math.abs(highs[highs.length - 1] - highs[highs.length - 2]) / highs[highs.length - 1] < 0.02;
    const lowsRising = lows[lows.length - 1] > lows[lows.length - 2];
    return highsFlat && lowsRising;
  }

  private isDescendingTriangle(highs: number[], lows: number[]): boolean {
    if (highs.length < 2 || lows.length < 2) return false;
    // Lows are relatively flat, highs are falling
    const lowsFlat = Math.abs(lows[lows.length - 1] - lows[lows.length - 2]) / lows[lows.length - 1] < 0.02;
    const highsFalling = highs[highs.length - 1] < highs[highs.length - 2];
    return lowsFlat && highsFalling;
  }

  private findSupportLevels(candles: CandleData[]): number[] {
    const lows = this.findSwingLows(candles);
    // Cluster nearby lows
    const supports: number[] = [];
    for (const low of lows) {
      const nearbySupport = supports.find(s => Math.abs(s - low) / s < 0.01);
      if (!nearbySupport) {
        supports.push(low);
      }
    }
    return supports.sort((a, b) => b - a); // Descending
  }

  private findResistanceLevels(candles: CandleData[]): number[] {
    const highs = this.findSwingHighs(candles);
    // Cluster nearby highs
    const resistances: number[] = [];
    for (const high of highs) {
      const nearbyResistance = resistances.find(r => Math.abs(r - high) / r < 0.01);
      if (!nearbyResistance) {
        resistances.push(high);
      }
    }
    return resistances.sort((a, b) => a - b); // Ascending
  }

  private calculateTrend(candles: CandleData[]): { direction: 'up' | 'down' | 'sideways'; strength: number } {
    const closes = candles.map(c => c.close);
    const len = closes.length;

    // Simple linear regression
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < len; i++) {
      sumX += i;
      sumY += closes[i];
      sumXY += i * closes[i];
      sumX2 += i * i;
    }

    const slope = (len * sumXY - sumX * sumY) / (len * sumX2 - sumX * sumX);
    const avgPrice = sumY / len;
    const normalizedSlope = slope / avgPrice;

    const strength = Math.min(1, Math.abs(normalizedSlope) * 100);
    const direction = normalizedSlope > 0.001 ? 'up' : normalizedSlope < -0.001 ? 'down' : 'sideways';

    return { direction, strength };
  }

  private isTrendReversal(candles: CandleData[]): boolean {
    if (candles.length < 10) return false;

    const recentTrend = this.calculateTrend(candles.slice(-5));
    const olderTrend = this.calculateTrend(candles.slice(-10, -5));

    return (
      recentTrend.direction !== olderTrend.direction &&
      recentTrend.strength > 0.5 &&
      olderTrend.strength > 0.5
    );
  }

  private calculateOptimalEntry(patterns: Pattern[], currentPrice: number): number {
    // Average expected move from bullish patterns
    const bullishPatterns = patterns.filter(p => p.type === 'bullish');
    if (bullishPatterns.length === 0) return currentPrice;

    const avgMove = bullishPatterns.reduce((sum, p) => sum + p.expectedMove, 0) / bullishPatterns.length;
    return currentPrice * (1 - avgMove / 200); // Enter slightly below current
  }

  private calculateOptimalExit(patterns: Pattern[], currentPrice: number): number {
    const bullishPatterns = patterns.filter(p => p.type === 'bullish');
    if (bullishPatterns.length === 0) return currentPrice;

    const avgMove = bullishPatterns.reduce((sum, p) => sum + p.expectedMove, 0) / bullishPatterns.length;
    return currentPrice * (1 + avgMove / 100);
  }

  private calculateStopLoss(patterns: Pattern[], candles: CandleData[], currentPrice: number): number {
    const supports = this.findSupportLevels(candles);
    if (supports.length > 0) {
      const nearestSupport = supports.find(s => s < currentPrice);
      if (nearestSupport) {
        return nearestSupport * 0.99; // Just below support
      }
    }
    return currentPrice * 0.97; // Default 3% stop
  }
}

export const patternRecognition = PatternRecognitionService.getInstance();
