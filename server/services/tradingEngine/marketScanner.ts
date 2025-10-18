import { Types } from 'mongoose';
import binanceService from '../binanceService';
import BotConfig from '../../models/BotConfig';
import BotState from '../../models/BotState';

export interface MarketData {
  symbol: string;
  price: number;
  volume24h: number;
  spreadBps: number;
  bidPrice: number;
  askPrice: number;
  atr: number;
  vwap: number;
  passesGates: boolean;
  gateFailures: string[];
}

export class MarketScanner {
  /**
   * Scan all configured pairs and collect market data
   */
  async scanMarkets(userId: Types.ObjectId): Promise<MarketData[]> {
    try {
      console.log('[MarketScanner] Starting market scan');

      const config = await BotConfig.findOne({ userId });
      if (!config) {
        throw new Error('Bot configuration not found');
      }

      const state = await BotState.findOne({ userId });
      if (!state) {
        throw new Error('Bot state not found');
      }

      const pairs = config.scanner.pairs;
      console.log(`[MarketScanner] Scanning ${pairs.length} pairs: ${pairs.join(', ')}`);

      const marketDataPromises = pairs.map(symbol =>
        this.getMarketData(symbol, config)
      );

      const marketDataResults = await Promise.allSettled(marketDataPromises);
      const marketData: MarketData[] = [];

      marketDataResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          marketData.push(result.value);
          // Update state with latest market data
          state.marketData.set(pairs[index], {
            price: result.value.price,
            volume24h: result.value.volume24h,
            spreadBps: result.value.spreadBps,
            atr: result.value.atr,
            vwap: result.value.vwap,
            lastUpdate: new Date(),
          });
        } else {
          console.error(`[MarketScanner] Failed to fetch data for ${pairs[index]}:`, result.reason);
        }
      });

      // Save updated state
      state.lastScanTimestamp = new Date();
      await state.save();

      console.log(`[MarketScanner] Scan complete - ${marketData.length}/${pairs.length} pairs successful`);
      return marketData;
    } catch (error) {
      console.error('[MarketScanner] Error during market scan:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive market data for a single symbol
   */
  private async getMarketData(
    symbol: string,
    config: typeof BotConfig.prototype
  ): Promise<MarketData> {
    try {
      // Fetch ticker data
      const ticker = await binanceService.getTicker(symbol);

      const price = parseFloat(ticker.lastPrice);
      const volume24h = parseFloat(ticker.quoteVolume);
      const bidPrice = parseFloat(ticker.bidPrice);
      const askPrice = parseFloat(ticker.askPrice);

      // Calculate spread
      const spread = askPrice - bidPrice;
      const spreadBps = (spread / price) * 10000;

      // Fetch klines for ATR calculation (15m bars, 100 bars)
      const klines = await binanceService.getKlines(symbol, '15m', 100);
      const atr = binanceService.calculateATR(klines, 14);

      // Calculate VWAP from today's klines
      const todayKlines = await binanceService.getKlines(symbol, '15m', 28); // ~7 hours of data
      const vwap = binanceService.calculateVWAP(todayKlines);

      // Run quality gates
      const gateFailures: string[] = [];
      let passesGates = true;

      // Gate 1: 24h volume
      if (volume24h < config.scanner.min_volume_usd_24h) {
        gateFailures.push(`Volume $${volume24h.toFixed(0)} < $${config.scanner.min_volume_usd_24h}`);
        passesGates = false;
      }

      // Gate 2: Spread
      if (spreadBps > config.scanner.max_spread_bps) {
        gateFailures.push(`Spread ${spreadBps.toFixed(2)} bps > ${config.scanner.max_spread_bps} bps`);
        passesGates = false;
      }

      // Gate 3: Top-of-book depth (simplified check)
      const bidQty = parseFloat(ticker.bidQty);
      const askQty = parseFloat(ticker.askQty);
      const bidDepthUsd = bidQty * bidPrice;
      const askDepthUsd = askQty * askPrice;
      const minDepth = Math.min(bidDepthUsd, askDepthUsd);

      if (minDepth < config.scanner.tob_min_depth_usd) {
        gateFailures.push(`TOB depth $${minDepth.toFixed(0)} < $${config.scanner.tob_min_depth_usd}`);
        passesGates = false;
      }

      if (passesGates) {
        console.log(`[MarketScanner] ${symbol} - PASS (Price: $${price.toFixed(2)}, Vol: $${(volume24h / 1e6).toFixed(2)}M, Spread: ${spreadBps.toFixed(2)} bps, ATR: $${atr.toFixed(2)})`);
      } else {
        console.log(`[MarketScanner] ${symbol} - FAIL: ${gateFailures.join(', ')}`);
      }

      return {
        symbol,
        price,
        volume24h,
        spreadBps,
        bidPrice,
        askPrice,
        atr,
        vwap,
        passesGates,
        gateFailures,
      };
    } catch (error) {
      console.error(`[MarketScanner] Error fetching market data for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Check if enough time has passed since last signal for a pair
   */
  async checkSignalCooldown(
    userId: Types.ObjectId,
    symbol: string,
    cooldownMinutes: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const state = await BotState.findOne({ userId });
      if (!state) {
        return { allowed: true };
      }

      const lastSignalTime = state.lastPairSignalTimes.get(symbol);
      if (!lastSignalTime) {
        return { allowed: true };
      }

      const now = new Date();
      const timeSinceLastSignal = (now.getTime() - lastSignalTime.getTime()) / 1000 / 60; // minutes

      if (timeSinceLastSignal < cooldownMinutes) {
        const remainingTime = Math.ceil(cooldownMinutes - timeSinceLastSignal);
        return {
          allowed: false,
          reason: `Signal cooldown: ${remainingTime} minutes remaining`,
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('[MarketScanner] Error checking signal cooldown:', error);
      return { allowed: true }; // Fail open
    }
  }

  /**
   * Update last signal time for a pair
   */
  async updateLastSignalTime(userId: Types.ObjectId, symbol: string): Promise<void> {
    try {
      const state = await BotState.findOne({ userId });
      if (!state) {
        return;
      }

      state.lastPairSignalTimes.set(symbol, new Date());
      await state.save();
    } catch (error) {
      console.error('[MarketScanner] Error updating last signal time:', error);
    }
  }
}

export default new MarketScanner();
