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
import lossLimitService from '../lossLimitService';
import positionReconciliationService from '../positionReconciliationService';
import exchangeInfoCache from '../exchangeInfoCache';

export class TradingEngine {
  private scanIntervals: Map<string, NodeJS.Timeout> = new Map();
  private runningScans: Set<string> = new Set(); // Track active scan cycles

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

      // Initialize exchange info cache
      console.log('[TradingEngine] Initializing exchange info cache...');
      await exchangeInfoCache.refresh();

      // Run position reconciliation on startup
      console.log('[TradingEngine] Running position reconciliation...');
      const reconciliationResult = await positionReconciliationService.reconcile(userId);
      console.log('[TradingEngine] Reconciliation complete:', {
        matched: reconciliationResult.matched,
        fixed: reconciliationResult.fixed,
        errors: reconciliationResult.errors.length,
      });

      // Start self-scheduling scan loop (prevents overlaps)
      const scheduleNextScan = async () => {
        const userKey = userId.toString();
        
        // Check if already running
        if (this.runningScans.has(userKey)) {
          console.log('[TradingEngine] Scan cycle still running, skipping...');
          return;
        }
        
        this.runningScans.add(userKey);
        
        try {
          await this.executeScanCycle(userId);
        } catch (error) {
          console.error('[TradingEngine] Scan cycle error:', error);
        } finally {
          this.runningScans.delete(userKey);
          
          // Check if engine is still supposed to be running
          const currentState = await BotState.findOne({ userId });
          if (currentState?.isRunning) {
            // Schedule next scan
            const currentConfig = await BotConfig.findOne({ userId });
            const refreshMs = currentConfig?.scanner?.refresh_ms ?? 50000;
            const timeout = setTimeout(scheduleNextScan, refreshMs);
            this.scanIntervals.set(userKey, timeout);
          }
        }
      };
      
      // Start first scan immediately
      setTimeout(scheduleNextScan, 0);
      
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

      const userKey = userId.toString();
      
      // Clear timeout
      const timeout = this.scanIntervals.get(userKey);
      if (timeout) {
        clearTimeout(timeout);
        this.scanIntervals.delete(userKey);
      }
      
      // Remove from running scans
      this.runningScans.delete(userKey);

      // Update state
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
      // Note: Reserve levels are checked when placing orders via reserveManager.checkAvailableCapital()

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

      // Step 2.5: Check loss limits
      const tradingAllowed = await lossLimitService.enforceLossLimits(userId);
      if (!tradingAllowed) {
        console.log('[TradingEngine] Loss limit reached - halting trading');
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

      // Use existing equity from BotState
      // The equity should be synced manually using the balance sync script
      // or updated when Binance API credentials are configured
      let baseEquity = state.equity || 7000; // Use existing equity as fallback
      
      // Only attempt to sync from Binance if API is properly configured
      if (binanceService.isConfigured()) {
        try {
          const accountInfo = await binanceService.getAccountInfo();
          
          // Calculate total portfolio value in USD
          let totalValue = 0;
          
          for (const balance of accountInfo.balances) {
            const free = parseFloat(balance.free);
            const locked = parseFloat(balance.locked);
            const total = free + locked;
            
            if (total > 0) {
              if (balance.asset === 'USD' || balance.asset === 'USDT' || balance.asset === 'USDC') {
                // Stablecoins count as 1:1 USD
                totalValue += total;
              } else {
                // For other assets, get current price and convert to USD
                // Try multiple quote currencies: USDT, USD, USDC
                let priceFound = false;
                for (const quote of ['USDT', 'USD', 'USDC']) {
                  try {
                    const symbol = `${balance.asset}${quote}`;
                    const ticker = await binanceService.getTickerPrice(symbol);
                    if (ticker && ticker.price) {
                      totalValue += total * parseFloat(ticker.price);
                      priceFound = true;
                      break;
                    }
                  } catch (priceError) {
                    // Try next quote currency
                    continue;
                  }
                }
                if (!priceFound) {
                  console.debug(`[TradingEngine] Could not get price for ${balance.asset}`);
                }
              }
            }
          }
          
          if (totalValue > 0) {
            // Only use the calculated value if it's reasonable (at least 80% of existing equity)
            // This prevents incorrect valuations when price lookups fail
            const minExpectedEquity = (state.equity || 0) * 0.8;
            if (totalValue >= minExpectedEquity || !state.equity) {
              baseEquity = totalValue;
              console.log(`[TradingEngine] Synced base equity from Binance API: $${baseEquity.toFixed(2)}`);
            } else {
              console.warn(`[TradingEngine] Calculated equity ($${totalValue.toFixed(2)}) is much lower than existing ($${state.equity.toFixed(2)}), keeping existing value`);
              console.warn(`[TradingEngine] This usually means price lookups failed for crypto assets`);
              // Keep existing baseEquity
            }
          } else {
            console.log(`[TradingEngine] Binance API returned 0, using existing equity: $${baseEquity.toFixed(2)}`);
          }
        } catch (error) {
          console.log(`[TradingEngine] Could not sync from Binance API, using existing equity: $${baseEquity.toFixed(2)}`);
        }
      } else {
        // API not configured - this is normal, equity should be synced manually
        console.log(`[TradingEngine] Using existing equity (Binance API not configured): $${baseEquity.toFixed(2)}`);
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
