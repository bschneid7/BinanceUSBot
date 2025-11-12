/**
 * Backtesting Engine
 * Tests trading strategies on historical data with ML validation
 * Provides comprehensive performance metrics and analysis
 */

import logger from '../../utils/logger';
import { CandleData } from './patternRecognition';
import { Signal } from '../tradingEngine/signalGenerator';

export interface BacktestConfig {
  initialCapital: number;
  startDate: Date;
  endDate: Date;
  symbols: string[];
  commission: number; // % per trade
  slippage: number; // % per trade
  maxPositions: number;
  riskPerTrade: number; // % of capital
}

export interface BacktestTrade {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryTime: Date;
  entryPrice: number;
  quantity: number;
  exitTime?: Date;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  commission: number;
  slippage: number;
  holdingPeriod?: number; // hours
  exitReason?: 'STOP_LOSS' | 'TAKE_PROFIT' | 'SIGNAL' | 'END_OF_TEST';
  mlScore?: number;
  mlConfidence?: number;
  regime?: string;
}

export interface BacktestResult {
  config: BacktestConfig;
  performance: {
    totalReturn: number;
    totalReturnPercent: number;
    annualizedReturn: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    winRate: number;
    profitFactor: number;
    avgWin: number;
    avgLoss: number;
    avgWinPercent: number;
    avgLossPercent: number;
    largestWin: number;
    largestLoss: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    avgHoldingPeriod: number; // hours
  };
  equity: {
    initial: number;
    final: number;
    peak: number;
    curve: Array<{ time: Date; equity: number }>;
  };
  trades: BacktestTrade[];
  monthlyReturns: Array<{ month: string; return: number; returnPercent: number }>;
  analysis: {
    bestMonth: { month: string; return: number };
    worstMonth: { month: string; return: number };
    consecutiveWins: number;
    consecutiveLosses: number;
    avgTradesPerDay: number;
    mlPerformance?: {
      highConfidenceWinRate: number;
      lowConfidenceWinRate: number;
      avgConfidenceWinners: number;
      avgConfidenceLoser: number;
    };
  };
}

class BacktestingEngine {
  private static instance: BacktestingEngine;

  private constructor() {}

  static getInstance(): BacktestingEngine {
    if (!BacktestingEngine.instance) {
      BacktestingEngine.instance = new BacktestingEngine();
    }
    return BacktestingEngine.instance;
  }

  /**
   * Run backtest on historical data
   */
  async runBacktest(
    config: BacktestConfig,
    historicalData: Map<string, CandleData[]>,
    signals: Signal[]
  ): Promise<BacktestResult> {
    logger.info('[Backtest] Starting backtest', {
      symbols: config.symbols,
      startDate: config.startDate.toISOString(),
      endDate: config.endDate.toISOString(),
      initialCapital: config.initialCapital
    });

    // Initialize state
    let equity = config.initialCapital;
    let peakEquity = equity;
    const equityCurve: Array<{ time: Date; equity: number }> = [];
    const trades: BacktestTrade[] = [];
    const openPositions: Map<string, BacktestTrade> = new Map();

    // Sort signals by time
    const sortedSignals = signals.sort((a, b) => 
      (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0)
    );

    // Process each signal
    for (const signal of sortedSignals) {
      const signalTime = signal.timestamp || new Date();
      
      // Skip if outside test period
      if (signalTime < config.startDate || signalTime > config.endDate) {
        continue;
      }

      // Get candle data for this symbol
      const candles = historicalData.get(signal.symbol);
      if (!candles) continue;

      // Find current price
      const currentCandle = this.findCandleAtTime(candles, signalTime);
      if (!currentCandle) continue;

      // Check if we can open a new position
      if (signal.action === 'BUY' && openPositions.size < config.maxPositions) {
        const trade = this.openPosition(signal, currentCandle, equity, config);
        if (trade) {
          openPositions.set(signal.symbol, trade);
          trades.push(trade);
          equity -= trade.quantity * trade.entryPrice * (1 + config.commission / 100);
        }
      }

      // Check if we should close an existing position
      if (signal.action === 'SELL' && openPositions.has(signal.symbol)) {
        const trade = openPositions.get(signal.symbol)!;
        this.closePosition(trade, currentCandle, signalTime, 'SIGNAL', config);
        openPositions.delete(signal.symbol);
        equity += (trade.exitPrice! * trade.quantity) * (1 - config.commission / 100);
      }

      // Update equity curve
      const totalPositionValue = Array.from(openPositions.values())
        .reduce((sum, pos) => sum + pos.quantity * currentCandle.close, 0);
      const currentEquity = equity + totalPositionValue;
      equityCurve.push({ time: signalTime, equity: currentEquity });

      // Update peak
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      }

      // Check stop losses and take profits for open positions
      for (const [symbol, trade] of openPositions.entries()) {
        const symbolCandles = historicalData.get(symbol);
        if (!symbolCandles) continue;

        const currentSymbolCandle = this.findCandleAtTime(symbolCandles, signalTime);
        if (!currentSymbolCandle) continue;

        // Check stop loss
        if (trade.side === 'BUY' && currentSymbolCandle.low <= (trade.entryPrice * 0.97)) {
          this.closePosition(trade, currentSymbolCandle, signalTime, 'STOP_LOSS', config);
          openPositions.delete(symbol);
          equity += (trade.exitPrice! * trade.quantity) * (1 - config.commission / 100);
        }

        // Check take profit
        if (trade.side === 'BUY' && currentSymbolCandle.high >= (trade.entryPrice * 1.05)) {
          this.closePosition(trade, currentSymbolCandle, signalTime, 'TAKE_PROFIT', config);
          openPositions.delete(symbol);
          equity += (trade.exitPrice! * trade.quantity) * (1 - config.commission / 100);
        }
      }
    }

    // Close all remaining positions at end of test
    const endCandles = new Map<string, CandleData>();
    for (const [symbol, candles] of historicalData.entries()) {
      const lastCandle = candles[candles.length - 1];
      endCandles.set(symbol, lastCandle);
    }

    for (const [symbol, trade] of openPositions.entries()) {
      const lastCandle = endCandles.get(symbol);
      if (lastCandle) {
        this.closePosition(trade, lastCandle, config.endDate, 'END_OF_TEST', config);
        equity += (trade.exitPrice! * trade.quantity) * (1 - config.commission / 100);
      }
    }

    // Calculate performance metrics
    const performance = this.calculatePerformance(trades, config.initialCapital, equity, equityCurve, config);
    const monthlyReturns = this.calculateMonthlyReturns(equityCurve);
    const analysis = this.analyzeResults(trades, monthlyReturns, config);

    const result: BacktestResult = {
      config,
      performance,
      equity: {
        initial: config.initialCapital,
        final: equity,
        peak: peakEquity,
        curve: equityCurve
      },
      trades,
      monthlyReturns,
      analysis
    };

    logger.info('[Backtest] Completed', {
      totalReturn: performance.totalReturnPercent.toFixed(2) + '%',
      sharpeRatio: performance.sharpeRatio.toFixed(2),
      winRate: (performance.winRate * 100).toFixed(1) + '%',
      totalTrades: performance.totalTrades
    });

    return result;
  }

  /**
   * Open a position
   */
  private openPosition(
    signal: Signal,
    candle: CandleData,
    equity: number,
    config: BacktestConfig
  ): BacktestTrade | null {
    const entryPrice = candle.close * (1 + config.slippage / 100);
    const riskAmount = equity * config.riskPerTrade;
    const stopDistance = entryPrice * 0.03; // 3% stop
    const quantity = riskAmount / stopDistance;

    const positionValue = quantity * entryPrice;
    if (positionValue > equity) {
      return null; // Not enough capital
    }

    const trade: BacktestTrade = {
      id: `${signal.symbol}_${Date.now()}`,
      symbol: signal.symbol,
      side: 'BUY',
      entryTime: new Date(candle.timestamp),
      entryPrice,
      quantity,
      commission: positionValue * config.commission / 100,
      slippage: positionValue * config.slippage / 100,
      mlScore: (signal as any).mlScore,
      mlConfidence: (signal as any).mlConfidence,
      regime: (signal as any).regime
    };

    return trade;
  }

  /**
   * Close a position
   */
  private closePosition(
    trade: BacktestTrade,
    candle: CandleData,
    exitTime: Date,
    exitReason: BacktestTrade['exitReason'],
    config: BacktestConfig
  ): void {
    const exitPrice = candle.close * (1 - config.slippage / 100);
    const pnl = (exitPrice - trade.entryPrice) * trade.quantity - trade.commission - (exitPrice * trade.quantity * config.commission / 100);
    const pnlPercent = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
    const holdingPeriod = (exitTime.getTime() - trade.entryTime.getTime()) / (1000 * 60 * 60);

    trade.exitTime = exitTime;
    trade.exitPrice = exitPrice;
    trade.pnl = pnl;
    trade.pnlPercent = pnlPercent;
    trade.holdingPeriod = holdingPeriod;
    trade.exitReason = exitReason;
  }

  /**
   * Find candle at specific time
   */
  private findCandleAtTime(candles: CandleData[], time: Date): CandleData | null {
    const targetTime = time.getTime();
    
    // Find closest candle
    let closest: CandleData | null = null;
    let minDiff = Infinity;

    for (const candle of candles) {
      const diff = Math.abs(candle.timestamp - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = candle;
      }
      
      // If we've passed the target time, use this candle
      if (candle.timestamp >= targetTime) {
        return candle;
      }
    }

    return closest;
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformance(
    trades: BacktestTrade[],
    initialCapital: number,
    finalEquity: number,
    equityCurve: Array<{ time: Date; equity: number }>,
    config: BacktestConfig
  ): BacktestResult['performance'] {
    const closedTrades = trades.filter(t => t.pnl !== undefined);
    const winners = closedTrades.filter(t => t.pnl! > 0);
    const losers = closedTrades.filter(t => t.pnl! <= 0);

    const totalReturn = finalEquity - initialCapital;
    const totalReturnPercent = (totalReturn / initialCapital) * 100;

    // Annualized return
    const days = (config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24);
    const years = days / 365;
    const annualizedReturn = (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100;

    // Win rate
    const winRate = closedTrades.length > 0 ? winners.length / closedTrades.length : 0;

    // Average win/loss
    const avgWin = winners.length > 0 ? winners.reduce((sum, t) => sum + t.pnl!, 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? losers.reduce((sum, t) => sum + t.pnl!, 0) / losers.length : 0;
    const avgWinPercent = winners.length > 0 ? winners.reduce((sum, t) => sum + t.pnlPercent!, 0) / winners.length : 0;
    const avgLossPercent = losers.length > 0 ? losers.reduce((sum, t) => sum + t.pnlPercent!, 0) / losers.length : 0;

    // Profit factor
    const grossProfit = winners.reduce((sum, t) => sum + t.pnl!, 0);
    const grossLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnl!, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    // Largest win/loss
    const largestWin = winners.length > 0 ? Math.max(...winners.map(t => t.pnl!)) : 0;
    const largestLoss = losers.length > 0 ? Math.min(...losers.map(t => t.pnl!)) : 0;

    // Drawdown
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let peak = initialCapital;

    for (const point of equityCurve) {
      if (point.equity > peak) {
        peak = point.equity;
      }
      const drawdown = peak - point.equity;
      const drawdownPercent = (drawdown / peak) * 100;
      
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = drawdownPercent;
      }
    }

    // Sharpe ratio
    const returns = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const ret = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
      returns.push(ret);
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

    // Sortino ratio (only downside deviation)
    const downsideReturns = returns.filter(r => r < 0);
    const downsideStdDev = downsideReturns.length > 0
      ? Math.sqrt(downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length)
      : stdDev;
    const sortinoRatio = downsideStdDev > 0 ? (avgReturn / downsideStdDev) * Math.sqrt(252) : 0;

    // Average holding period
    const avgHoldingPeriod = closedTrades.length > 0
      ? closedTrades.reduce((sum, t) => sum + (t.holdingPeriod || 0), 0) / closedTrades.length
      : 0;

    return {
      totalReturn,
      totalReturnPercent,
      annualizedReturn,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      maxDrawdownPercent,
      winRate,
      profitFactor,
      avgWin,
      avgLoss,
      avgWinPercent,
      avgLossPercent,
      largestWin,
      largestLoss,
      totalTrades: closedTrades.length,
      winningTrades: winners.length,
      losingTrades: losers.length,
      avgHoldingPeriod
    };
  }

  /**
   * Calculate monthly returns
   */
  private calculateMonthlyReturns(
    equityCurve: Array<{ time: Date; equity: number }>
  ): Array<{ month: string; return: number; returnPercent: number }> {
    const monthlyReturns: Array<{ month: string; return: number; returnPercent: number }> = [];
    const monthlyEquity = new Map<string, { start: number; end: number }>();

    for (const point of equityCurve) {
      const monthKey = `${point.time.getFullYear()}-${String(point.time.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyEquity.has(monthKey)) {
        monthlyEquity.set(monthKey, { start: point.equity, end: point.equity });
      } else {
        monthlyEquity.get(monthKey)!.end = point.equity;
      }
    }

    for (const [month, equity] of monthlyEquity.entries()) {
      const ret = equity.end - equity.start;
      const retPercent = (ret / equity.start) * 100;
      monthlyReturns.push({ month, return: ret, returnPercent: retPercent });
    }

    return monthlyReturns;
  }

  /**
   * Analyze results
   */
  private analyzeResults(
    trades: BacktestTrade[],
    monthlyReturns: Array<{ month: string; return: number; returnPercent: number }>,
    config: BacktestConfig
  ): BacktestResult['analysis'] {
    const closedTrades = trades.filter(t => t.pnl !== undefined);

    // Best/worst month
    const bestMonth = monthlyReturns.length > 0
      ? monthlyReturns.reduce((best, curr) => curr.return > best.return ? curr : best)
      : { month: 'N/A', return: 0 };
    
    const worstMonth = monthlyReturns.length > 0
      ? monthlyReturns.reduce((worst, curr) => curr.return < worst.return ? curr : worst)
      : { month: 'N/A', return: 0 };

    // Consecutive wins/losses
    let consecutiveWins = 0;
    let consecutiveLosses = 0;
    let currentStreak = 0;
    let lastWasWin = false;

    for (const trade of closedTrades) {
      const isWin = trade.pnl! > 0;
      
      if (isWin === lastWasWin) {
        currentStreak++;
      } else {
        if (lastWasWin) {
          consecutiveWins = Math.max(consecutiveWins, currentStreak);
        } else {
          consecutiveLosses = Math.max(consecutiveLosses, currentStreak);
        }
        currentStreak = 1;
        lastWasWin = isWin;
      }
    }

    // Average trades per day
    const days = (config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24);
    const avgTradesPerDay = closedTrades.length / days;

    // ML performance analysis
    const tradesWithML = closedTrades.filter(t => t.mlConfidence !== undefined);
    const highConfidenceTrades = tradesWithML.filter(t => t.mlConfidence! > 0.7);
    const lowConfidenceTrades = tradesWithML.filter(t => t.mlConfidence! <= 0.7);

    const highConfidenceWinRate = highConfidenceTrades.length > 0
      ? highConfidenceTrades.filter(t => t.pnl! > 0).length / highConfidenceTrades.length
      : 0;
    
    const lowConfidenceWinRate = lowConfidenceTrades.length > 0
      ? lowConfidenceTrades.filter(t => t.pnl! > 0).length / lowConfidenceTrades.length
      : 0;

    const winners = tradesWithML.filter(t => t.pnl! > 0);
    const losers = tradesWithML.filter(t => t.pnl! <= 0);

    const avgConfidenceWinners = winners.length > 0
      ? winners.reduce((sum, t) => sum + t.mlConfidence!, 0) / winners.length
      : 0;
    
    const avgConfidenceLoser = losers.length > 0
      ? losers.reduce((sum, t) => sum + t.mlConfidence!, 0) / losers.length
      : 0;

    return {
      bestMonth,
      worstMonth,
      consecutiveWins,
      consecutiveLosses,
      avgTradesPerDay,
      mlPerformance: tradesWithML.length > 0 ? {
        highConfidenceWinRate,
        lowConfidenceWinRate,
        avgConfidenceWinners,
        avgConfidenceLoser
      } : undefined
    };
  }

  /**
   * Export results to CSV
   */
  exportToCSV(result: BacktestResult): string {
    const lines: string[] = [];
    
    // Header
    lines.push('Trade ID,Symbol,Side,Entry Time,Entry Price,Exit Time,Exit Price,Quantity,P&L,P&L %,Holding Period (h),Exit Reason,ML Score,ML Confidence,Regime');
    
    // Trades
    for (const trade of result.trades) {
      if (trade.pnl === undefined) continue;
      
      lines.push([
        trade.id,
        trade.symbol,
        trade.side,
        trade.entryTime.toISOString(),
        trade.entryPrice.toFixed(2),
        trade.exitTime?.toISOString() || '',
        trade.exitPrice?.toFixed(2) || '',
        trade.quantity.toFixed(6),
        trade.pnl.toFixed(2),
        trade.pnlPercent?.toFixed(2) || '',
        trade.holdingPeriod?.toFixed(2) || '',
        trade.exitReason || '',
        trade.mlScore?.toFixed(3) || '',
        trade.mlConfidence?.toFixed(3) || '',
        trade.regime || ''
      ].join(','));
    }
    
    return lines.join('\n');
  }
}

export const backtestingEngine = BacktestingEngine.getInstance();
