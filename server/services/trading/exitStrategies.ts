import binanceService from '../binanceService';
import { priceCacheService } from '../websocket/priceCacheService';
import { multiTimeframeAnalysis } from './multiTimeframeAnalysis';

interface ExitSignal {
  symbol: string;
  positionId: string;
  strategy: 'PROFIT_TARGET' | 'STOP_LOSS' | 'TIME_BASED' | 'SIGNAL_REVERSAL' | 'TRAILING_STOP';
  shouldExit: boolean;
  confidence: number;
  reason: string;
  currentPrice: number;
  profitPercent: number;
}

interface ExitConfig {
  profitTargetPercent: number; // Take profit at X%
  stopLossPercent: number; // Stop loss at -X%
  maxHoldingDays: number; // Exit after X days
  useSignalReversal: boolean; // Exit on opposite signal
  partialExitPercent: number; // Take partial profit at 50% of target
}

/**
 * Advanced Exit Strategies Service
 * Implements multiple exit strategies for optimal trade management
 */
export class ExitStrategies {
  private readonly DEFAULT_CONFIG: ExitConfig = {
    profitTargetPercent: 10, // 10% profit target
    stopLossPercent: 5, // 5% stop loss
    maxHoldingDays: 7, // Exit after 7 days
    useSignalReversal: true,
    partialExitPercent: 50, // Take 50% profit at 5% gain
  };

  /**
   * Evaluate all exit strategies for a position
   */
  async evaluateExit(position: any, config?: Partial<ExitConfig>): Promise<ExitSignal> {
    const exitConfig = { ...this.DEFAULT_CONFIG, ...config };

    console.log(`[ExitStrategies] Evaluating exit for ${position.symbol} (${position._id})`);

    // Get current price
    const currentPrice = await this.getCurrentPrice(position.symbol);
    if (!currentPrice) {
      return this.createNoExitSignal(position, 'Unable to get current price');
    }

    const profitPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

    // Check each exit strategy
    const strategies = [
      await this.checkProfitTarget(position, currentPrice, profitPercent, exitConfig),
      await this.checkStopLoss(position, currentPrice, profitPercent, exitConfig),
      await this.checkTimeBasedExit(position, exitConfig),
      await this.checkSignalReversal(position, exitConfig),
    ];

    // Find highest priority exit signal
    const exitSignal = strategies.find(s => s.shouldExit);

    if (exitSignal) {
      console.log(`[ExitStrategies] 🚪 EXIT SIGNAL for ${position.symbol}: ${exitSignal.reason}`);
      return exitSignal;
    }

    return this.createNoExitSignal(position, 'No exit conditions met', currentPrice, profitPercent);
  }

  /**
   * Check profit target exit
   */
  private async checkProfitTarget(
    position: any,
    currentPrice: number,
    profitPercent: number,
    config: ExitConfig
  ): Promise<ExitSignal> {
    // Full profit target
    if (profitPercent >= config.profitTargetPercent) {
      return {
        symbol: position.symbol,
        positionId: position._id,
        strategy: 'PROFIT_TARGET',
        shouldExit: true,
        confidence: 95,
        reason: `Profit target reached: ${profitPercent.toFixed(2)}% (target: ${config.profitTargetPercent}%)`,
        currentPrice,
        profitPercent,
      };
    }

    // Partial profit target
    const partialTarget = config.profitTargetPercent * (config.partialExitPercent / 100);
    if (profitPercent >= partialTarget && !position.partialExitTaken) {
      return {
        symbol: position.symbol,
        positionId: position._id,
        strategy: 'PROFIT_TARGET',
        shouldExit: true,
        confidence: 80,
        reason: `Partial profit target reached: ${profitPercent.toFixed(2)}% (target: ${partialTarget.toFixed(1)}%)`,
        currentPrice,
        profitPercent,
      };
    }

    return this.createNoExitSignal(position, 'Profit target not reached', currentPrice, profitPercent);
  }

  /**
   * Check stop loss exit
   */
  private async checkStopLoss(
    position: any,
    currentPrice: number,
    profitPercent: number,
    config: ExitConfig
  ): Promise<ExitSignal> {
    if (profitPercent <= -config.stopLossPercent) {
      return {
        symbol: position.symbol,
        positionId: position._id,
        strategy: 'STOP_LOSS',
        shouldExit: true,
        confidence: 100,
        reason: `Stop loss triggered: ${profitPercent.toFixed(2)}% (limit: -${config.stopLossPercent}%)`,
        currentPrice,
        profitPercent,
      };
    }

    return this.createNoExitSignal(position, 'Stop loss not triggered', currentPrice, profitPercent);
  }

  /**
   * Check time-based exit
   */
  private async checkTimeBasedExit(position: any, config: ExitConfig): Promise<ExitSignal> {
    const entryDate = new Date(position.entryDate);
    const now = new Date();
    const daysHeld = (now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysHeld >= config.maxHoldingDays) {
      const currentPrice = await this.getCurrentPrice(position.symbol);
      const profitPercent = currentPrice
        ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
        : 0;

      return {
        symbol: position.symbol,
        positionId: position._id,
        strategy: 'TIME_BASED',
        shouldExit: true,
        confidence: 70,
        reason: `Max holding period exceeded: ${daysHeld.toFixed(1)} days (limit: ${config.maxHoldingDays} days)`,
        currentPrice: currentPrice || position.entryPrice,
        profitPercent,
      };
    }

    return this.createNoExitSignal(position, 'Time limit not reached');
  }

  /**
   * Check signal reversal exit
   */
  private async checkSignalReversal(position: any, config: ExitConfig): Promise<ExitSignal> {
    if (!config.useSignalReversal) {
      return this.createNoExitSignal(position, 'Signal reversal disabled');
    }

    try {
      // Get multi-timeframe analysis
      const analysis = await multiTimeframeAnalysis.analyze(position.symbol);

      // Check for opposite signal
      const isLongPosition = position.side === 'LONG';
      const hasReversal = isLongPosition
        ? analysis.recommendation === 'STRONG_SELL' || analysis.recommendation === 'SELL'
        : analysis.recommendation === 'STRONG_BUY' || analysis.recommendation === 'BUY';

      if (hasReversal && analysis.confidence >= 60) {
        const currentPrice = await this.getCurrentPrice(position.symbol);
        const profitPercent = currentPrice
          ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
          : 0;

        return {
          symbol: position.symbol,
          positionId: position._id,
          strategy: 'SIGNAL_REVERSAL',
          shouldExit: true,
          confidence: analysis.confidence,
          reason: `Signal reversal detected: ${analysis.recommendation} (confidence: ${analysis.confidence}%)`,
          currentPrice: currentPrice || position.entryPrice,
          profitPercent,
        };
      }

      return this.createNoExitSignal(position, 'No signal reversal');

    } catch (error) {
      console.error(`[ExitStrategies] Error checking signal reversal for ${position.symbol}:`, error);
      return this.createNoExitSignal(position, 'Error checking signal reversal');
    }
  }

  /**
   * Create a no-exit signal
   */
  private createNoExitSignal(
    position: any,
    reason: string,
    currentPrice?: number,
    profitPercent?: number
  ): ExitSignal {
    return {
      symbol: position.symbol,
      positionId: position._id,
      strategy: 'PROFIT_TARGET',
      shouldExit: false,
      confidence: 0,
      reason,
      currentPrice: currentPrice || position.entryPrice,
      profitPercent: profitPercent || 0,
    };
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
      console.error(`[ExitStrategies] Error getting price for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Monitor all open positions and execute exits
   */
  async monitorPositions(): Promise<void> {
    try {
      const response = await fetch('http://localhost:3000/api/positions?status=OPEN');
      const data = await response.json();
      const positions = data.positions || [];

      console.log(`[ExitStrategies] Monitoring ${positions.length} open positions...`);

      for (const position of positions) {
        const exitSignal = await this.evaluateExit(position);

        if (exitSignal.shouldExit) {
          await this.executeExit(position, exitSignal);
        }
      }

    } catch (error) {
      console.error('[ExitStrategies] Error monitoring positions:', error);
    }
  }

  /**
   * Execute exit for a position
   */
  private async executeExit(position: any, signal: ExitSignal): Promise<void> {
    try {
      console.log(`[ExitStrategies] Executing exit for ${position.symbol} - ${signal.reason}`);

      // Determine if partial or full exit
      const isPartialExit = signal.reason.includes('Partial') && !position.partialExitTaken;

      if (isPartialExit) {
        // Execute partial exit (50% of position)
        await fetch('http://localhost:3000/api/queue/partial-exit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            positionId: position._id,
            exitPercent: 50,
            reason: signal.reason,
            priority: 'NORMAL',
          }),
        });

        console.log(`[ExitStrategies] ✅ Partial exit queued for ${position.symbol}`);

      } else {
        // Execute full exit
        await fetch('http://localhost:3000/api/queue/close-position', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            positionId: position._id,
            reason: signal.strategy,
            priority: signal.strategy === 'STOP_LOSS' ? 'HIGH' : 'NORMAL',
          }),
        });

        console.log(`[ExitStrategies] ✅ Full exit queued for ${position.symbol}`);
      }

    } catch (error) {
      console.error(`[ExitStrategies] Error executing exit for ${position.symbol}:`, error);
    }
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(intervalMs: number = 30000): NodeJS.Timeout {
    console.log(`[ExitStrategies] Starting exit monitoring (interval: ${intervalMs}ms)...`);

    return setInterval(async () => {
      await this.monitorPositions();
    }, intervalMs);
  }
}

// Singleton instance
export const exitStrategies = new ExitStrategies();
