import logger from "../utils/logger";
import Trade from "../models/Trade";
import Signal from "../models/Signal";

interface SlippageData {
  tradeId: string;
  symbol: string;
  expectedPrice: number;
  actualPrice: number;
  slippageBps: number;
  slippageCost: number;
  quantity: number;
  side: string;
  timestamp: Date;
}

interface SlippageStats {
  averageSlippageBps: number;
  medianSlippageBps: number;
  maxSlippageBps: number;
  totalSlippageCost: number;
  tradeCount: number;
  period: number;
}

export class SlippageAnalyzer {
  private slippageHistory: SlippageData[] = [];
  private maxHistoryLength = 1000;
  private alertThresholdBps = 20; // Alert if slippage > 20 bps

  /**
   * Analyze slippage for a single trade
   */
  async analyzeSlippage(tradeId: string): Promise<SlippageData | null> {
    try {
      const trade = await Trade.findById(tradeId);
      if (!trade) {
        logger.error(`Trade ${tradeId} not found`);
        return null;
      }

      // Try to find associated signal
      let expectedPrice = trade.entryPrice; // Default to entry price
      
      if (trade.signalId) {
        const signal = await Signal.findById(trade.signalId);
        if (signal && signal.targetPrice) {
          expectedPrice = signal.targetPrice;
        }
      }

      const actualPrice = trade.fillPrice || trade.entryPrice;
      const slippageBps = Math.abs((actualPrice - expectedPrice) / expectedPrice * 10000);
      const slippageCost = Math.abs(actualPrice - expectedPrice) * trade.quantity;

      const data: SlippageData = {
        tradeId: trade._id.toString(),
        symbol: trade.symbol,
        expectedPrice,
        actualPrice,
        slippageBps,
        slippageCost,
        quantity: trade.quantity,
        side: trade.side,
        timestamp: trade.createdAt || new Date()
      };

      // Add to history
      this.addToHistory(data);

      // Alert if slippage is high
      if (slippageBps > this.alertThresholdBps) {
        logger.warn(`High slippage detected for ${trade.symbol}`, {
          tradeId,
          slippageBps: slippageBps.toFixed(2),
          slippageCost: slippageCost.toFixed(2),
          expectedPrice,
          actualPrice
        });
      }

      logger.debug(`Slippage analysis for ${trade.symbol}`, {
        slippageBps: slippageBps.toFixed(2),
        slippageCost: slippageCost.toFixed(2)
      });

      return data;
    } catch (error) {
      logger.error(`Error analyzing slippage for trade ${tradeId}:`, error);
      return null;
    }
  }

  /**
   * Get average slippage over a period
   */
  async getAverageSlippage(days: number = 30): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const trades = await Trade.find({
        status: "closed",
        createdAt: { $gte: cutoff }
      });

      if (trades.length === 0) {
        return 0;
      }

      let totalSlippage = 0;
      let count = 0;

      for (const trade of trades) {
        const data = await this.analyzeSlippage(trade._id.toString());
        if (data) {
          totalSlippage += data.slippageBps;
          count++;
        }
      }

      return count > 0 ? totalSlippage / count : 0;
    } catch (error) {
      logger.error("Error calculating average slippage:", error);
      return 0;
    }
  }

  /**
   * Get comprehensive slippage statistics
   */
  async getSlippageStats(days: number = 30): Promise<SlippageStats> {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const recentHistory = this.slippageHistory.filter(h => h.timestamp >= cutoff);

      if (recentHistory.length === 0) {
        return {
          averageSlippageBps: 0,
          medianSlippageBps: 0,
          maxSlippageBps: 0,
          totalSlippageCost: 0,
          tradeCount: 0,
          period: days
        };
      }

      const slippages = recentHistory.map(h => h.slippageBps).sort((a, b) => a - b);
      const costs = recentHistory.map(h => h.slippageCost);

      const averageSlippageBps = slippages.reduce((a, b) => a + b, 0) / slippages.length;
      const medianSlippageBps = slippages[Math.floor(slippages.length / 2)];
      const maxSlippageBps = Math.max(...slippages);
      const totalSlippageCost = costs.reduce((a, b) => a + b, 0);

      logger.info(`Slippage stats (${days}d)`, {
        averageSlippageBps: averageSlippageBps.toFixed(2),
        medianSlippageBps: medianSlippageBps.toFixed(2),
        maxSlippageBps: maxSlippageBps.toFixed(2),
        totalSlippageCost: totalSlippageCost.toFixed(2),
        tradeCount: recentHistory.length
      });

      return {
        averageSlippageBps,
        medianSlippageBps,
        maxSlippageBps,
        totalSlippageCost,
        tradeCount: recentHistory.length,
        period: days
      };
    } catch (error) {
      logger.error("Error getting slippage stats:", error);
      return {
        averageSlippageBps: 0,
        medianSlippageBps: 0,
        maxSlippageBps: 0,
        totalSlippageCost: 0,
        tradeCount: 0,
        period: days
      };
    }
  }

  /**
   * Get slippage by symbol
   */
  async getSlippageBySymbol(symbol: string, days: number = 30): Promise<SlippageStats> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const symbolHistory = this.slippageHistory.filter(
      h => h.symbol === symbol && h.timestamp >= cutoff
    );

    if (symbolHistory.length === 0) {
      return {
        averageSlippageBps: 0,
        medianSlippageBps: 0,
        maxSlippageBps: 0,
        totalSlippageCost: 0,
        tradeCount: 0,
        period: days
      };
    }

    const slippages = symbolHistory.map(h => h.slippageBps).sort((a, b) => a - b);
    const costs = symbolHistory.map(h => h.slippageCost);

    return {
      averageSlippageBps: slippages.reduce((a, b) => a + b, 0) / slippages.length,
      medianSlippageBps: slippages[Math.floor(slippages.length / 2)],
      maxSlippageBps: Math.max(...slippages),
      totalSlippageCost: costs.reduce((a, b) => a + b, 0),
      tradeCount: symbolHistory.length,
      period: days
    };
  }

  /**
   * Get worst slippage trades
   */
  getWorstSlippage(limit: number = 10): SlippageData[] {
    return [...this.slippageHistory]
      .sort((a, b) => b.slippageBps - a.slippageBps)
      .slice(0, limit);
  }

  /**
   * Add slippage data to history
   */
  private addToHistory(data: SlippageData): void {
    this.slippageHistory.push(data);

    // Limit history length
    if (this.slippageHistory.length > this.maxHistoryLength) {
      this.slippageHistory.shift();
    }
  }

  /**
   * Update alert threshold
   */
  setAlertThreshold(bps: number): void {
    this.alertThresholdBps = bps;
    logger.info(`Slippage alert threshold updated to ${bps} bps`);
  }

  /**
   * Get slippage history
   */
  getHistory(limit?: number): SlippageData[] {
    if (limit) {
      return this.slippageHistory.slice(-limit);
    }
    return [...this.slippageHistory];
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.slippageHistory = [];
    logger.info("Slippage history cleared");
  }
}

export const slippageAnalyzer = new SlippageAnalyzer();
