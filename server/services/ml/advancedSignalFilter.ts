/**
 * Advanced ML Signal Filter
 * Multi-layer filtering system with ensemble ML models
 * Reduces false positives and improves signal quality
 */

import logger from '../../utils/logger';
import { Signal } from '../tradingEngine/signalGenerator';
import { metricsService } from '../metricsService';

export interface FilteredSignal extends Signal {
  mlScore: number;
  mlConfidence: number;
  filterReason?: string;
  features: SignalFeatures;
  predictions: ModelPredictions;
}

export interface SignalFeatures {
  // Price action features
  priceChange1h: number;
  priceChange4h: number;
  priceChange24h: number;
  volatility: number;
  
  // Volume features
  volumeRatio: number;
  volumeTrend: number;
  
  // Technical indicators
  rsi: number;
  macd: number;
  macdSignal: number;
  bbPosition: number; // Position within Bollinger Bands (0-1)
  
  // Market structure
  trendStrength: number;
  supportDistance: number;
  resistanceDistance: number;
  
  // Time-based
  hourOfDay: number;
  dayOfWeek: number;
  
  // Signal quality
  signalAge: number; // milliseconds since signal generated
  priceDeviation: number; // % deviation from signal price
}

export interface ModelPredictions {
  ensemble: number; // Combined prediction (0-1)
  randomForest: number;
  gradientBoosting: number;
  neuralNet: number;
  agreement: number; // How much models agree (0-1)
}

export interface FilterConfig {
  minConfidence: number; // Minimum ML confidence (0-1)
  minAgreement: number; // Minimum model agreement (0-1)
  maxSignalAge: number; // Maximum signal age in ms
  maxPriceDeviation: number; // Maximum price deviation %
  enabledFilters: string[];
}

class AdvancedSignalFilter {
  private static instance: AdvancedSignalFilter;
  private config: FilterConfig;
  
  private constructor() {
    this.config = {
      minConfidence: 0.65,
      minAgreement: 0.70,
      maxSignalAge: 60000, // 60 seconds
      maxPriceDeviation: 0.5, // 0.5%
      enabledFilters: [
        'confidence',
        'agreement',
        'age',
        'priceDeviation',
        'volatility',
        'volume'
      ]
    };
  }

  static getInstance(): AdvancedSignalFilter {
    if (!AdvancedSignalFilter.instance) {
      AdvancedSignalFilter.instance = new AdvancedSignalFilter();
    }
    return AdvancedSignalFilter.instance;
  }

  /**
   * Filter and score a signal using ML models
   */
  async filterSignal(
    signal: Signal,
    currentPrice: number,
    marketData: any
  ): Promise<{ passed: boolean; filtered?: FilteredSignal; reason?: string }> {
    try {
      // Extract features
      const features = await this.extractFeatures(signal, currentPrice, marketData);
      
      // Get ML predictions
      const predictions = await this.getPredictions(features, signal);
      
      // Calculate ML score and confidence
      const mlScore = predictions.ensemble;
      const mlConfidence = this.calculateConfidence(predictions, features);
      
      // Create filtered signal
      const filteredSignal: FilteredSignal = {
        ...signal,
        mlScore,
        mlConfidence,
        features,
        predictions
      };
      
      // Run filters
      const filterResult = this.runFilters(filteredSignal);
      
      if (!filterResult.passed) {
        logger.info(`[AdvancedSignalFilter] Signal filtered: ${signal.symbol} ${signal.side}`, {
          reason: filterResult.reason,
          mlScore,
          mlConfidence,
          agreement: predictions.agreement
        });
        
        metricsService.incrementCounter('ml_signals_filtered', 1, {
          symbol: signal.symbol,
          reason: filterResult.reason || 'unknown'
        });
        
        return { passed: false, reason: filterResult.reason };
      }
      
      logger.info(`[AdvancedSignalFilter] Signal passed: ${signal.symbol} ${signal.side}`, {
        mlScore: mlScore.toFixed(3),
        mlConfidence: mlConfidence.toFixed(3),
        agreement: predictions.agreement.toFixed(3)
      });
      
      metricsService.incrementCounter('ml_signals_passed', 1, { symbol: signal.symbol });
      metricsService.setGauge('ml_last_signal_confidence', mlConfidence);
      
      return { passed: true, filtered: filteredSignal };
      
    } catch (error: any) {
      logger.error('[AdvancedSignalFilter] Error filtering signal:', error);
      // On error, pass signal through (fail-open)
      return { passed: true };
    }
  }

  /**
   * Extract features from signal and market data
   */
  private async extractFeatures(
    signal: Signal,
    currentPrice: number,
    marketData: any
  ): Promise<SignalFeatures> {
    const now = Date.now();
    const signalTime = signal.timestamp?.getTime() || now;
    
    // Calculate price changes
    const priceChange1h = marketData.priceChange1h || 0;
    const priceChange4h = marketData.priceChange4h || 0;
    const priceChange24h = marketData.priceChange24h || 0;
    
    // Calculate volatility (using recent price data)
    const volatility = marketData.volatility || this.calculateVolatility(marketData.recentPrices || []);
    
    // Volume metrics
    const volumeRatio = marketData.volume24h / (marketData.avgVolume24h || marketData.volume24h);
    const volumeTrend = marketData.volumeTrend || 0;
    
    // Technical indicators
    const rsi = marketData.rsi || 50;
    const macd = marketData.macd || 0;
    const macdSignal = marketData.macdSignal || 0;
    const bbPosition = this.calculateBBPosition(currentPrice, marketData.bb);
    
    // Market structure
    const trendStrength = this.calculateTrendStrength(marketData);
    const supportDistance = this.calculateSupportDistance(currentPrice, marketData.support);
    const resistanceDistance = this.calculateResistanceDistance(currentPrice, marketData.resistance);
    
    // Time-based
    const date = new Date();
    const hourOfDay = date.getUTCHours();
    const dayOfWeek = date.getUTCDay();
    
    // Signal quality
    const signalAge = now - signalTime;
    const priceDeviation = Math.abs((currentPrice - signal.entryPrice) / signal.entryPrice) * 100;
    
    return {
      priceChange1h,
      priceChange4h,
      priceChange24h,
      volatility,
      volumeRatio,
      volumeTrend,
      rsi,
      macd,
      macdSignal,
      bbPosition,
      trendStrength,
      supportDistance,
      resistanceDistance,
      hourOfDay,
      dayOfWeek,
      signalAge,
      priceDeviation
    };
  }

  /**
   * Get predictions from ensemble models
   */
  private async getPredictions(
    features: SignalFeatures,
    signal: Signal
  ): Promise<ModelPredictions> {
    // Simplified ML predictions (in production, call actual ML models)
    // For now, use heuristic scoring based on features
    
    const randomForest = this.randomForestPredict(features, signal);
    const gradientBoosting = this.gradientBoostingPredict(features, signal);
    const neuralNet = this.neuralNetPredict(features, signal);
    
    // Ensemble: weighted average
    const ensemble = (
      randomForest * 0.35 +
      gradientBoosting * 0.35 +
      neuralNet * 0.30
    );
    
    // Calculate agreement (how much models agree)
    const predictions = [randomForest, gradientBoosting, neuralNet];
    const mean = predictions.reduce((a, b) => a + b, 0) / predictions.length;
    const variance = predictions.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / predictions.length;
    const agreement = 1 - Math.sqrt(variance); // Higher agreement = lower variance
    
    return {
      ensemble,
      randomForest,
      gradientBoosting,
      neuralNet,
      agreement
    };
  }

  /**
   * Random Forest prediction (heuristic)
   */
  private randomForestPredict(features: SignalFeatures, signal: Signal): number {
    let score = 0.5; // Base score
    
    // RSI contribution
    if (signal.side === 'BUY' && features.rsi < 40) score += 0.15;
    if (signal.side === 'SELL' && features.rsi > 60) score += 0.15;
    
    // Volume contribution
    if (features.volumeRatio > 1.2) score += 0.10;
    
    // Trend contribution
    if (features.trendStrength > 0.6) score += 0.10;
    
    // Support/Resistance
    if (signal.side === 'BUY' && features.supportDistance < 2) score += 0.10;
    if (signal.side === 'SELL' && features.resistanceDistance < 2) score += 0.10;
    
    // Volatility penalty
    if (features.volatility > 5) score -= 0.10;
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Gradient Boosting prediction (heuristic)
   */
  private gradientBoostingPredict(features: SignalFeatures, signal: Signal): number {
    let score = 0.5;
    
    // MACD contribution
    if (signal.side === 'BUY' && features.macd > features.macdSignal) score += 0.15;
    if (signal.side === 'SELL' && features.macd < features.macdSignal) score += 0.15;
    
    // Bollinger Bands
    if (signal.side === 'BUY' && features.bbPosition < 0.3) score += 0.15;
    if (signal.side === 'SELL' && features.bbPosition > 0.7) score += 0.15;
    
    // Price momentum
    const momentum = features.priceChange4h;
    if (signal.side === 'BUY' && momentum > 1) score += 0.10;
    if (signal.side === 'SELL' && momentum < -1) score += 0.10;
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Neural Network prediction (heuristic)
   */
  private neuralNetPredict(features: SignalFeatures, signal: Signal): number {
    // Complex non-linear relationships
    let score = 0.5;
    
    // Combined momentum and RSI
    const momentumRSI = (features.priceChange4h / 10) * (features.rsi / 100);
    if (signal.side === 'BUY' && momentumRSI < 0.2) score += 0.15;
    if (signal.side === 'SELL' && momentumRSI > 0.5) score += 0.15;
    
    // Volume-volatility relationship
    const volVolatility = features.volumeRatio * (1 / (1 + features.volatility));
    if (volVolatility > 0.8) score += 0.15;
    
    // Time-based patterns
    if (features.hourOfDay >= 13 && features.hourOfDay <= 21) score += 0.05; // Active trading hours
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(predictions: ModelPredictions, features: SignalFeatures): number {
    let confidence = predictions.ensemble;
    
    // Boost confidence if models agree
    confidence *= (0.7 + 0.3 * predictions.agreement);
    
    // Reduce confidence for stale signals
    if (features.signalAge > 30000) {
      confidence *= 0.9;
    }
    
    // Reduce confidence for high volatility
    if (features.volatility > 3) {
      confidence *= 0.85;
    }
    
    // Boost confidence for strong volume
    if (features.volumeRatio > 1.5) {
      confidence *= 1.1;
    }
    
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Run all enabled filters
   */
  private runFilters(signal: FilteredSignal): { passed: boolean; reason?: string } {
    // Confidence filter
    if (this.config.enabledFilters.includes('confidence')) {
      if (signal.mlConfidence < this.config.minConfidence) {
        return { passed: false, reason: `Low confidence: ${signal.mlConfidence.toFixed(3)}` };
      }
    }
    
    // Agreement filter
    if (this.config.enabledFilters.includes('agreement')) {
      if (signal.predictions.agreement < this.config.minAgreement) {
        return { passed: false, reason: `Low agreement: ${signal.predictions.agreement.toFixed(3)}` };
      }
    }
    
    // Age filter
    if (this.config.enabledFilters.includes('age')) {
      if (signal.features.signalAge > this.config.maxSignalAge) {
        return { passed: false, reason: `Signal too old: ${(signal.features.signalAge / 1000).toFixed(1)}s` };
      }
    }
    
    // Price deviation filter
    if (this.config.enabledFilters.includes('priceDeviation')) {
      if (signal.features.priceDeviation > this.config.maxPriceDeviation) {
        return { passed: false, reason: `Price deviated: ${signal.features.priceDeviation.toFixed(2)}%` };
      }
    }
    
    // Volatility filter
    if (this.config.enabledFilters.includes('volatility')) {
      if (signal.features.volatility > 8) {
        return { passed: false, reason: `Excessive volatility: ${signal.features.volatility.toFixed(2)}%` };
      }
    }
    
    // Volume filter
    if (this.config.enabledFilters.includes('volume')) {
      if (signal.features.volumeRatio < 0.5) {
        return { passed: false, reason: `Low volume: ${signal.features.volumeRatio.toFixed(2)}x` };
      }
    }
    
    return { passed: true };
  }

  // Helper methods
  
  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * 100; // As percentage
  }

  private calculateBBPosition(price: number, bb: any): number {
    if (!bb || !bb.upper || !bb.lower) return 0.5;
    return (price - bb.lower) / (bb.upper - bb.lower);
  }

  private calculateTrendStrength(marketData: any): number {
    // Simple trend strength based on price changes
    const changes = [
      marketData.priceChange1h || 0,
      marketData.priceChange4h || 0,
      marketData.priceChange24h || 0
    ];
    
    const allPositive = changes.every(c => c > 0);
    const allNegative = changes.every(c => c < 0);
    
    if (allPositive || allNegative) {
      const avgChange = Math.abs(changes.reduce((a, b) => a + b, 0) / changes.length);
      return Math.min(1, avgChange / 5); // Normalize to 0-1
    }
    
    return 0;
  }

  private calculateSupportDistance(price: number, support: number | undefined): number {
    if (!support) return 100;
    return ((price - support) / support) * 100;
  }

  private calculateResistanceDistance(price: number, resistance: number | undefined): number {
    if (!resistance) return 100;
    return ((resistance - price) / price) * 100;
  }

  /**
   * Update filter configuration
   */
  updateConfig(config: Partial<FilterConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[AdvancedSignalFilter] Configuration updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): FilterConfig {
    return { ...this.config };
  }
}

export const advancedSignalFilter = AdvancedSignalFilter.getInstance();
