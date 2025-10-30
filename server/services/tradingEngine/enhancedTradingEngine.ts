import logger from "../../utils/logger";
import { Types } from "mongoose";
import { liquidityFilter } from "../liquidityFilter";
import { tradingScheduler } from "../tradingScheduler";
import { portfolioDrawdownManager } from "../portfolioDrawdownManager";
import { trailingStopManager } from "../trailingStopManager";
import { correlationAnalyzer } from "../correlationAnalyzer";
import { performanceMetrics } from "../performanceMetrics";
import { slippageAnalyzer } from "../slippageAnalyzer";
import { binanceApiCircuitBreaker } from "../circuitBreaker";

export class EnhancedTradingEngine {
  private drawdownCheckInterval: NodeJS.Timeout | null = null;
  private trailingStopInterval: NodeJS.Timeout | null = null;
  private performanceReportInterval: NodeJS.Timeout | null = null;

  async preTradeChecks(symbol: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const scheduleCheck = tradingScheduler.canTradeNow();
      if (!scheduleCheck.allowed) {
        return scheduleCheck;
      }

      if (portfolioDrawdownManager.isTradingStopped()) {
        return { allowed: false, reason: "Trading stopped due to max drawdown" };
      }

      const liquidityCheck = await liquidityFilter.isLiquid(symbol);
      if (!liquidityCheck.isLiquid) {
        return { allowed: false, reason: `Insufficient liquidity: ${liquidityCheck.reason}` };
      }

      const concentrationCheck = await correlationAnalyzer.hasConcentrationRisk();
      if (concentrationCheck.hasRisk) {
        logger.warn("Concentration risk detected but allowing trade", { reason: concentrationCheck.reason });
      }

      return { allowed: true };
    } catch (error) {
      logger.error("Error in pre-trade checks:", error);
      return { allowed: true, reason: "Pre-trade checks failed, allowing trade" };
    }
  }

  async postTradeActions(tradeId: string): Promise<void> {
    try {
      await slippageAnalyzer.analyzeSlippage(tradeId);
    } catch (error) {
      logger.error("Error in post-trade actions:", error);
    }
  }

  async startMonitoring(userId: Types.ObjectId): Promise<void> {
    logger.info("[EnhancedTradingEngine] Starting monitoring tasks");

    this.drawdownCheckInterval = setInterval(async () => {
      try {
        const drawdown = await portfolioDrawdownManager.checkDrawdown();
        if (drawdown.shouldStop) {
          logger.error("MAX DRAWDOWN REACHED - TRADING STOPPED", {
            currentDrawdown: drawdown.currentDrawdown.toFixed(2),
            reason: drawdown.reason
          });
        }
      } catch (error) {
        logger.error("Error checking drawdown:", error);
      }
    }, 5 * 60 * 1000);

    this.trailingStopInterval = setInterval(async () => {
      try {
        const updates = await trailingStopManager.updateTrailingStops();
        if (updates.length > 0) {
          logger.info(`Updated ${updates.length} trailing stops`);
        }
      } catch (error) {
        logger.error("Error updating trailing stops:", error);
      }
    }, 60 * 1000);

    this.performanceReportInterval = setInterval(async () => {
      try {
        const stats = await performanceMetrics.getPerformanceStats(30);
        const slippageStats = await slippageAnalyzer.getSlippageStats(30);
        const streaks = await performanceMetrics.calculateWinLossStreaks();
        
        logger.info("=== PERFORMANCE REPORT (30d) ===", {
          sharpeRatio: stats.sharpeRatio.toFixed(3),
          sortinoRatio: stats.sortinoRatio.toFixed(3),
          maxDrawdown: stats.maxDrawdown.toFixed(2) + "%",
          winRate: stats.winRate.toFixed(2) + "%",
          profitFactor: stats.profitFactor.toFixed(2),
          averageSlippage: slippageStats.averageSlippageBps.toFixed(2) + " bps",
          currentStreak: `${streaks.currentStreak} ${streaks.currentStreakType}`,
          totalTrades: stats.totalTrades
        });
      } catch (error) {
        logger.error("Error generating performance report:", error);
      }
    }, 60 * 60 * 1000);

    logger.info("[EnhancedTradingEngine] Monitoring tasks started");
  }

  stopMonitoring(): void {
    if (this.drawdownCheckInterval) {
      clearInterval(this.drawdownCheckInterval);
      this.drawdownCheckInterval = null;
    }
    if (this.trailingStopInterval) {
      clearInterval(this.trailingStopInterval);
      this.trailingStopInterval = null;
    }
    if (this.performanceReportInterval) {
      clearInterval(this.performanceReportInterval);
      this.performanceReportInterval = null;
    }
    logger.info("[EnhancedTradingEngine] Monitoring tasks stopped");
  }

  async executeBinanceCall<T>(fn: () => Promise<T>): Promise<T> {
    return binanceApiCircuitBreaker.execute(fn);
  }

  async getHealthStatus(): Promise<{
    drawdown: any;
    circuitBreakers: any;
    performanceMetrics: any;
    trailingStops: number;
  }> {
    const [drawdownStatus, circuitBreakerStats, perfStats, trailingStops] = await Promise.all([
      Promise.resolve(portfolioDrawdownManager.getStatus()),
      Promise.resolve(binanceApiCircuitBreaker.getStats()),
      performanceMetrics.getPerformanceStats(7),
      trailingStopManager.getAllTrailingStops()
    ]);

    return {
      drawdown: drawdownStatus,
      circuitBreakers: circuitBreakerStats,
      performanceMetrics: perfStats,
      trailingStops: trailingStops.length
    };
  }
}

export const enhancedTradingEngine = new EnhancedTradingEngine();
