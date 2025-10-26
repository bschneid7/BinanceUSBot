import mongoose from 'mongoose';

/**
 * ML Monitoring Service
 * 
 * Tracks ML model performance, predictions, and errors in real-time
 */

// ML Prediction Log Schema
export interface IMLPredictionLog extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  timestamp: Date;
  symbol: string;
  state: number[];
  action: number;  // 0=HOLD, 1=BUY, 2=SELL, 3=CLOSE
  confidence: number;
  modelVersion: string;
  executedTrade: boolean;
  tradeId?: mongoose.Types.ObjectId;
}

const MLPredictionLogSchema = new mongoose.Schema<IMLPredictionLog>({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  symbol: { type: String, required: true, index: true },
  state: { type: [Number], required: true },
  action: { type: Number, required: true, min: 0, max: 3 },
  confidence: { type: Number, required: true, min: 0, max: 1 },
  modelVersion: { type: String, required: true, index: true },
  executedTrade: { type: Boolean, default: false },
  tradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade' }
});

export const MLPredictionLog = mongoose.model<IMLPredictionLog>('MLPredictionLog', MLPredictionLogSchema);

// ML Error Log Schema
export interface IMLErrorLog extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  timestamp: Date;
  errorType: 'INFERENCE_ERROR' | 'STATE_DIMENSION_MISMATCH' | 'MODEL_LOAD_ERROR' | 'UNKNOWN';
  errorMessage: string;
  modelVersion: string;
  state?: number[];
  stackTrace?: string;
}

const MLErrorLogSchema = new mongoose.Schema<IMLErrorLog>({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  errorType: { 
    type: String, 
    required: true, 
    enum: ['INFERENCE_ERROR', 'STATE_DIMENSION_MISMATCH', 'MODEL_LOAD_ERROR', 'UNKNOWN'] 
  },
  errorMessage: { type: String, required: true },
  modelVersion: { type: String, required: true },
  state: { type: [Number] },
  stackTrace: { type: String }
});

export const MLErrorLog = mongoose.model<IMLErrorLog>('MLErrorLog', MLErrorLogSchema);

// ML Performance Metrics Interface
export interface MLMetrics {
  // Time range
  timeRange: string;
  startTime: Date;
  endTime: Date;
  
  // Prediction metrics
  predictionsTotal: number;
  predictionsPerHour: number;
  avgConfidence: number;
  actionDistribution: {
    HOLD: number;
    BUY: number;
    SELL: number;
    CLOSE: number;
  };
  
  // Trade metrics
  mlTradesTotal: number;
  mlWinRate: number;
  mlAvgReturn: number;
  mlSharpeRatio: number;
  mlMaxDrawdown: number;
  
  // Comparison metrics
  mlVsRulesReturnDiff: number;
  mlVsRulesSharpeDiff: number;
  
  // Error metrics
  inferenceErrors: number;
  fallbackToRulesCount: number;
  lowConfidenceCount: number;
  
  // Model info
  modelVersion: string;
  allocationPct: number;
}

export class MLMonitor {
  /**
   * Log ML prediction
   */
  static async logPrediction(
    userId: mongoose.Types.ObjectId,
    symbol: string,
    state: number[],
    action: number,
    confidence: number,
    modelVersion: string,
    executedTrade: boolean = false,
    tradeId?: mongoose.Types.ObjectId
  ): Promise<void> {
    try {
      await MLPredictionLog.create({
        userId,
        symbol,
        state,
        action,
        confidence,
        modelVersion,
        executedTrade,
        tradeId
      });
    } catch (error) {
      console.error('[MLMonitor] Error logging prediction:', error);
    }
  }
  
  /**
   * Log ML error
   */
  static async logError(
    userId: mongoose.Types.ObjectId,
    errorType: 'INFERENCE_ERROR' | 'STATE_DIMENSION_MISMATCH' | 'MODEL_LOAD_ERROR' | 'UNKNOWN',
    errorMessage: string,
    modelVersion: string,
    state?: number[],
    stackTrace?: string
  ): Promise<void> {
    try {
      await MLErrorLog.create({
        userId,
        errorType,
        errorMessage,
        modelVersion,
        state,
        stackTrace
      });
      
      console.error(`[MLMonitor] ❌ ${errorType}: ${errorMessage}`);
    } catch (error) {
      console.error('[MLMonitor] Error logging ML error:', error);
    }
  }
  
  /**
   * Get ML metrics for a time range
   */
  static async getMetrics(
    userId: mongoose.Types.ObjectId,
    timeRange: '1h' | '24h' | '7d' | '30d'
  ): Promise<MLMetrics> {
    const now = new Date();
    const startTime = this.getStartTime(now, timeRange);
    
    // Get predictions
    const predictions = await MLPredictionLog.find({
      userId,
      timestamp: { $gte: startTime, $lte: now }
    }).lean();
    
    // Get errors
    const errors = await MLErrorLog.find({
      userId,
      timestamp: { $gte: startTime, $lte: now }
    }).lean();
    
    // Calculate metrics
    const predictionsTotal = predictions.length;
    const hoursInRange = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    const predictionsPerHour = predictionsTotal / hoursInRange;
    
    const avgConfidence = predictions.length > 0
      ? predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length
      : 0;
    
    const actionDistribution = {
      HOLD: predictions.filter(p => p.action === 0).length,
      BUY: predictions.filter(p => p.action === 1).length,
      SELL: predictions.filter(p => p.action === 2).length,
      CLOSE: predictions.filter(p => p.action === 3).length
    };
    
    const mlTradesTotal = predictions.filter(p => p.executedTrade).length;
    const lowConfidenceCount = predictions.filter(p => p.confidence < 0.6).length;
    
    // Get trade performance from actual trades with ML metadata
    const Trade = (await import('../models/Trade')).default;
    const mlTrades = await Trade.find({
      userId,
      createdAt: { $gte: startTime, $lte: now },
      'metadata.mlConfidence': { $exists: true }
    }).lean();
    
    const mlWinRate = mlTrades.length > 0 
      ? mlTrades.filter(t => t.pnl_usd > 0).length / mlTrades.length 
      : 0;
    const mlAvgReturn = mlTrades.length > 0
      ? mlTrades.reduce((sum, t) => sum + (t.pnl_r || 0), 0) / mlTrades.length
      : 0;
    const mlSharpeRatio = mlTrades.length > 2
      ? this.calculateSharpeRatio(mlTrades.map(t => t.pnl_r || 0))
      : 0;
    const mlMaxDrawdown = mlTrades.length > 0
      ? this.calculateMaxDrawdown(mlTrades.map(t => t.pnl_usd))
      : 0;
    
    // Compare ML trades vs rule-based trades
    const ruleTrades = await Trade.find({
      userId,
      createdAt: { $gte: startTime, $lte: now },
      'metadata.mlConfidence': { $exists: false }
    }).lean();
    
    const ruleAvgReturn = ruleTrades.length > 0
      ? ruleTrades.reduce((sum, t) => sum + (t.pnl_r || 0), 0) / ruleTrades.length
      : 0;
    const ruleSharpeRatio = ruleTrades.length > 2
      ? this.calculateSharpeRatio(ruleTrades.map(t => t.pnl_r || 0))
      : 0;
    
    const mlVsRulesReturnDiff = mlAvgReturn - ruleAvgReturn;
    const mlVsRulesSharpeDiff = mlSharpeRatio - ruleSharpeRatio;
    
    // Get model version (from most recent prediction)
    const modelVersion = predictions.length > 0 
      ? predictions[predictions.length - 1].modelVersion 
      : 'unknown';
    
    // Get allocation from config
    const BotConfig = (await import('../models/BotConfig')).default;
    const config = await BotConfig.findOne({ userId });
    const allocationPct = config?.mlAllocation || 0;
    
    return {
      timeRange,
      startTime,
      endTime: now,
      predictionsTotal,
      predictionsPerHour,
      avgConfidence,
      actionDistribution,
      mlTradesTotal,
      mlWinRate,
      mlAvgReturn,
      mlSharpeRatio,
      mlMaxDrawdown,
      mlVsRulesReturnDiff,
      mlVsRulesSharpeDiff,
      inferenceErrors: errors.filter(e => e.errorType === 'INFERENCE_ERROR').length,
      fallbackToRulesCount: predictions.filter(p => p.metadata?.fallbackToRules).length,
      lowConfidenceCount,
      modelVersion,
      allocationPct
    };
  }
  
  /**
   * Check if rollback conditions are met
   */
  static async checkRollbackConditions(
    userId: mongoose.Types.ObjectId
  ): Promise<{ shouldRollback: boolean; reason?: string }> {
    const metrics = await this.getMetrics(userId, '24h');
    
    // Condition 1: High error rate
    if (metrics.inferenceErrors > 50) {
      return { 
        shouldRollback: true, 
        reason: `High inference error rate (${metrics.inferenceErrors} in 24h)` 
      };
    }
    
    // Condition 2: Poor performance (if enough trades)
    if (metrics.mlSharpeRatio < 0.5 && metrics.mlTradesTotal > 20) {
      return { 
        shouldRollback: true, 
        reason: `Sharpe ratio below 0.5 (${metrics.mlSharpeRatio.toFixed(2)}) with ${metrics.mlTradesTotal} trades` 
      };
    }
    
    // Condition 3: Significant underperformance
    if (metrics.mlVsRulesReturnDiff < -10) {
      return { 
        shouldRollback: true, 
        reason: `Underperforming rule-based system by ${Math.abs(metrics.mlVsRulesReturnDiff).toFixed(1)}%` 
      };
    }
    
    // Condition 4: Max drawdown exceeded
    if (metrics.mlMaxDrawdown < -0.15) {
      return { 
        shouldRollback: true, 
        reason: `Max drawdown exceeded 15% (${(metrics.mlMaxDrawdown * 100).toFixed(1)}%)` 
      };
    }
    
    // Condition 5: Very low confidence
    if (metrics.avgConfidence < 0.4 && metrics.predictionsTotal > 100) {
      return { 
        shouldRollback: true, 
        reason: `Average confidence too low (${(metrics.avgConfidence * 100).toFixed(1)}%)` 
      };
    }
    
    return { shouldRollback: false };
  }
  
  /**
   * Get alert conditions
   */
  static async getAlerts(userId: mongoose.Types.ObjectId): Promise<Array<{
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    message: string;
    metric?: string;
    value?: number;
  }>> {
    const metrics = await this.getMetrics(userId, '24h');
    const alerts: Array<any> = [];
    
    // Low confidence warning
    if (metrics.avgConfidence < 0.5) {
      alerts.push({
        severity: 'WARNING',
        message: 'ML model confidence below 50%',
        metric: 'avgConfidence',
        value: metrics.avgConfidence
      });
    }
    
    // High error rate
    if (metrics.inferenceErrors > 10) {
      alerts.push({
        severity: metrics.inferenceErrors > 50 ? 'CRITICAL' : 'WARNING',
        message: `ML inference errors: ${metrics.inferenceErrors} in 24h`,
        metric: 'inferenceErrors',
        value: metrics.inferenceErrors
      });
    }
    
    // Poor performance
    if (metrics.mlSharpeRatio < 1.0 && metrics.mlTradesTotal > 10) {
      alerts.push({
        severity: 'WARNING',
        message: `ML Sharpe ratio below 1.0: ${metrics.mlSharpeRatio.toFixed(2)}`,
        metric: 'mlSharpeRatio',
        value: metrics.mlSharpeRatio
      });
    }
    
    // Underperforming rules
    if (metrics.mlVsRulesReturnDiff < -5) {
      alerts.push({
        severity: 'WARNING',
        message: `ML underperforming rule-based by ${Math.abs(metrics.mlVsRulesReturnDiff).toFixed(1)}%`,
        metric: 'mlVsRulesReturnDiff',
        value: metrics.mlVsRulesReturnDiff
      });
    }
    
    // High drawdown
    if (metrics.mlMaxDrawdown < -0.10) {
      alerts.push({
        severity: metrics.mlMaxDrawdown < -0.15 ? 'CRITICAL' : 'WARNING',
        message: `ML max drawdown: ${(metrics.mlMaxDrawdown * 100).toFixed(1)}%`,
        metric: 'mlMaxDrawdown',
        value: metrics.mlMaxDrawdown
      });
    }
    
    return alerts;
  }
  
  /**
   * Helper: Get start time for time range
   */
  private static getStartTime(now: Date, timeRange: string): Date {
    const ms = now.getTime();
    
    switch (timeRange) {
      case '1h':
        return new Date(ms - 60 * 60 * 1000);
      case '24h':
        return new Date(ms - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(ms - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(ms - 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(ms - 24 * 60 * 60 * 1000);
    }
  }
  
  /**
   * Helper: Calculate Sharpe ratio from returns
   */
  private static calculateSharpeRatio(returns: number[]): number {
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;
    
    // Annualized Sharpe ratio (assuming daily returns)
    return (mean / stdDev) * Math.sqrt(252);
  }
  
  /**
   * Helper: Calculate maximum drawdown from cumulative PnL
   */
  private static calculateMaxDrawdown(pnls: number[]): number {
    if (pnls.length === 0) return 0;
    
    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;
    
    for (const pnl of pnls) {
      cumulative += pnl;
      peak = Math.max(peak, cumulative);
      const drawdown = (cumulative - peak) / Math.max(Math.abs(peak), 1);
      maxDrawdown = Math.min(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }
}

