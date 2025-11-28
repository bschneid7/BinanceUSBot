/**
 * Position Importer
 * 
 * Creates position records for existing crypto holdings that aren't tracked.
 * Allows the bot to manage all assets in the account, not just ones it opened.
 */

import logger from '../utils/logger';
import binanceService from './binanceService';
import Position from '../models/Position';
import eventStore from './eventStore';

class PositionImporter {
  /**
   * Import all untracked crypto holdings as positions
   */
  async importUntrackedHoldings(userId: string): Promise<{
    imported: number;
    skipped: number;
    failed: number;
    positions: any[];
  }> {
    try {
      logger.info('[PositionImporter] Starting import of untracked holdings...');
      
      // Get account balances
      const accountInfo = await binanceService.getAccountInfo();
      
      // Get existing positions
      const existingPositions = await Position.find({
        userId,
        status: 'OPEN'
      });
      
      const existingSymbols = new Set(
        existingPositions.map(p => p.symbol.replace('USD', '').replace('USDT', ''))
      );
      
      logger.info(`[PositionImporter] Found ${existingPositions.length} existing positions`);
      
      const results = {
        imported: 0,
        skipped: 0,
        failed: 0,
        positions: [] as any[]
      };
      
      // Process each balance
      for (const balance of accountInfo.balances) {
        const asset = balance.asset;
        const free = parseFloat(balance.free);
        const locked = parseFloat(balance.locked);
        const total = free + locked;
        
        // Skip stablecoins and zero balances
        if (total <= 0 || asset === 'USD' || asset === 'USDT' || asset === 'USDC' || asset === 'BUSD') {
          continue;
        }
        
        // Skip if already tracked
        if (existingSymbols.has(asset)) {
          logger.info(`[PositionImporter] Skipping ${asset} - already tracked`);
          results.skipped++;
          continue;
        }
        
        try {
          // Get current market price
          const symbol = `${asset}USD`;
          let currentPrice: number;
          
          try {
            const ticker = await binanceService.getTickerPrice(symbol);
            currentPrice = parseFloat(ticker.price);
          } catch (error) {
            // Try USDT pair if USD pair doesn't exist
            try {
              const symbolUsdt = `${asset}USDT`;
              const ticker = await binanceService.getTickerPrice(symbolUsdt);
              currentPrice = parseFloat(ticker.price);
            } catch (error2) {
              logger.warn(`[PositionImporter] Could not get price for ${asset}, skipping`);
              results.skipped++;
              continue;
            }
          }
          
          // Calculate notional value
          const notionalValue = total * currentPrice;
          
          // Skip very small positions (< $10)
          if (notionalValue < 10) {
            logger.info(`[PositionImporter] Skipping ${asset} - value too small ($${notionalValue.toFixed(2)})`);
            results.skipped++;
            continue;
          }
          
          // Create position record
          const position = new Position({
            userId,
            symbol: symbol.endsWith('USD') ? symbol : `${asset}USDT`,
            side: 'LONG',
            playbook: 'MANUAL', // Mark as manually acquired
            entryPrice: currentPrice,
            quantity: total,
            notionalValue: notionalValue,
            stopPrice: currentPrice * 0.95, // 5% stop loss
            targetPrice: currentPrice * 1.10, // 10% target
            status: 'OPEN',
            entryTime: new Date(),
            unrealizedPnL: 0, // No P&L since we're using current price as entry
            notes: 'Imported from existing holdings'
          });
          
          await position.save();
          
          // Record event
          await eventStore.recordEvent({
            type: 'PositionImported',
            aggregateType: 'Position',
            aggregateId: position._id.toString(),
            data: {
              symbol: position.symbol,
              quantity: total,
              entryPrice: currentPrice,
              notionalValue: notionalValue
            }
          });
          
          logger.info(
            `[PositionImporter] ✅ Imported ${asset}: ${total.toFixed(8)} @ $${currentPrice.toFixed(2)} ` +
            `(notional: $${notionalValue.toFixed(2)})`
          );
          
          results.imported++;
          results.positions.push({
            asset,
            quantity: total,
            price: currentPrice,
            value: notionalValue
          });
          
        } catch (error) {
          logger.error(`[PositionImporter] ❌ Failed to import ${asset}:`, error);
          results.failed++;
        }
      }
      
      logger.info(
        `[PositionImporter] Import complete: ` +
        `${results.imported} imported, ${results.skipped} skipped, ${results.failed} failed`
      );
      
      return results;
      
    } catch (error) {
      logger.error('[PositionImporter] Error importing holdings:', error);
      throw error;
    }
  }
  
  /**
   * Get summary of untracked holdings
   */
  async getUntrackedHoldingsSummary(userId: string): Promise<{
    totalValue: number;
    count: number;
    assets: Array<{ asset: string; quantity: number; value: number }>;
  }> {
    try {
      const accountInfo = await binanceService.getAccountInfo();
      const existingPositions = await Position.find({ userId, status: 'OPEN' });
      const existingSymbols = new Set(
        existingPositions.map(p => p.symbol.replace('USD', '').replace('USDT', ''))
      );
      
      let totalValue = 0;
      const assets: Array<{ asset: string; quantity: number; value: number }> = [];
      
      for (const balance of accountInfo.balances) {
        const asset = balance.asset;
        const total = parseFloat(balance.free) + parseFloat(balance.locked);
        
        if (total <= 0 || asset === 'USD' || asset === 'USDT' || existingSymbols.has(asset)) {
          continue;
        }
        
        try {
          const symbol = `${asset}USD`;
          const ticker = await binanceService.getTickerPrice(symbol);
          const price = parseFloat(ticker.price);
          const value = total * price;
          
          if (value >= 10) {
            totalValue += value;
            assets.push({ asset, quantity: total, value });
          }
        } catch (error) {
          // Skip if can't get price
        }
      }
      
      return {
        totalValue,
        count: assets.length,
        assets: assets.sort((a, b) => b.value - a.value)
      };
      
    } catch (error) {
      logger.error('[PositionImporter] Error getting untracked summary:', error);
      throw error;
    }
  }
}

export default new PositionImporter();
