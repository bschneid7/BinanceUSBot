import logger from '../../utils/logger';
import eventStore from '../eventStore';

/**
 * Alert Manager Service
 * Manages system alerts, deduplication, and notifications
 */

export type AlertLevel = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface Alert {
  id?: string;
  level: AlertLevel;
  title: string;
  message: string;
  details?: any;
  timestamp: Date;
  acknowledged?: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}

interface AlertConfig {
  enabled: boolean;
  deduplicationWindowSeconds: number;
  maxActiveAlerts: number;
}

class AlertManager {
  private config: AlertConfig = {
    enabled: true,
    deduplicationWindowSeconds: 300, // 5 minutes
    maxActiveAlerts: 100,
  };

  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private maxHistorySize: number = 1000;

  /**
   * Send an alert
   */
  async sendAlert(alert: Alert): Promise<void> {
    if (!this.config.enabled) return;

    try {
      // Generate alert ID
      const alertId = this.generateAlertId(alert);
      alert.id = alertId;

      // Check for duplicate
      if (this.isDuplicate(alertId)) {
        logger.debug(`[AlertManager] Deduplicated alert: ${alert.title}`);
        return;
      }

      // Add to active alerts
      this.activeAlerts.set(alertId, alert);

      // Trim active alerts if too many
      if (this.activeAlerts.size > this.config.maxActiveAlerts) {
        const oldest = Array.from(this.activeAlerts.keys())[0];
        this.activeAlerts.delete(oldest);
      }

      // Add to history
      this.alertHistory.push(alert);
      if (this.alertHistory.length > this.maxHistorySize) {
        this.alertHistory.shift();
      }

      // Log alert
      this.logAlert(alert);

      // Record event
      await this.recordAlertEvent(alert);

      // TODO: Send notifications (email, Slack, etc.)
      // await this.sendNotifications(alert);
    } catch (error: any) {
      logger.error('[AlertManager] Failed to send alert:', error);
    }
  }

  /**
   * Generate alert ID for deduplication
   */
  private generateAlertId(alert: Alert): string {
    const key = `${alert.level}:${alert.title}`;
    return Buffer.from(key).toString('base64');
  }

  /**
   * Check if alert is duplicate
   */
  private isDuplicate(alertId: string): boolean {
    const existing = this.activeAlerts.get(alertId);
    if (!existing) return false;

    const age = Date.now() - existing.timestamp.getTime();
    const windowMs = this.config.deduplicationWindowSeconds * 1000;

    if (age < windowMs) {
      return true; // Within deduplication window
    }

    // Outside window, remove old alert
    this.activeAlerts.delete(alertId);
    return false;
  }

  /**
   * Log alert to console
   */
  private logAlert(alert: Alert): void {
    const emoji = this.getAlertEmoji(alert.level);
    const message = `${emoji} [Alert:${alert.level}] ${alert.title}: ${alert.message}`;

    switch (alert.level) {
      case 'CRITICAL':
      case 'ERROR':
        logger.error(message, alert.details);
        break;
      case 'WARNING':
        logger.warn(message, alert.details);
        break;
      case 'INFO':
        logger.info(message, alert.details);
        break;
    }
  }

  /**
   * Get emoji for alert level
   */
  private getAlertEmoji(level: AlertLevel): string {
    switch (level) {
      case 'CRITICAL': return '🔴';
      case 'ERROR': return '❌';
      case 'WARNING': return '⚠️';
      case 'INFO': return 'ℹ️';
      default: return '📢';
    }
  }

  /**
   * Record alert as event
   */
  private async recordAlertEvent(alert: Alert): Promise<void> {
    try {
      await eventStore.recordEvent({
        type: `Alert.${alert.level}`,
        aggregateId: alert.id || 'unknown',
        aggregateType: 'System',
        data: {
          title: alert.title,
          message: alert.message,
          details: alert.details,
        },
        source: 'System',
      });
    } catch (error: any) {
      logger.error('[AlertManager] Failed to record alert event:', error);
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(level?: AlertLevel): Alert[] {
    const alerts = Array.from(this.activeAlerts.values());
    
    if (level) {
      return alerts.filter(a => a.level === level);
    }
    
    return alerts;
  }

  /**
   * Get alert history
   */
  getAlertHistory(minutes: number = 60, level?: AlertLevel): Alert[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    let alerts = this.alertHistory.filter(a => a.timestamp >= cutoff);
    
    if (level) {
      alerts = alerts.filter(a => a.level === level);
    }
    
    return alerts;
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string = 'system'): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = acknowledgedBy;

    logger.info(`[AlertManager] Alert acknowledged: ${alert.title} (by: ${acknowledgedBy})`);
    return true;
  }

  /**
   * Clear acknowledged alerts
   */
  clearAcknowledgedAlerts(): number {
    let cleared = 0;
    
    for (const [id, alert] of this.activeAlerts.entries()) {
      if (alert.acknowledged) {
        this.activeAlerts.delete(id);
        cleared++;
      }
    }

    if (cleared > 0) {
      logger.info(`[AlertManager] Cleared ${cleared} acknowledged alerts`);
    }

    return cleared;
  }

  /**
   * Clear all alerts
   */
  clearAllAlerts(): void {
    const count = this.activeAlerts.size;
    this.activeAlerts.clear();
    logger.info(`[AlertManager] Cleared all ${count} active alerts`);
  }

  /**
   * Get alert statistics
   */
  getAlertStats(): any {
    const active = Array.from(this.activeAlerts.values());
    const recent = this.getAlertHistory(60);

    return {
      active: {
        total: active.length,
        critical: active.filter(a => a.level === 'CRITICAL').length,
        error: active.filter(a => a.level === 'ERROR').length,
        warning: active.filter(a => a.level === 'WARNING').length,
        info: active.filter(a => a.level === 'INFO').length,
      },
      recent: {
        total: recent.length,
        critical: recent.filter(a => a.level === 'CRITICAL').length,
        error: recent.filter(a => a.level === 'ERROR').length,
        warning: recent.filter(a => a.level === 'WARNING').length,
        info: recent.filter(a => a.level === 'INFO').length,
      },
      history: {
        total: this.alertHistory.length,
        oldestTimestamp: this.alertHistory[0]?.timestamp,
        newestTimestamp: this.alertHistory[this.alertHistory.length - 1]?.timestamp,
      },
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[AlertManager] Configuration updated:', this.config);
  }

  /**
   * Get configuration
   */
  getConfig(): AlertConfig {
    return { ...this.config };
  }
}

export const alertManager = new AlertManager();
export default alertManager;
