import { Types } from 'mongoose';
import BotConfig from '../../models/BotConfig';
import BotState from '../../models/BotState';
import Signal from '../../models/Signal';
import { MarketData } from './marketScanner';
import binanceService from '../binanceService';

export interface TradingSignal {
  symbol: string;
  playbook: 'A' | 'B' | 'C' | 'D';
  action: 'BUY' | 'SELL';
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  quantity?: number;
  reason: string;
  isEvent?: boolean;
}

export class SignalGenerator {
  /**
   * Generate signals from all enabled playbooks
   */
  async generateSignals(
    userId: Types.ObjectId,
    marketDataArray: MarketData[]
  ): Promise<TradingSignal[]> {
    try {
      console.log('[SignalGenerator] Generating signals from market data');

      const config = await BotConfig.findOne({ userId });
      if (!config) {
        throw new Error('Bot configuration not found');
      }

      const signals: TradingSignal[] = [];

      // Filter to only symbols that passed gates
      const qualifiedMarkets = marketDataArray.filter(m => m.passesGates);
      console.log(`[SignalGenerator] ${qualifiedMarkets.length} markets passed quality gates`);

      // Run each playbook
      for (const market of qualifiedMarkets) {
        // Playbook A: Breakout Trend
        if (config.playbook_A.enable) {
          const signalA = await this.checkPlaybookA(userId, market, config);
          if (signalA) signals.push(signalA);
        }

        // Playbook B: VWAP Mean-Revert
        if (config.playbook_B.enable) {
          const signalB = await this.checkPlaybookB(userId, market, config);
          if (signalB) signals.push(signalB);
        }

        // Playbook C: Event Burst
        if (config.playbook_C.enable) {
          const signalC = await this.checkPlaybookC(userId, market, config);
          if (signalC) signals.push(signalC);
        }

        // Playbook D: Dip Pullback
        if (config.playbook_D.enable) {
          const signalD = await this.checkPlaybookD(userId, market, config);
          if (signalD) signals.push(signalD);
        }
      }

      console.log(`[SignalGenerator] Generated ${signals.length} signals`);
      return signals;
    } catch (error) {
      console.error('[SignalGenerator] Error generating signals:', error);
      throw error;
    }
  }

  /**
   * Playbook A: Breakout Trend
   * Entry: Price breaks PDH or 20-session high with volume confirmation
   */
  private async checkPlaybookA(
    userId: Types.ObjectId,
    market: MarketData,
    config: typeof BotConfig.prototype
  ): Promise<TradingSignal | null> {
    try {
      const { symbol, price, atr } = market;

      // Fetch 1h klines for structure check (24 bars = 1 day)
      const klines1h = await binanceService.getKlines(symbol, '1h', 24);
      if (klines1h.length < 20) return null;

      // Get 15m klines for entry and volume check
      const klines15m = await binanceService.getKlines(symbol, '15m', 50);
      if (klines15m.length < 20) return null;

      // Calculate 20-session high (using 1h data)
      const high20 = Math.max(...klines1h.slice(-20).map(k => parseFloat(k.high)));

      // Calculate prior day high (PDH) - last 24 1h bars
      const pdh = Math.max(...klines1h.slice(-24).map(k => parseFloat(k.high)));

      // Check if current price is breaking out
      const breakoutLevel = Math.max(high20, pdh);
      const isBreakout = price >= breakoutLevel;

      if (!isBreakout) return null;

      // Volume confirmation: current volume vs 20-bar average
      const recentVolumes = klines15m.slice(-20).map(k => parseFloat(k.volume));
      const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
      const currentVolume = parseFloat(klines15m[klines15m.length - 1].volume);
      const volumeMultiple = currentVolume / avgVolume;

      if (volumeMultiple < config.playbook_A.volume_mult) {
        console.log(`[PlaybookA] ${symbol} - Volume ${volumeMultiple.toFixed(2)}x < ${config.playbook_A.volume_mult}x required`);
        return null;
      }

      // Calculate stop price: 1.2 × ATR below breakout level
      const stopDistance = config.playbook_A.stop_atr_mult * atr;
      const stopPrice = breakoutLevel - stopDistance;

      console.log(`[PlaybookA] ${symbol} - SIGNAL: Breakout at $${price.toFixed(2)}, PDH: $${pdh.toFixed(2)}, High20: $${high20.toFixed(2)}, Volume: ${volumeMultiple.toFixed(2)}x, Stop: $${stopPrice.toFixed(2)}`);

      return {
        symbol,
        playbook: 'A',
        action: 'BUY',
        entryPrice: price,
        stopPrice,
        reason: `Breakout above ${breakoutLevel === pdh ? 'PDH' : '20-session high'} at $${breakoutLevel.toFixed(2)} with ${volumeMultiple.toFixed(2)}x volume`,
      };
    } catch (error) {
      console.error(`[PlaybookA] Error checking ${market.symbol}:`, error);
      return null;
    }
  }

  /**
   * Playbook B: VWAP Mean-Revert
   * Entry: Price deviation >= 2 ATR from VWAP with reversal pattern
   */
  private async checkPlaybookB(
    userId: Types.ObjectId,
    market: MarketData,
    config: typeof BotConfig.prototype
  ): Promise<TradingSignal | null> {
    try {
      const { symbol, price, vwap, atr } = market;

      // Check session trade count for this playbook
      const state = await BotState.findOne({ userId });
      if (!state) return null;

      const sessionKey = `${symbol}_B`;
      const sessionCount = state.playbookBCounters.get(sessionKey) || 0;
      if (sessionCount >= config.playbook_B.max_trades_per_session) {
        console.log(`[PlaybookB] ${symbol} - Session limit reached (${sessionCount}/${config.playbook_B.max_trades_per_session})`);
        return null;
      }

      // Calculate deviation from VWAP
      const deviation = Math.abs(price - vwap);
      const deviationInATR = deviation / atr;

      if (deviationInATR < config.playbook_B.deviation_atr_mult) {
        return null;
      }

      // Determine direction (fade to VWAP)
      const direction = price > vwap ? 'SELL' : 'BUY';

      // Fetch recent klines to check for reversal pattern
      const klines15m = await binanceService.getKlines(symbol, '15m', 10);
      const lastKline = klines15m[klines15m.length - 1];
      const close = parseFloat(lastKline.close);
      const open = parseFloat(lastKline.open);
      const high = parseFloat(lastKline.high);
      const low = parseFloat(lastKline.low);

      // Simple reversal pattern detection
      let hasReversalPattern = false;

      // Hammer pattern (for oversold bounce)
      if (direction === 'BUY') {
        const bodySize = Math.abs(close - open);
        const lowerWick = Math.min(open, close) - low;
        const upperWick = high - Math.max(open, close);
        if (lowerWick > bodySize * 2 && upperWick < bodySize) {
          hasReversalPattern = true;
        }
      }

      // Shooting star pattern (for overbought fade)
      if (direction === 'SELL') {
        const bodySize = Math.abs(close - open);
        const upperWick = high - Math.max(open, close);
        const lowerWick = Math.min(open, close) - low;
        if (upperWick > bodySize * 2 && lowerWick < bodySize) {
          hasReversalPattern = true;
        }
      }

      if (!hasReversalPattern) {
        console.log(`[PlaybookB] ${symbol} - No reversal pattern detected`);
        return null;
      }

      // Calculate stop price: 0.8 × ATR beyond current price
      const stopDistance = config.playbook_B.stop_atr_mult * atr;
      const stopPrice = direction === 'BUY'
        ? price - stopDistance
        : price + stopDistance;

      // Target is VWAP
      const targetPrice = vwap;

      console.log(`[PlaybookB] ${symbol} - SIGNAL: VWAP fade (${direction}) at $${price.toFixed(2)}, VWAP: $${vwap.toFixed(2)}, Deviation: ${deviationInATR.toFixed(2)} ATR, Target: $${targetPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}`);

      return {
        symbol,
        playbook: 'B',
        action: direction,
        entryPrice: price,
        stopPrice,
        targetPrice,
        reason: `VWAP mean-revert: ${deviationInATR.toFixed(2)} ATR from VWAP with reversal pattern`,
      };
    } catch (error) {
      console.error(`[PlaybookB] Error checking ${market.symbol}:`, error);
      return null;
    }
  }

  /**
   * Playbook C: Event Burst
   * Entry: Impulse move >= 4% in < 10 minutes with retest confirmation
   */
  private async checkPlaybookC(
    userId: Types.ObjectId,
    market: MarketData,
    config: typeof BotConfig.prototype
  ): Promise<TradingSignal | null> {
    try {
      const { symbol, price, atr } = market;

      // Fetch 5m klines for impulse detection
      const klines5m = await binanceService.getKlines(symbol, '5m', 20);
      if (klines5m.length < 10) return null;

      // Look for recent impulse move (last 10 bars = 50 minutes)
      const recentKlines = klines5m.slice(-10);
      const startPrice = parseFloat(recentKlines[0].open);
      const highPrice = Math.max(...recentKlines.map(k => parseFloat(k.high)));
      const lowPrice = Math.min(...recentKlines.map(k => parseFloat(k.low)));

      // Calculate largest move
      const moveUp = ((highPrice - startPrice) / startPrice) * 100;
      const moveDown = ((startPrice - lowPrice) / startPrice) * 100;
      const largestMove = Math.max(moveUp, moveDown);
      const direction = moveUp > moveDown ? 'BUY' : 'SELL';

      // Check if impulse >= 4%
      if (largestMove < 4.0) {
        return null;
      }

      // Check for retest (price should have pulled back from extreme)
      const extremePrice = direction === 'BUY' ? highPrice : lowPrice;
      const pullbackPct = Math.abs((price - extremePrice) / extremePrice) * 100;

      // We want a pullback of at least 0.5% but not more than 2%
      if (pullbackPct < 0.5 || pullbackPct > 2.0) {
        console.log(`[PlaybookC] ${symbol} - Pullback ${pullbackPct.toFixed(2)}% not in range (0.5-2.0%)`);
        return null;
      }

      // Check if price is resuming after retest
      const lastKline = klines5m[klines5m.length - 1];
      const lastClose = parseFloat(lastKline.close);
      const isResuming = direction === 'BUY'
        ? lastClose > parseFloat(klines5m[klines5m.length - 2].close)
        : lastClose < parseFloat(klines5m[klines5m.length - 2].close);

      if (!isResuming) {
        return null;
      }

      // Calculate stop price: 1.8 × ATR (wider for events)
      const stopDistance = config.playbook_C.stop_atr_mult * atr;
      const stopPrice = direction === 'BUY'
        ? price - stopDistance
        : price + stopDistance;

      console.log(`[PlaybookC] ${symbol} - SIGNAL: Event burst (${direction}) - Impulse: ${largestMove.toFixed(2)}%, Pullback: ${pullbackPct.toFixed(2)}%, Entry: $${price.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}`);

      return {
        symbol,
        playbook: 'C',
        action: direction,
        entryPrice: price,
        stopPrice,
        reason: `Event burst: ${largestMove.toFixed(2)}% impulse move with ${pullbackPct.toFixed(2)}% retest`,
        isEvent: true,
      };
    } catch (error) {
      console.error(`[PlaybookC] Error checking ${market.symbol}:`, error);
      return null;
    }
  }

  /**
   * Playbook D: Dip Pullback (Laddered)
   * Entry: Flash crash >= 2σ with breadth confirmation
   */
  private async checkPlaybookD(
    userId: Types.ObjectId,
    market: MarketData,
    config: typeof BotConfig.prototype
  ): Promise<TradingSignal | null> {
    try {
      const { symbol, price, atr } = market;

      // Fetch 15m klines for volatility calculation
      const klines15m = await binanceService.getKlines(symbol, '15m', 50);
      if (klines15m.length < 30) return null;

      // Calculate recent returns
      const returns: number[] = [];
      for (let i = 1; i < klines15m.length; i++) {
        const prevClose = parseFloat(klines15m[i - 1].close);
        const currentClose = parseFloat(klines15m[i].close);
        const ret = (currentClose - prevClose) / prevClose;
        returns.push(ret);
      }

      // Calculate mean and std dev
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);

      // Check last bar return
      const lastReturn = returns[returns.length - 1];
      const sigmaMove = (lastReturn - mean) / stdDev;

      // Trigger: return <= -2σ (flash crash)
      if (sigmaMove > -2.0) {
        return null;
      }

      // Volume surge check
      const recentVolumes = klines15m.slice(-20).map(k => parseFloat(k.volume));
      const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
      const currentVolume = parseFloat(klines15m[klines15m.length - 1].volume);
      const volumeMultiple = currentVolume / avgVolume;

      if (volumeMultiple < 2.0) {
        console.log(`[PlaybookD] ${symbol} - Volume ${volumeMultiple.toFixed(2)}x < 2.0x required`);
        return null;
      }

      // Calculate last swing low (for ladder placement)
      const recentLows = klines15m.slice(-10).map(k => parseFloat(k.low));
      const swingLow = Math.min(...recentLows);

      // Calculate stop price: below first ladder
      const stopDistance = 1.0 * atr;
      const stopPrice = swingLow - stopDistance;

      console.log(`[PlaybookD] ${symbol} - SIGNAL: Dip pullback - ${Math.abs(sigmaMove).toFixed(2)}σ move, Volume: ${volumeMultiple.toFixed(2)}x, Entry: $${price.toFixed(2)}, Swing low: $${swingLow.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}`);

      return {
        symbol,
        playbook: 'D',
        action: 'BUY',
        entryPrice: price,
        stopPrice,
        reason: `Dip pullback: ${Math.abs(sigmaMove).toFixed(2)}σ flash crash with ${volumeMultiple.toFixed(2)}x volume`,
      };
    } catch (error) {
      console.error(`[PlaybookD] Error checking ${market.symbol}:`, error);
      return null;
    }
  }

  /**
   * Record a signal in the database
   */
  async recordSignal(
    userId: Types.ObjectId,
    signal: TradingSignal,
    action: 'EXECUTED' | 'SKIPPED',
    reason?: string
  ): Promise<void> {
    try {
      await Signal.create({
        userId,
        symbol: signal.symbol,
        playbook: signal.playbook,
        action,
        reason: reason || signal.reason,
        entry_price: action === 'EXECUTED' ? signal.entryPrice : undefined,
        timestamp: new Date(),
      });

      console.log(`[SignalGenerator] Recorded signal: ${signal.symbol} ${signal.playbook} - ${action}`);
    } catch (error) {
      console.error('[SignalGenerator] Error recording signal:', error);
    }
  }
}

export default new SignalGenerator();
