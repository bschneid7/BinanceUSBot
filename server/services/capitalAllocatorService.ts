/**
 * Capital Allocator Service
 * 
 * Manages dynamic capital allocation across strategy buckets
 */

import BotState from '../models/BotState';
import Position from '../models/Position';
import { Types } from 'mongoose';

const logger = console;

export interface StrategyBucket {
  name: string;
  target_allocation_pct: number; // Target % of capital
  current_allocation_usd: number; // Current $ allocated
  current_allocation_pct: number; // Current % of capital
  position_count: number;
  performance_7d: {
    pnl_usd: number;
    pnl_pct: number;
    win_rate: number;
    trade_count: number;
  };
}

export interface CapitalAllocation {
  total_equity: number;
  deployed_capital: number;
  reserve_capital: number;
  buckets: {
    grid_trading: StrategyBucket;
    directional: StrategyBucket;
    scalping: StrategyBucket;
    reserve: StrategyBucket;
  };
  recommendations: string[];
}

class CapitalAllocatorService {
  /**
   * Calculate current capital allocation across strategy buckets
   */
  async calculateAllocation(userId: Types.ObjectId): Promise<CapitalAllocation> {
    try {
      logger.log('[CapitalAllocator] Calculating capital allocation...');
      
      // Get bot state
      const botState = await BotState.findOne({ user_id: userId });
      if (!botState) {
        throw new Error('Bot state not found');
      }
      
      const totalEquity = botState.equity || 0;
      
      // Get all open positions
      const positions = await Position.find({
        user_id: userId,
        status: 'OPEN',
      });
      
      // Calculate capital by strategy
      const gridCapital = this.calculateGridCapital(positions);
      const directionalCapital = this.calculateDirectionalCapital(positions);
      const scalpingCapital = 0; // Not implemented yet
      
      const deployedCapital = gridCapital + directionalCapital + scalpingCapital;
      const reserveCapital = totalEquity - deployedCapital;
      
      // Calculate performance metrics (7-day)
      const gridPerf = await this.calculateStrategyPerformance(userId, 'GRID', 7);
      const directionalPerf = await this.calculateStrategyPerformance(userId, 'DIRECTIONAL', 7);
      
      // Build allocation object
      const allocation: CapitalAllocation = {
        total_equity: totalEquity,
        deployed_capital: deployedCapital,
        reserve_capital: reserveCapital,
        buckets: {
          grid_trading: {
            name: 'Grid Trading',
            target_allocation_pct: 35,
            current_allocation_usd: gridCapital,
            current_allocation_pct: (gridCapital / totalEquity) * 100,
            position_count: positions.filter(p => p.strategy === 'GRID').length,
            performance_7d: gridPerf,
          },
          directional: {
            name: 'Directional',
            target_allocation_pct: 40,
            current_allocation_usd: directionalCapital,
            current_allocation_pct: (directionalCapital / totalEquity) * 100,
            position_count: positions.filter(p => p.strategy !== 'GRID').length,
            performance_7d: directionalPerf,
          },
          scalping: {
            name: 'Scalping',
            target_allocation_pct: 10,
            current_allocation_usd: scalpingCapital,
            current_allocation_pct: 0,
            position_count: 0,
            performance_7d: { pnl_usd: 0, pnl_pct: 0, win_rate: 0, trade_count: 0 },
          },
          reserve: {
            name: 'Reserve',
            target_allocation_pct: 15,
            current_allocation_usd: reserveCapital,
            current_allocation_pct: (reserveCapital / totalEquity) * 100,
            position_count: 0,
            performance_7d: { pnl_usd: 0, pnl_pct: 0, win_rate: 0, trade_count: 0 },
          },
        },
        recommendations: [],
      };
      
      // Generate recommendations
      allocation.recommendations = this.generateRecommendations(allocation);
      
      logger.log('[CapitalAllocator] Allocation calculated:', {
        total: totalEquity.toFixed(2),
        deployed: deployedCapital.toFixed(2),
        reserve: reserveCapital.toFixed(2),
        grid_pct: allocation.buckets.grid_trading.current_allocation_pct.toFixed(1),
        directional_pct: allocation.buckets.directional.current_allocation_pct.toFixed(1),
      });
      
      return allocation;
    } catch (error) {
      logger.error('[CapitalAllocator] Error calculating allocation:', error);
      throw error;
    }
  }
  
  /**
   * Calculate capital locked in grid trading
   */
  private calculateGridCapital(positions: any[]): number {
    return positions
      .filter(p => p.strategy === 'GRID')
      .reduce((sum, p) => sum + (p.position_size || 0), 0);
  }
  
  /**
   * Calculate capital in directional positions
   */
  private calculateDirectionalCapital(positions: any[]): number {
    return positions
      .filter(p => p.strategy !== 'GRID')
      .reduce((sum, p) => sum + (p.position_size || 0), 0);
  }
  
  /**
   * Calculate strategy performance over N days
   */
  private async calculateStrategyPerformance(
    userId: Types.ObjectId,
    strategy: string,
    days: number
  ): Promise<{ pnl_usd: number; pnl_pct: number; win_rate: number; trade_count: number }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      // Get closed positions from last N days
      const Trade = require('../models/Trade').default;
      const trades = await Trade.find({
        user_id: userId,
        strategy: strategy,
        exit_time: { $gte: cutoffDate },
        status: 'CLOSED',
      });
      
      if (trades.length === 0) {
        return { pnl_usd: 0, pnl_pct: 0, win_rate: 0, trade_count: 0 };
      }
      
      const totalPnl = trades.reduce((sum: number, t: any) => sum + (t.pnl || 0), 0);
      const avgPnlPct = trades.reduce((sum: number, t: any) => sum + (t.pnl_pct || 0), 0) / trades.length;
      const winners = trades.filter((t: any) => (t.pnl || 0) > 0).length;
      const winRate = (winners / trades.length) * 100;
      
      return {
        pnl_usd: totalPnl,
        pnl_pct: avgPnlPct,
        win_rate: winRate,
        trade_count: trades.length,
      };
    } catch (error) {
      logger.error(`[CapitalAllocator] Error calculating ${strategy} performance:`, error);
      return { pnl_usd: 0, pnl_pct: 0, win_rate: 0, trade_count: 0 };
    }
  }
  
  /**
   * Generate rebalancing recommendations
   */
  private generateRecommendations(allocation: CapitalAllocation): string[] {
    const recommendations: string[] = [];
    
    // Check grid trading allocation
    const gridDiff = allocation.buckets.grid_trading.current_allocation_pct - 
                     allocation.buckets.grid_trading.target_allocation_pct;
    if (Math.abs(gridDiff) > 5) {
      if (gridDiff > 0) {
        recommendations.push(`Grid trading overallocated by ${gridDiff.toFixed(1)}%. Consider reducing grid orders.`);
      } else {
        recommendations.push(`Grid trading underallocated by ${Math.abs(gridDiff).toFixed(1)}%. Consider adding grid orders.`);
      }
    }
    
    // Check directional allocation
    const dirDiff = allocation.buckets.directional.current_allocation_pct - 
                    allocation.buckets.directional.target_allocation_pct;
    if (Math.abs(dirDiff) > 5) {
      if (dirDiff > 0) {
        recommendations.push(`Directional overallocated by ${dirDiff.toFixed(1)}%. Consider closing weak positions.`);
      } else {
        recommendations.push(`Directional underallocated by ${Math.abs(dirDiff).toFixed(1)}%. Consider opening more positions.`);
      }
    }
    
    // Check reserve level
    const reservePct = allocation.buckets.reserve.current_allocation_pct;
    if (reservePct < 10) {
      recommendations.push(`⚠️ Reserve critically low at ${reservePct.toFixed(1)}%. Reduce exposure immediately.`);
    } else if (reservePct < 15) {
      recommendations.push(`Reserve below target at ${reservePct.toFixed(1)}%. Consider closing some positions.`);
    } else if (reservePct > 25) {
      recommendations.push(`Reserve high at ${reservePct.toFixed(1)}%. Capital available for deployment.`);
    }
    
    // Check performance-based recommendations
    if (allocation.buckets.grid_trading.performance_7d.win_rate > 60 && 
        allocation.buckets.grid_trading.performance_7d.trade_count > 10) {
      recommendations.push(`✅ Grid trading performing well (${allocation.buckets.grid_trading.performance_7d.win_rate.toFixed(0)}% win rate). Consider increasing allocation.`);
    }
    
    if (allocation.buckets.directional.performance_7d.win_rate < 40 && 
        allocation.buckets.directional.performance_7d.trade_count > 10) {
      recommendations.push(`⚠️ Directional trading underperforming (${allocation.buckets.directional.performance_7d.win_rate.toFixed(0)}% win rate). Consider reducing allocation.`);
    }
    
    return recommendations;
  }
  
  /**
   * Get recommended position size for new trade
   */
  async getRecommendedPositionSize(
    userId: Types.ObjectId,
    strategy: string,
    signalTier?: string
  ): Promise<number> {
    try {
      const allocation = await this.calculateAllocation(userId);
      const totalEquity = allocation.total_equity;
      
      // Base position size from signal tier or default
      let baseSizePct = 1.5; // Default 1.5%
      
      if (signalTier === 'TIER_1_CONSERVATIVE') {
        baseSizePct = 2.5;
      } else if (signalTier === 'TIER_2_MODERATE') {
        baseSizePct = 1.5;
      } else if (signalTier === 'TIER_3_AGGRESSIVE') {
        baseSizePct = 1.0;
      }
      
      // Adjust based on reserve level
      const reservePct = allocation.buckets.reserve.current_allocation_pct;
      let reserveMultiplier = 1.0;
      
      if (reservePct < 10) {
        reserveMultiplier = 0.5; // Reduce size if reserve low
      } else if (reservePct < 15) {
        reserveMultiplier = 0.75;
      } else if (reservePct > 25) {
        reserveMultiplier = 1.2; // Increase size if reserve high
      }
      
      const recommendedSize = (totalEquity * baseSizePct / 100) * reserveMultiplier;
      
      logger.log(`[CapitalAllocator] Recommended position size: $${recommendedSize.toFixed(2)} (${baseSizePct}% × ${reserveMultiplier.toFixed(2)})`);
      
      return recommendedSize;
    } catch (error) {
      logger.error('[CapitalAllocator] Error calculating position size:', error);
      return 0;
    }
  }
}

export default new CapitalAllocatorService();
