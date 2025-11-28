import binanceService from '../binanceService';
import { priceCacheService } from '../websocket/priceCacheService';

interface TimeframeData {
  timeframe: string;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  strength: number; // 0-100
  ema20: number;
  ema50: number;
  rsi: number;
  volume: number;
  volatility: number;
}

interface MultiTimeframeSignal {
  symbol: string;
  overallTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number; // 0-100
  timeframes: TimeframeData[];
  recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
}

/**
 * Multi-Timeframe Analysis Service
 * Analyzes multiple timeframes to improve signal quality
 */
export class MultiTimeframeAnalysis {
  private readonly TIMEFRAMES = ['5m', '15m', '1h', '4h'];
  private readonly KLINE_LIMITS = {
    '5m': 100,
    '15m': 100,
    '1h': 100,
    '4h': 100,
  };

  /**
   * Analyze symbol across multiple timeframes
   */
  async analyze(symbol: string): Promise<MultiTimeframeSignal> {
    console.log(`[MultiTimeframeAnalysis] Analyzing ${symbol} across ${this.TIMEFRAMES.length} timeframes`);

    const timeframeAnalyses = await Promise.all(
      this.TIMEFRAMES.map(tf => this.analyzeTimeframe(symbol, tf))
    );

    // Calculate overall trend based on timeframe alignment
    const overallTrend = this.calculateOverallTrend(timeframeAnalyses);
    const confidence = this.calculateConfidence(timeframeAnalyses);
    const recommendation = this.generateRecommendation(overallTrend, confidence, timeframeAnalyses);

    return {
      symbol,
      overallTrend,
      confidence,
      timeframes: timeframeAnalyses,
      recommendation,
    };
  }

  /**
   * Analyze single timeframe
   */
  private async analyzeTimeframe(symbol: string, timeframe: string): Promise<TimeframeData> {
    try {
      // Get candlestick data
      const klines = await binanceService.getKlines(
        symbol,
        timeframe,
        this.KLINE_LIMITS[timeframe as keyof typeof this.KLINE_LIMITS]
      );

      if (!klines || klines.length < 50) {
        throw new Error(`Insufficient data for ${symbol} ${timeframe}`);
      }

      // Extract close prices and volumes
      const closes = klines.map((k: any) => parseFloat(k[4]));
      const volumes = klines.map((k: any) => parseFloat(k[5]));

      // Calculate indicators
      const ema20 = this.calculateEMA(closes, 20);
      const ema50 = this.calculateEMA(closes, 50);
      const rsi = this.calculateRSI(closes, 14);
      const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      const volatility = this.calculateVolatility(closes);

      // Determine trend
      const currentPrice = closes[closes.length - 1];
      let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
      let strength = 50;

      if (currentPrice > ema20 && ema20 > ema50) {
        trend = 'BULLISH';
        const priceDiff = ((currentPrice - ema50) / ema50) * 100;
        strength = Math.min(100, 50 + priceDiff * 10);
      } else if (currentPrice < ema20 && ema20 < ema50) {
        trend = 'BEARISH';
        const priceDiff = ((ema50 - currentPrice) / ema50) * 100;
        strength = Math.min(100, 50 + priceDiff * 10);
      }

      // Adjust strength based on RSI
      if (rsi > 70) strength = Math.max(0, strength - 20); // Overbought
      if (rsi < 30) strength = Math.max(0, strength - 20); // Oversold

      return {
        timeframe,
        trend,
        strength,
        ema20,
        ema50,
        rsi,
        volume: avgVolume,
        volatility,
      };

    } catch (error) {
      console.error(`[MultiTimeframeAnalysis] Error analyzing ${symbol} ${timeframe}:`, error);

      // Return neutral analysis on error
      return {
        timeframe,
        trend: 'NEUTRAL',
        strength: 0,
        ema20: 0,
        ema50: 0,
        rsi: 50,
        volume: 0,
        volatility: 0,
      };
    }
  }

  /**
   * Calculate overall trend from multiple timeframes
   */
  private calculateOverallTrend(timeframes: TimeframeData[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    const bullishCount = timeframes.filter(tf => tf.trend === 'BULLISH').length;
    const bearishCount = timeframes.filter(tf => tf.trend === 'BEARISH').length;

    // Require 75% alignment for strong trend
    if (bullishCount >= timeframes.length * 0.75) return 'BULLISH';
    if (bearishCount >= timeframes.length * 0.75) return 'BEARISH';

    return 'NEUTRAL';
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(timeframes: TimeframeData[]): number {
    // Average strength across all timeframes
    const avgStrength = timeframes.reduce((sum, tf) => sum + tf.strength, 0) / timeframes.length;

    // Check alignment
    const trends = timeframes.map(tf => tf.trend);
    const uniqueTrends = new Set(trends);
    const alignmentBonus = uniqueTrends.size === 1 ? 20 : 0;

    return Math.min(100, avgStrength + alignmentBonus);
  }

  /**
   * Generate trading recommendation
   */
  private generateRecommendation(
    overallTrend: string,
    confidence: number,
    timeframes: TimeframeData[]
  ): 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL' {
    // Check for overbought/oversold conditions
    const avgRSI = timeframes.reduce((sum, tf) => sum + tf.rsi, 0) / timeframes.length;

    if (overallTrend === 'BULLISH') {
      if (confidence > 75 && avgRSI < 70) return 'STRONG_BUY';
      if (confidence > 50 && avgRSI < 75) return 'BUY';
    }

    if (overallTrend === 'BEARISH') {
      if (confidence > 75 && avgRSI > 30) return 'STRONG_SELL';
      if (confidence > 50 && avgRSI > 25) return 'SELL';
    }

    return 'NEUTRAL';
  }

  /**
   * Calculate Exponential Moving Average
   */
  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];

    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * Calculate Relative Strength Index
   */
  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;

    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }

    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? -c : 0);

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  /**
   * Calculate price volatility
   */
  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    return stdDev * 100; // Return as percentage
  }

  /**
   * Check if signal aligns with multi-timeframe analysis
   */
  async validateSignal(symbol: string, signalDirection: 'LONG' | 'SHORT'): Promise<{
    valid: boolean;
    confidence: number;
    reason: string;
  }> {
    const analysis = await this.analyze(symbol);

    if (signalDirection === 'LONG') {
      if (analysis.recommendation === 'STRONG_BUY' || analysis.recommendation === 'BUY') {
        return {
          valid: true,
          confidence: analysis.confidence,
          reason: `Multi-timeframe analysis confirms LONG signal (${analysis.overallTrend}, confidence: ${analysis.confidence}%)`,
        };
      }

      return {
        valid: false,
        confidence: analysis.confidence,
        reason: `Multi-timeframe analysis does not support LONG (${analysis.overallTrend}, recommendation: ${analysis.recommendation})`,
      };
    }

    if (signalDirection === 'SHORT') {
      if (analysis.recommendation === 'STRONG_SELL' || analysis.recommendation === 'SELL') {
        return {
          valid: true,
          confidence: analysis.confidence,
          reason: `Multi-timeframe analysis confirms SHORT signal (${analysis.overallTrend}, confidence: ${analysis.confidence}%)`,
        };
      }

      return {
        valid: false,
        confidence: analysis.confidence,
        reason: `Multi-timeframe analysis does not support SHORT (${analysis.overallTrend}, recommendation: ${analysis.recommendation})`,
      };
    }

    return {
      valid: false,
      confidence: 0,
      reason: 'Invalid signal direction',
    };
  }
}

// Singleton instance
export const multiTimeframeAnalysis = new MultiTimeframeAnalysis();
