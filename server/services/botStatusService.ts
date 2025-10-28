import { Types } from 'mongoose';
import Position from '../models/Position';
import Trade from '../models/Trade';
import BotState from '../models/BotState';
import BotConfig from '../models/BotConfig';
import depositService from './depositService';

interface BotStatusMetrics {
  status: 'ACTIVE' | 'HALTED_DAILY' | 'HALTED_WEEKLY' | 'STOPPED';
  equity: number;
  startingCapital: number; // Total deposits - withdrawals
  currentR: number;
  totalPnl: number;
  totalPnlPct: number;
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

class BotStatusService {
  private cache: Map<string, { data: BotStatusMetrics; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5000; // 5 seconds

  async getBotStatus(userId: Types.ObjectId): Promise<BotStatusMetrics> {
    try {
      const cacheKey = userId.toString();
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }

      console.log(`[BotStatusService] Fetching bot status for user: ${userId}`);

      // Get open positions
      const openPositions = await Position.find({ userId, status: 'OPEN' });
      console.log(`[BotStatusService] Found ${openPositions.length} open positions`);

      // Calculate total unrealized P&L
      const totalUnrealizedPnl = openPositions.reduce((sum, pos) => {
        return sum + (pos.unrealized_pnl || 0);
      }, 0);

      // Calculate total open risk in R
      const totalOpenRiskR = openPositions.reduce((sum, pos) => {
        return sum + Math.abs(pos.risk_R || 0);
      }, 0);

      // Get config for R value
      const config = await BotConfig.findOne({ userId });
      const currentR = config?.risk?.R || 0;

      // Get daily P&L (trades from today)
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const dailyTrades = await Trade.find({
        userId,
        date: { $gte: startOfDay }
      });

      const dailyPnl = dailyTrades.reduce((sum, trade) => sum + (trade.pnl_usd || 0), 0);
      const dailyPnlR = currentR > 0 ? dailyPnl / currentR : 0;

      console.log(`[BotStatusService] Daily P&L: $${dailyPnl.toFixed(2)} from ${dailyTrades.length} trades`);

      // Get weekly P&L (trades from this week)
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const weeklyTrades = await Trade.find({
        userId,
        date: { $gte: startOfWeek }
      });

      const weeklyPnl = weeklyTrades.reduce((sum, trade) => sum + (trade.pnl_usd || 0), 0);
      const weeklyPnlR = currentR > 0 ? weeklyPnl / currentR : 0;

      console.log(`[BotStatusService] Weekly P&L: $${weeklyPnl.toFixed(2)} from ${weeklyTrades.length} trades`);

      // Get starting capital from deposits
      const startingCapital = await depositService.getNetDeposits(userId);
      console.log(`[BotStatusService] Starting capital (net deposits): $${startingCapital.toFixed(2)}`);

      // Get realized P&L from all closed trades
      const allClosedTrades = await Trade.find({ userId });
      const totalRealizedPnl = allClosedTrades.reduce((sum, trade) => sum + (trade.pnl_usd || 0), 0);

      // Calculate current equity
      // equity = deposits - withdrawals + realized_pnl + unrealized_pnl
      const equity = startingCapital + totalRealizedPnl + totalUnrealizedPnl;
      
      // Calculate total P&L
      const totalPnl = totalRealizedPnl + totalUnrealizedPnl;
      const totalPnlPct = startingCapital > 0 ? (totalPnl / startingCapital) * 100 : 0;
      
      console.log(`[BotStatusService] Equity calculation: $${startingCapital.toFixed(2)} (deposits) + $${totalRealizedPnl.toFixed(2)} (realized) + $${totalUnrealizedPnl.toFixed(2)} (unrealized) = $${equity.toFixed(2)}`);
      console.log(`[BotStatusService] Total P&L: $${totalPnl.toFixed(2)} (${totalPnlPct.toFixed(2)}%)`);
      
      // Update BotState with calculated values
      let botState = await BotState.findOne({ userId });
      if (!botState) {
        botState = await BotState.create({
          userId,
          status: 'ACTIVE',
          startingEquity: startingCapital,
          equity,
          currentR,
          totalEquity: equity,
          availableCapital: equity,
          dailyPnl,
          dailyPnlR,
          weeklyPnl,
          weeklyPnlR,
        });
      } else {
        botState.startingEquity = startingCapital;
        botState.equity = equity;
        botState.currentR = currentR;
        botState.dailyPnl = dailyPnl;
        botState.dailyPnlR = dailyPnlR;
        botState.weeklyPnl = weeklyPnl;
        botState.weeklyPnlR = weeklyPnlR;
        await botState.save();
      }
      
      console.log(`[BotStatusService] Updated BotState with equity: $${equity.toFixed(2)}, startingCapital: $${startingCapital.toFixed(2)}`);

      // Calculate available capital and reserve level
      const positionsValue = openPositions.reduce((sum, pos) => {
        return sum + Math.abs(pos.position_size_usd || 0);
      }, 0);

      const availableCapital = equity - positionsValue;
      const reserveLevel = (availableCapital / equity) * 100;
      const totalExposurePct = (positionsValue / equity) * 100;

      console.log(`[BotStatusService] Calculated equity: $${equity.toFixed(2)}`);

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
        startingCapital: Math.round(startingCapital * 100) / 100,
        currentR: Math.round(currentR * 100) / 100,
        totalPnl: Math.round(totalPnl * 100) / 100,
        totalPnlPct: Math.round(totalPnlPct * 100) / 100,
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
        startingCapital: botStatus.startingCapital,
        totalPnl: botStatus.totalPnl,
        totalPnlPct: botStatus.totalPnlPct,
        openPositions: botStatus.openPositions
      });

      this.cache.set(cacheKey, { data: botStatus, timestamp: Date.now() });
      return botStatus;
    } catch (error) {
      console.error('[BotStatusService] Error getting bot status:', error);
      throw error;
    }
  }
}

export default new BotStatusService();

