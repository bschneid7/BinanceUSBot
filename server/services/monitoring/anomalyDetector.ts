import logger from '../../utils/logger';
import metricsCollector, { SystemMetrics } from './metricsCollector';
import alertManager, { AlertLevel } from './alertManager';

/**
 * Anomaly Detection Service
 * Detects unusual patterns in system metrics using statistical methods
 */

export interface AnomalyDetectionConfig {
  enabled: boolean;
  checkIntervalSeconds: number;
  zScoreThreshold: number;
  minDataPoints: number;
}

export interface Anomaly {
  type: string;
  severity: AlertLevel;
  metric: string;
  currentValue: number;
  expectedValue: number;
  deviation: number;
  timestamp: Date;
  description: string;
}

class AnomalyDetector {
  private config: AnomalyDetectionConfig = {
    enabled: true,
    checkIntervalSeconds: 30,
    zScoreThreshold: 2.5, // 2.5 standard deviations
    minDataPoints: 10,
  };

  private detectionInterval: NodeJS.Timeout | null = null;

  /**
   * Start anomaly detection
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('[AnomalyDetector] Anomaly detection disabled');
      return;
    }

    logger.info(`[AnomalyDetector] Starting anomaly detection (interval: ${this.config.checkIntervalSeconds}s)`);

    this.detectionInterval = setInterval(() => {
      this.detectAnomalies();
    }, this.config.checkIntervalSeconds * 1000);

    logger.info('[AnomalyDetector] ✅ Anomaly detection started');
  }

  /**
   * Stop anomaly detection
   */
  stop(): void {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
      logger.info('[AnomalyDetector] Anomaly detection stopped');
    }
  }

  /**
   * Detect anomalies in current metrics
   */
  private async detectAnomalies(): Promise<void> {
    try {
      const current = metricsCollector.getCurrentMetrics();
      if (!current) return;

      const history = metricsCollector.getMetricsHistory(60); // Last hour
      if (history.length < this.config.minDataPoints) {
        logger.debug('[AnomalyDetector] Insufficient data for anomaly detection');
        return;
      }

      const anomalies: Anomaly[] = [];

      // Check trading metrics
      anomalies.push(...this.checkTradingAnomalies(current, history));

      // Check system health
      anomalies.push(...this.checkSystemAnomalies(current, history));

      // Check performance
      anomalies.push(...this.checkPerformanceAnomalies(current, history));

      // Send alerts for detected anomalies
      for (const anomaly of anomalies) {
        await alertManager.sendAlert({
          level: anomaly.severity,
          title: `Anomaly Detected: ${anomaly.type}`,
          message: anomaly.description,
          details: {
            metric: anomaly.metric,
            currentValue: anomaly.currentValue,
            expectedValue: anomaly.expectedValue,
            deviation: anomaly.deviation,
          },
          timestamp: anomaly.timestamp,
        });
      }

      if (anomalies.length > 0) {
        logger.warn(`[AnomalyDetector] Detected ${anomalies.length} anomalies`);
      }
    } catch (error: any) {
      logger.error('[AnomalyDetector] Error detecting anomalies:', error);
    }
  }

  /**
   * Check for anomalies in trading metrics
   */
  private checkTradingAnomalies(current: SystemMetrics, history: SystemMetrics[]): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Check signal generation rate
    const signalRates = history.map(m => m.trading.signalsPerMinute);
    const signalAnomaly = this.detectOutlier(
      current.trading.signalsPerMinute,
      signalRates,
      'Signal Generation Rate'
    );
    if (signalAnomaly) {
      signalAnomaly.type = 'SignalGenerationAnomaly';
      signalAnomaly.severity = signalAnomaly.currentValue < signalAnomaly.expectedValue ? 'WARNING' : 'INFO';
      signalAnomaly.description = signalAnomaly.currentValue < signalAnomaly.expectedValue
        ? `Signal generation rate dropped significantly: ${signalAnomaly.currentValue.toFixed(1)}/min (expected: ${signalAnomaly.expectedValue.toFixed(1)}/min)`
        : `Signal generation rate increased significantly: ${signalAnomaly.currentValue.toFixed(1)}/min (expected: ${signalAnomaly.expectedValue.toFixed(1)}/min)`;
      anomalies.push(signalAnomaly);
    }

    // Check order success rate
    if (current.trading.ordersPlaced > 0 && current.trading.orderSuccessRate < 80) {
      anomalies.push({
        type: 'OrderSuccessRateAnomaly',
        severity: current.trading.orderSuccessRate < 50 ? 'ERROR' : 'WARNING',
        metric: 'Order Success Rate',
        currentValue: current.trading.orderSuccessRate,
        expectedValue: 95,
        deviation: 95 - current.trading.orderSuccessRate,
        timestamp: current.timestamp,
        description: `Order success rate is low: ${current.trading.orderSuccessRate.toFixed(1)}% (expected: >95%)`,
      });
    }

    // Check discrepancy rate
    if (current.trading.discrepanciesFound > 5) {
      anomalies.push({
        type: 'HighDiscrepancyRate',
        severity: current.trading.discrepanciesFound > 10 ? 'ERROR' : 'WARNING',
        metric: 'Discrepancies Found',
        currentValue: current.trading.discrepanciesFound,
        expectedValue: 0,
        deviation: current.trading.discrepanciesFound,
        timestamp: current.timestamp,
        description: `High number of discrepancies detected: ${current.trading.discrepanciesFound} (expected: <2)`,
      });
    }

    return anomalies;
  }

  /**
   * Check for anomalies in system health
   */
  private checkSystemAnomalies(current: SystemMetrics, history: SystemMetrics[]): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Check API latency
    const apiLatencies = history.map(m => m.system.apiLatency.binance);
    const latencyAnomaly = this.detectOutlier(
      current.system.apiLatency.binance,
      apiLatencies,
      'Binance API Latency'
    );
    if (latencyAnomaly && latencyAnomaly.currentValue > latencyAnomaly.expectedValue) {
      latencyAnomaly.type = 'HighApiLatency';
      latencyAnomaly.severity = latencyAnomaly.currentValue > 1000 ? 'ERROR' : 'WARNING';
      latencyAnomaly.description = `Binance API latency is high: ${latencyAnomaly.currentValue}ms (expected: ${latencyAnomaly.expectedValue.toFixed(0)}ms)`;
      anomalies.push(latencyAnomaly);
    }

    // Check queue depths
    const totalQueueDepth = 
      current.system.queueDepths.orderPlacement +
      current.system.queueDepths.positionManagement +
      current.system.queueDepths.reconciliation +
      current.system.queueDepths.analytics;

    if (totalQueueDepth > 50) {
      anomalies.push({
        type: 'HighQueueDepth',
        severity: totalQueueDepth > 100 ? 'ERROR' : 'WARNING',
        metric: 'Total Queue Depth',
        currentValue: totalQueueDepth,
        expectedValue: 10,
        deviation: totalQueueDepth - 10,
        timestamp: current.timestamp,
        description: `Message queues backing up: ${totalQueueDepth} jobs waiting (expected: <10)`,
      });
    }

    // Check circuit breakers
    const openBreakers = Object.entries(current.system.circuitBreakers)
      .filter(([_, state]) => state === 'OPEN')
      .map(([name, _]) => name);

    if (openBreakers.length > 0) {
      anomalies.push({
        type: 'CircuitBreakerOpen',
        severity: 'ERROR',
        metric: 'Circuit Breakers',
        currentValue: openBreakers.length,
        expectedValue: 0,
        deviation: openBreakers.length,
        timestamp: current.timestamp,
        description: `Circuit breakers open: ${openBreakers.join(', ')}`,
      });
    }

    // Check error rates
    if (current.system.errorRates.apiErrors > 5) {
      anomalies.push({
        type: 'HighApiErrorRate',
        severity: current.system.errorRates.apiErrors > 10 ? 'ERROR' : 'WARNING',
        metric: 'API Errors',
        currentValue: current.system.errorRates.apiErrors,
        expectedValue: 0,
        deviation: current.system.errorRates.apiErrors,
        timestamp: current.timestamp,
        description: `High API error rate: ${current.system.errorRates.apiErrors} errors in last 10 seconds`,
      });
    }

    return anomalies;
  }

  /**
   * Check for anomalies in performance metrics
   */
  private checkPerformanceAnomalies(current: SystemMetrics, history: SystemMetrics[]): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Check reconciliation time
    if (current.performance.reconciliationTime > 5000) {
      anomalies.push({
        type: 'SlowReconciliation',
        severity: current.performance.reconciliationTime > 10000 ? 'ERROR' : 'WARNING',
        metric: 'Reconciliation Time',
        currentValue: current.performance.reconciliationTime,
        expectedValue: 1000,
        deviation: current.performance.reconciliationTime - 1000,
        timestamp: current.timestamp,
        description: `Reconciliation taking too long: ${current.performance.reconciliationTime}ms (expected: <1000ms)`,
      });
    }

    // Check cache hit rate
    if (current.performance.cacheHitRate < 50 && current.performance.cacheHitRate > 0) {
      anomalies.push({
        type: 'LowCacheHitRate',
        severity: 'WARNING',
        metric: 'Cache Hit Rate',
        currentValue: current.performance.cacheHitRate,
        expectedValue: 80,
        deviation: 80 - current.performance.cacheHitRate,
        timestamp: current.timestamp,
        description: `Cache hit rate is low: ${current.performance.cacheHitRate.toFixed(1)}% (expected: >80%)`,
      });
    }

    // Check API call rate
    if (current.performance.apiCallsPerMinute > 1000) {
      anomalies.push({
        type: 'HighApiCallRate',
        severity: current.performance.apiCallsPerMinute > 1100 ? 'ERROR' : 'WARNING',
        metric: 'API Calls Per Minute',
        currentValue: current.performance.apiCallsPerMinute,
        expectedValue: 100,
        deviation: current.performance.apiCallsPerMinute - 100,
        timestamp: current.timestamp,
        description: `API call rate approaching limit: ${current.performance.apiCallsPerMinute}/min (limit: 1200/min)`,
      });
    }

    return anomalies;
  }

  /**
   * Detect outliers using z-score method
   */
  private detectOutlier(
    currentValue: number,
    historicalValues: number[],
    metricName: string
  ): Anomaly | null {
    if (historicalValues.length < this.config.minDataPoints) return null;

    const mean = historicalValues.reduce((sum, val) => sum + val, 0) / historicalValues.length;
    const variance = historicalValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / historicalValues.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return null; // No variation

    const zScore = Math.abs((currentValue - mean) / stdDev);

    if (zScore > this.config.zScoreThreshold) {
      return {
        type: 'StatisticalAnomaly',
        severity: zScore > 3 ? 'ERROR' : 'WARNING',
        metric: metricName,
        currentValue,
        expectedValue: mean,
        deviation: zScore,
        timestamp: new Date(),
        description: `${metricName} is ${zScore.toFixed(1)} standard deviations from normal`,
      };
    }

    return null;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AnomalyDetectionConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[AnomalyDetector] Configuration updated:', this.config);
  }

  /**
   * Get configuration
   */
  getConfig(): AnomalyDetectionConfig {
    return { ...this.config };
  }
}

export const anomalyDetector = new AnomalyDetector();
export default anomalyDetector;
