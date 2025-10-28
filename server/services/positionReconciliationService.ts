import Position from '../models/Position';
import binanceService from './binanceService';
import { Types } from 'mongoose';

interface ReconciliationResult {
  timestamp: Date;
  databasePositions: number;
  binancePositions: number;
  matched: number;
  missingInDatabase: string[];
  missingInBinance: string[];
  discrepancies: Array<{
    symbol: string;
    dbQuantity: number;
    binanceQuantity: number;
    difference: number;
  }>;
  fixed: number;
  errors: string[];
}

class PositionReconciliationService {
  /**
   * Reconcile database positions with actual Binance positions
   */
  async reconcile(userId: Types.ObjectId): Promise<ReconciliationResult> {
    const result: ReconciliationResult = {
      timestamp: new Date(),
      databasePositions: 0,
      binancePositions: 0,
      matched: 0,
      missingInDatabase: [],
      missingInBinance: [],
      discrepancies: [],
      fixed: 0,
      errors: [],
    };

    try {
      // Get database positions
      const dbPositions = await Position.find({
        userId,
        status: 'OPEN',
      });
      result.databasePositions = dbPositions.length;

      // Get actual Binance positions
      if (!binanceService.isConfigured()) {
        result.errors.push('Binance API not configured - cannot fetch actual positions');
        return result;
      }

      const account = await binanceService.getAccountInfo();
      const binanceBalances = account.balances.filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
      result.binancePositions = binanceBalances.length;

      // Create maps for comparison
      const dbPositionMap = new Map<string, typeof dbPositions[0]>();
      for (const pos of dbPositions) {
        // Extract base asset from symbol (e.g., BTC from BTCUSD)
        const baseAsset = pos.symbol.replace(/USD$/, '');
        dbPositionMap.set(baseAsset, pos);
      }

      const binanceBalanceMap = new Map<string, any>();
      for (const balance of binanceBalances) {
        const total = parseFloat(balance.free) + parseFloat(balance.locked);
        if (total > 0) {
          binanceBalanceMap.set(balance.asset, balance);
        }
      }

      // Check for positions missing in database and auto-create them
      for (const [asset, balance] of binanceBalanceMap.entries()) {
        if (asset === 'USD' || asset === 'USDT' || asset === 'USDC') {
          continue; // Skip stablecoins
        }

        if (!dbPositionMap.has(asset)) {
          result.missingInDatabase.push(asset);
          console.warn(`[Reconciliation] Position ${asset} exists in Binance but not in database`);
          
          // Auto-fix: Create position record for existing holding
          try {
            const symbol = `${asset}USD`;
            const quantity = parseFloat(balance.free) + parseFloat(balance.locked);
            
            // Get current market price
            let currentPrice = 0;
            try {
              const ticker = await binanceService.getTickerPrice(symbol);
              currentPrice = parseFloat(ticker.price);
            } catch (priceError) {
              console.error(`[Reconciliation] Could not fetch price for ${symbol}:`, priceError);
              result.errors.push(`Could not fetch price for ${symbol}`);
              continue; // Skip if we can't get price
            }
            
            // Create position with MANUAL playbook
            const newPosition = new Position({
              userId,
              symbol,
              side: 'LONG',
              entry_price: currentPrice,
              quantity,
              playbook: 'MANUAL',
              status: 'OPEN',
              opened_at: new Date(),
            });
            
            await newPosition.save();
            result.fixed++;
            console.log(`[Reconciliation] Auto-created position for ${asset}: ${quantity} @ $${currentPrice}`);
          } catch (error) {
            console.error(`[Reconciliation] Failed to create position for ${asset}:`, error);
            result.errors.push(`Failed to create position for ${asset}: ${error}`);
          }
        }
      }

      // Check for positions missing in Binance
      for (const [asset, dbPos] of dbPositionMap.entries()) {
        if (!binanceBalanceMap.has(asset)) {
          result.missingInBinance.push(asset);
          console.warn(`[Reconciliation] Position ${asset} exists in database but not in Binance`);
          
          // Auto-fix: Mark as closed in database
          try {
            await Position.updateOne(
              { _id: dbPos._id },
              {
                status: 'CLOSED',
                close_reason: 'Reconciliation: Position not found in Binance',
                closed_at: new Date(),
              }
            );
            result.fixed++;
            console.log(`[Reconciliation] Auto-fixed: Closed ${asset} position in database`);
          } catch (error) {
            result.errors.push(`Failed to close ${asset} position: ${error}`);
          }
        }
      }

      // Check for quantity discrepancies
      for (const [asset, dbPos] of dbPositionMap.entries()) {
        const binanceBalance = binanceBalanceMap.get(asset);
        if (binanceBalance) {
          const dbQuantity = dbPos.quantity;
          const binanceQuantity = parseFloat(binanceBalance.free) + parseFloat(binanceBalance.locked);
          const difference = Math.abs(dbQuantity - binanceQuantity);
          const tolerance = dbQuantity * 0.01; // 1% tolerance

          if (difference > tolerance) {
            result.discrepancies.push({
              symbol: dbPos.symbol,
              dbQuantity,
              binanceQuantity,
              difference,
            });
            console.warn(`[Reconciliation] Quantity mismatch for ${asset}: DB=${dbQuantity}, Binance=${binanceQuantity}`);

            // Auto-fix: Update database quantity
            try {
              await Position.updateOne(
                { _id: dbPos._id },
                { quantity: binanceQuantity }
              );
              result.fixed++;
              console.log(`[Reconciliation] Auto-fixed: Updated ${asset} quantity to ${binanceQuantity}`);
            } catch (error) {
              result.errors.push(`Failed to update ${asset} quantity: ${error}`);
            }
          } else {
            result.matched++;
          }
        }
      }

      console.log('[Reconciliation] Complete:', {
        matched: result.matched,
        missingInDB: result.missingInDatabase.length,
        missingInBinance: result.missingInBinance.length,
        discrepancies: result.discrepancies.length,
        fixed: result.fixed,
      });

    } catch (error) {
      console.error('[Reconciliation] Error:', error);
      result.errors.push(`Reconciliation failed: ${error}`);
    }

    return result;
  }

  /**
   * Schedule periodic reconciliation
   */
  startPeriodicReconciliation(userId: Types.ObjectId, intervalMinutes: number = 60): NodeJS.Timeout {
    console.log(`[Reconciliation] Starting periodic reconciliation every ${intervalMinutes} minutes`);
    
    return setInterval(async () => {
      try {
        const result = await this.reconcile(userId);
        
        // Alert if significant issues found
        if (result.missingInDatabase.length > 0 || result.missingInBinance.length > 2 || result.discrepancies.length > 0) {
          console.warn('[Reconciliation] Significant discrepancies found:', result);
          
          // Send warning alert
          const alertService = (await import('./alertService')).default;
          await alertService.warning(
            'Position Reconciliation Discrepancies Detected',
            `Found ${result.missingInDatabase.length} positions missing in database, ${result.missingInBinance.length} missing in Binance, and ${result.discrepancies.length} discrepancies.`,
            {
              missingInDatabase: result.missingInDatabase.length,
              missingInBinance: result.missingInBinance.length,
              discrepancies: result.discrepancies.length,
              details: result
            }
          );
        }
      } catch (error) {
        console.error('[Reconciliation] Periodic reconciliation error:', error);
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Get reconciliation report for API/dashboard
   */
  async getReconciliationReport(userId: Types.ObjectId): Promise<ReconciliationResult> {
    return this.reconcile(userId);
  }
}

export default new PositionReconciliationService();

