import { ISignal } from '../models/Signal';
import mongoose from 'mongoose';
/**
 * Signal Service
 * Handles business logic for trading signals
 */
declare class SignalService {
    /**
     * Get recent signals for a user with optional limit
     * @param userId - User ID to fetch signals for
     * @param limit - Maximum number of signals to return (default: 10)
     * @returns Array of recent signals sorted by timestamp (descending)
     */
    getRecentSignals(userId: string | mongoose.Types.ObjectId, limit?: number): Promise<ISignal[]>;
    /**
     * Create a new signal
     * @param signalData - Signal data to create
     * @returns Created signal
     */
    createSignal(signalData: Partial<ISignal>): Promise<ISignal>;
    /**
     * Get signals by filters
     * @param userId - User ID
     * @param filters - Filter options (symbol, playbook, action, startDate, endDate)
     * @returns Array of signals matching filters
     */
    getSignalsByFilters(userId: string | mongoose.Types.ObjectId, filters: {
        symbol?: string;
        playbook?: 'A' | 'B' | 'C' | 'D';
        action?: 'EXECUTED' | 'SKIPPED';
        startDate?: Date;
        endDate?: Date;
    }): Promise<ISignal[]>;
    /**
     * Get signal statistics for a user
     * @param userId - User ID
     * @returns Signal statistics
     */
    getSignalStats(userId: string | mongoose.Types.ObjectId): Promise<{
        total: number;
        executed: number;
        skipped: number;
        byPlaybook: Record<string, number>;
    }>;
}
declare const _default: SignalService;
export default _default;
//# sourceMappingURL=signalService.d.ts.map