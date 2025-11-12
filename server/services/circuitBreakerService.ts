/**
 * Circuit Breaker Service
 * Implements automatic trading halts and tail risk protection
 * Protects against extreme market conditions and system failures
 */

import logger from '../utils/logger';
import { metricsService } from './metricsService';
import { slackNotifier } from './slackNotifier';
import BotState from '../models/BotState';
import { Types } from 'mongoose';

export interface CircuitBreakerTrigger {
  type: 'DRAWDOWN' | 'VOLATILITY' | 'LOSS_RATE' | 'CORRELATION_SPIKE' | 'SYSTEM_ERROR' | 'MANUAL';
  threshold: number;
  currentValue: number;
  triggeredAt: Date;
  severity: 'WARNING' | 'CRITICAL';
}

export interface CircuitBreakerStatus {
  isActive: boolean;
  triggers: CircuitBreakerTrigger[];
  activatedAt?: Date;
  resumeAt?: Date;
  autoResumeEnabled: boolean;
}

class CircuitBreakerService {
  private static instance: CircuitBreakerService;
  private isActive: boolean = false;
  private triggers: CircuitBreakerTrigger[] = [];
  private activatedAt?: Date;
  private monitoringInterval?: NodeJS.Timeout;

  // Circuit breaker thresholds
  private thresholds = {
    maxDrawdownPct: 0.10, // 10% drawdown triggers halt
    maxDailyLossPct: 0.05, // 5% daily loss triggers halt
    maxHourlyLossPct: 0.03, // 3% hourly loss triggers halt
    maxVolatilitySpike: 3.0, // 3x normal volatility
    maxCorrelationSpike: 0.95, // 95% correlation (all positions moving together)
    maxConsecutiveLosses: 5, // 5 consecutive losses
    minWinRateWindow: 0.30, // 30% win rate over last 20 trades
  };

  // Auto-resume configuration
  private autoResume = {
    enabled: false,
    cooldownMinutes: 60, // Wait 1 hour before auto-resume
    requireManualReview: true
  };

  private constructor() {
    logger.info('[CircuitBreaker] Initialized');
  }

  static getInstance(): CircuitBreakerService {
    if (!CircuitBreakerService.instance) {
      CircuitBreakerService.instance = new CircuitBreakerService();
    }
    return CircuitBreakerService.instance;
  }

  /**
   * Start monitoring for circuit breaker conditions
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      logger.warn('[CircuitBreaker] Already monitoring');
      return;
    }

    logger.info('[CircuitBreaker] Starting monitoring');

    // Check every minute
    this.monitoringInterval = setInterval(() => {
      this.checkConditions().catch(error => {
        logger.error('[CircuitBreaker] Error in monitoring:', error);
      });
    }, 60 * 1000);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      logger.info('[CircuitBreaker] Stopped monitoring');
    }
  }

  /**
   * Check all circuit breaker conditions
   */
  private async checkConditions(): Promise<void> {
    if (this.isActive) {
      // Check if we should auto-resume
      await this.checkAutoResume();
      return;
    }

    try {
      // Get all user states (in production, you'd check each user)
      const states = await BotState.find({ isRunning: true });

      for (const state of states) {
        await this.checkUserConditions(state.userId, state);
      }
    } catch (error) {
      logger.error('[CircuitBreaker] Error checking conditions:', error);
    }
  }

  /**
   * Check circuit breaker conditions for a specific user
   */
  private async checkUserConditions(userId: Types.ObjectId, state: any): Promise<void> {
    const triggers: CircuitBreakerTrigger[] = [];

    // Check drawdown
    const drawdownPct = this.calculateDrawdown(state);
    if (drawdownPct > this.thresholds.maxDrawdownPct) {
      triggers.push({
        type: 'DRAWDOWN',
        threshold: this.thresholds.maxDrawdownPct,
        currentValue: drawdownPct,
        triggeredAt: new Date(),
        severity: 'CRITICAL'
      });
    }

    // Check daily loss
    const dailyLossPct = Math.abs(state.dailyPnl) / state.equity;
    if (state.dailyPnl < 0 && dailyLossPct > this.thresholds.maxDailyLossPct) {
      triggers.push({
        type: 'LOSS_RATE',
        threshold: this.thresholds.maxDailyLossPct,
        currentValue: dailyLossPct,
        triggeredAt: new Date(),
        severity: 'CRITICAL'
      });
    }

    // Check consecutive losses
    if (state.consecutiveLosses >= this.thresholds.maxConsecutiveLosses) {
      triggers.push({
        type: 'LOSS_RATE',
        threshold: this.thresholds.maxConsecutiveLosses,
        currentValue: state.consecutiveLosses,
        triggeredAt: new Date(),
        severity: 'WARNING'
      });
    }

    // Trigger circuit breaker if any conditions met
    if (triggers.length > 0) {
      await this.activate(userId, triggers);
    }
  }

  /**
   * Calculate current drawdown
   */
  private calculateDrawdown(state: any): number {
    if (!state.peakEquity || state.peakEquity === 0) {
      return 0;
    }
    return (state.peakEquity - state.equity) / state.peakEquity;
  }

  /**
   * Activate circuit breaker
   */
  async activate(userId: Types.ObjectId, triggers: CircuitBreakerTrigger[]): Promise<void> {
    if (this.isActive) {
      logger.warn('[CircuitBreaker] Already active');
      return;
    }

    this.isActive = true;
    this.triggers = triggers;
    this.activatedAt = new Date();

    logger.error('[CircuitBreaker] ACTIVATED', {
      triggers: triggers.map(t => ({ type: t.type, value: t.currentValue }))
    });

    // Stop trading
    await BotState.updateOne(
      { userId },
      { isRunning: false, circuitBreakerActive: true }
    );

    // Update metrics
    metricsService.setGauge('circuit_breaker_active', 1);
    metricsService.incrementCounter('circuit_breaker_activations', 1);

    // Send critical alert
    await this.sendAlert(triggers);
  }

  /**
   * Manually activate circuit breaker
   */
  async manualActivate(reason: string): Promise<void> {
    const trigger: CircuitBreakerTrigger = {
      type: 'MANUAL',
      threshold: 0,
      currentValue: 0,
      triggeredAt: new Date(),
      severity: 'CRITICAL'
    };

    // Get all running bots
    const states = await BotState.find({ isRunning: true });
    
    for (const state of states) {
      await this.activate(state.userId, [trigger]);
    }

    await slackNotifier.sendNotification(
      `🛑 *Circuit Breaker Manually Activated*\n` +
      `Reason: ${reason}\n` +
      `All trading has been halted.`,
      'critical'
    );
  }

  /**
   * Deactivate circuit breaker
   */
  async deactivate(userId?: Types.ObjectId): Promise<void> {
    if (!this.isActive) {
      logger.warn('[CircuitBreaker] Not active');
      return;
    }

    this.isActive = false;
    this.triggers = [];
    const duration = this.activatedAt 
      ? (Date.now() - this.activatedAt.getTime()) / 1000 / 60 
      : 0;
    this.activatedAt = undefined;

    logger.info('[CircuitBreaker] Deactivated', { durationMinutes: duration.toFixed(1) });

    // Resume trading
    if (userId) {
      await BotState.updateOne(
        { userId },
        { isRunning: true, circuitBreakerActive: false }
      );
    } else {
      await BotState.updateMany(
        { circuitBreakerActive: true },
        { isRunning: true, circuitBreakerActive: false }
      );
    }

    // Update metrics
    metricsService.setGauge('circuit_breaker_active', 0);

    // Send notification
    await slackNotifier.sendNotification(
      `✅ *Circuit Breaker Deactivated*\n` +
      `Trading has been resumed.\n` +
      `Downtime: ${duration.toFixed(1)} minutes`,
      'info'
    );
  }

  /**
   * Check if auto-resume should occur
   */
  private async checkAutoResume(): Promise<void> {
    if (!this.autoResume.enabled || !this.activatedAt) {
      return;
    }

    const minutesSinceActivation = (Date.now() - this.activatedAt.getTime()) / 1000 / 60;

    if (minutesSinceActivation >= this.autoResume.cooldownMinutes) {
      if (this.autoResume.requireManualReview) {
        await slackNotifier.sendNotification(
          `⏰ *Circuit Breaker Auto-Resume Ready*\n` +
          `Cooldown period complete (${this.autoResume.cooldownMinutes} minutes).\n` +
          `Manual review required before resuming trading.`,
          'warning'
        );
        // Don't auto-resume, wait for manual confirmation
      } else {
        await this.deactivate();
      }
    }
  }

  /**
   * Send circuit breaker alert
   */
  private async sendAlert(triggers: CircuitBreakerTrigger[]): Promise<void> {
    const criticalTriggers = triggers.filter(t => t.severity === 'CRITICAL');
    const warningTriggers = triggers.filter(t => t.severity === 'WARNING');

    let message = `🚨 *CIRCUIT BREAKER ACTIVATED* 🚨\n\n`;
    message += `All trading has been automatically halted.\n\n`;

    if (criticalTriggers.length > 0) {
      message += `*Critical Triggers:*\n`;
      for (const trigger of criticalTriggers) {
        message += `• ${trigger.type}: ${(trigger.currentValue * 100).toFixed(2)}% ` +
          `(threshold: ${(trigger.threshold * 100).toFixed(2)}%)\n`;
      }
      message += `\n`;
    }

    if (warningTriggers.length > 0) {
      message += `*Warning Triggers:*\n`;
      for (const trigger of warningTriggers) {
        message += `• ${trigger.type}: ${trigger.currentValue.toFixed(2)} ` +
          `(threshold: ${trigger.threshold.toFixed(2)})\n`;
      }
      message += `\n`;
    }

    message += `*Action Required:*\n`;
    message += `1. Review trading performance and system logs\n`;
    message += `2. Identify root cause of the issue\n`;
    message += `3. Make necessary adjustments\n`;
    message += `4. Manually resume trading when ready\n`;

    await slackNotifier.sendNotification(message, 'critical');
  }

  /**
   * Get current status
   */
  getStatus(): CircuitBreakerStatus {
    return {
      isActive: this.isActive,
      triggers: [...this.triggers],
      activatedAt: this.activatedAt,
      resumeAt: this.activatedAt && this.autoResume.enabled
        ? new Date(this.activatedAt.getTime() + this.autoResume.cooldownMinutes * 60 * 1000)
        : undefined,
      autoResumeEnabled: this.autoResume.enabled
    };
  }

  /**
   * Update thresholds
   */
  updateThresholds(thresholds: Partial<typeof CircuitBreakerService.prototype.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    logger.info('[CircuitBreaker] Thresholds updated', this.thresholds);
  }

  /**
   * Update auto-resume configuration
   */
  updateAutoResume(config: Partial<typeof CircuitBreakerService.prototype.autoResume>): void {
    this.autoResume = { ...this.autoResume, ...config };
    logger.info('[CircuitBreaker] Auto-resume config updated', this.autoResume);
  }

  /**
   * Get thresholds
   */
  getThresholds(): typeof CircuitBreakerService.prototype.thresholds {
    return { ...this.thresholds };
  }

  /**
   * Test circuit breaker (for testing purposes)
   */
  async test(): Promise<void> {
    logger.info('[CircuitBreaker] Running test activation');
    
    const testTrigger: CircuitBreakerTrigger = {
      type: 'MANUAL',
      threshold: 0,
      currentValue: 0,
      triggeredAt: new Date(),
      severity: 'WARNING'
    };

    await slackNotifier.sendNotification(
      `🧪 *Circuit Breaker Test*\n` +
      `This is a test of the circuit breaker system.\n` +
      `No actual trading halt has occurred.`,
      'info'
    );
  }
}

export const circuitBreakerService = CircuitBreakerService.getInstance();
