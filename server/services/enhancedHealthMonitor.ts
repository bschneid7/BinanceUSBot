import mongoose from 'mongoose';
import binanceService from './binanceService';
import messageQueue from './messageQueue';
import eventStore from './eventStore';
import continuousReconciliationService from './continuousReconciliationService';
import circuitBreakerManager from './circuitBreaker';
import logger from '../utils/logger';

/**
 * Enhanced Health Monitor
 * 
 * Monitors all system components and provides comprehensive health status
 */

export interface HealthCheckResult {
  healthy: boolean;
  latency?: number;
  error?: string;
  details?: any;
}

export interface SystemHealthStatus {
  healthy: boolean;
  timestamp: Date;
  checks: {
    database: HealthCheckResult;
    redis: HealthCheckResult;
    binance: HealthCheckResult;
    messageQueue: HealthCheckResult;
    eventStore: HealthCheckResult;
    circuitBreakers: HealthCheckResult;
    reconciliation: HealthCheckResult;
  };
}

class EnhancedHealthMonitor {
  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<SystemHealthStatus> {
    const checks = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
      binance: await this.checkBinance(),
      messageQueue: await this.checkMessageQueue(),
      eventStore: await this.checkEventStore(),
      circuitBreakers: await this.checkCircuitBreakers(),
      reconciliation: await this.checkReconciliation(),
    };

    const healthy = Object.values(checks).every(check => check.healthy);

    return {
      healthy,
      timestamp: new Date(),
      checks,
    };
  }

  /**
   * Check MongoDB database connectivity and performance
   */
  private async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Check connection state
      if (mongoose.connection.readyState !== 1) {
        return {
          healthy: false,
          error: 'Database not connected',
          details: { readyState: mongoose.connection.readyState },
        };
      }

      // Perform ping
      await mongoose.connection.db.admin().ping();
      const latency = Date.now() - startTime;

      // Check if latency is acceptable
      const healthy = latency < 100;

      return {
        healthy,
        latency,
        details: {
          readyState: mongoose.connection.readyState,
          host: mongoose.connection.host,
          name: mongoose.connection.name,
        },
      };
    } catch (error: any) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Check Redis connectivity and performance
   */
  private async checkRedis(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Get Redis client from message queue
      const client = messageQueue.getRedisClient();
      
      if (!client) {
        return {
          healthy: false,
          error: 'Redis client not available',
        };
      }

      // Perform ping
      await client.ping();
      const latency = Date.now() - startTime;

      // Check if latency is acceptable
      const healthy = latency < 50;

      // Get memory usage
      const info = await client.info('memory');
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const memory = memoryMatch ? memoryMatch[1] : 'unknown';

      return {
        healthy,
        latency,
        details: {
          memory,
          status: 'connected',
        },
      };
    } catch (error: any) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Check Binance API connectivity and performance
   */
  private async checkBinance(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Perform lightweight API call
      await binanceService.getServerTime();
      const latency = Date.now() - startTime;

      // Check if latency is acceptable
      const healthy = latency < 1000;

      return {
        healthy,
        latency,
        details: {
          status: 'connected',
        },
      };
    } catch (error: any) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Check message queue health
   */
  private async checkMessageQueue(): Promise<HealthCheckResult> {
    try {
      const stats = await messageQueue.getAllQueueStats();
      
      // Check if any queue has too many waiting jobs
      let totalWaiting = 0;
      let totalFailed = 0;

      for (const queueStats of Object.values(stats)) {
        totalWaiting += queueStats.waiting || 0;
        totalFailed += queueStats.failed || 0;
      }

      // Healthy if waiting < 100 and failed < 10
      const healthy = totalWaiting < 100 && totalFailed < 10;

      return {
        healthy,
        details: {
          totalWaiting,
          totalFailed,
          queues: stats,
        },
      };
    } catch (error: any) {
      return {
        healthy: false,
        error: error.message,
      };
    }
  }

  /**
   * Check event store health
   */
  private async checkEventStore(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Get event statistics
      const stats = await eventStore.getStatistics();
      const latency = Date.now() - startTime;

      // Healthy if query latency < 100ms
      const healthy = latency < 100;

      return {
        healthy,
        latency,
        details: stats,
      };
    } catch (error: any) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Check circuit breakers health
   */
  private async checkCircuitBreakers(): Promise<HealthCheckResult> {
    try {
      const status = circuitBreakerManager.getHealthStatus();
      
      // Check if any circuit is OPEN
      const openCircuits = Object.entries(status)
        .filter(([_, stats]) => stats.state === 'OPEN')
        .map(([name, _]) => name);

      const healthy = openCircuits.length === 0;

      return {
        healthy,
        details: {
          openCircuits,
          allCircuits: status,
        },
      };
    } catch (error: any) {
      return {
        healthy: false,
        error: error.message,
      };
    }
  }

  /**
   * Check reconciliation service health
   */
  private async checkReconciliation(): Promise<HealthCheckResult> {
    try {
      const stats = continuousReconciliationService.getStats();
      
      // Check if reconciliation ran recently (within last 2 minutes)
      const lastRunTime = stats.lastRunTime;
      const timeSinceLastRun = lastRunTime ? Date.now() - lastRunTime.getTime() : Infinity;
      const ranRecently = timeSinceLastRun < 120000; // 2 minutes

      // Check discrepancy rate
      const discrepancyRate = stats.runsTotal > 0 
        ? stats.discrepanciesFound / stats.runsTotal 
        : 0;
      const acceptableDiscrepancyRate = discrepancyRate < 0.05; // < 5%

      // Check auto-fix success rate
      const fixAttempts = stats.discrepanciesFixed + stats.discrepanciesFailed;
      const fixSuccessRate = fixAttempts > 0
        ? stats.discrepanciesFixed / fixAttempts
        : 1;
      const acceptableFixRate = fixSuccessRate > 0.95; // > 95%

      const healthy = ranRecently && acceptableDiscrepancyRate && acceptableFixRate;

      return {
        healthy,
        details: {
          lastRunTime,
          timeSinceLastRun,
          discrepancyRate,
          fixSuccessRate,
          stats,
        },
      };
    } catch (error: any) {
      return {
        healthy: false,
        error: error.message,
      };
    }
  }

  /**
   * Get quick health status (cached if available)
   */
  async getQuickStatus(): Promise<{ healthy: boolean; timestamp: Date }> {
    // For now, just check critical components
    const dbHealthy = mongoose.connection.readyState === 1;
    const circuitsHealthy = circuitBreakerManager.isAllHealthy();

    return {
      healthy: dbHealthy && circuitsHealthy,
      timestamp: new Date(),
    };
  }
}

// Export singleton instance
export const enhancedHealthMonitor = new EnhancedHealthMonitor();
export default enhancedHealthMonitor;
