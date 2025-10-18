import mongoose from 'mongoose';
/**
 * Service for analytics and performance metrics
 */
declare class AnalyticsService {
    /**
     * Get comprehensive performance metrics
     */
    getPerformanceMetrics(userId: string | mongoose.Types.ObjectId): Promise<{
        total_trades: number;
        win_rate: number;
        profit_factor: number;
        average_r: number;
        max_drawdown_r: number;
        sharpe_ratio: number;
        best_trade_r: number;
        worst_trade_r: number;
        today_trades: number;
        today_wins: number;
        today_losses: number;
        week_trades: number;
        week_wins: number;
        week_losses: number;
        month_trades: number;
        month_wins: number;
        month_losses: number;
    }>;
    /**
     * Get equity curve data points
     */
    getEquityCurve(userId: string | mongoose.Types.ObjectId, days?: number): Promise<Array<{
        date: string;
        equity: number;
    }>>;
    /**
     * Calculate maximum drawdown from trades (in R multiples)
     */
    private calculateMaxDrawdown;
    /**
     * Calculate Sharpe ratio (simplified version)
     * Sharpe = (average return - risk-free rate) / standard deviation of returns
     * Assuming risk-free rate = 0 for simplicity
     */
    private calculateSharpeRatio;
}
declare const _default: AnalyticsService;
export default _default;
//# sourceMappingURL=analyticsService.d.ts.map