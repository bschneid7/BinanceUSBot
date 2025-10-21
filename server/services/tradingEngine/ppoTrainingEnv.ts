import * as tf from '@tensorflow/tfjs-node';
import binanceService from '../binanceService';
import historicalDataService from '../historicalDataService';
import logger from '../../utils/logger';

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Position {
  side: 'LONG' | 'SHORT' | null;
  entryPrice: number;
  quantity: number;
  entryTime: number;
}

interface TrainingState {
  // Market features (normalized)
  prices: number[]; // Last 20 candles (close prices)
  returns: number[]; // Last 20 returns
  volumes: number[]; // Last 20 volumes (normalized)
  rsi: number;
  macd: number;
  macdSignal: number;
  
  // Position features
  hasPosition: number; // 0 or 1
  positionSide: number; // -1 (SHORT), 0 (NONE), 1 (LONG)
  positionPnL: number; // Unrealized PnL (normalized)
  positionDuration: number; // Time in position (normalized)
  
  // Account features
  equity: number; // Normalized
  drawdown: number; // Current drawdown from peak
}

/**
 * PPO Training Environment for cryptocurrency trading
 * Implements a gym-like interface for reinforcement learning
 */
export class PPOTrainingEnvironment {
  private candles: Candle[] = [];
  private currentIndex: number = 0;
  private initialEquity: number = 10000;
  private equity: number = 10000;
  private peakEquity: number = 10000;
  private position: Position | null = null;
  private episodeReward: number = 0;
  private episodeSteps: number = 0;
  private maxSteps: number = 1000;
  
  // Hyperparameters
  private feeRate: number = 0.00075; // 0.075% with BNB discount
  private lookbackPeriod: number = 20;
  
  /**
   * Load historical data for training
   */
  async loadHistoricalData(
    symbol: string,
    startDate: Date,
    endDate: Date,
    interval: string = '1h'
  ): Promise<void> {
    logger.info(`[PPO Env] Loading historical data for ${symbol}...`);
    
    // Use Historical Data Service for faster, offline training
    this.candles = await historicalDataService.getCandles(symbol, interval, startDate, endDate);
    
    // If no cached data, download from Binance.US
    if (this.candles.length === 0) {
      logger.info('[PPO Env] No cached data, downloading from Binance.US...');
      this.candles = await historicalDataService.downloadDailyRange({
        symbol,
        interval,
        startDate,
        endDate,
      });
    }
    
    logger.info(`[PPO Env] Loaded ${this.candles.length} candles`);
  }
  
  /**
   * Reset the environment for a new episode
   */
  reset(): TrainingState {
    // Start at a random point in the data (but leave room for lookback and episode length)
    const minStart = this.lookbackPeriod;
    const maxStart = this.candles.length - this.maxSteps - 1;
    this.currentIndex = Math.floor(Math.random() * (maxStart - minStart)) + minStart;
    
    // Reset account state
    this.equity = this.initialEquity;
    this.peakEquity = this.initialEquity;
    this.position = null;
    this.episodeReward = 0;
    this.episodeSteps = 0;
    
    return this.getState();
  }
  
  /**
   * Take an action in the environment
   * Actions: 0 = HOLD, 1 = BUY (LONG), 2 = SELL (SHORT), 3 = CLOSE
   */
  step(action: number): { state: TrainingState; reward: number; done: boolean; info: any } {
    const currentCandle = this.candles[this.currentIndex];
    const currentPrice = currentCandle.close;
    
    let reward = 0;
    let info: any = { action: this.getActionName(action) };
    
    // Execute action
    if (action === 1 && !this.position) {
      // BUY (open LONG position)
      const positionSize = this.equity * 0.95; // Use 95% of equity
      const quantity = positionSize / currentPrice;
      const fees = positionSize * this.feeRate;
      
      this.position = {
        side: 'LONG',
        entryPrice: currentPrice,
        quantity,
        entryTime: currentCandle.timestamp,
      };
      
      this.equity -= fees;
      info.fees = fees;
      
    } else if (action === 2 && !this.position) {
      // SELL (open SHORT position)
      const positionSize = this.equity * 0.95;
      const quantity = positionSize / currentPrice;
      const fees = positionSize * this.feeRate;
      
      this.position = {
        side: 'SHORT',
        entryPrice: currentPrice,
        quantity,
        entryTime: currentCandle.timestamp,
      };
      
      this.equity -= fees;
      info.fees = fees;
      
    } else if (action === 3 && this.position) {
      // CLOSE position
      const pnl = this.calculatePnL(currentPrice);
      const positionValue = currentPrice * this.position.quantity;
      const fees = positionValue * this.feeRate;
      
      this.equity += pnl - fees;
      
      // Reward is the PnL as percentage of initial equity
      reward = (pnl / this.initialEquity) * 100;
      
      info.pnl = pnl;
      info.fees = fees;
      info.holdTime = currentCandle.timestamp - this.position.entryTime;
      
      this.position = null;
    }
    
    // Calculate unrealized PnL if holding position
    if (this.position) {
      const unrealizedPnL = this.calculatePnL(currentPrice);
      info.unrealizedPnL = unrealizedPnL;
      
      // Small negative reward for holding (encourages action)
      reward -= 0.01;
      
      // Penalty for large unrealized losses
      if (unrealizedPnL < -this.initialEquity * 0.02) {
        reward -= 1.0;
      }
    }
    
    // Update peak equity and calculate drawdown
    const totalEquity = this.getTotalEquity(currentPrice);
    if (totalEquity > this.peakEquity) {
      this.peakEquity = totalEquity;
    }
    const drawdown = (this.peakEquity - totalEquity) / this.peakEquity;
    
    // Penalty for drawdown
    if (drawdown > 0.05) {
      reward -= drawdown * 10;
    }
    
    // Move to next candle
    this.currentIndex++;
    this.episodeSteps++;
    this.episodeReward += reward;
    
    // Check if episode is done
    const done = this.currentIndex >= this.candles.length - 1 || 
                 this.episodeSteps >= this.maxSteps ||
                 totalEquity < this.initialEquity * 0.5; // Stop if lost 50%
    
    if (done) {
      // Close any open position at the end
      if (this.position) {
        const finalPnL = this.calculatePnL(currentPrice);
        this.equity += finalPnL;
        reward += (finalPnL / this.initialEquity) * 100;
      }
      
      info.finalEquity = this.equity;
      info.totalReturn = ((this.equity - this.initialEquity) / this.initialEquity) * 100;
      info.episodeReward = this.episodeReward;
    }
    
    const state = this.getState();
    
    return { state, reward, done, info };
  }
  
  /**
   * Get the current state observation
   */
  private getState(): TrainingState {
    const lookbackCandles = this.candles.slice(
      Math.max(0, this.currentIndex - this.lookbackPeriod),
      this.currentIndex + 1
    );
    
    const currentCandle = this.candles[this.currentIndex];
    const currentPrice = currentCandle.close;
    
    // Calculate price features
    const prices = lookbackCandles.map(c => c.close);
    const normalizedPrices = this.normalize(prices);
    
    // Calculate returns
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    while (returns.length < this.lookbackPeriod) returns.unshift(0);
    
    // Calculate volumes
    const volumes = lookbackCandles.map(c => c.volume);
    const normalizedVolumes = this.normalize(volumes);
    
    // Calculate technical indicators
    const rsi = this.calculateRSI(prices);
    const { macd, signal } = this.calculateMACD(prices);
    
    // Position features
    const hasPosition = this.position ? 1 : 0;
    const positionSide = this.position ? (this.position.side === 'LONG' ? 1 : -1) : 0;
    const positionPnL = this.position ? this.calculatePnL(currentPrice) / this.initialEquity : 0;
    const positionDuration = this.position ? 
      (currentCandle.timestamp - this.position.entryTime) / (1000 * 60 * 60 * 24) : 0; // Days
    
    // Account features
    const totalEquity = this.getTotalEquity(currentPrice);
    const normalizedEquity = (totalEquity - this.initialEquity) / this.initialEquity;
    const drawdown = (this.peakEquity - totalEquity) / this.peakEquity;
    
    return {
      prices: normalizedPrices,
      returns,
      volumes: normalizedVolumes,
      rsi: rsi / 100, // Normalize to [0, 1]
      macd,
      macdSignal: signal,
      hasPosition,
      positionSide,
      positionPnL,
      positionDuration: Math.min(positionDuration / 7, 1), // Normalize to ~1 week
      equity: normalizedEquity,
      drawdown,
    };
  }
  
  /**
   * Calculate unrealized PnL for current position
   */
  private calculatePnL(currentPrice: number): number {
    if (!this.position) return 0;
    
    if (this.position.side === 'LONG') {
      return (currentPrice - this.position.entryPrice) * this.position.quantity;
    } else {
      return (this.position.entryPrice - currentPrice) * this.position.quantity;
    }
  }
  
  /**
   * Get total equity (cash + unrealized PnL)
   */
  private getTotalEquity(currentPrice: number): number {
    return this.equity + this.calculatePnL(currentPrice);
  }
  
  /**
   * Normalize array to [-1, 1] range
   */
  private normalize(values: number[]): number[] {
    if (values.length === 0) return [];
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    
    if (range === 0) return values.map(() => 0);
    
    return values.map(v => 2 * (v - min) / range - 1);
  }
  
  /**
   * Calculate RSI (Relative Strength Index)
   */
  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50; // Neutral
    
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }
    
    const recentChanges = changes.slice(-period);
    const gains = recentChanges.filter(c => c > 0);
    const losses = recentChanges.filter(c => c < 0).map(c => Math.abs(c));
    
    const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
  
  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   */
  private calculateMACD(prices: number[]): { macd: number; signal: number } {
    if (prices.length < 26) return { macd: 0, signal: 0 };
    
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macd = ema12 - ema26;
    
    // For simplicity, use a simple moving average for signal line
    const signal = macd * 0.9; // Approximation
    
    // Normalize
    const avgPrice = prices[prices.length - 1];
    return {
      macd: macd / avgPrice,
      signal: signal / avgPrice,
    };
  }
  
  /**
   * Calculate Exponential Moving Average
   */
  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];
    
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }
  
  /**
   * Get action name for logging
   */
  private getActionName(action: number): string {
    const names = ['HOLD', 'BUY_LONG', 'SELL_SHORT', 'CLOSE'];
    return names[action] || 'UNKNOWN';
  }
  
  /**
   * Get state shape for model building
   */
  static getStateShape(): number[] {
    return [
      20, // prices
      20, // returns
      20, // volumes
      1,  // rsi
      1,  // macd
      1,  // macdSignal
      1,  // hasPosition
      1,  // positionSide
      1,  // positionPnL
      1,  // positionDuration
      1,  // equity
      1,  // drawdown
    ];
  }
  
  /**
   * Get total state dimension
   */
  static getStateDimension(): number {
    return 20 + 20 + 20 + 12; // 72 features total
  }
  
  /**
   * Get number of possible actions
   */
  static getActionSpace(): number {
    return 4; // HOLD, BUY_LONG, SELL_SHORT, CLOSE
  }
  
  /**
   * Convert state object to tensor
   */
  static stateToTensor(state: TrainingState): tf.Tensor2D {
    const features = [
      ...state.prices,
      ...state.returns,
      ...state.volumes,
      state.rsi,
      state.macd,
      state.macdSignal,
      state.hasPosition,
      state.positionSide,
      state.positionPnL,
      state.positionDuration,
      state.equity,
      state.drawdown,
    ];
    
    return tf.tensor2d([features], [1, features.length]);
  }
}

export default PPOTrainingEnvironment;

