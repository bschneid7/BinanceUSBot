import binanceService from '../binanceService';
import { priceCacheService } from '../websocket/priceCacheService';
import Position from '../../models/Position';

interface TrailingStopConfig {
  symbol: string;
  positionId: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  trailingPercent: number; // Percentage to trail (e.g., 5 for 5%)
  activationPercent: number; // Profit % required to activate trailing stop (e.g., 3 for 3%)
}

interface StopLossState {
  positionId: string;
  symbol: string;
  highestPrice: number;
  stopPrice: number;
  isActive: boolean;
  activatedAt?: Date;
  lastUpdated: Date;
}

/**
 * Trailing Stop-Loss Service
 * Implements dynamic stop-loss that trails price movements
 */
export class TrailingStopLoss {
  private stopStates: Map<string, StopLossState> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL = 5000; // Check every 5 seconds

  /**
   * Start monitoring trailing stops
   */
  start(): void {
    if (this.monitoringInterval) {
      console.log('[TrailingStopLoss] Already monitoring');
      return;
    }

    console.log('[TrailingStopLoss] Starting trailing stop monitoring...');

    this.monitoringInterval = setInterval(async () => {
      await this.checkAllStops();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stop monitoring trailing stops
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('[TrailingStopLoss] Stopped monitoring');
    }
  }

  /**
   * Add or update trailing stop for a position
   */
  async addTrailingStop(config: TrailingStopConfig): Promise<void> {
    console.log(`[TrailingStopLoss] Adding trailing stop for ${config.symbol} (${config.positionId})`);

    const profitPercent = ((config.currentPrice - config.entryPrice) / config.entryPrice) * 100;
    const isActive = profitPercent >= config.activationPercent;

    const stopPrice = config.currentPrice * (1 - config.trailingPercent / 100);

    const state: StopLossState = {
      positionId: config.positionId,
      symbol: config.symbol,
      highestPrice: config.currentPrice,
      stopPrice,
      isActive,
      activatedAt: isActive ? new Date() : undefined,
      lastUpdated: new Date(),
    };

    this.stopStates.set(config.positionId, state);

    console.log(`[TrailingStopLoss] Trailing stop ${isActive ? 'ACTIVE' : 'PENDING'} for ${config.symbol} - Stop: $${stopPrice.toFixed(4)}`);
  }

  /**
   * Remove trailing stop for a position
   */
  removeTrailingStop(positionId: string): void {
    if (this.stopStates.has(positionId)) {
      const state = this.stopStates.get(positionId)!;
      console.log(`[TrailingStopLoss] Removing trailing stop for ${state.symbol} (${positionId})`);
      this.stopStates.delete(positionId);
    }
  }

  /**
   * Check all trailing stops
   */
  private async checkAllStops(): Promise<void> {
    if (this.stopStates.size === 0) return;

    for (const [positionId, state] of this.stopStates) {
      try {
        await this.checkStop(positionId, state);
      } catch (error) {
        console.error(`[TrailingStopLoss] Error checking stop for ${state.symbol}:`, error);
      }
    }
  }

  /**
   * Check individual trailing stop
   */
  private async checkStop(positionId: string, state: StopLossState): Promise<void> {
    // Get current price
    const currentPrice = await this.getCurrentPrice(state.symbol);
    if (!currentPrice) return;

    // Get position details
    const position = await this.getPosition(positionId);
    if (!position || position.status !== 'OPEN') {
      console.log(`[TrailingStopLoss] Position ${positionId} is no longer open, removing stop`);
      this.removeTrailingStop(positionId);
      return;
    }

    const profitPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

    // Activate trailing stop if profit threshold reached
    if (!state.isActive && profitPercent >= position.trailingStopActivation) {
      state.isActive = true;
      state.activatedAt = new Date();
      console.log(`[TrailingStopLoss] Trailing stop ACTIVATED for ${state.symbol} at ${profitPercent.toFixed(2)}% profit`);
    }

    // Update highest price and stop price if price increased
    if (currentPrice > state.highestPrice) {
      state.highestPrice = currentPrice;
      state.stopPrice = currentPrice * (1 - position.trailingStopPercent / 100);
      state.lastUpdated = new Date();

      console.log(`[TrailingStopLoss] Updated trailing stop for ${state.symbol} - New high: $${currentPrice.toFixed(4)}, Stop: $${state.stopPrice.toFixed(4)}`);
    }

    // Trigger stop if active and price fell below stop level
    if (state.isActive && currentPrice <= state.stopPrice) {
      console.log(`[TrailingStopLoss] 🛑 TRAILING STOP TRIGGERED for ${state.symbol} - Price: $${currentPrice.toFixed(4)}, Stop: $${state.stopPrice.toFixed(4)}`);
      await this.executeStop(position, currentPrice, state);
    }
  }

  /**
   * Execute trailing stop (close position)
   */
  private async executeStop(position: any, currentPrice: number, state: StopLossState): Promise<void> {
    try {
      console.log(`[TrailingStopLoss] Executing trailing stop for ${position.symbol}...`);

      // Close position via message queue
      await fetch('http://localhost:3000/api/queue/close-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionId: position._id,
          reason: 'TRAILING_STOP',
          priority: 'HIGH',
        }),
      });

      // Remove from monitoring
      this.removeTrailingStop(position._id);

      const profitPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
      console.log(`[TrailingStopLoss] ✅ Trailing stop executed for ${position.symbol} - Profit: ${profitPercent.toFixed(2)}%`);

    } catch (error) {
      console.error(`[TrailingStopLoss] Error executing stop for ${position.symbol}:`, error);
    }
  }

  /**
   * Get current price from cache or API
   */
  private async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      // Try to get from price cache first (WebSocket)
      const cachedPrice = priceCacheService.getPrice(symbol);
      if (cachedPrice) return cachedPrice;

      // Fallback to API
      const ticker = await binanceService.getTickerPrice(symbol);
      return ticker ? parseFloat(ticker.price) : null;

    } catch (error) {
      console.error(`[TrailingStopLoss] Error getting price for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get position from database
   */
  private async getPosition(positionId: string): Promise<any | null> {
    try {
      const response = await fetch(`http://localhost:3000/api/positions/${positionId}`);
      const data = await response.json();
      return data.position || null;
    } catch (error) {
      console.error(`[TrailingStopLoss] Error fetching position ${positionId}:`, error);
      return null;
    }
  }

  /**
   * Initialize trailing stops for all open positions
   */
  async initializeFromPositions(): Promise<void> {
    console.log('[TrailingStopLoss] Initializing trailing stops from open positions...');

    try {
      const response = await fetch('http://localhost:3000/api/positions?status=OPEN');
      const data = await response.json();
      const positions = data.positions || [];

      for (const position of positions) {
        // Only add trailing stop if configured
        if (!position.trailingStopPercent || position.trailingStopPercent <= 0) continue;

        const currentPrice = await this.getCurrentPrice(position.symbol);
        if (!currentPrice) continue;

        await this.addTrailingStop({
          symbol: position.symbol,
          positionId: position._id,
          entryPrice: position.entryPrice,
          currentPrice,
          quantity: position.quantity,
          trailingPercent: position.trailingStopPercent,
          activationPercent: position.trailingStopActivation || 3,
        });
      }

      console.log(`[TrailingStopLoss] Initialized ${this.stopStates.size} trailing stops`);

    } catch (error) {
      console.error('[TrailingStopLoss] Error initializing trailing stops:', error);
    }
  }

  /**
   * Get status of all trailing stops
   */
  getStatus(): {
    totalStops: number;
    activeStops: number;
    pendingStops: number;
    stops: Array<{
      symbol: string;
      positionId: string;
      isActive: boolean;
      highestPrice: number;
      stopPrice: number;
      lastUpdated: Date;
    }>;
  } {
    const stops = Array.from(this.stopStates.values());

    return {
      totalStops: stops.length,
      activeStops: stops.filter(s => s.isActive).length,
      pendingStops: stops.filter(s => !s.isActive).length,
      stops: stops.map(s => ({
        symbol: s.symbol,
        positionId: s.positionId,
        isActive: s.isActive,
        highestPrice: s.highestPrice,
        stopPrice: s.stopPrice,
        lastUpdated: s.lastUpdated,
      })),
    };
  }
}

// Singleton instance
export const trailingStopLoss = new TrailingStopLoss();
