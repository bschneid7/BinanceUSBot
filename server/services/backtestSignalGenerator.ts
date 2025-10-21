/**
 * Standalone signal generator for backtesting
 * Does not interact with database or require userId
 */

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MarketData {
  symbol: string;
  price: number;
  volume24h: number;
  priceChange24h: number;
  high24h: number;
  low24h: number;
  candles: Candle[];
}

interface Signal {
  symbol: string;
  action: 'BUY' | 'SELL';
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  playbook: string;
  confidence: number;
}

/**
 * Generate trading signals for backtesting
 * Simplified version of the live signal generator
 */
export function generateBacktestSignals(marketDataList: MarketData[]): Signal[] {
  const signals: Signal[] = [];

  for (const data of marketDataList) {
    const { symbol, price, candles } = data;

    if (candles.length < 50) continue; // Need enough data

    // Calculate indicators
    const rsi = calculateRSI(candles.map(c => c.close));
    const { macd, signal: macdSignal } = calculateMACD(candles.map(c => c.close));
    const ema20 = calculateEMA(candles.map(c => c.close), 20);
    const ema50 = calculateEMA(candles.map(c => c.close), 50);

    // Playbook A: RSI Oversold/Overbought
    if (rsi < 30 && price < ema20) {
      // Oversold - potential BUY
      signals.push({
        symbol,
        action: 'BUY',
        entryPrice: price,
        stopPrice: price * 0.98, // 2% stop loss
        targetPrice: price * 1.04, // 4% target
        playbook: 'PlaybookA',
        confidence: (30 - rsi) / 30, // Higher confidence when more oversold
      });
    } else if (rsi > 70 && price > ema20) {
      // Overbought - potential SELL
      signals.push({
        symbol,
        action: 'SELL',
        entryPrice: price,
        stopPrice: price * 1.02, // 2% stop loss
        targetPrice: price * 0.96, // 4% target
        playbook: 'PlaybookA',
        confidence: (rsi - 70) / 30, // Higher confidence when more overbought
      });
    }

    // Playbook B: MACD Crossover
    if (macd > macdSignal && macd > 0) {
      // Bullish crossover
      signals.push({
        symbol,
        action: 'BUY',
        entryPrice: price,
        stopPrice: price * 0.97, // 3% stop loss
        targetPrice: price * 1.06, // 6% target
        playbook: 'PlaybookB',
        confidence: Math.min(Math.abs(macd - macdSignal) / price * 100, 1),
      });
    } else if (macd < macdSignal && macd < 0) {
      // Bearish crossover
      signals.push({
        symbol,
        action: 'SELL',
        entryPrice: price,
        stopPrice: price * 1.03, // 3% stop loss
        targetPrice: price * 0.94, // 6% target
        playbook: 'PlaybookB',
        confidence: Math.min(Math.abs(macd - macdSignal) / price * 100, 1),
      });
    }

    // Playbook C: EMA Crossover (Trend Following)
    if (ema20 > ema50 && price > ema20) {
      // Uptrend
      signals.push({
        symbol,
        action: 'BUY',
        entryPrice: price,
        stopPrice: ema20 * 0.99, // Stop below EMA20
        targetPrice: price * 1.05, // 5% target
        playbook: 'PlaybookC',
        confidence: (ema20 - ema50) / ema50,
      });
    } else if (ema20 < ema50 && price < ema20) {
      // Downtrend
      signals.push({
        symbol,
        action: 'SELL',
        entryPrice: price,
        stopPrice: ema20 * 1.01, // Stop above EMA20
        targetPrice: price * 0.95, // 5% target
        playbook: 'PlaybookC',
        confidence: (ema50 - ema20) / ema50,
      });
    }

    // Playbook D: Dip Buying (Price drops significantly)
    const recentHigh = Math.max(...candles.slice(-20).map(c => c.high));
    const dropPct = (recentHigh - price) / recentHigh;
    if (dropPct > 0.05 && rsi < 40) {
      // Price dropped 5%+ and RSI confirms oversold
      signals.push({
        symbol,
        action: 'BUY',
        entryPrice: price,
        stopPrice: price * 0.96, // 4% stop loss
        targetPrice: recentHigh * 0.98, // Target near recent high
        playbook: 'PlaybookD',
        confidence: Math.min(dropPct * 2, 1),
      });
    }
  }

  // Filter signals by confidence (only keep high-confidence signals)
  return signals.filter(s => s.confidence > 0.5);
}

/**
 * Calculate RSI
 */
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

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
 * Calculate MACD
 */
function calculateMACD(prices: number[]): { macd: number; signal: number } {
  if (prices.length < 26) return { macd: 0, signal: 0 };

  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;

  // Simple approximation for signal line
  const signal = macd * 0.9;

  return { macd, signal };
}

/**
 * Calculate EMA
 */
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

