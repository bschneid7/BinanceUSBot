import { Types } from 'mongoose';
import BotConfig from '../../models/BotConfig';
import BotState from '../../models/BotState';
import Position from '../../models/Position';
import marketScanner from './marketScanner';
import mlEnhancedSignalGenerator from './mlEnhancedSignalGenerator';
import riskEngine from './riskEngine';
import executionRouter from './executionRouter';
import positionManager from './positionManager';
import reserveManager from './reserveManager';
import killSwitch from './killSwitch';
import binanceService from '../binanceService';

export class TradingEngine {
  private scanIntervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Start the trading engine for a user
   */
  async start(userId: Types.ObjectId): Promise<void> {
    try {
      console.log(`[TradingEngine] Starting engine for user ${userId}`);

      // Check if scan interval is already active
      const userIdStr = userId.toString();
      if (this.scanIntervals.has(userIdStr)) {
        console.log('[TradingEngine] Engine already running (scan interval active)');
        return;
      }

      // Get or create state
      const state = await BotState.findOne({ userId });

      // Initialize or update state
      let botState = state;
      if (!botState) {
        botState = await BotState.create({
          userId,
          isRunning: true,
          equity: 7000,
          currentR: 42,
          dailyPnl: 0,
          dailyPnlR: 0,
          weeklyPnl: 0,
          weeklyPnlR: 0,
        });
      } else {
        botState.isRunning = true;
        await botState.save();
      }

      // Get config
      const config = await BotConfig.findOne({ userId });
      if (!config) {
        throw new Error('Bot configuration not found');
      }

      // Start scan loop
      const scanInterval = setInterval(async () => {
        await this.executeScanCycle(userId);
      }, config.scanner.refresh_ms);

      this.scanIntervals.set(userId.toString(), scanInterval);

      console.log(`[TradingEngine] Engine started - Scanning every ${config.scanner.refresh_ms}ms`);
    } catch (error) {
      console.error('[TradingEngine] Error starting engine:', error);
      throw error;
    }
  }

  /**
   * Stop the trading engine for a user
   */
  async stop(userId: Types.ObjectId): Promise<void> {
    try {
      console.log(`[TradingEngine] Stopping engine for user ${userId}`);

      const interval = this.scanIntervals.get(userId.toString());
      if (interval) {
        clearInterval(interval);
        this.scanIntervals.delete(userId.toString());
      }

      const state = await BotState.findOne({ userId });
      if (state) {
        state.isRunning = false;
        await state.save();
      }

      console.log('[TradingEngine] Engine stopped');
    } catch (error) {
      console.error('[TradingEngine] Error stopping engine:', error);
      throw error;
    }
  }

  /**
   * Execute a single scan cycle
   */
  private async executeScanCycle(userId: Types.ObjectId): Promise<void> {
    try {
      // Check if engine should be running
      const state = await BotState.findOne({ userId });
      if (!state?.isRunning) {
        console.log('[TradingEngine] Engine not running - skipping scan');
        return;
      }

      const config = await BotConfig.findOne({ userId });
      if (!config) {
        console.error('[TradingEngine] Config not found - skipping scan');
        return;
      }

      // Check bot status
      if (config.botStatus !== 'ACTIVE') {
        // Check for auto-resume
        const resumed = await killSwitch.checkAutoResume(userId);
        if (!resumed) {
          console.log(`[TradingEngine] Bot status ${config.botStatus} - skipping scan`);
          return;
        }
      }

      console.log('[TradingEngine] ===== Scan Cycle Start =====');

      // Step 1: Update PnL tracking and recalculate R
      await riskEngine.updatePnLTracking(userId);
      await this.recalculateEquity(userId);
      await reserveManager.updateReserves(userId);

      // Step 2: Check kill-switch
      const killSwitchResult = await riskEngine.checkKillSwitch(userId);
      if (killSwitchResult.shouldHalt) {
        console.log(`[TradingEngine] Kill-switch triggered: ${killSwitchResult.reason}`);
        await killSwitch.execute(
          userId,
          killSwitchResult.haltType!,
          killSwitchResult.reason!
        );
        return;
      }

      // Step 3: Update all open positions
      await positionManager.updateAllPositions(userId);

      // Step 4: Scan markets
      const marketData = await marketScanner.scanMarkets(userId);

      // Step 5: Generate signals
      const signals = await mlEnhancedSignalGenerator.generateSignals(userId, marketData);

      console.log(`[TradingEngine] Generated ${signals.length} signals`);

      // Step 6: Process signals
      for (const signal of signals) {
        await this.processSignal(userId, signal);
      }

      console.log('[TradingEngine] ===== Scan Cycle Complete =====');
    } catch (error) {
      console.error('[TradingEngine] Error in scan cycle:', error);
    }
  }

  /**
   * Process a trading signal
   */
  private async processSignal(
    userId: Types.ObjectId,
    signal: typeof signalGenerator.prototype
  ): Promise<void> {
    try {
      console.log(`[TradingEngine] Processing signal: ${signal.symbol} ${signal.playbook} ${signal.action}`);

      const config = await BotConfig.findOne({ userId });
      const state = await BotState.findOne({ userId });

      if (!config || !state) {
        await signalGenerator.recordSignal(userId, signal, 'SKIPPED', 'Config or state not found');
        return;
      }

      // Check signal cooldown
      const cooldownCheck = await marketScanner.checkSignalCooldown(
        userId,
        signal.symbol,
        config.scanner.pair_signal_cooldown_min
      );

      if (!cooldownCheck.allowed) {
        await signalGenerator.recordSignal(userId, signal, 'SKIPPED', cooldownCheck.reason);
        return;
      }

      // Calculate position size
      const riskAmount = state.currentR;
      let quantity = riskEngine.calculatePositionSize(
        signal.entryPrice,
        signal.stopPrice,
        riskAmount
      );

      // Calculate notional value
      let notional = quantity * signal.entryPrice;

      // Check risk limits
      const riskCheck = await riskEngine.checkRiskLimits(
        userId,
        signal.symbol,
        1.0, // 1R per position
        notional
      );

      if (!riskCheck.approved) {
        await signalGenerator.recordSignal(userId, signal, 'SKIPPED', riskCheck.reason);
        return;
      }

      // Apply correlation guard scaling
      if (riskCheck.maxQuantity) {
        quantity *= riskCheck.maxQuantity;
        notional = quantity * signal.entryPrice;
        console.log(`[TradingEngine] Position scaled down by ${(riskCheck.maxQuantity * 100).toFixed(0)}% due to correlation guard`);
      }

      // Check available capital
      const capitalCheck = await reserveManager.checkAvailableCapital(userId, notional);
      if (!capitalCheck.available) {
        await signalGenerator.recordSignal(userId, signal, 'SKIPPED', capitalCheck.reason);
        return;
      }

      // Execute the signal
      console.log(`[TradingEngine] Executing signal: ${signal.symbol} ${signal.action} ${quantity.toFixed(8)} @ $${signal.entryPrice.toFixed(2)}`);

      const orderResult = await executionRouter.executeSignal(
        userId,
        signal,
        quantity
      );

      if (!orderResult.success) {
        await signalGenerator.recordSignal(userId, signal, 'SKIPPED', orderResult.error);
        return;
      }

      // Create position record
      const position = await positionManager.createPosition(
        userId,
        signal.symbol,
        signal.action === 'BUY' ? 'LONG' : 'SHORT',
        orderResult.fillPrice || signal.entryPrice,
        orderResult.filledQuantity || quantity,
        signal.stopPrice,
        signal.playbook,
        signal.targetPrice
      );

      // Record signal as executed
      await signalGenerator.recordSignal(userId, signal, 'EXECUTED');

      // Update last signal time
      await marketScanner.updateLastSignalTime(userId, signal.symbol);

      console.log(`[TradingEngine] Signal executed successfully - Position ${position._id} created`);
    } catch (error) {
      console.error('[TradingEngine] Error processing signal:', error);
      await signalGenerator.recordSignal(
        userId,
        signal,
        'SKIPPED',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Recalculate equity and R value
   */
  private async recalculateEquity(userId: Types.ObjectId): Promise<void> {
    try {
      const state = await BotState.findOne({ userId });
      const config = await BotConfig.findOne({ userId });

      if (!state || !config) return;

      // Get all positions
      const openPositions = await Position.find({ userId, status: 'OPEN' });

      // Calculate total unrealized PnL
      let totalUnrealizedPnl = 0;
      openPositions.forEach(position => {
        totalUnrealizedPnl += position.unrealized_pnl || 0;
      });

      // Fetch actual account balance from Binance
      let baseEquity = 7000; // Default fallback
      
      if (binanceService.isConfigured()) {
        try {
          const accountInfo = await binanceService.getAccountInfo();
          const usdBalance = accountInfo.balances.find(b => b.asset === 'USD' || b.asset === 'USDT');
          if (usdBalance) {
            baseEquity = parseFloat(usdBalance.free) + parseFloat(usdBalance.locked);
            console.log(`[TradingEngine] Synced base equity from Binance: $${baseEquity.toFixed(2)}`);
          }
        } catch (error) {
          console.warn('[TradingEngine] Could not fetch account balance, using default');
        }
      }

      // Update equity
      state.equity = baseEquity + totalUnrealizedPnl;
      state.currentR = state.equity * config.risk.R_pct;

      await state.save();
    } catch (error) {
      console.error('[TradingEngine] Error recalculating equity:', error);
    }
  }

  /**
   * Get engine status
   */
  async getStatus(userId: Types.ObjectId): Promise<{
    isRunning: boolean;
    lastScanTimestamp?: Date;
    lastSignalTimestamp?: Date;
  }> {
    try {
      const state = await BotState.findOne({ userId });
      return {
        isRunning: state?.isRunning || false,
        lastScanTimestamp: state?.lastScanTimestamp,
        lastSignalTimestamp: state?.lastSignalTimestamp,
      };
    } catch (error) {
      console.error('[TradingEngine] Error getting status:', error);
      return { isRunning: false };
    }
  }
}

export default new TradingEngine();
