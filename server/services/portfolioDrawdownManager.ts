import logger from "../utils/logger";
import { alertService } from "./alertService";
import { binanceService } from "./binanceService";

interface DrawdownStats {
  currentEquity: number;
  peakEquity: number;
  currentDrawdown: number;
  maxDrawdown: number;
  shouldStop: boolean;
  reason?: string;
  timestamp: Date;
}

export class PortfolioDrawdownManager {
  private maxDrawdownPercent = 10; // 10% max drawdown
  private peakEquity = 0;
  private currentDrawdown = 0;
  private maxDrawdownReached = 0;
  private isStopped = false;
  private lastCheckTime: Date | null = null;
  
  // Track equity history for analysis
  private equityHistory: Array<{ equity: number; timestamp: Date }> = [];
  private maxHistoryLength = 1000;

  /**
   * Check current drawdown and determine if trading should stop
   */
  async checkDrawdown(): Promise<DrawdownStats> {
    try {
      const equity = await this.getCurrentEquity();
      this.lastCheckTime = new Date();
      
      // Update peak equity
      if (equity > this.peakEquity) {
        this.peakEquity = equity;
        logger.info(`New peak equity: $${equity.toFixed(2)}`);
      }
      
      // Calculate current drawdown
      if (this.peakEquity > 0) {
        this.currentDrawdown = ((this.peakEquity - equity) / this.peakEquity) * 100;
      } else {
        this.currentDrawdown = 0;
      }
      
      // Update max drawdown reached
      if (this.currentDrawdown > this.maxDrawdownReached) {
        this.maxDrawdownReached = this.currentDrawdown;
      }
      
      // Add to history
      this.addToHistory(equity);
      
      // Check if we should stop trading
      let shouldStop = false;
      let reason: string | undefined;
      
      if (this.currentDrawdown >= this.maxDrawdownPercent) {
        shouldStop = true;
        reason = `Max drawdown reached: ${this.currentDrawdown.toFixed(2)}% (limit: ${this.maxDrawdownPercent}%)`;
        
        if (!this.isStopped) {
          this.isStopped = true;
          logger.error(reason);
          
          // Send alert
          await alertService.sendAlert({
            type: "MAX_DRAWDOWN",
            severity: "critical",
            message: reason,
            data: {
              currentEquity: equity,
              peakEquity: this.peakEquity,
              currentDrawdown: this.currentDrawdown,
              maxDrawdown: this.maxDrawdownPercent
            }
          });
        }
      } else if (this.currentDrawdown >= this.maxDrawdownPercent * 0.8) {
        // Warning at 80% of max drawdown
        const warningMessage = `Approaching max drawdown: ${this.currentDrawdown.toFixed(2)}% (limit: ${this.maxDrawdownPercent}%)`;
        logger.warn(warningMessage);
        
        await alertService.sendAlert({
          type: "DRAWDOWN_WARNING",
          severity: "medium",
          message: warningMessage,
          data: {
            currentEquity: equity,
            peakEquity: this.peakEquity,
            currentDrawdown: this.currentDrawdown,
            maxDrawdown: this.maxDrawdownPercent
          }
        });
      }
      
      return {
        currentEquity: equity,
        peakEquity: this.peakEquity,
        currentDrawdown: this.currentDrawdown,
        maxDrawdown: this.maxDrawdownReached,
        shouldStop,
        reason,
        timestamp: this.lastCheckTime
      };
    } catch (error) {
      logger.error("Error checking drawdown:", error);
      throw error;
    }
  }

  /**
   * Get current portfolio equity (USDT balance + position values)
   */
  private async getCurrentEquity(): Promise<number> {
    try {
      const account = await binanceService.getAccountInfo();
      
      // Get USDT balance
      const usdtBalance = account.balances.find(b => b.asset === "USDT");
      const usdtValue = usdtBalance ? parseFloat(usdtBalance.free) + parseFloat(usdtBalance.locked) : 0;
      
      // Get value of all positions
      let positionValue = 0;
      for (const balance of account.balances) {
        if (balance.asset === "USDT") continue;
        
        const total = parseFloat(balance.free) + parseFloat(balance.locked);
        if (total > 0) {
          try {
            const symbol = `${balance.asset}USDT`;
            const price = await binanceService.getSymbolPrice(symbol);
            positionValue += total * parseFloat(price.price);
          } catch (err) {
            // Skip if symbol not found
            logger.debug(`Could not get price for ${balance.asset}USDT`);
          }
        }
      }
      
      return usdtValue + positionValue;
    } catch (error) {
      logger.error("Error getting current equity:", error);
      throw error;
    }
  }

  /**
   * Add equity to history
   */
  private addToHistory(equity: number): void {
    this.equityHistory.push({
      equity,
      timestamp: new Date()
    });
    
    // Limit history length
    if (this.equityHistory.length > this.maxHistoryLength) {
      this.equityHistory.shift();
    }
  }

  /**
   * Get equity history
   */
  getEquityHistory(limit?: number): Array<{ equity: number; timestamp: Date }> {
    if (limit) {
      return this.equityHistory.slice(-limit);
    }
    return [...this.equityHistory];
  }

  /**
   * Calculate maximum drawdown over a period
   */
  calculateMaxDrawdown(days?: number): { maxDrawdown: number; duration: number; recoveryTime: number } {
    if (this.equityHistory.length === 0) {
      return { maxDrawdown: 0, duration: 0, recoveryTime: 0 };
    }
    
    let history = this.equityHistory;
    if (days) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      history = this.equityHistory.filter(h => h.timestamp >= cutoff);
    }
    
    let peak = history[0].equity;
    let maxDD = 0;
    let ddStart = 0;
    let ddEnd = 0;
    let recovered = false;
    
    for (let i = 1; i < history.length; i++) {
      if (history[i].equity > peak) {
        peak = history[i].equity;
        if (!recovered && maxDD > 0) {
          recovered = true;
        }
      } else {
        const dd = ((peak - history[i].equity) / peak) * 100;
        if (dd > maxDD) {
          maxDD = dd;
          ddStart = i;
          ddEnd = i;
          recovered = false;
        }
      }
    }
    
    const duration = ddEnd - ddStart;
    const recoveryTime = recovered ? history.length - ddEnd : -1;
    
    return { maxDrawdown: maxDD, duration, recoveryTime };
  }

  /**
   * Reset drawdown manager (e.g., after manual intervention)
   */
  reset(): void {
    this.isStopped = false;
    this.currentDrawdown = 0;
    logger.info("Drawdown manager reset - trading resumed");
  }

  /**
   * Update max drawdown threshold
   */
  setMaxDrawdown(percent: number): void {
    this.maxDrawdownPercent = percent;
    logger.info(`Max drawdown threshold updated to ${percent}%`);
  }

  /**
   * Get current status
   */
  getStatus(): {
    peakEquity: number;
    currentDrawdown: number;
    maxDrawdownReached: number;
    maxDrawdownLimit: number;
    isStopped: boolean;
    lastCheckTime: Date | null;
  } {
    return {
      peakEquity: this.peakEquity,
      currentDrawdown: this.currentDrawdown,
      maxDrawdownReached: this.maxDrawdownReached,
      maxDrawdownLimit: this.maxDrawdownPercent,
      isStopped: this.isStopped,
      lastCheckTime: this.lastCheckTime
    };
  }

  /**
   * Check if trading is stopped due to drawdown
   */
  isTradingStopped(): boolean {
    return this.isStopped;
  }
}

export const portfolioDrawdownManager = new PortfolioDrawdownManager();
