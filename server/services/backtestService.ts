import { Types } from 'mongoose';
import binanceService from './binanceService';
import historicalDataService from './historicalDataService';
import marketScanner from './tradingEngine/marketScanner';
import { generateBacktestSignals } from './backtestSignalGenerator';
import riskEngine from './tradingEngine/riskEngine';
import BotConfig from '../models/BotConfig';
import logger from '../utils/logger';

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BacktestPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  entryTime: number;
  quantity: number;
  stopPrice: number;
  targetPrice?: number;
  playbook: string;
  riskAmount: number;
}

interface BacktestTrade {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  quantity: number;
  pnl: number;
  pnlR: number;
  playbook: string;
  exitReason: 'TARGET' | 'STOP' | 'SIGNAL' | 'END';
}

interface BacktestResult {
  startDate: Date;
  endDate: Date;
  initialEquity: number;
  finalEquity: number;
  totalReturn: number;
  totalReturnPct: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  trades: BacktestTrade[];
  equityCurve: Array<{ timestamp: number; equity: number }>;
}

/**
 * Backtesting service for testing trading strategies with historical data
 */
export class BacktestService {
  /**
   * Run a backtest for a specific symbol and date range
   */
  async runBacktest(
    userId: Types.ObjectId,
    symbol: string,
    startDate: Date,
    endDate: Date,
    initialEquity: number = 10000
  ): Promise<BacktestResult> {
    logger.info(`[Backtest] Starting backtest for ${symbol} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Get bot configuration (use any available config if userId doesn't match)
    let config = await BotConfig.findOne({ userId });
    if (!config) {
      config = await BotConfig.findOne(); // Use any available config
      if (!config) {
        throw new Error('No bot configuration found in database');
      }
      logger.info('[Backtest] Using default bot configuration');
    }

    // Fetch historical data (from cache or download from Binance.US)
    logger.info('[Backtest] Fetching historical data...');
    const candles = await historicalDataService.getCandles(symbol, '1h', startDate, endDate);
    
    // If no cached data, try downloading daily range
    if (candles.length === 0) {
      logger.info('[Backtest] No cached data, downloading from Binance.US...');
      const downloadedCandles = await historicalDataService.downloadDailyRange({
        symbol,
        interval: '1h',
        startDate,
        endDate,
      });
      candles.push(...downloadedCandles);
    }
    logger.info(`[Backtest] Fetched ${candles.length} candles`);

    // Initialize backtest state
    let equity = initialEquity;
    let currentR = (config.risk?.R_pct || 0.006) * equity;
    const positions: BacktestPosition[] = [];
    const trades: BacktestTrade[] = [];
    const equityCurve: Array<{ timestamp: number; equity: number }> = [];
    let peakEquity = equity;
    let maxDrawdown = 0;

    // Simulate trading through historical data
    for (let i = 100; i < candles.length; i++) {
      const currentCandle = candles[i];
      const historicalCandles = candles.slice(Math.max(0, i - 100), i);

      // Update equity curve
      equityCurve.push({
        timestamp: currentCandle.timestamp,
        equity,
      });

      // Track drawdown
      if (equity > peakEquity) {
        peakEquity = equity;
      }
      const drawdown = peakEquity - equity;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      // Check if any positions should be closed
      for (let j = positions.length - 1; j >= 0; j--) {
        const position = positions[j];
        let exitPrice: number | null = null;
        let exitReason: 'TARGET' | 'STOP' | 'SIGNAL' | 'END' = 'SIGNAL';

        // Check stop loss
        if (position.side === 'LONG' && currentCandle.low <= position.stopPrice) {
          exitPrice = position.stopPrice;
          exitReason = 'STOP';
        } else if (position.side === 'SHORT' && currentCandle.high >= position.stopPrice) {
          exitPrice = position.stopPrice;
          exitReason = 'STOP';
        }

        // Check target (if set)
        if (!exitPrice && position.targetPrice) {
          if (position.side === 'LONG' && currentCandle.high >= position.targetPrice) {
            exitPrice = position.targetPrice;
            exitReason = 'TARGET';
          } else if (position.side === 'SHORT' && currentCandle.low <= position.targetPrice) {
            exitPrice = position.targetPrice;
            exitReason = 'TARGET';
          }
        }

        // Close position if exit condition met
        if (exitPrice) {
          const pnl = position.side === 'LONG'
            ? (exitPrice - position.entryPrice) * position.quantity
            : (position.entryPrice - exitPrice) * position.quantity;

          // Account for fees (0.1% per trade, or 0.075% with BNB discount)
          const feeRate = 0.00075; // Assuming BNB discount
          const fees = (position.entryPrice * position.quantity * feeRate) + (exitPrice * position.quantity * feeRate);
          const netPnl = pnl - fees;
          const pnlR = netPnl / position.riskAmount;

          equity += netPnl;
          currentR = (config.risk?.R_pct || 0.006) * equity;

          trades.push({
            symbol: position.symbol,
            side: position.side,
            entryPrice: position.entryPrice,
            exitPrice,
            entryTime: position.entryTime,
            exitTime: currentCandle.timestamp,
            quantity: position.quantity,
            pnl: netPnl,
            pnlR,
            playbook: position.playbook,
            exitReason,
          });

          positions.splice(j, 1);
        }
      }

      // Generate signals for new positions
      if (positions.length < (config.risk?.max_positions || 8)) {
        try {
          // Build market data from historical candles
          const marketData = {
            symbol,
            price: currentCandle.close,
            volume24h: historicalCandles.reduce((sum, c) => sum + c.volume, 0),
            priceChange24h: ((currentCandle.close - historicalCandles[0].open) / historicalCandles[0].open) * 100,
            high24h: Math.max(...historicalCandles.map(c => c.high)),
            low24h: Math.min(...historicalCandles.map(c => c.low)),
            bidPrice: currentCandle.close * 0.9999,
            askPrice: currentCandle.close * 1.0001,
            bidQty: 1000,
            askQty: 1000,
            candles: historicalCandles.map(c => ({
              timestamp: c.timestamp,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
            })),
          };

          // Generate signals (using standalone backtest generator)
          const signals = generateBacktestSignals([marketData]);
          if (i % 100 === 0) {
            logger.info(`[Backtest] Candle ${i}/${candles.length}: Price=${currentCandle.close.toFixed(2)}, Signals=${signals.length}`);
          }

          // Execute signals
          for (const signal of signals) {
            if (positions.length >= (config.risk?.max_positions || 8)) break;

            // Calculate position size
            const riskAmount = currentR;
            const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
            const quantity = riskAmount / stopDistance;

            // Check if we have enough equity
            const positionValue = signal.entryPrice * quantity;
            if (positionValue > equity * 0.2) {
              // Skip if position would be too large (>20% of equity)
              continue;
            }

            // Open position
            positions.push({
              symbol: signal.symbol,
              side: signal.action === 'BUY' ? 'LONG' : 'SHORT',
              entryPrice: signal.entryPrice,
              entryTime: currentCandle.timestamp,
              quantity,
              stopPrice: signal.stopPrice,
              targetPrice: signal.targetPrice,
              playbook: signal.playbook,
              riskAmount,
            });
          }
        } catch (error) {
          // Skip this candle if signal generation fails
          logger.error(`[Backtest] Error generating signals at ${new Date(currentCandle.timestamp).toISOString()}:`, error);
        }
      }
    }

    // Close any remaining positions at the end
    const lastCandle = candles[candles.length - 1];
    for (const position of positions) {
      const exitPrice = lastCandle.close;
      const pnl = position.side === 'LONG'
        ? (exitPrice - position.entryPrice) * position.quantity
        : (position.entryPrice - exitPrice) * position.quantity;

      const feeRate = 0.00075;
      const fees = (position.entryPrice * position.quantity * feeRate) + (exitPrice * position.quantity * feeRate);
      const netPnl = pnl - fees;
      const pnlR = netPnl / position.riskAmount;

      equity += netPnl;

      trades.push({
        symbol: position.symbol,
        side: position.side,
        entryPrice: position.entryPrice,
        exitPrice,
        entryTime: position.entryTime,
        exitTime: lastCandle.timestamp,
        quantity: position.quantity,
        pnl: netPnl,
        pnlR,
        playbook: position.playbook,
        exitReason: 'END',
      });
    }

    // Calculate metrics
    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);
    const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

    const result: BacktestResult = {
      startDate,
      endDate,
      initialEquity,
      finalEquity: equity,
      totalReturn: equity - initialEquity,
      totalReturnPct: ((equity - initialEquity) / initialEquity) * 100,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
      avgWin: winningTrades.length > 0 ? totalWins / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ? totalLosses / losingTrades.length : 0,
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0,
      maxDrawdown,
      maxDrawdownPct: (maxDrawdown / peakEquity) * 100,
      sharpeRatio: this.calculateSharpeRatio(equityCurve, initialEquity),
      trades,
      equityCurve,
    };

    logger.info(`[Backtest] Completed: ${result.totalTrades} trades, ${result.totalReturnPct.toFixed(2)}% return`);

    return result;
  }

  /**
   * Fetch historical candle data from Binance
   */
  private async fetchHistoricalData(
    symbol: string,
    startDate: Date,
    endDate: Date,
    interval: string = '1h'
  ): Promise<Candle[]> {
    const candles: Candle[] = [];
    let currentStart = startDate.getTime();
    const endTime = endDate.getTime();

    // Fetch in chunks (max 1000 candles per request)
    while (currentStart < endTime) {
      try {
        logger.info(`[Backtest] Fetching klines: ${symbol}, ${interval}, start=${new Date(currentStart).toISOString()}, end=${new Date(endTime).toISOString()}`);
        const klines = await binanceService.getKlines(symbol, interval, 1000, currentStart, endTime);
        logger.info(`[Backtest] Received ${klines.length} klines from API`);

        for (const kline of klines) {
          candles.push({
            timestamp: kline.openTime as number,
            open: parseFloat(kline.open as string),
            high: parseFloat(kline.high as string),
            low: parseFloat(kline.low as string),
            close: parseFloat(kline.close as string),
            volume: parseFloat(kline.volume as string),
          });
        }

        if (klines.length === 0) break;

        // Move to next chunk
        currentStart = (klines[klines.length - 1][0] as number) + 1;

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.error(`[Backtest] Error fetching historical data:`, error);
        break;
      }
    }

    return candles;
  }

  /**
   * Calculate Sharpe Ratio
   */
  private calculateSharpeRatio(
    equityCurve: Array<{ timestamp: number; equity: number }>,
    initialEquity: number
  ): number {
    if (equityCurve.length < 2) return 0;

    // Calculate daily returns
    const returns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const returnPct = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
      returns.push(returnPct);
    }

    if (returns.length === 0) return 0;

    // Calculate mean and standard deviation
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualize (assuming hourly data)
    const annualizedReturn = mean * 24 * 365;
    const annualizedStdDev = stdDev * Math.sqrt(24 * 365);

    // Risk-free rate (assume 4% annual)
    const riskFreeRate = 0.04;

    return (annualizedReturn - riskFreeRate) / annualizedStdDev;
  }
}

export default new BacktestService();

