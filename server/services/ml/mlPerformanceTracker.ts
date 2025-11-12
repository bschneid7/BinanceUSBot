/**
 * ML Performance Tracker
 * Tracks ML predictions vs actual outcomes
 * Provides real-time performance metrics and model calibration data
 */

import logger from '../../utils/logger';
import { metricsService } from '../metricsService';
import { MLEnhancedSignal } from './mlOrchestrator';

export interface MLPrediction {
  id: string;
  timestamp: Date;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  mlScore: number;
  mlConfidence: number;
  overallConfidence: number;
  regime: string;
  patterns: number;
  positionSize: number;
  recommendation: string;
}

export interface MLOutcome {
  predictionId: string;
  exitPrice: number;
  exitTime: Date;
  pnl: number;
  pnlPercent: number;
  holdingPeriod: number; // hours
  wasWinner: boolean;
}

export interface MLPerformanceMetrics {
  totalPredictions: number;
  totalOutcomes: number;
  
  // Overall performance
  winRate: number;
  avgPnl: number;
  avgPnlPercent: number;
  profitFactor: number;
  
  // Confidence-based performance
  highConfidence: {
    count: number;
    winRate: number;
    avgPnl: number;
  };
  mediumConfidence: {
    count: number;
    winRate: number;
    avgPnl: number;
  };
  lowConfidence: {
    count: number;
    winRate: number;
    avgPnl: number;
  };
  
  // Regime-based performance
  regimePerformance: Map<string, {
    count: number;
    winRate: number;
    avgPnl: number;
  }>;
  
  // Pattern-based performance
  withPatterns: {
    count: number;
    winRate: number;
    avgPnl: number;
  };
  withoutPatterns: {
    count: number;
    winRate: number;
    avgPnl: number;
  };
  
  // Model calibration
  calibration: {
    predicted: number[]; // Confidence buckets
    actual: number[]; // Actual win rates
  };
}

class MLPerformanceTracker {
  private static instance: MLPerformanceTracker;
  private predictions: Map<string, MLPrediction> = new Map();
  private outcomes: Map<string, MLOutcome> = new Map();
  private readonly MAX_HISTORY = 1000; // Keep last 1000 predictions

  private constructor() {
    logger.info('[MLPerformanceTracker] Initialized');
  }

  static getInstance(): MLPerformanceTracker {
    if (!MLPerformanceTracker.instance) {
      MLPerformanceTracker.instance = new MLPerformanceTracker();
    }
    return MLPerformanceTracker.instance;
  }

  /**
   * Record an ML prediction
   */
  recordPrediction(signal: MLEnhancedSignal, orderId: string): void {
    const prediction: MLPrediction = {
      id: orderId,
      timestamp: new Date(),
      symbol: signal.symbol,
      side: signal.side,
      entryPrice: signal.entryPrice,
      mlScore: signal.mlScore,
      mlConfidence: signal.mlConfidence,
      overallConfidence: signal.overallConfidence,
      regime: signal.regime.regime,
      patterns: signal.patterns.length,
      positionSize: signal.positionSize?.quantity || 0,
      recommendation: signal.recommendation
    };

    this.predictions.set(orderId, prediction);

    // Trim history if too large
    if (this.predictions.size > this.MAX_HISTORY) {
      const firstKey = this.predictions.keys().next().value;
      this.predictions.delete(firstKey);
    }

    logger.info(`[MLPerformanceTracker] Recorded prediction for ${signal.symbol}`, {
      orderId,
      confidence: signal.overallConfidence.toFixed(3)
    });

    metricsService.incrementCounter('ml_predictions_total', 1, { symbol: signal.symbol });
  }

  /**
   * Record an ML outcome (when trade closes)
   */
  recordOutcome(
    orderId: string,
    exitPrice: number,
    exitTime: Date,
    pnl: number,
    pnlPercent: number
  ): void {
    const prediction = this.predictions.get(orderId);
    if (!prediction) {
      logger.warn(`[MLPerformanceTracker] No prediction found for order ${orderId}`);
      return;
    }

    const holdingPeriod = (exitTime.getTime() - prediction.timestamp.getTime()) / (1000 * 60 * 60);
    const wasWinner = pnl > 0;

    const outcome: MLOutcome = {
      predictionId: orderId,
      exitPrice,
      exitTime,
      pnl,
      pnlPercent,
      holdingPeriod,
      wasWinner
    };

    this.outcomes.set(orderId, outcome);

    // Trim history
    if (this.outcomes.size > this.MAX_HISTORY) {
      const firstKey = this.outcomes.keys().next().value;
      this.outcomes.delete(firstKey);
    }

    logger.info(`[MLPerformanceTracker] Recorded outcome for ${prediction.symbol}`, {
      orderId,
      pnl: pnl.toFixed(2),
      pnlPercent: pnlPercent.toFixed(2) + '%',
      wasWinner
    });

    // Update metrics
    metricsService.incrementCounter('ml_outcomes_total', 1, { 
      symbol: prediction.symbol,
      result: wasWinner ? 'win' : 'loss'
    });

    if (wasWinner) {
      metricsService.incrementCounter('ml_wins_total', 1, { symbol: prediction.symbol });
    } else {
      metricsService.incrementCounter('ml_losses_total', 1, { symbol: prediction.symbol });
    }

    metricsService.setGauge('ml_last_pnl', pnl, { symbol: prediction.symbol });
    metricsService.setGauge('ml_last_pnl_percent', pnlPercent, { symbol: prediction.symbol });

    // Update win rate
    const metrics = this.getMetrics();
    metricsService.setGauge('ml_win_rate', metrics.winRate * 100);
  }

  /**
   * Get comprehensive performance metrics
   */
  getMetrics(symbol?: string): MLPerformanceMetrics {
    // Filter by symbol if provided
    let predictions = Array.from(this.predictions.values());
    let outcomes = Array.from(this.outcomes.values());

    if (symbol) {
      predictions = predictions.filter(p => p.symbol === symbol);
      const predictionIds = new Set(predictions.map(p => p.id));
      outcomes = outcomes.filter(o => predictionIds.has(o.predictionId));
    }

    // Calculate overall metrics
    const totalPredictions = predictions.length;
    const totalOutcomes = outcomes.length;

    const winners = outcomes.filter(o => o.wasWinner);
    const losers = outcomes.filter(o => !o.wasWinner);

    const winRate = totalOutcomes > 0 ? winners.length / totalOutcomes : 0;
    const avgPnl = totalOutcomes > 0 
      ? outcomes.reduce((sum, o) => sum + o.pnl, 0) / totalOutcomes 
      : 0;
    const avgPnlPercent = totalOutcomes > 0
      ? outcomes.reduce((sum, o) => sum + o.pnlPercent, 0) / totalOutcomes
      : 0;

    const grossProfit = winners.reduce((sum, o) => sum + o.pnl, 0);
    const grossLoss = Math.abs(losers.reduce((sum, o) => sum + o.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    // Confidence-based performance
    const highConfidence = this.getConfidenceMetrics(predictions, outcomes, 0.80, 1.0);
    const mediumConfidence = this.getConfidenceMetrics(predictions, outcomes, 0.65, 0.80);
    const lowConfidence = this.getConfidenceMetrics(predictions, outcomes, 0, 0.65);

    // Regime-based performance
    const regimePerformance = this.getRegimePerformance(predictions, outcomes);

    // Pattern-based performance
    const withPatterns = this.getPatternMetrics(predictions, outcomes, true);
    const withoutPatterns = this.getPatternMetrics(predictions, outcomes, false);

    // Calibration
    const calibration = this.calculateCalibration(predictions, outcomes);

    return {
      totalPredictions,
      totalOutcomes,
      winRate,
      avgPnl,
      avgPnlPercent,
      profitFactor,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      regimePerformance,
      withPatterns,
      withoutPatterns,
      calibration
    };
  }

  /**
   * Get metrics for a confidence range
   */
  private getConfidenceMetrics(
    predictions: MLPrediction[],
    outcomes: MLOutcome[],
    minConf: number,
    maxConf: number
  ): { count: number; winRate: number; avgPnl: number } {
    const filtered = predictions.filter(
      p => p.overallConfidence >= minConf && p.overallConfidence < maxConf
    );
    const filteredIds = new Set(filtered.map(p => p.id));
    const filteredOutcomes = outcomes.filter(o => filteredIds.has(o.predictionId));

    const count = filteredOutcomes.length;
    const winners = filteredOutcomes.filter(o => o.wasWinner);
    const winRate = count > 0 ? winners.length / count : 0;
    const avgPnl = count > 0
      ? filteredOutcomes.reduce((sum, o) => sum + o.pnl, 0) / count
      : 0;

    return { count, winRate, avgPnl };
  }

  /**
   * Get performance by regime
   */
  private getRegimePerformance(
    predictions: MLPrediction[],
    outcomes: MLOutcome[]
  ): Map<string, { count: number; winRate: number; avgPnl: number }> {
    const regimeMap = new Map<string, { count: number; winRate: number; avgPnl: number }>();

    const regimes = new Set(predictions.map(p => p.regime));

    for (const regime of regimes) {
      const filtered = predictions.filter(p => p.regime === regime);
      const filteredIds = new Set(filtered.map(p => p.id));
      const filteredOutcomes = outcomes.filter(o => filteredIds.has(o.predictionId));

      const count = filteredOutcomes.length;
      const winners = filteredOutcomes.filter(o => o.wasWinner);
      const winRate = count > 0 ? winners.length / count : 0;
      const avgPnl = count > 0
        ? filteredOutcomes.reduce((sum, o) => sum + o.pnl, 0) / count
        : 0;

      regimeMap.set(regime, { count, winRate, avgPnl });
    }

    return regimeMap;
  }

  /**
   * Get metrics based on pattern presence
   */
  private getPatternMetrics(
    predictions: MLPrediction[],
    outcomes: MLOutcome[],
    hasPatterns: boolean
  ): { count: number; winRate: number; avgPnl: number } {
    const filtered = hasPatterns
      ? predictions.filter(p => p.patterns > 0)
      : predictions.filter(p => p.patterns === 0);

    const filteredIds = new Set(filtered.map(p => p.id));
    const filteredOutcomes = outcomes.filter(o => filteredIds.has(o.predictionId));

    const count = filteredOutcomes.length;
    const winners = filteredOutcomes.filter(o => o.wasWinner);
    const winRate = count > 0 ? winners.length / count : 0;
    const avgPnl = count > 0
      ? filteredOutcomes.reduce((sum, o) => sum + o.pnl, 0) / count
      : 0;

    return { count, winRate, avgPnl };
  }

  /**
   * Calculate model calibration
   * Compares predicted confidence to actual win rate
   */
  private calculateCalibration(
    predictions: MLPrediction[],
    outcomes: MLOutcome[]
  ): { predicted: number[]; actual: number[] } {
    const buckets = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const predicted: number[] = [];
    const actual: number[] = [];

    for (let i = 0; i < buckets.length - 1; i++) {
      const minConf = buckets[i];
      const maxConf = buckets[i + 1];

      const filtered = predictions.filter(
        p => p.overallConfidence >= minConf && p.overallConfidence < maxConf
      );
      const filteredIds = new Set(filtered.map(p => p.id));
      const filteredOutcomes = outcomes.filter(o => filteredIds.has(o.predictionId));

      if (filteredOutcomes.length > 0) {
        const avgConfidence = filtered.reduce((sum, p) => sum + p.overallConfidence, 0) / filtered.length;
        const winRate = filteredOutcomes.filter(o => o.wasWinner).length / filteredOutcomes.length;

        predicted.push(avgConfidence);
        actual.push(winRate);
      }
    }

    return { predicted, actual };
  }

  /**
   * Get recent predictions
   */
  getRecentPredictions(limit: number = 10, symbol?: string): MLPrediction[] {
    let predictions = Array.from(this.predictions.values());

    if (symbol) {
      predictions = predictions.filter(p => p.symbol === symbol);
    }

    return predictions
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get recent outcomes
   */
  getRecentOutcomes(limit: number = 10, symbol?: string): Array<MLPrediction & MLOutcome> {
    const outcomes = Array.from(this.outcomes.values());
    const results: Array<MLPrediction & MLOutcome> = [];

    for (const outcome of outcomes) {
      const prediction = this.predictions.get(outcome.predictionId);
      if (prediction) {
        if (!symbol || prediction.symbol === symbol) {
          results.push({ ...prediction, ...outcome });
        }
      }
    }

    return results
      .sort((a, b) => b.exitTime.getTime() - a.exitTime.getTime())
      .slice(0, limit);
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.predictions.clear();
    this.outcomes.clear();
    logger.info('[MLPerformanceTracker] History cleared');
  }

  /**
   * Export data for analysis
   */
  exportData(): { predictions: MLPrediction[]; outcomes: MLOutcome[] } {
    return {
      predictions: Array.from(this.predictions.values()),
      outcomes: Array.from(this.outcomes.values())
    };
  }
}

export const mlPerformanceTracker = MLPerformanceTracker.getInstance();
