import Alert, { IAlert } from '../models/Alert';
import mongoose from 'mongoose';

/**
 * Service for managing system alerts and notifications
 */
class AlertService {
  /**
   * Get recent alerts for a user
   * @param userId - User ID
   * @param limit - Maximum number of alerts to return (default: 20)
   * @returns Array of alerts sorted by timestamp (most recent first)
   */
  async getRecentAlerts(userId: string, limit: number = 20): Promise<IAlert[]> {
    try {
      console.log(`[AlertService] Fetching recent alerts for user ${userId} with limit ${limit}`);

      const alerts = await Alert.find({ userId: new mongoose.Types.ObjectId(userId) })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean()
        .exec();

      console.log(`[AlertService] Found ${alerts.length} alerts for user ${userId}`);
      return alerts as unknown as IAlert[];
    } catch (error) {
      console.error(`[AlertService] Error fetching recent alerts for user ${userId}:`, error);
      throw new Error(`Failed to fetch recent alerts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get alerts filtered by level
   * @param userId - User ID
   * @param level - Alert level to filter by
   * @param limit - Maximum number of alerts to return
   * @returns Array of filtered alerts
   */
  async getAlertsByLevel(
    userId: string,
    level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL',
    limit: number = 20
  ): Promise<IAlert[]> {
    try {
      console.log(`[AlertService] Fetching ${level} alerts for user ${userId} with limit ${limit}`);

      const alerts = await Alert.find({
        userId: new mongoose.Types.ObjectId(userId),
        level
      })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean()
        .exec();

      console.log(`[AlertService] Found ${alerts.length} ${level} alerts for user ${userId}`);
      return alerts as unknown as IAlert[];
    } catch (error) {
      console.error(`[AlertService] Error fetching ${level} alerts for user ${userId}:`, error);
      throw new Error(`Failed to fetch alerts by level: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get alerts filtered by type
   * @param userId - User ID
   * @param type - Alert type to filter by
   * @param limit - Maximum number of alerts to return
   * @returns Array of filtered alerts
   */
  async getAlertsByType(userId: string, type: string, limit: number = 20): Promise<IAlert[]> {
    try {
      console.log(`[AlertService] Fetching ${type} alerts for user ${userId} with limit ${limit}`);

      const alerts = await Alert.find({
        userId: new mongoose.Types.ObjectId(userId),
        type
      })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean()
        .exec();

      console.log(`[AlertService] Found ${alerts.length} ${type} alerts for user ${userId}`);
      return alerts as unknown as IAlert[];
    } catch (error) {
      console.error(`[AlertService] Error fetching ${type} alerts for user ${userId}:`, error);
      throw new Error(`Failed to fetch alerts by type: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a new alert
   * @param alertData - Alert data
   * @returns Created alert
   */
  async createAlert(alertData: {
    userId: string;
    level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
    message: string;
    type: string;
  }): Promise<IAlert> {
    try {
      console.log(`[AlertService] Creating alert for user ${alertData.userId}: ${alertData.message}`);

      const alert = new Alert({
        userId: new mongoose.Types.ObjectId(alertData.userId),
        level: alertData.level,
        message: alertData.message,
        type: alertData.type,
        timestamp: new Date()
      });

      await alert.save();
      console.log(`[AlertService] Alert created successfully with ID: ${alert._id}`);

      return alert;
    } catch (error) {
      console.error(`[AlertService] Error creating alert:`, error);
      throw new Error(`Failed to create alert: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get alert statistics for a user
   * @param userId - User ID
   * @returns Alert statistics by level
   */
  async getAlertStats(userId: string): Promise<{
    total: number;
    info: number;
    warning: number;
    error: number;
    critical: number;
  }> {
    try {
      console.log(`[AlertService] Fetching alert statistics for user ${userId}`);

      const stats = await Alert.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: '$level',
            count: { $sum: 1 }
          }
        }
      ]);

      const result = {
        total: 0,
        info: 0,
        warning: 0,
        error: 0,
        critical: 0
      };

      stats.forEach(stat => {
        const level = stat._id.toLowerCase();
        result[level as keyof typeof result] = stat.count;
        result.total += stat.count;
      });

      console.log(`[AlertService] Alert statistics for user ${userId}:`, result);
      return result;
    } catch (error) {
      console.error(`[AlertService] Error fetching alert statistics for user ${userId}:`, error);
      throw new Error(`Failed to fetch alert statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default new AlertService();
