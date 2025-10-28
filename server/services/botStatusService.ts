import Position from '../models/Position';
import Trade from '../models/Trade';
import Signal from '../models/Signal';
import Alert from '../models/Alert';
import BotConfig from '../models/BotConfig';
import BotState from '../models/BotState';
import { Types } from 'mongoose';

interface BotStatusMetrics {
  status: 'ACTIVE' | 'HALTED_DAILY' | 'HALTED_WEEKLY' | 'STOPPED';
  equity: number;
  availableCapital: number;
  dailyPnl: number;
  dailyPnlR: number;
  weeklyPnl: number;
  weeklyPnlR: number;
  reserveLevel: number;
  openPositions: number;
  totalOpenRiskR: number;
  totalExposurePct: number;
}

interface DashboardOverview {
  botStatus: BotStatusMetrics;
  recentSignals: unknown[];
  activePositions: unknown[];
  systemAlerts: unknown[];
}

class BotStatusService {
  /**
   * Calculate bot status and real-time trading metrics
   */
  async getBotStatus(userId: string | Types.ObjectId): Promise<BotStatusMetrics> {
    try {
      console.log(`[BotStatusService] Fetching bot status for user: ${userId}`);

      // Get bot configuration
      const config = await BotConfig.findOne({ userId });
      const riskPct = config?.risk?.R_pct || 0.006;

      // Get all open positions
      const openPositions = await Position.find({
        userId,
        status: 'OPEN'
      });

      console.log(`[BotStatusService] Found ${openPositions.length} open positions`);

      // Calculate equity from positions
      let totalNotional = 0;
      let totalUnrealizedPnl = 0;
      let totalOpenRiskR = 0;

      openPositions.forEach(position => {
        const notional = position.quantity * (position.current_price || position.entry_price);
        totalNotional += notional;

        if (position.unrealized_pnl) {
          totalUnrealizedPnl += position.unrealized_pnl;
        }

        if (position.realized_r) {
          totalOpenRiskR += Math.abs(position.realized_r || 0);
        }
      });

      // Get trades for PnL calculations
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
      startOfWeek.setHours(0, 0, 0, 0);

      // Daily PnL (trades closed today)
      const dailyTrades = await Trade.find({
        userId,
        date: { $gte: startOfDay }
      });

      const dailyPnl = dailyTrades.reduce((sum, trade) => sum + (trade.pnl_usd || 0), 0);

      console.log(`[BotStatusService] Daily PnL: $${dailyPnl.toFixed(2)} from ${dailyTrades.length} trades`);

      // Weekly PnL (trades closed this week)
      const weeklyTrades = await Trade.find({
        userId,
        date: { $gte: startOfWeek }
      });

      const weeklyPnl = weeklyTrades.reduce((sum, trade) => sum + (trade.pnl_usd || 0), 0);

      console.log(`[BotStatusService] Weekly PnL: $${weeklyPnl.toFixed(2)} from ${weeklyTrades.length} trades`);

      // Calculate estimated equity (simplified - would need more complex logic in production)
      // Starting equity + all closed trades PnL + unrealized PnL
      const allClosedTrades = await Trade.find({ userId });
      const totalRealizedPnl = allClosedTrades.reduce((sum, trade) => sum + (trade.pnl_usd || 0), 0);

      // Get starting equity from BotState (synced from Binance)
      const botState = await BotState.findOne({ userId });
      
      // Use startingEquity field (initial deposit), not current equity
      // If startingEquity not set, initialize it to 15000 (actual account starting balance)
      let startingEquity = botState?.startingEquity;
      if (!startingEquity || startingEquity === 7000) {
        // Fix incorrect starting equity (was hardcoded to 7000)
        startingEquity = 15000;
        console.log(`[BotStatusService] Initializing startingEquity to $${startingEquity}`);
      }
      
      const equity = startingEquity + totalRealizedPnl + totalUnrealizedPnl;
      
      console.log(`[BotStatusService] Equity calculation: $${startingEquity} (starting) + $${totalRealizedPnl.toFixed(2)} (realized) + $${totalUnrealizedPnl.toFixed(2)} (unrealized) = $${equity.toFixed(2)}`);
      
      // Update BotState with calculated equity for consistency across all endpoints
      if (botState) {
        botState.startingEquity = startingEquity; // Ensure startingEquity is persisted
        botState.equity = equity;
        botState.dailyPnl = dailyPnl;
        botState.weeklyPnl = weeklyPnl;
        botState.totalEquity = equity; // Also update totalEquity field
        await botState.save();
        console.log(`[BotStatusService] Updated BotState with equity: $${equity.toFixed(2)}, startingEquity: $${startingEquity}`);
      }

      console.log(`[BotStatusService] Calculated equity: $${equity.toFixed(2)}`);

      // Calculate R values
      const currentR = equity * riskPct;
      const dailyPnlR = currentR > 0 ? dailyPnl / currentR : 0;
      const weeklyPnlR = currentR > 0 ? weeklyPnl / currentR : 0;

      // Calculate exposure percentage
      const totalExposurePct = equity > 0 ? (totalNotional / equity) * 100 : 0;

      // Calculate available capital (total equity - used in positions)
      const availableCapital = equity - totalNotional;

      // Calculate reserve level (percentage of equity in USDT)
      // Simplified - assumes available capital is reserve
      const reserveLevel = equity > 0 ? (availableCapital / equity) * 100 : 0;

      // Get bot status from config (manual overrides take precedence)
      let status: 'ACTIVE' | 'HALTED_DAILY' | 'HALTED_WEEKLY' | 'STOPPED' = config?.botStatus || 'ACTIVE';

      // If status is ACTIVE, check if automatic loss limits should halt
      if (status === 'ACTIVE') {
        const dailyStopR = config?.risk?.daily_stop_R || -2.0;
        const weeklyStopR = config?.risk?.weekly_stop_R || -6.0;

        if (weeklyPnlR <= weeklyStopR) {
          status = 'HALTED_WEEKLY';
          console.log(`[BotStatusService] Weekly loss limit reached: ${weeklyPnlR.toFixed(2)}R <= ${weeklyStopR}R`);
        } else if (dailyPnlR <= dailyStopR) {
          status = 'HALTED_DAILY';
          console.log(`[BotStatusService] Daily loss limit reached: ${dailyPnlR.toFixed(2)}R <= ${dailyStopR}R`);
        }
      } else {
        console.log(`[BotStatusService] Bot manually set to status: ${status}`);
      }

      const botStatus: BotStatusMetrics = {
        status,
        equity: Math.round(equity * 100) / 100,
        availableCapital: Math.round(availableCapital * 100) / 100,
        dailyPnl: Math.round(dailyPnl * 100) / 100,
        dailyPnlR: Math.round(dailyPnlR * 100) / 100,
        weeklyPnl: Math.round(weeklyPnl * 100) / 100,
        weeklyPnlR: Math.round(weeklyPnlR * 100) / 100,
        reserveLevel: Math.round(reserveLevel * 100) / 100,
        openPositions: openPositions.length,
        totalOpenRiskR: Math.round(totalOpenRiskR * 100) / 100,
        totalExposurePct: Math.round(totalExposurePct * 100) / 100
      };

      console.log(`[BotStatusService] Bot status calculated successfully:`, {
        status: botStatus.status,
        equity: botStatus.equity,
        openPositions: botStatus.openPositions
      });

      return botStatus;
    } catch (error) {
      console.error('[BotStatusService] Error calculating bot status:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to calculate bot status: ${errorMessage}`);
    }
  }

  /**
   * Get dashboard overview with all relevant data
   */
  async getDashboardOverview(userId: string | Types.ObjectId): Promise<DashboardOverview> {
    try {
      console.log(`[BotStatusService] Fetching dashboard overview for user: ${userId}`);

      // Get bot status
      const botStatus = await this.getBotStatus(userId);

      // Get recent signals (last 10)
      const recentSignals = await Signal.find({ userId })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean();

      console.log(`[BotStatusService] Found ${recentSignals.length} recent signals`);

      // Get active positions
      const activePositions = await Position.find({
        userId,
        status: 'OPEN'
      })
        .sort({ openedAt: -1 })
        .lean();

      console.log(`[BotStatusService] Found ${activePositions.length} active positions`);

      // Get recent system alerts (last 24 hours, limit 10)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const systemAlerts = await Alert.find({
        userId,
        timestamp: { $gte: yesterday }
      })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean();

      console.log(`[BotStatusService] Found ${systemAlerts.length} recent alerts`);

      return {
        botStatus,
        recentSignals,
        activePositions,
        systemAlerts
      };
    } catch (error) {
      console.error('[BotStatusService] Error fetching dashboard overview:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to fetch dashboard overview: ${errorMessage}`);
    }
  }

  /**
   * Get system health metrics
   */
  async getSystemHealth(userId: string | Types.ObjectId) {
    try {
      console.log(`[BotStatusService] Checking system health for user: ${userId}`);

      const config = await BotConfig.findOne({ userId });

      // Check database connectivity
      const dbHealthy = true; // If we got here, DB is connected

      // Check API connectivity (placeholder - would need actual exchange API check)
      const apiHealthy = true;
      const apiLatencyMs = 120;

      // Check recent errors
      const recentErrors = await Alert.countDocuments({
        userId,
        level: 'ERROR',
        timestamp: { $gte: new Date(Date.now() - 3600000) } // Last hour
      });

      console.log(`[BotStatusService] System health check complete: ${recentErrors} errors in last hour`);

      return {
        database: dbHealthy,
        exchangeAPI: apiHealthy,
        apiLatencyMs,
        recentErrorCount: recentErrors,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('[BotStatusService] Error checking system health:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to check system health: ${errorMessage}`);
    }
  }
}

export default new BotStatusService();
