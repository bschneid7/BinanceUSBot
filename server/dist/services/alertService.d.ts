import { IAlert } from '../models/Alert';
/**
 * Service for managing system alerts and notifications
 */
declare class AlertService {
    /**
     * Get recent alerts for a user
     * @param userId - User ID
     * @param limit - Maximum number of alerts to return (default: 20)
     * @returns Array of alerts sorted by timestamp (most recent first)
     */
    getRecentAlerts(userId: string, limit?: number): Promise<IAlert[]>;
    /**
     * Get alerts filtered by level
     * @param userId - User ID
     * @param level - Alert level to filter by
     * @param limit - Maximum number of alerts to return
     * @returns Array of filtered alerts
     */
    getAlertsByLevel(userId: string, level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL', limit?: number): Promise<IAlert[]>;
    /**
     * Get alerts filtered by type
     * @param userId - User ID
     * @param type - Alert type to filter by
     * @param limit - Maximum number of alerts to return
     * @returns Array of filtered alerts
     */
    getAlertsByType(userId: string, type: string, limit?: number): Promise<IAlert[]>;
    /**
     * Create a new alert
     * @param alertData - Alert data
     * @returns Created alert
     */
    createAlert(alertData: {
        userId: string;
        level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
        message: string;
        type: string;
    }): Promise<IAlert>;
    /**
     * Get alert statistics for a user
     * @param userId - User ID
     * @returns Alert statistics by level
     */
    getAlertStats(userId: string): Promise<{
        total: number;
        info: number;
        warning: number;
        error: number;
        critical: number;
    }>;
}
declare const _default: AlertService;
export default _default;
//# sourceMappingURL=alertService.d.ts.map