/**
 * ML Orchestrator
 * Coordinates all ML services and integrates them with the trading engine
 * Main entry point for ML-enhanced trading decisions
 */

import logger from '../../utils/logger';
import { Signal } from '../tradingEngine/signalGenerator';
import { advancedSignalFilter, FilteredSignal } from './advancedSignalFilter';
import { patternRecognition } from './patternRecognition';
import { marketRegimeDetector, RegimeAnalysis } from './marketRegimeDetector';
import { adaptivePositionSizer, PositionSizeInput } from './adaptivePositionSizer';
import { metricsService } from '../metricsService';
import { slackNotifier } from '../slackNotifier';

export interface MLEnhancedSignal extends FilteredSignal {
  patterns: any[];
  regime: RegimeAnalysis;
  positionSize?: {
    quantity: number;
    riskAmount: number;
    riskPercent: number;
    reasoning: string[];
  };
  recommendation: 'EXECUTE' | 'SKIP' | 'REDUCE_SIZE';
  overallConfidence: number;
}

export interface MarketData {
  symbol: string;
  candles: any[];
  currentPrice: number;
  volume24h: number;
  avgVolume24h: number;
  priceChange1h: number;
  priceChange4h: number;
  priceChange24h: number;
  volatility: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  bb: { upper: number; middle: number; lower: number };
  support?: number;
  resistance?: number;
  recentPrices?: number[];
}

class MLOrchestrator {
  private static instance: MLOrchestrator;
  private enabled: boolean = true;
  private minOverallConfidence: number = 0.60;

  private constructor() {
    logger.info('[MLOrchestrator] Initialized');
  }

  static getInstance(): MLOrchestrator {
    if (!MLOrchestrator.instance) {
      MLOrchestrator.instance = new MLOrchestrator();
    }
    return MLOrchestrator.instance;
  }

  /**
   * Process a trading signal through all ML layers
   * This is the main entry point for ML-enhanced trading
   */
  async processSignal(
    signal: Signal,
    marketData: MarketData,
    currentEquity: number,
    recentWinRate?: number
  ): Promise<MLEnhancedSignal | null> {
    try {
      if (!this.enabled) {
        logger.info('[MLOrchestrator] ML processing disabled, passing signal through');
        return null;
      }

      logger.info(`[MLOrchestrator] Processing signal: ${signal.symbol} ${signal.side}`);

      // Step 1: Signal Filtering & Confidence Scoring
      const filterResult = await advancedSignalFilter.filterSignal(
        signal,
        marketData.currentPrice,
        marketData
      );

      if (!filterResult.passed) {
        logger.info(`[MLOrchestrator] Signal filtered out: ${filterResult.reason}`);
        metricsService.incrementCounter('ml_signals_rejected', 1, { 
          symbol: signal.symbol,
          reason: 'filter'
        });
        return null;
      }

      const filteredSignal = filterResult.filtered!;

      // Step 2: Pattern Recognition
      const patternAnalysis = await patternRecognition.analyzePatterns(
        signal.symbol,
        marketData.candles,
        marketData.currentPrice
      );

      // Check if patterns support the signal
      const patternSupportsSignal = this.checkPatternAlignment(signal, patternAnalysis);
      if (!patternSupportsSignal) {
        logger.info(`[MLOrchestrator] Patterns don't support signal`);
        metricsService.incrementCounter('ml_signals_rejected', 1, { 
          symbol: signal.symbol,
          reason: 'pattern_mismatch'
        });
        return null;
      }

      // Step 3: Market Regime Detection
      const regime = await marketRegimeDetector.detectRegime(
        signal.symbol,
        marketData.candles
      );

      // Check if regime is favorable
      const regimeIsFavorable = this.checkRegimeFavorability(signal, regime);
      if (!regimeIsFavorable) {
        logger.info(`[MLOrchestrator] Unfavorable regime: ${regime.regime}`);
        metricsService.incrementCounter('ml_signals_rejected', 1, { 
          symbol: signal.symbol,
          reason: 'unfavorable_regime'
        });
        return null;
      }

      // Step 4: Calculate Overall Confidence
      const overallConfidence = this.calculateOverallConfidence(
        filteredSignal,
        patternAnalysis,
        regime
      );

      if (overallConfidence < this.minOverallConfidence) {
        logger.info(`[MLOrchestrator] Overall confidence too low: ${overallConfidence.toFixed(3)}`);
        metricsService.incrementCounter('ml_signals_rejected', 1, { 
          symbol: signal.symbol,
          reason: 'low_confidence'
        });
        return null;
      }

      // Step 5: Adaptive Position Sizing
      const stopLossPrice = signal.stopLoss || marketData.currentPrice * 0.97;
      
      const positionSizeInput: PositionSizeInput = {
        signal: filteredSignal,
        regime,
        currentEquity,
        entryPrice: marketData.currentPrice,
        stopLossPrice,
        recentWinRate,
        accountVolatility: marketData.volatility
      };

      const positionSize = await adaptivePositionSizer.calculatePositionSize(positionSizeInput);

      // Step 6: Final Recommendation
      const recommendation = this.makeRecommendation(
        overallConfidence,
        regime,
        positionSize
      );

      // Create enhanced signal
      const enhancedSignal: MLEnhancedSignal = {
        ...filteredSignal,
        patterns: patternAnalysis.patterns,
        regime,
        positionSize: {
          quantity: positionSize.quantity,
          riskAmount: positionSize.riskAmount,
          riskPercent: positionSize.riskPercent,
          reasoning: positionSize.reasoning
        },
        recommendation,
        overallConfidence
      };

      // Log and notify
      logger.info(`[MLOrchestrator] Signal enhanced: ${signal.symbol} ${signal.side}`, {
        mlScore: filteredSignal.mlScore.toFixed(3),
        mlConfidence: filteredSignal.mlConfidence.toFixed(3),
        overallConfidence: overallConfidence.toFixed(3),
        regime: regime.regime,
        patterns: patternAnalysis.patterns.length,
        recommendation,
        positionSize: positionSize.quantity.toFixed(6)
      });

      metricsService.incrementCounter('ml_signals_enhanced', 1, { symbol: signal.symbol });
      metricsService.setGauge('ml_overall_confidence', overallConfidence, { symbol: signal.symbol });

      // Send Slack notification for high-confidence signals
      if (overallConfidence >= 0.80) {
        await this.notifyHighConfidenceSignal(enhancedSignal, marketData);
      }

      return enhancedSignal;

    } catch (error: any) {
      logger.error('[MLOrchestrator] Error processing signal:', error);
      metricsService.incrementCounter('ml_errors', 1, { symbol: signal.symbol });
      return null;
    }
  }

  /**
   * Check if patterns align with signal direction
   */
  private checkPatternAlignment(signal: Signal, patternAnalysis: any): boolean {
    if (patternAnalysis.patterns.length === 0) {
      return true; // No patterns, don't reject
    }

    const bullishPatterns = patternAnalysis.patterns.filter((p: any) => p.type === 'bullish').length;
    const bearishPatterns = patternAnalysis.patterns.filter((p: any) => p.type === 'bearish').length;

    if (signal.side === 'BUY') {
      // For buy signals, we want more bullish than bearish patterns
      return bullishPatterns >= bearishPatterns;
    } else {
      // For sell signals, we want more bearish than bullish patterns
      return bearishPatterns >= bullishPatterns;
    }
  }

  /**
   * Check if market regime is favorable for the signal
   */
  private checkRegimeFavorability(signal: Signal, regime: RegimeAnalysis): boolean {
    // High volatility is generally unfavorable
    if (regime.regime === 'HIGH_VOLATILITY') {
      return regime.confidence < 0.7; // Only proceed if not very confident it's high volatility
    }

    // Buy signals
    if (signal.side === 'BUY') {
      const favorableRegimes = ['STRONG_UPTREND', 'UPTREND', 'WEAK_UPTREND', 'RANGING'];
      return favorableRegimes.includes(regime.regime);
    }

    // Sell signals
    if (signal.side === 'SELL') {
      const favorableRegimes = ['STRONG_DOWNTREND', 'DOWNTREND', 'WEAK_DOWNTREND', 'RANGING'];
      return favorableRegimes.includes(regime.regime);
    }

    return true;
  }

  /**
   * Calculate overall confidence from all ML components
   */
  private calculateOverallConfidence(
    filteredSignal: FilteredSignal,
    patternAnalysis: any,
    regime: RegimeAnalysis
  ): number {
    // Weighted average of different confidence scores
    const weights = {
      mlConfidence: 0.40,
      patternConfidence: 0.30,
      regimeConfidence: 0.20,
      agreement: 0.10
    };

    const mlConfidence = filteredSignal.mlConfidence;
    const patternConfidence = patternAnalysis.confidence || 0.5;
    const regimeConfidence = regime.confidence;
    const agreement = filteredSignal.predictions.agreement;

    const overall = (
      mlConfidence * weights.mlConfidence +
      patternConfidence * weights.patternConfidence +
      regimeConfidence * weights.regimeConfidence +
      agreement * weights.agreement
    );

    return Math.max(0, Math.min(1, overall));
  }

  /**
   * Make final trading recommendation
   */
  private makeRecommendation(
    overallConfidence: number,
    regime: RegimeAnalysis,
    positionSize: any
  ): MLEnhancedSignal['recommendation'] {
    // Very high confidence - execute full size
    if (overallConfidence >= 0.85) {
      return 'EXECUTE';
    }

    // High confidence - execute
    if (overallConfidence >= 0.70) {
      return 'EXECUTE';
    }

    // Moderate confidence - reduce size
    if (overallConfidence >= 0.60) {
      return 'REDUCE_SIZE';
    }

    // Low confidence - skip
    return 'SKIP';
  }

  /**
   * Send Slack notification for high-confidence signals
   */
  private async notifyHighConfidenceSignal(
    signal: MLEnhancedSignal,
    marketData: MarketData
  ): Promise<void> {
    try {
      const message = `🎯 *High-Confidence ML Signal*\n` +
        `Symbol: ${signal.symbol}\n` +
        `Side: ${signal.side}\n` +
        `Price: $${marketData.currentPrice.toFixed(2)}\n` +
        `\n` +
        `*ML Analysis:*\n` +
        `Overall Confidence: ${(signal.overallConfidence * 100).toFixed(1)}%\n` +
        `ML Score: ${(signal.mlScore * 100).toFixed(1)}%\n` +
        `Ensemble Agreement: ${(signal.predictions.agreement * 100).toFixed(1)}%\n` +
        `\n` +
        `*Market Regime:* ${signal.regime.regime}\n` +
        `Regime Confidence: ${(signal.regime.confidence * 100).toFixed(1)}%\n` +
        `Strategy: ${signal.regime.tradingRecommendation.strategy}\n` +
        `\n` +
        `*Patterns Detected:* ${signal.patterns.length}\n` +
        signal.patterns.slice(0, 3).map((p: any) => `• ${p.name} (${p.type})`).join('\n') +
        `\n\n` +
        `*Position Size:*\n` +
        `Quantity: ${signal.positionSize?.quantity.toFixed(6)}\n` +
        `Risk: ${(signal.positionSize?.riskPercent! * 100).toFixed(2)}% ($${signal.positionSize?.riskAmount.toFixed(2)})\n` +
        `\n` +
        `*Recommendation:* ${signal.recommendation}`;

      await slackNotifier.sendNotification(message, 'info');
    } catch (error) {
      logger.error('[MLOrchestrator] Error sending Slack notification:', error);
    }
  }

  /**
   * Get ML performance statistics
   */
  async getPerformanceStats(symbol?: string): Promise<any> {
    // This would query your database for ML performance metrics
    // For now, return placeholder
    return {
      totalSignalsProcessed: 0,
      signalsEnhanced: 0,
      signalsRejected: 0,
      avgConfidence: 0,
      highConfidenceWinRate: 0,
      lowConfidenceWinRate: 0
    };
  }

  /**
   * Enable/disable ML processing
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info(`[MLOrchestrator] ML processing ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Update minimum confidence threshold
   */
  setMinConfidence(confidence: number): void {
    this.minOverallConfidence = Math.max(0, Math.min(1, confidence));
    logger.info(`[MLOrchestrator] Min confidence set to ${this.minOverallConfidence.toFixed(2)}`);
  }

  /**
   * Get current configuration
   */
  getConfig(): { enabled: boolean; minConfidence: number } {
    return {
      enabled: this.enabled,
      minConfidence: this.minOverallConfidence
    };
  }
}

export const mlOrchestrator = MLOrchestrator.getInstance();
