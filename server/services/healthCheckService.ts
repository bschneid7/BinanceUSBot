/**
 * Health Check Service
 * Monitors critical system components and provides health status
 */

import logger from '../utils/logger';
import mongoose from 'mongoose';
import binanceService from './binanceService';
import webSocketService from './webSocketService';
import { metricsService } from './metricsService';
import { slackNotifier } from './slackNotifier';

export interface HealthStatus {
  healthy: boolean;
  timestamp: string;
  uptime: number;
  checks: {
    database: HealthCheck;
    binanceApi: HealthCheck;
    websocket: HealthCheck;
    memory: HealthCheck;
    disk: HealthCheck;
  };
}

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  responseTime?: number;
  details?: any;
}

class HealthCheckService {
  private static instance: HealthCheckService;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastHealthStatus: HealthStatus | null = null;
  private consecutiveFailures: Map<string, number> = new Map();
  private readonly MAX_FAILURES = 3;
  private readonly CHECK_INTERVAL_MS = 60000; // 1 minute

  private constructor() {}

  static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService();
    }
    return HealthCheckService.instance;
  }

  /**
   * Start periodic health checks
   */
  start(): void {
    if (this.checkInterval) {
      logger.info('[HealthCheck] Already running');
      return;
    }

    logger.info('[HealthCheck] Starting periodic health checks');
    
    // Run initial check immediately
    this.performHealthCheck().catch(err => {
      logger.error('[HealthCheck] Initial check failed:', err);
    });

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.performHealthCheck().catch(err => {
        logger.error('[HealthCheck] Periodic check failed:', err);
      });
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop periodic health checks
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('[HealthCheck] Stopped periodic health checks');
    }
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();

    const checks = {
      database: await this.checkDatabase(),
      binanceApi: await this.checkBinanceApi(),
      websocket: await this.checkWebSocket(),
      memory: await this.checkMemory(),
      disk: await this.checkDisk(),
    };

    // Determine overall health
    const unhealthyChecks = Object.entries(checks).filter(
      ([_, check]) => check.status === 'unhealthy'
    );
    const degradedChecks = Object.entries(checks).filter(
      ([_, check]) => check.status === 'degraded'
    );

    const healthy = unhealthyChecks.length === 0;
    const uptime = process.uptime();

    const status: HealthStatus = {
      healthy,
      timestamp: new Date().toISOString(),
      uptime,
      checks,
    };

    // Update metrics
    metricsService.setGauge('bot_health', healthy ? 1 : 0);

    // Handle failures
    for (const [checkName, check] of Object.entries(checks)) {
      if (check.status === 'unhealthy') {
        await this.handleFailure(checkName, check);
      } else {
        // Reset failure count on success
        this.consecutiveFailures.set(checkName, 0);
      }
    }

    // Log summary
    if (!healthy) {
      logger.warn('[HealthCheck] System unhealthy', {
        unhealthy: unhealthyChecks.map(([name]) => name),
        degraded: degradedChecks.map(([name]) => name),
      });
    } else if (degradedChecks.length > 0) {
      logger.info('[HealthCheck] System healthy but degraded', {
        degraded: degradedChecks.map(([name]) => name),
      });
    } else {
      logger.info('[HealthCheck] All systems healthy');
    }

    this.lastHealthStatus = status;
    return status;
  }

  /**
   * Get last health status
   */
  getLastHealthStatus(): HealthStatus | null {
    return this.lastHealthStatus;
  }

  /**
   * Check database connectivity
   */
  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const state = mongoose.connection.readyState;
      const responseTime = Date.now() - startTime;

      if (state === 1) {
        // Connected
        return {
          status: 'healthy',
          message: 'Database connected',
          responseTime,
        };
      } else if (state === 2) {
        // Connecting
        return {
          status: 'degraded',
          message: 'Database connecting',
          responseTime,
        };
      } else {
        // Disconnected or disconnecting
        return {
          status: 'unhealthy',
          message: 'Database disconnected',
          responseTime,
          details: { readyState: state },
        };
      }
    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: `Database check failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check Binance API connectivity
   */
  private async checkBinanceApi(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Check if API keys are configured
      if (!process.env.BINANCE_US_API_KEY) {
        return {
          status: 'degraded',
          message: 'Binance API keys not configured',
          responseTime: Date.now() - startTime,
        };
      }

      // Ping Binance API
      await binanceService.testConnectivity();
      const responseTime = Date.now() - startTime;

      if (responseTime > 5000) {
        return {
          status: 'degraded',
          message: 'Binance API slow response',
          responseTime,
        };
      }

      return {
        status: 'healthy',
        message: 'Binance API connected',
        responseTime,
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: `Binance API check failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check WebSocket connectivity
   */
  private async checkWebSocket(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const isConnected = webSocketService.isConnected();
      const responseTime = Date.now() - startTime;

      if (isConnected) {
        return {
          status: 'healthy',
          message: 'WebSocket connected',
          responseTime,
        };
      } else {
        return {
          status: 'degraded',
          message: 'WebSocket disconnected',
          responseTime,
        };
      }
    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: `WebSocket check failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check memory usage
   */
  private async checkMemory(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const usage = process.memoryUsage();
      const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
      const rssMB = Math.round(usage.rss / 1024 / 1024);
      const responseTime = Date.now() - startTime;

      const heapUsagePercent = (usage.heapUsed / usage.heapTotal) * 100;

      if (heapUsagePercent > 90) {
        return {
          status: 'unhealthy',
          message: 'Memory usage critical',
          responseTime,
          details: { heapUsedMB, heapTotalMB, rssMB, heapUsagePercent: heapUsagePercent.toFixed(1) },
        };
      } else if (heapUsagePercent > 75) {
        return {
          status: 'degraded',
          message: 'Memory usage high',
          responseTime,
          details: { heapUsedMB, heapTotalMB, rssMB, heapUsagePercent: heapUsagePercent.toFixed(1) },
        };
      }

      return {
        status: 'healthy',
        message: 'Memory usage normal',
        responseTime,
        details: { heapUsedMB, heapTotalMB, rssMB, heapUsagePercent: heapUsagePercent.toFixed(1) },
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: `Memory check failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check disk usage
   */
  private async checkDisk(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // In Docker, we can't easily check disk usage
      // Return healthy by default
      return {
        status: 'healthy',
        message: 'Disk check skipped (Docker environment)',
        responseTime: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: `Disk check failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Handle check failure
   */
  private async handleFailure(checkName: string, check: HealthCheck): Promise<void> {
    const failures = (this.consecutiveFailures.get(checkName) || 0) + 1;
    this.consecutiveFailures.set(checkName, failures);

    logger.error(`[HealthCheck] ${checkName} failed (${failures}/${this.MAX_FAILURES})`, {
      status: check.status,
      message: check.message,
      details: check.details,
    });

    // Alert on threshold
    if (failures >= this.MAX_FAILURES) {
      await slackNotifier.notifyError(
        `Health Check Failed: ${checkName}`,
        `${check.message} (${failures} consecutive failures)`,
        check.details
      );

      // Attempt recovery
      await this.attemptRecovery(checkName);
    }
  }

  /**
   * Attempt to recover from failure
   */
  private async attemptRecovery(checkName: string): Promise<void> {
    logger.info(`[HealthCheck] Attempting recovery for ${checkName}`);

    try {
      switch (checkName) {
        case 'websocket':
          logger.info('[HealthCheck] Reconnecting WebSocket...');
          await webSocketService.reconnect();
          break;

        case 'database':
          logger.warn('[HealthCheck] Database recovery not implemented (requires restart)');
          break;

        case 'binanceApi':
          logger.warn('[HealthCheck] Binance API recovery not needed (transient issue)');
          break;

        default:
          logger.warn(`[HealthCheck] No recovery action for ${checkName}`);
      }
    } catch (error: any) {
      logger.error(`[HealthCheck] Recovery failed for ${checkName}:`, error);
    }
  }
}

export const healthCheckService = HealthCheckService.getInstance();
