import { BinanceService } from './binanceService';
import { Position } from '../models/Position';
import { BotState } from '../models/BotState';

/**
 * State Builder for PPO Agent
 * 
 * Constructs the 17-dimensional state vector that matches train_enhanced_ppo.py
 * 
 * CRITICAL: This must stay in sync with the Python training script
 */
export class StateBuilder {
  private binanceService: BinanceService;
  private priceHistory: Map<string, number[]> = new Map();
  private volumeHistory: Map<string, number[]> = new Map();
  private readonly LOOKBACK_PERIOD = 20;

  constructor(binanceService: BinanceService) {
    this.binanceService = binanceService;
  }

  /**
   * Build 17-dimensional state vector for a symbol
   * 
   * State features (must match train_enhanced_ppo.py):
   * 1. Normalized Price
   * 2. Latest Return
   * 3. Normalized Volume
   * 4. 5-Period Average Return
   * 5. 5-Period Volatility
   * 6. RSI
   * 7. MACD
   * 8. MACD Signal
   * 9. Funding Rate (CDD)
   * 10. Funding Trend (CDD)
   * 11. VWAP Deviation (CDD)
   * 12. Order Flow Imbalance (CDD)
   * 13. Correlation Score (CDD)
   * 14. Has Position
   * 15. Position PnL
   * 16. Normalized Equity
   * 17. Drawdown
   */
  async buildState(symbol: string): Promise<number[]> {
    try {
      // Get current market data
      const price = await this.binanceService.getPrice(symbol);
      const volume = await this.getVolume(symbol);
      
      // Update history
      this.updateHistory(symbol, price, volume);
      
      // Get price and volume history
      const prices = this.priceHistory.get(symbol) || [price];
      const volumes = this.volumeHistory.get(symbol) || [volume];
      
      // Calculate technical indicators
      const normalizedPrice = this.normalizePrice(price);
      const latestReturn = this.calculateLatestReturn(prices);
      const normalizedVolume = this.normalizeVolume(volume, volumes);
      const avgReturn5 = this.calculateAverageReturn(prices, 5);
      const volatility5 = this.calculateVolatility(prices, 5);
      const rsi = this.calculateRSI(prices, 14);
      const { macd, signal } = this.calculateMACD(prices);
      
      // Get CDD features
      const fundingRate = await this.getFundingRate(symbol);
      const fundingTrend = await this.getFundingTrend(symbol);
      const vwapDeviation = await this.getVWAPDeviation(symbol, price);
      const orderFlowImbalance = await this.getOrderFlowImbalance(symbol);
      const correlationScore = await this.getCorrelationScore(symbol);
      
      // Get position and bot state
      const position = await Position.findOne({ symbol, status: 'OPEN' });
      const hasPosition = position ? 1 : 0;
      const positionPnL = position ? this.calculatePositionPnL(position, price) : 0;
      
      const botState = await BotState.findOne();
      const normalizedEquity = botState ? botState.equity / 10000 : 1;
      const drawdown = botState ? this.calculateDrawdown(botState) : 0;
      
      // Construct 17-dimensional state vector
      const state = [
        normalizedPrice,        // 1
        latestReturn,           // 2
        normalizedVolume,       // 3
        avgReturn5,             // 4
        volatility5,            // 5
        rsi,                    // 6
        macd,                   // 7
        signal,                 // 8
        fundingRate,            // 9
        fundingTrend,           // 10
        vwapDeviation,          // 11
        orderFlowImbalance,     // 12
        correlationScore,       // 13
        hasPosition,            // 14
        positionPnL,            // 15
        normalizedEquity,       // 16
        drawdown,               // 17
      ];
      
      // Validate state dimensions
      if (state.length !== 17) {
        throw new Error(`State builder produced ${state.length} features, expected 17`);
      }
      
      // Validate no NaN values
      if (state.some(v => isNaN(v))) {
        console.warn('[StateBuilder] NaN detected in state, replacing with 0');
        return state.map(v => isNaN(v) ? 0 : v);
      }
      
      return state;
    } catch (error) {
      console.error('[StateBuilder] Error building state:', error);
      throw error;
    }
  }

  /**
   * Update price and volume history
   */
  private updateHistory(symbol: string, price: number, volume: number): void {
    // Initialize if not exists
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }
    if (!this.volumeHistory.has(symbol)) {
      this.volumeHistory.set(symbol, []);
    }
    
    // Add new values
    const prices = this.priceHistory.get(symbol)!;
    const volumes = this.volumeHistory.get(symbol)!;
    
    prices.push(price);
    volumes.push(volume);
    
    // Keep only lookback period
    if (prices.length > this.LOOKBACK_PERIOD) {
      prices.shift();
    }
    if (volumes.length > this.LOOKBACK_PERIOD) {
      volumes.shift();
    }
  }

  /**
   * Normalize price (0-1 range)
   */
  private normalizePrice(price: number): number {
    // Normalize to typical crypto price range
    return price / 100000;
  }

  /**
   * Calculate latest return
   */
  private calculateLatestReturn(prices: number[]): number {
    if (prices.length < 2) return 0;
    const latest = prices[prices.length - 1];
    const previous = prices[prices.length - 2];
    return (latest - previous) / previous;
  }

  /**
   * Normalize volume
   */
  private normalizeVolume(volume: number, volumes: number[]): number {
    if (volumes.length === 0) return 0;
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    return volume / (avgVolume || 1);
  }

  /**
   * Calculate average return over N periods
   */
  private calculateAverageReturn(prices: number[], periods: number): number {
    if (prices.length < periods + 1) return 0;
    
    const returns = [];
    for (let i = prices.length - periods; i < prices.length; i++) {
      const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
      returns.push(ret);
    }
    
    return returns.reduce((a, b) => a + b, 0) / returns.length;
  }

  /**
   * Calculate volatility (standard deviation of returns)
   */
  private calculateVolatility(prices: number[], periods: number): number {
    if (prices.length < periods + 1) return 0;
    
    const returns = [];
    for (let i = prices.length - periods; i < prices.length; i++) {
      const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
      returns.push(ret);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Calculate RSI (Relative Strength Index)
   */
  private calculateRSI(prices: number[], periods: number = 14): number {
    if (prices.length < periods + 1) return 0.5; // Neutral
    
    const changes = [];
    for (let i = prices.length - periods; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }
    
    const gains = changes.filter(c => c > 0).reduce((a, b) => a + b, 0) / periods;
    const losses = Math.abs(changes.filter(c => c < 0).reduce((a, b) => a + b, 0)) / periods;
    
    if (losses === 0) return 1;
    const rs = gains / losses;
    const rsi = 1 - (1 / (1 + rs));
    
    return rsi;
  }

  /**
   * Calculate MACD
   */
  private calculateMACD(prices: number[]): { macd: number; signal: number } {
    if (prices.length < 26) return { macd: 0, signal: 0 };
    
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macd = ema12 - ema26;
    
    // Signal line is 9-period EMA of MACD (simplified)
    const signal = macd * 0.9; // Simplified
    
    return { macd: macd / prices[prices.length - 1], signal: signal / prices[prices.length - 1] };
  }

  /**
   * Calculate EMA (Exponential Moving Average)
   */
  private calculateEMA(prices: number[], periods: number): number {
    if (prices.length < periods) return prices[prices.length - 1];
    
    const multiplier = 2 / (periods + 1);
    let ema = prices[prices.length - periods];
    
    for (let i = prices.length - periods + 1; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }

  /**
   * Get funding rate from CDD database
   */
  private async getFundingRate(symbol: string): Promise<number> {
    try {
      // TODO: Query CDD database for latest funding rate
      // For now, return 0 (placeholder)
      return 0;
    } catch (error) {
      console.error('[StateBuilder] Error getting funding rate:', error);
      return 0;
    }
  }

  /**
   * Get funding trend (7-day average)
   */
  private async getFundingTrend(symbol: string): Promise<number> {
    try {
      // TODO: Query CDD database for 7-day funding trend
      // For now, return 0 (placeholder)
      return 0;
    } catch (error) {
      console.error('[StateBuilder] Error getting funding trend:', error);
      return 0;
    }
  }

  /**
   * Get VWAP deviation
   */
  private async getVWAPDeviation(symbol: string, currentPrice: number): Promise<number> {
    try {
      // TODO: Query CDD database for VWAP
      // For now, return 0 (placeholder)
      return 0;
    } catch (error) {
      console.error('[StateBuilder] Error getting VWAP deviation:', error);
      return 0;
    }
  }

  /**
   * Get order flow imbalance
   */
  private async getOrderFlowImbalance(symbol: string): Promise<number> {
    try {
      // TODO: Calculate from order book or trade data
      // For now, return 0 (placeholder)
      return 0;
    } catch (error) {
      console.error('[StateBuilder] Error getting order flow imbalance:', error);
      return 0;
    }
  }

  /**
   * Get correlation score
   */
  private async getCorrelationScore(symbol: string): Promise<number> {
    try {
      // TODO: Query CDD database for correlation matrix
      // For now, return 0.5 (neutral)
      return 0.5;
    } catch (error) {
      console.error('[StateBuilder] Error getting correlation score:', error);
      return 0.5;
    }
  }

  /**
   * Get volume for symbol
   */
  private async getVolume(symbol: string): Promise<number> {
    try {
      const ticker = await this.binanceService.get24hrTicker(symbol);
      return parseFloat(ticker.volume);
    } catch (error) {
      console.error('[StateBuilder] Error getting volume:', error);
      return 0;
    }
  }

  /**
   * Calculate position PnL
   */
  private calculatePositionPnL(position: any, currentPrice: number): number {
    const entryPrice = position.entryPrice;
    const side = position.side;
    
    if (side === 'LONG') {
      return (currentPrice - entryPrice) / entryPrice;
    } else {
      return (entryPrice - currentPrice) / entryPrice;
    }
  }

  /**
   * Calculate drawdown
   */
  private calculateDrawdown(botState: any): number {
    const peakEquity = botState.peakEquity || botState.equity;
    const currentEquity = botState.equity;
    return (peakEquity - currentEquity) / peakEquity;
  }
}

export default StateBuilder;

