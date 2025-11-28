import logger from '../../utils/logger';
import eventStore from '../eventStore';

/**
 * Metrics Collector Service
 * Collects and stores system metrics for monitoring and analysis
 */

export interface SystemMetrics {
  timestamp: Date;
  trading: TradingMetrics;
  system: SystemHealthMetrics;
  performance: PerformanceMetrics;
}

export interface TradingMetrics {
  signalsGenerated: number;
  signalsPerMinute: number;
  ordersPlaced: number;
  ordersFilled: number;
  ordersFailed: number;
  orderSuccessRate: number;
  positionsOpened: number;
  positionsClosed: number;
  positionCloseSuccessRate: number;
  discrepanciesFound: number;
  discrepanciesFixed: number;
}

export interface SystemHealthMetrics {
  apiLatency: {
    binance: number;
    database: number;
    redis: number;
  };
  queueDepths: {
    orderPlacement: number;
    positionManagement: number;
    reconciliation: number;
    analytics: number;
  };
  circuitBreakers: {
    binanceApi: string;
    mlModel: string;
    database: string;
  };
  errorRates: {
    apiErrors: number;
    databaseErrors: number;
    reconciliationErrors: number;
  };
}

export interface PerformanceMetrics {
  reconciliationTime: number;
  scanCycleTime: number;
  orderPlacementTime: number;
  cacheHitRate: number;
  apiCallsPerMinute: number;
  dbQueriesPerMinute: number;
}

interface MetricsWindow {
  metrics: SystemMetrics[];
  startTime: Date;
  maxSize: number;
}

class MetricsCollector {
  private currentMetrics: Partial<SystemMetrics> = {};
  private metricsHistory: MetricsWindow;
  private collectionInterval: NodeJS.Timeout | null = null;
  private counters: Map<string, number> = new Map();
  private timers: Map<string, number[]> = new Map();

  constructor() {
    // Store last 24 hours of metrics (10-second intervals = 8640 data points)
    this.metricsHistory = {
      metrics: [],
      startTime: new Date(),
      maxSize: 8640,
    };

    this.resetCounters();
  }

  /**
   * Start collecting metrics
   */
  start(intervalSeconds: number = 10): void {
    logger.info(`[MetricsCollector] Starting metrics collection (interval: ${intervalSeconds}s)`);

    this.collectionInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalSeconds * 1000);

    logger.info('[MetricsCollector] ✅ Metrics collection started');
  }

  /**
   * Stop collecting metrics
   */
  stop(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
      logger.info('[MetricsCollector] Metrics collection stopped');
    }
  }

  /**
   * Collect current metrics snapshot
   */
  private collectMetrics(): void {
    const metrics: SystemMetrics = {
      timestamp: new Date(),
      trading: this.collectTradingMetrics(),
      system: this.collectSystemMetrics(),
      performance: this.collectPerformanceMetrics(),
    };

    // Add to history
    this.metricsHistory.metrics.push(metrics);

    // Trim history if too large
    if (this.metricsHistory.metrics.length > this.metricsHistory.maxSize) {
      this.metricsHistory.metrics.shift();
    }

    // Reset counters for next interval
    this.resetCounters();
  }

  /**
   * Collect trading metrics
   */
  private collectTradingMetrics(): TradingMetrics {
    const signalsGenerated = this.getCounter('signals_generated');
    const ordersPlaced = this.getCounter('orders_placed');
    const ordersFilled = this.getCounter('orders_filled');
    const ordersFailed = this.getCounter('orders_failed');
    const positionsClosed = this.getCounter('positions_closed');
    const positionCloseAttempts = this.getCounter('position_close_attempts');
    const discrepanciesFound = this.getCounter('discrepancies_found');
    const discrepanciesFixed = this.getCounter('discrepancies_fixed');

    return {
      signalsGenerated,
      signalsPerMinute: signalsGenerated * 6, // 10-second interval * 6 = 1 minute
      ordersPlaced,
      ordersFilled,
      ordersFailed,
      orderSuccessRate: ordersPlaced > 0 ? (ordersFilled / ordersPlaced) * 100 : 100,
      positionsOpened: ordersFilled,
      positionsClosed,
      positionCloseSuccessRate: positionCloseAttempts > 0 
        ? (positionsClosed / positionCloseAttempts) * 100 
        : 100,
      discrepanciesFound,
      discrepanciesFixed,
    };
  }

  /**
   * Collect system health metrics
   */
  private collectSystemMetrics(): SystemHealthMetrics {
    return {
      apiLatency: {
        binance: this.getAverageTime('binance_api_latency'),
        database: this.getAverageTime('database_latency'),
        redis: this.getAverageTime('redis_latency'),
      },
      queueDepths: {
        orderPlacement: this.getCounter('queue_depth_order_placement'),
        positionManagement: this.getCounter('queue_depth_position_management'),
        reconciliation: this.getCounter('queue_depth_reconciliation'),
        analytics: this.getCounter('queue_depth_analytics'),
      },
      circuitBreakers: {
        binanceApi: this.getCounter('circuit_breaker_binance_open') > 0 ? 'OPEN' : 'CLOSED',
        mlModel: this.getCounter('circuit_breaker_ml_open') > 0 ? 'OPEN' : 'CLOSED',
        database: this.getCounter('circuit_breaker_database_open') > 0 ? 'OPEN' : 'CLOSED',
      },
      errorRates: {
        apiErrors: this.getCounter('api_errors'),
        databaseErrors: this.getCounter('database_errors'),
        reconciliationErrors: this.getCounter('reconciliation_errors'),
      },
    };
  }

  /**
   * Collect performance metrics
   */
  private collectPerformanceMetrics(): PerformanceMetrics {
    return {
      reconciliationTime: this.getAverageTime('reconciliation_time'),
      scanCycleTime: this.getAverageTime('scan_cycle_time'),
      orderPlacementTime: this.getAverageTime('order_placement_time'),
      cacheHitRate: this.calculateCacheHitRate(),
      apiCallsPerMinute: this.getCounter('api_calls') * 6,
      dbQueriesPerMinute: this.getCounter('db_queries') * 6,
    };
  }

  /**
   * Increment a counter
   */
  incrementCounter(name: string, value: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  /**
   * Record a timing
   */
  recordTiming(name: string, milliseconds: number): void {
    const timings = this.timers.get(name) || [];
    timings.push(milliseconds);
    this.timers.set(name, timings);
  }

  /**
   * Get counter value
   */
  private getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  /**
   * Get average time for a timer
   */
  private getAverageTime(name: string): number {
    const timings = this.timers.get(name) || [];
    if (timings.length === 0) return 0;
    
    const sum = timings.reduce((a, b) => a + b, 0);
    return Math.round(sum / timings.length);
  }

  /**
   * Calculate cache hit rate
   */
  private calculateCacheHitRate(): number {
    const hits = this.getCounter('cache_hits');
    const misses = this.getCounter('cache_misses');
    const total = hits + misses;
    
    return total > 0 ? (hits / total) * 100 : 0;
  }

  /**
   * Reset counters for next collection interval
   */
  private resetCounters(): void {
    this.counters.clear();
    this.timers.clear();
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics(): SystemMetrics | null {
    if (this.metricsHistory.metrics.length === 0) return null;
    return this.metricsHistory.metrics[this.metricsHistory.metrics.length - 1];
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(minutes: number = 60): SystemMetrics[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.metricsHistory.metrics.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Get metrics summary for a time period
   */
  getMetricsSummary(minutes: number = 60): any {
    const history = this.getMetricsHistory(minutes);
    if (history.length === 0) return null;

    const totalSignals = history.reduce((sum, m) => sum + m.trading.signalsGenerated, 0);
    const totalOrders = history.reduce((sum, m) => sum + m.trading.ordersPlaced, 0);
    const totalDiscrepancies = history.reduce((sum, m) => sum + m.trading.discrepanciesFound, 0);

    const avgApiLatency = history.reduce((sum, m) => sum + m.system.apiLatency.binance, 0) / history.length;
    const avgReconciliationTime = history.reduce((sum, m) => sum + m.performance.reconciliationTime, 0) / history.length;

    return {
      period: `${minutes} minutes`,
      dataPoints: history.length,
      trading: {
        totalSignals,
        totalOrders,
        totalDiscrepancies,
        avgSignalsPerMinute: totalSignals / minutes,
        avgOrdersPerMinute: totalOrders / minutes,
      },
      performance: {
        avgApiLatency: Math.round(avgApiLatency),
        avgReconciliationTime: Math.round(avgReconciliationTime),
      },
    };
  }

  /**
   * Record event for metrics
   */
  async recordEvent(type: string, data: any): Promise<void> {
    try {
      await eventStore.recordEvent({
        type: `Metrics.${type}`,
        aggregateId: 'system',
        aggregateType: 'System',
        data,
        source: 'System',
      });
    } catch (error: any) {
      logger.error('[MetricsCollector] Failed to record event:', error);
    }
  }
}

export const metricsCollector = new MetricsCollector();
export default metricsCollector;
