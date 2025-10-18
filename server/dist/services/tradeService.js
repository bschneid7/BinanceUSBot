import Trade from '../models/Trade';
/**
 * Service for managing trades (completed historical trades)
 */
class TradeService {
    /**
     * Get trade history with optional filters
     */
    async getTradeHistory(userId, filters) {
        try {
            console.log(`[TradeService] Fetching trade history for user: ${userId}`);
            console.log(`[TradeService] Filters:`, filters);
            const query = { userId };
            // Apply filters
            if (filters) {
                if (filters.startDate || filters.endDate) {
                    query.date = {};
                    if (filters.startDate) {
                        query.date.$gte = new Date(filters.startDate);
                    }
                    if (filters.endDate) {
                        query.date.$lte = new Date(filters.endDate);
                    }
                }
                if (filters.playbook) {
                    query.playbook = filters.playbook;
                }
                if (filters.outcome) {
                    query.outcome = filters.outcome;
                }
                if (filters.symbol) {
                    query.symbol = filters.symbol;
                }
            }
            const trades = await Trade.find(query).sort({ date: -1 }).exec();
            console.log(`[TradeService] Found ${trades.length} trades`);
            return trades;
        }
        catch (error) {
            console.error('[TradeService] Error fetching trade history:', error);
            if (error instanceof Error) {
                console.error('[TradeService] Error details:', error.message);
                console.error('[TradeService] Error stack:', error.stack);
            }
            throw error;
        }
    }
    /**
     * Get a single trade by ID
     */
    async getTradeById(tradeId, userId) {
        try {
            console.log(`[TradeService] Fetching trade ${tradeId} for user: ${userId}`);
            const trade = await Trade.findOne({
                _id: tradeId,
                userId
            }).exec();
            if (!trade) {
                console.log(`[TradeService] Trade not found: ${tradeId}`);
                return null;
            }
            console.log(`[TradeService] Found trade: ${trade._id}`);
            return trade;
        }
        catch (error) {
            console.error('[TradeService] Error fetching trade by ID:', error);
            if (error instanceof Error) {
                console.error('[TradeService] Error details:', error.message);
                console.error('[TradeService] Error stack:', error.stack);
            }
            throw error;
        }
    }
    /**
     * Create a new trade (typically called when closing a position)
     */
    async createTrade(tradeData) {
        try {
            console.log(`[TradeService] Creating new trade for user: ${tradeData.userId}`);
            const trade = new Trade(tradeData);
            await trade.save();
            console.log(`[TradeService] Trade created successfully: ${trade._id}`);
            return trade;
        }
        catch (error) {
            console.error('[TradeService] Error creating trade:', error);
            if (error instanceof Error) {
                console.error('[TradeService] Error details:', error.message);
                console.error('[TradeService] Error stack:', error.stack);
            }
            throw error;
        }
    }
    /**
     * Get trade statistics for analytics
     */
    async getTradeStatistics(userId) {
        try {
            console.log(`[TradeService] Calculating trade statistics for user: ${userId}`);
            const trades = await Trade.find({ userId }).exec();
            const stats = {
                total_trades: trades.length,
                wins: trades.filter(t => t.outcome === 'WIN').length,
                losses: trades.filter(t => t.outcome === 'LOSS').length,
                breakeven: trades.filter(t => t.outcome === 'BREAKEVEN').length,
                total_pnl: trades.reduce((sum, t) => sum + t.pnl_usd, 0),
                total_fees: trades.reduce((sum, t) => sum + t.fees, 0),
                win_rate: 0,
                avg_win: 0,
                avg_loss: 0,
                profit_factor: 0
            };
            // Calculate win rate
            if (stats.total_trades > 0) {
                stats.win_rate = (stats.wins / stats.total_trades) * 100;
            }
            // Calculate average win and loss
            const winningTrades = trades.filter(t => t.outcome === 'WIN');
            const losingTrades = trades.filter(t => t.outcome === 'LOSS');
            if (winningTrades.length > 0) {
                stats.avg_win = winningTrades.reduce((sum, t) => sum + t.pnl_usd, 0) / winningTrades.length;
            }
            if (losingTrades.length > 0) {
                stats.avg_loss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl_usd, 0) / losingTrades.length);
            }
            // Calculate profit factor
            const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl_usd, 0);
            const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl_usd, 0));
            if (totalLosses > 0) {
                stats.profit_factor = totalWins / totalLosses;
            }
            console.log(`[TradeService] Statistics calculated:`, stats);
            return stats;
        }
        catch (error) {
            console.error('[TradeService] Error calculating trade statistics:', error);
            if (error instanceof Error) {
                console.error('[TradeService] Error details:', error.message);
                console.error('[TradeService] Error stack:', error.stack);
            }
            throw error;
        }
    }
}
export default new TradeService();
//# sourceMappingURL=tradeService.js.map