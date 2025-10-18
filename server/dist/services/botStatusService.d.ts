import { Types } from 'mongoose';
interface BotStatusMetrics {
    status: 'ACTIVE' | 'HALTED_DAILY' | 'HALTED_WEEKLY' | 'STOPPED';
    equity: number;
    availableCapital: number;
    dailyPnl: number;
    dailyPnlR: number;
    weeklyPnl: number;
    weeklyPnlR: number;
    reserveLevel: number;
    openPositions: number;
    totalOpenRiskR: number;
    totalExposurePct: number;
}
interface DashboardOverview {
    botStatus: BotStatusMetrics;
    recentSignals: unknown[];
    activePositions: unknown[];
    systemAlerts: unknown[];
}
declare class BotStatusService {
    /**
     * Calculate bot status and real-time trading metrics
     */
    getBotStatus(userId: string | Types.ObjectId): Promise<BotStatusMetrics>;
    /**
     * Get dashboard overview with all relevant data
     */
    getDashboardOverview(userId: string | Types.ObjectId): Promise<DashboardOverview>;
    /**
     * Get system health metrics
     */
    getSystemHealth(userId: string | Types.ObjectId): Promise<{
        database: boolean;
        exchangeAPI: boolean;
        apiLatencyMs: number;
        recentErrorCount: number;
        timestamp: Date;
    }>;
}
declare const _default: BotStatusService;
export default _default;
//# sourceMappingURL=botStatusService.d.ts.map