import fs from 'fs';
import path from 'path';

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
 * Generate a detailed backtest report
 */
export function generateReport(result: BacktestResult): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                    BACKTEST RESULTS');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  // Period
  lines.push('📅 PERIOD');
  lines.push(`   Start: ${result.startDate.toISOString()}`);
  lines.push(`   End:   ${result.endDate.toISOString()}`);
  lines.push(`   Duration: ${Math.round((result.endDate.getTime() - result.startDate.getTime()) / (1000 * 60 * 60 * 24))} days`);
  lines.push('');

  // Performance
  lines.push('💰 PERFORMANCE');
  lines.push(`   Initial Equity:  $${result.initialEquity.toFixed(2)}`);
  lines.push(`   Final Equity:    $${result.finalEquity.toFixed(2)}`);
  lines.push(`   Total Return:    $${result.totalReturn.toFixed(2)} (${result.totalReturnPct.toFixed(2)}%)`);
  lines.push(`   Max Drawdown:    $${result.maxDrawdown.toFixed(2)} (${result.maxDrawdownPct.toFixed(2)}%)`);
  lines.push(`   Sharpe Ratio:    ${result.sharpeRatio.toFixed(2)}`);
  lines.push('');

  // Trading Stats
  lines.push('📊 TRADING STATISTICS');
  lines.push(`   Total Trades:    ${result.totalTrades}`);
  lines.push(`   Winning Trades:  ${result.winningTrades} (${result.winRate.toFixed(1)}%)`);
  lines.push(`   Losing Trades:   ${result.losingTrades} (${(100 - result.winRate).toFixed(1)}%)`);
  lines.push(`   Avg Win:         $${result.avgWin.toFixed(2)}`);
  lines.push(`   Avg Loss:        $${result.avgLoss.toFixed(2)}`);
  lines.push(`   Profit Factor:   ${result.profitFactor === Infinity ? '∞' : result.profitFactor.toFixed(2)}`);
  lines.push('');

  // Playbook Breakdown
  const playbookStats = analyzeByPlaybook(result.trades);
  if (Object.keys(playbookStats).length > 0) {
    lines.push('🎯 PLAYBOOK PERFORMANCE');
    for (const [playbook, stats] of Object.entries(playbookStats)) {
      lines.push(`   ${playbook}:`);
      lines.push(`      Trades: ${stats.count} | Win Rate: ${stats.winRate.toFixed(1)}% | Total PnL: $${stats.totalPnl.toFixed(2)}`);
    }
    lines.push('');
  }

  // Exit Reason Breakdown
  const exitReasons = analyzeExitReasons(result.trades);
  lines.push('🚪 EXIT REASONS');
  for (const [reason, count] of Object.entries(exitReasons)) {
    const pct = (count / result.totalTrades) * 100;
    lines.push(`   ${reason}: ${count} (${pct.toFixed(1)}%)`);
  }
  lines.push('');

  // Recent Trades
  if (result.trades.length > 0) {
    lines.push('📝 RECENT TRADES (Last 10)');
    const recentTrades = result.trades.slice(-10);
    for (const trade of recentTrades) {
      const date = new Date(trade.exitTime).toISOString().split('T')[0];
      const pnlSign = trade.pnl >= 0 ? '+' : '';
      lines.push(`   ${date} | ${trade.symbol} ${trade.side} | ${trade.playbook} | ${pnlSign}$${trade.pnl.toFixed(2)} (${pnlSign}${trade.pnlR.toFixed(2)}R) | ${trade.exitReason}`);
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Analyze trades by playbook
 */
function analyzeByPlaybook(trades: BacktestTrade[]): Record<string, any> {
  const stats: Record<string, any> = {};

  for (const trade of trades) {
    if (!stats[trade.playbook]) {
      stats[trade.playbook] = {
        count: 0,
        wins: 0,
        totalPnl: 0,
      };
    }

    stats[trade.playbook].count++;
    if (trade.pnl > 0) stats[trade.playbook].wins++;
    stats[trade.playbook].totalPnl += trade.pnl;
  }

  // Calculate win rates
  for (const playbook in stats) {
    stats[playbook].winRate = (stats[playbook].wins / stats[playbook].count) * 100;
  }

  return stats;
}

/**
 * Analyze exit reasons
 */
function analyzeExitReasons(trades: BacktestTrade[]): Record<string, number> {
  const reasons: Record<string, number> = {
    TARGET: 0,
    STOP: 0,
    SIGNAL: 0,
    END: 0,
  };

  for (const trade of trades) {
    reasons[trade.exitReason]++;
  }

  return reasons;
}

/**
 * Export backtest results to JSON file
 */
export function exportToJSON(result: BacktestResult, outputPath: string): void {
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
}

/**
 * Export backtest results to CSV file
 */
export function exportToCSV(result: BacktestResult, outputPath: string): void {
  const lines: string[] = [];

  // Header
  lines.push('Date,Symbol,Side,Playbook,Entry Price,Exit Price,Quantity,PnL,PnL (R),Exit Reason');

  // Trades
  for (const trade of result.trades) {
    const date = new Date(trade.exitTime).toISOString();
    lines.push([
      date,
      trade.symbol,
      trade.side,
      trade.playbook,
      trade.entryPrice.toFixed(2),
      trade.exitPrice.toFixed(2),
      trade.quantity.toFixed(6),
      trade.pnl.toFixed(2),
      trade.pnlR.toFixed(2),
      trade.exitReason,
    ].join(','));
  }

  fs.writeFileSync(outputPath, lines.join('\n'));
}

/**
 * Export equity curve to CSV file
 */
export function exportEquityCurve(result: BacktestResult, outputPath: string): void {
  const lines: string[] = [];

  // Header
  lines.push('Timestamp,Date,Equity');

  // Data points
  for (const point of result.equityCurve) {
    const date = new Date(point.timestamp).toISOString();
    lines.push([
      point.timestamp,
      date,
      point.equity.toFixed(2),
    ].join(','));
  }

  fs.writeFileSync(outputPath, lines.join('\n'));
}

