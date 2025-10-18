import Trade from '../models/Trade';
/**
 * Service for analytics and performance metrics
 */
class AnalyticsService {
    /**
     * Get comprehensive performance metrics
     */
    async getPerformanceMetrics(userId) {
        try {
            console.log(`[AnalyticsService] Calculating performance metrics for user: ${userId}`);
            // Fetch all trades for the user
            const allTrades = await Trade.find({ userId }).sort({ date: 1 }).exec();
            console.log(`[AnalyticsService] Found ${allTrades.length} total trades`);
            // Calculate time boundaries
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            // Filter trades by time periods
            const todayTrades = allTrades.filter(t => new Date(t.date) >= todayStart);
            const weekTrades = allTrades.filter(t => new Date(t.date) >= weekStart);
            const monthTrades = allTrades.filter(t => new Date(t.date) >= monthStart);
            console.log(`[AnalyticsService] Today trades: ${todayTrades.length}, Week trades: ${weekTrades.length}, Month trades: ${monthTrades.length}`);
            // Calculate overall statistics
            const winningTrades = allTrades.filter(t => t.outcome === 'WIN');
            const losingTrades = allTrades.filter(t => t.outcome === 'LOSS');
            const total_trades = allTrades.length;
            const win_rate = total_trades > 0 ? (winningTrades.length / total_trades) * 100 : 0;
            // Calculate profit factor
            const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl_usd, 0);
            const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl_usd, 0));
            const profit_factor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;
            // Calculate average R
            const average_r = total_trades > 0
                ? allTrades.reduce((sum, t) => sum + t.pnl_r, 0) / total_trades
                : 0;
            // Calculate best and worst trades (in R)
            const best_trade_r = allTrades.length > 0
                ? Math.max(...allTrades.map(t => t.pnl_r))
                : 0;
            const worst_trade_r = allTrades.length > 0
                ? Math.min(...allTrades.map(t => t.pnl_r))
                : 0;
            // Calculate max drawdown (in R)
            const max_drawdown_r = this.calculateMaxDrawdown(allTrades);
            console.log(`[AnalyticsService] Max drawdown: ${max_drawdown_r.toFixed(2)}R`);
            // Calculate Sharpe ratio (simplified: average return / stddev of returns)
            const sharpe_ratio = this.calculateSharpeRatio(allTrades);
            console.log(`[AnalyticsService] Sharpe ratio: ${sharpe_ratio.toFixed(2)}`);
            // Time period specific metrics
            const today_wins = todayTrades.filter(t => t.outcome === 'WIN').length;
            const today_losses = todayTrades.filter(t => t.outcome === 'LOSS').length;
            const week_wins = weekTrades.filter(t => t.outcome === 'WIN').length;
            const week_losses = weekTrades.filter(t => t.outcome === 'LOSS').length;
            const month_wins = monthTrades.filter(t => t.outcome === 'WIN').length;
            const month_losses = monthTrades.filter(t => t.outcome === 'LOSS').length;
            const metrics = {
                total_trades,
                win_rate: Math.round(win_rate * 100) / 100,
                profit_factor: Math.round(profit_factor * 100) / 100,
                average_r: Math.round(average_r * 100) / 100,
                max_drawdown_r: Math.round(max_drawdown_r * 100) / 100,
                sharpe_ratio: Math.round(sharpe_ratio * 100) / 100,
                best_trade_r: Math.round(best_trade_r * 100) / 100,
                worst_trade_r: Math.round(worst_trade_r * 100) / 100,
                today_trades: todayTrades.length,
                today_wins,
                today_losses,
                week_trades: weekTrades.length,
                week_wins,
                week_losses,
                month_trades: monthTrades.length,
                month_wins,
                month_losses
            };
            console.log(`[AnalyticsService] Performance metrics calculated successfully`);
            return metrics;
        }
        catch (error) {
            console.error('[AnalyticsService] Error calculating performance metrics:', error);
            if (error instanceof Error) {
                console.error('[AnalyticsService] Error details:', error.message);
                console.error('[AnalyticsService] Error stack:', error.stack);
            }
            throw error;
        }
    }
    /**
     * Get equity curve data points
     */
    async getEquityCurve(userId, days = 30) {
        try {
            console.log(`[AnalyticsService] Generating equity curve for user: ${userId}, days: ${days}`);
            // Calculate start date
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            // Fetch trades within the date range, sorted by date
            const trades = await Trade.find({
                userId,
                date: { $gte: startDate }
            }).sort({ date: 1 }).exec();
            console.log(`[AnalyticsService] Found ${trades.length} trades for equity curve`);
            // Assume starting equity (we'll calculate from first trade)
            // In a real scenario, this would come from account snapshots or configuration
            const STARTING_EQUITY = 7000;
            // Build equity curve
            const equityCurve = [];
            let currentEquity = STARTING_EQUITY;
            // If no trades, just return the starting equity
            if (trades.length === 0) {
                console.log(`[AnalyticsService] No trades found, returning flat equity curve at ${STARTING_EQUITY}`);
                // Generate data points for each day with flat equity
                for (let i = 0; i <= days; i++) {
                    const date = new Date(startDate);
                    date.setDate(date.getDate() + i);
                    equityCurve.push({
                        date: date.toISOString().split('T')[0],
                        equity: STARTING_EQUITY
                    });
                }
                return equityCurve;
            }
            // Get the earliest trade date to adjust starting equity
            const firstTradeInRange = trades[0];
            const firstTradeDate = new Date(firstTradeInRange.date);
            // Fetch all trades before the date range to calculate actual starting equity
            const priorTrades = await Trade.find({
                userId,
                date: { $lt: startDate }
            }).exec();
            console.log(`[AnalyticsService] Found ${priorTrades.length} prior trades for equity calculation`);
            // Calculate starting equity from prior trades
            const priorPnl = priorTrades.reduce((sum, t) => sum + t.pnl_usd, 0);
            currentEquity = STARTING_EQUITY + priorPnl;
            console.log(`[AnalyticsService] Adjusted starting equity: $${currentEquity.toFixed(2)}`);
            // Create a map of date -> equity changes
            const equityByDate = new Map();
            // Initialize all dates with current equity
            for (let i = 0; i <= days; i++) {
                const date = new Date(startDate);
                date.setDate(date.getDate() + i);
                const dateString = date.toISOString().split('T')[0];
                equityByDate.set(dateString, currentEquity);
            }
            // Apply trades to update equity
            trades.forEach(trade => {
                const tradeDate = new Date(trade.date).toISOString().split('T')[0];
                currentEquity += trade.pnl_usd;
                // Update this date and all subsequent dates
                equityByDate.forEach((value, date) => {
                    if (date >= tradeDate) {
                        equityByDate.set(date, currentEquity);
                    }
                });
            });
            // Convert map to array
            equityByDate.forEach((equity, date) => {
                equityCurve.push({
                    date,
                    equity: Math.round(equity * 100) / 100
                });
            });
            // Sort by date
            equityCurve.sort((a, b) => a.date.localeCompare(b.date));
            console.log(`[AnalyticsService] Equity curve generated with ${equityCurve.length} data points`);
            console.log(`[AnalyticsService] Equity range: $${equityCurve[0]?.equity.toFixed(2)} to $${equityCurve[equityCurve.length - 1]?.equity.toFixed(2)}`);
            return equityCurve;
        }
        catch (error) {
            console.error('[AnalyticsService] Error generating equity curve:', error);
            if (error instanceof Error) {
                console.error('[AnalyticsService] Error details:', error.message);
                console.error('[AnalyticsService] Error stack:', error.stack);
            }
            throw error;
        }
    }
    /**
     * Calculate maximum drawdown from trades (in R multiples)
     */
    calculateMaxDrawdown(trades) {
        if (trades.length === 0)
            return 0;
        let peak = 0;
        let maxDrawdown = 0;
        let cumulativeR = 0;
        trades.forEach(trade => {
            cumulativeR += trade.pnl_r;
            // Update peak if we've reached a new high
            if (cumulativeR > peak) {
                peak = cumulativeR;
            }
            // Calculate current drawdown
            const currentDrawdown = peak - cumulativeR;
            // Update max drawdown if current is larger
            if (currentDrawdown > maxDrawdown) {
                maxDrawdown = currentDrawdown;
            }
        });
        // Return as negative value (drawdowns are negative)
        return -maxDrawdown;
    }
    /**
     * Calculate Sharpe ratio (simplified version)
     * Sharpe = (average return - risk-free rate) / standard deviation of returns
     * Assuming risk-free rate = 0 for simplicity
     */
    calculateSharpeRatio(trades) {
        if (trades.length < 2)
            return 0;
        // Calculate average return (in R)
        const returns = trades.map(t => t.pnl_r);
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        // Calculate standard deviation
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        // Avoid division by zero
        if (stdDev === 0)
            return 0;
        // Sharpe ratio (annualized - multiply by sqrt of trading days)
        // Assuming ~252 trading days per year, but simplified here
        return avgReturn / stdDev;
    }
}
export default new AnalyticsService();
//# sourceMappingURL=analyticsService.js.map