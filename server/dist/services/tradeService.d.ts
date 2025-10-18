import { ITrade } from '../models/Trade';
import mongoose from 'mongoose';
/**
 * Service for managing trades (completed historical trades)
 */
declare class TradeService {
    /**
     * Get trade history with optional filters
     */
    getTradeHistory(userId: string | mongoose.Types.ObjectId, filters?: {
        startDate?: string;
        endDate?: string;
        playbook?: string;
        outcome?: string;
        symbol?: string;
    }): Promise<ITrade[]>;
    /**
     * Get a single trade by ID
     */
    getTradeById(tradeId: string | mongoose.Types.ObjectId, userId: string | mongoose.Types.ObjectId): Promise<ITrade | null>;
    /**
     * Create a new trade (typically called when closing a position)
     */
    createTrade(tradeData: Partial<ITrade>): Promise<ITrade>;
    /**
     * Get trade statistics for analytics
     */
    getTradeStatistics(userId: string | mongoose.Types.ObjectId): Promise<{
        total_trades: number;
        wins: number;
        losses: number;
        breakeven: number;
        total_pnl: number;
        total_fees: number;
        win_rate: number;
        avg_win: number;
        avg_loss: number;
        profit_factor: number;
    }>;
}
declare const _default: TradeService;
export default _default;
//# sourceMappingURL=tradeService.d.ts.map