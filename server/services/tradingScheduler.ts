import logger from "../utils/logger";

interface BlackoutPeriod {
  start: Date;
  end: Date;
  reason: string;
}

export class TradingScheduler {
  private blackoutPeriods: BlackoutPeriod[] = [];
  
  // Low liquidity hours (UTC)
  private lowLiquidityHours = {
    start: 2,  // 2 AM UTC
    end: 6     // 6 AM UTC
  };
  
  // Enable/disable features
  private enableLowLiquidityFilter = true;
  private enableBlackoutPeriods = true;

  /**
   * Check if trading is allowed at current time
   */
  canTradeNow(): { allowed: boolean; reason?: string } {
    const now = new Date();
    
    // Check low liquidity hours
    if (this.enableLowLiquidityFilter && this.isLowLiquidityHour(now)) {
      return {
        allowed: false,
        reason: `Low liquidity period (${this.lowLiquidityHours.start}-${this.lowLiquidityHours.end} UTC)`
      };
    }
    
    // Check blackout periods
    if (this.enableBlackoutPeriods) {
      const blackout = this.isBlackoutPeriod(now);
      if (blackout) {
        return {
          allowed: false,
          reason: `Blackout period: ${blackout.reason}`
        };
      }
    }
    
    return { allowed: true };
  }

  /**
   * Check if current time is in low liquidity hours
   */
  private isLowLiquidityHour(time: Date): boolean {
    const hour = time.getUTCHours();
    return hour >= this.lowLiquidityHours.start && hour < this.lowLiquidityHours.end;
  }

  /**
   * Check if current time is in a blackout period
   */
  private isBlackoutPeriod(time: Date): BlackoutPeriod | null {
    for (const period of this.blackoutPeriods) {
      if (time >= period.start && time <= period.end) {
        return period;
      }
    }
    return null;
  }

  /**
   * Add a blackout period (e.g., for major news events)
   */
  addBlackoutPeriod(start: Date, end: Date, reason: string): void {
    this.blackoutPeriods.push({ start, end, reason });
    this.blackoutPeriods.sort((a, b) => a.start.getTime() - b.start.getTime());
    
    logger.info("Blackout period added", {
      start: start.toISOString(),
      end: end.toISOString(),
      reason
    });
  }

  /**
   * Remove expired blackout periods
   */
  cleanupBlackoutPeriods(): void {
    const now = new Date();
    const before = this.blackoutPeriods.length;
    this.blackoutPeriods = this.blackoutPeriods.filter(p => p.end > now);
    const removed = before - this.blackoutPeriods.length;
    
    if (removed > 0) {
      logger.info(`Removed ${removed} expired blackout periods`);
    }
  }

  /**
   * Get all active blackout periods
   */
  getActiveBlackoutPeriods(): BlackoutPeriod[] {
    const now = new Date();
    return this.blackoutPeriods.filter(p => p.end > now);
  }

  /**
   * Update low liquidity hours
   */
  updateLowLiquidityHours(start: number, end: number): void {
    this.lowLiquidityHours = { start, end };
    logger.info("Low liquidity hours updated", { start, end });
  }

  /**
   * Enable/disable low liquidity filter
   */
  setLowLiquidityFilter(enabled: boolean): void {
    this.enableLowLiquidityFilter = enabled;
    logger.info(`Low liquidity filter ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Enable/disable blackout periods
   */
  setBlackoutPeriods(enabled: boolean): void {
    this.enableBlackoutPeriods = enabled;
    logger.info(`Blackout periods ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Add common economic event blackouts
   * Call this to add blackouts for FOMC, CPI, NFP, etc.
   */
  addEconomicEventBlackouts(events: Array<{ date: Date; name: string; durationMinutes?: number }>): void {
    for (const event of events) {
      const duration = event.durationMinutes || 60; // Default 1 hour
      const start = new Date(event.date.getTime() - 15 * 60 * 1000); // 15 min before
      const end = new Date(event.date.getTime() + duration * 60 * 1000);
      
      this.addBlackoutPeriod(start, end, `Economic event: ${event.name}`);
    }
  }

  /**
   * Get next trading window
   */
  getNextTradingWindow(): { start: Date; reason: string } | null {
    const check = this.canTradeNow();
    if (check.allowed) {
      return null; // Can trade now
    }

    const now = new Date();
    
    // If in low liquidity hours, return end of that period
    if (this.isLowLiquidityHour(now)) {
      const nextWindow = new Date(now);
      nextWindow.setUTCHours(this.lowLiquidityHours.end, 0, 0, 0);
      return {
        start: nextWindow,
        reason: "End of low liquidity period"
      };
    }

    // If in blackout period, return end of that period
    const blackout = this.isBlackoutPeriod(now);
    if (blackout) {
      return {
        start: blackout.end,
        reason: `End of blackout: ${blackout.reason}`
      };
    }

    return null;
  }
}

export const tradingScheduler = new TradingScheduler();
