import logger from "../utils/logger";
import { binanceService } from "./binanceService";
import Position from "../models/Position";

interface TrailingStopConfig {
  activationPercent: number; // Activate when position is up X%
  trailingPercent: number;   // Trail by X%
  enabled: boolean;
}

interface TrailingStopInfo {
  positionId: string;
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  highestPrice: number;
  trailingStopPrice: number;
  pnlPercent: number;
  isActive: boolean;
  lastUpdate: Date;
}

export class TrailingStopManager {
  private config: TrailingStopConfig = {
    activationPercent: 5,  // Activate trailing stop when up 5%
    trailingPercent: 2,    // Trail by 2%
    enabled: true
  };
  
  // Track highest prices for each position
  private highestPrices = new Map<string, number>();
  
  // Track which positions have trailing stops active
  private activeTrailingStops = new Set<string>();

  /**
   * Update trailing stops for all winning positions
   */
  async updateTrailingStops(): Promise<TrailingStopInfo[]> {
    if (!this.config.enabled) {
      return [];
    }

    try {
      // Get all open positions
      const positions = await Position.find({ status: "open" });
      const updates: TrailingStopInfo[] = [];

      for (const position of positions) {
        try {
          const info = await this.updatePositionTrailingStop(position);
          if (info) {
            updates.push(info);
          }
        } catch (error) {
          logger.error(`Error updating trailing stop for position ${position._id}:`, error);
        }
      }

      return updates;
    } catch (error) {
      logger.error("Error updating trailing stops:", error);
      return [];
    }
  }

  /**
   * Update trailing stop for a single position
   */
  private async updatePositionTrailingStop(position: any): Promise<TrailingStopInfo | null> {
    const positionId = position._id.toString();
    
    // Get current price
    const ticker = await binanceService.getSymbolPrice(position.symbol);
    const currentPrice = parseFloat(ticker.price);
    
    // Calculate P&L
    const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    
    // Update highest price
    const previousHigh = this.highestPrices.get(positionId) || position.entryPrice;
    const highestPrice = Math.max(previousHigh, currentPrice);
    this.highestPrices.set(positionId, highestPrice);
    
    // Check if we should activate trailing stop
    const shouldActivate = pnlPercent >= this.config.activationPercent;
    const isActive = this.activeTrailingStops.has(positionId);
    
    if (shouldActivate && !isActive) {
      this.activeTrailingStops.add(positionId);
      logger.info(`Trailing stop activated for ${position.symbol}`, {
        positionId,
        entryPrice: position.entryPrice,
        currentPrice,
        pnlPercent: pnlPercent.toFixed(2)
      });
    }
    
    // Calculate trailing stop price
    const trailingStopPrice = highestPrice * (1 - this.config.trailingPercent / 100);
    
    // Update stop loss if trailing stop is active and higher than current stop
    if (shouldActivate) {
      const currentStopLoss = position.stopLoss || 0;
      
      if (trailingStopPrice > currentStopLoss) {
        // Update position stop loss
        position.stopLoss = trailingStopPrice;
        await position.save();
        
        logger.info(`Trailing stop updated for ${position.symbol}`, {
          positionId,
          oldStopLoss: currentStopLoss.toFixed(2),
          newStopLoss: trailingStopPrice.toFixed(2),
          highestPrice: highestPrice.toFixed(2),
          currentPrice: currentPrice.toFixed(2)
        });
      }
      
      // Check if stop loss is hit
      if (currentPrice <= trailingStopPrice) {
        logger.warn(`Trailing stop hit for ${position.symbol}`, {
          positionId,
          stopPrice: trailingStopPrice.toFixed(2),
          currentPrice: currentPrice.toFixed(2)
        });
        
        // Trigger sell order (this would be handled by position manager)
        // For now, just log it
      }
    }
    
    return {
      positionId,
      symbol: position.symbol,
      entryPrice: position.entryPrice,
      currentPrice,
      highestPrice,
      trailingStopPrice,
      pnlPercent,
      isActive: shouldActivate,
      lastUpdate: new Date()
    };
  }

  /**
   * Remove tracking for a closed position
   */
  removePosition(positionId: string): void {
    this.highestPrices.delete(positionId);
    this.activeTrailingStops.delete(positionId);
  }

  /**
   * Get trailing stop info for all positions
   */
  async getAllTrailingStops(): Promise<TrailingStopInfo[]> {
    const positions = await Position.find({ status: "open" });
    const infos: TrailingStopInfo[] = [];

    for (const position of positions) {
      try {
        const info = await this.getTrailingStopInfo(position);
        if (info) {
          infos.push(info);
        }
      } catch (error) {
        logger.error(`Error getting trailing stop info for ${position._id}:`, error);
      }
    }

    return infos;
  }

  /**
   * Get trailing stop info for a specific position
   */
  private async getTrailingStopInfo(position: any): Promise<TrailingStopInfo | null> {
    const positionId = position._id.toString();
    
    const ticker = await binanceService.getSymbolPrice(position.symbol);
    const currentPrice = parseFloat(ticker.price);
    
    const highestPrice = this.highestPrices.get(positionId) || currentPrice;
    const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    const trailingStopPrice = highestPrice * (1 - this.config.trailingPercent / 100);
    const isActive = this.activeTrailingStops.has(positionId);

    return {
      positionId,
      symbol: position.symbol,
      entryPrice: position.entryPrice,
      currentPrice,
      highestPrice,
      trailingStopPrice,
      pnlPercent,
      isActive,
      lastUpdate: new Date()
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TrailingStopConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info("Trailing stop configuration updated", this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): TrailingStopConfig {
    return { ...this.config };
  }

  /**
   * Enable/disable trailing stops
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    logger.info(`Trailing stops ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Clear all tracking data
   */
  clear(): void {
    this.highestPrices.clear();
    this.activeTrailingStops.clear();
    logger.info("Trailing stop manager cleared");
  }
}

export const trailingStopManager = new TrailingStopManager();
