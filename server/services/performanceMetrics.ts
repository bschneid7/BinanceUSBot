import logger from "../utils/logger";
import Trade from "../models/Trade";
import { portfolioDrawdownManager } from "./portfolioDrawdownManager";

interface PerformanceStats {
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  totalTrades: number;
  period: number;
}

interface StreakStats {
  currentStreak: number;
  longestWinStreak: number;
  longestLossStreak: number;
  currentStreakType: "win" | "loss" | "none";
}

export class PerformanceMetrics {
  /**
   * Calculate Sharpe Ratio
   */
  async calculateSharpeRatio(period: number = 30): Promise<number> {
    try {
      const returns = await this.getDailyReturns(period);
      
      if (returns.length === 0) {
        return 0;
      }

      const avgReturn = this.average(returns);
      const stdDev = this.standardDeviation(returns);
      
      if (stdDev === 0) {
        return 0;
      }

      const riskFreeRate = 0.05 / 365; // 5% annual / 365 days
      const sharpe = ((avgReturn - riskFreeRate) / stdDev) * Math.sqrt(365);

      logger.info(`Sharpe Ratio (${period}d): ${sharpe.toFixed(3)}`);
      return sharpe;
    } catch (error) {
      logger.error("Error calculating Sharpe ratio:", error);
      return 0;
    }
  }

  /**
   * Calculate Sortino Ratio (only penalizes downside volatility)
   */
  async calculateSortinoRatio(period: number = 30): Promise<number> {
    try {
      const returns = await this.getDailyReturns(period);
      
      if (returns.length === 0) {
        return 0;
      }

      const avgReturn = this.average(returns);
      const downside = this.downsideDeviation(returns);
      
      if (downside === 0) {
        return 0;
      }

      const riskFreeRate = 0.05 / 365;
      const sortino = ((avgReturn - riskFreeRate) / downside) * Math.sqrt(365);

      logger.info(`Sortino Ratio (${period}d): ${sortino.toFixed(3)}`);
      return sortino;
    } catch (error) {
      logger.error("Error calculating Sortino ratio:", error);
      return 0;
    }
  }

  /**
   * Calculate maximum drawdown over a period
   */
  async calculateMaxDrawdown(period: number = 90): Promise<{
    maxDrawdown: number;
    drawdownDuration: number;
    recoveryTime: number;
  }> {
    try {
      const equity = await this.getEquityCurve(period);
      
      if (equity.length === 0) {
        return { maxDrawdown: 0, drawdownDuration: 0, recoveryTime: 0 };
      }

      let peak = equity[0];
      let maxDD = 0;
      let ddStart = 0;
      let ddEnd = 0;
      let recovered = false;

      for (let i = 1; i < equity.length; i++) {
        if (equity[i] > peak) {
          peak = equity[i];
          if (!recovered && maxDD > 0) {
            recovered = true;
          }
        } else {
          const dd = ((peak - equity[i]) / peak) * 100;
          if (dd > maxDD) {
            maxDD = dd;
            ddStart = i;
            ddEnd = i;
            recovered = false;
          }
        }
      }

      const duration = ddEnd - ddStart;
      const recoveryTime = recovered ? equity.length - ddEnd : -1;

      logger.info(`Max Drawdown (${period}d): ${maxDD.toFixed(2)}%`);
      return { maxDrawdown: maxDD, drawdownDuration: duration, recoveryTime };
    } catch (error) {
      logger.error("Error calculating max drawdown:", error);
      return { maxDrawdown: 0, drawdownDuration: 0, recoveryTime: 0 };
    }
  }

  /**
   * Calculate win/loss streaks
   */
  async calculateWinLossStreaks(): Promise<StreakStats> {
    try {
      const trades = await Trade.find({ status: "closed" })
        .sort({ closedAt: -1 })
        .limit(100);

      if (trades.length === 0) {
        return {
          currentStreak: 0,
          longestWinStreak: 0,
          longestLossStreak: 0,
          currentStreakType: "none"
        };
      }

      let currentStreak = 0;
      let longestWin = 0;
      let longestLoss = 0;
      let tempWin = 0;
      let tempLoss = 0;
      let currentStreakType: "win" | "loss" | "none" = "none";

      // Reverse to go chronological
      const chronological = [...trades].reverse();

      for (const trade of chronological) {
        const pnl = trade.realizedPnl || 0;
        
        if (pnl > 0) {
          tempWin++;
          tempLoss = 0;
          currentStreak = tempWin;
          currentStreakType = "win";
        } else if (pnl < 0) {
          tempLoss++;
          tempWin = 0;
          currentStreak = -tempLoss;
          currentStreakType = "loss";
        }

        longestWin = Math.max(longestWin, tempWin);
        longestLoss = Math.max(longestLoss, tempLoss);
      }

      logger.info("Win/Loss Streaks", {
        currentStreak,
        currentStreakType,
        longestWinStreak: longestWin,
        longestLossStreak: longestLoss
      });

      return {
        currentStreak: Math.abs(currentStreak),
        longestWinStreak: longestWin,
        longestLossStreak: longestLoss,
        currentStreakType
      };
    } catch (error) {
      logger.error("Error calculating win/loss streaks:", error);
      return {
        currentStreak: 0,
        longestWinStreak: 0,
        longestLossStreak: 0,
        currentStreakType: "none"
      };
    }
  }

  /**
   * Get comprehensive performance statistics
   */
  async getPerformanceStats(period: number = 30): Promise<PerformanceStats> {
    try {
      const cutoff = new Date(Date.now() - period * 24 * 60 * 60 * 1000);
      const trades = await Trade.find({
        status: "closed",
        closedAt: { $gte: cutoff }
      });

      const wins = trades.filter(t => (t.realizedPnl || 0) > 0);
      const losses = trades.filter(t => (t.realizedPnl || 0) < 0);

      const totalWins = wins.reduce((sum, t) => sum + (t.realizedPnl || 0), 0);
      const totalLosses = Math.abs(losses.reduce((sum, t) => sum + (t.realizedPnl || 0), 0));

      const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
      const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;
      const averageWin = wins.length > 0 ? totalWins / wins.length : 0;
      const averageLoss = losses.length > 0 ? totalLosses / losses.length : 0;

      const [sharpeRatio, sortinoRatio, maxDrawdownData] = await Promise.all([
        this.calculateSharpeRatio(period),
        this.calculateSortinoRatio(period),
        this.calculateMaxDrawdown(period)
      ]);

      return {
        sharpeRatio,
        sortinoRatio,
        maxDrawdown: maxDrawdownData.maxDrawdown,
        winRate,
        profitFactor,
        averageWin,
        averageLoss,
        totalTrades: trades.length,
        period
      };
    } catch (error) {
      logger.error("Error getting performance stats:", error);
      throw error;
    }
  }

  /**
   * Get daily returns
   */
  private async getDailyReturns(days: number): Promise<number[]> {
    const equity = await this.getEquityCurve(days);
    const returns: number[] = [];

    for (let i = 1; i < equity.length; i++) {
      if (equity[i - 1] > 0) {
        returns.push((equity[i] - equity[i - 1]) / equity[i - 1]);
      }
    }

    return returns;
  }

  /**
   * Get equity curve
   */
  private async getEquityCurve(days: number): Promise<number[]> {
    // Try to get from drawdown manager first
    const history = portfolioDrawdownManager.getEquityHistory();
    
    if (history.length > 0) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const filtered = history.filter(h => h.timestamp >= cutoff);
      return filtered.map(h => h.equity);
    }

    // Fallback: calculate from trades
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const trades = await Trade.find({
      status: "closed",
      closedAt: { $gte: cutoff }
    }).sort({ closedAt: 1 });

    const equity: number[] = [10000]; // Start with initial capital
    let current = 10000;

    for (const trade of trades) {
      current += trade.realizedPnl || 0;
      equity.push(current);
    }

    return equity;
  }

  /**
   * Calculate average
   */
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate standard deviation
   */
  private standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.average(values);
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = this.average(squareDiffs);
    return Math.sqrt(avgSquareDiff);
  }

  /**
   * Calculate downside deviation (only negative returns)
   */
  private downsideDeviation(values: number[]): number {
    const negativeValues = values.filter(v => v < 0);
    if (negativeValues.length === 0) return 0;
    
    const squareDiffs = negativeValues.map(value => Math.pow(value, 2));
    const avgSquareDiff = this.average(squareDiffs);
    return Math.sqrt(avgSquareDiff);
  }
}

export const performanceMetrics = new PerformanceMetrics();
