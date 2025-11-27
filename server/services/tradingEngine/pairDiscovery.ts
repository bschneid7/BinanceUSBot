import logger from '../../utils/logger';
import binanceService from '../binanceService';
import exchangeInfoCache from '../exchangeInfoCache';

/**
 * Dynamic Pair Discovery Service
 * Automatically discovers trading pairs based on actual account holdings
 * Eliminates hardcoded pair lists
 */
export class PairDiscovery {
  private cachedPairs: string[] = [];
  private lastUpdate: number = 0;
  private readonly CACHE_TTL_MS = 60000; // Refresh every 60 seconds

  /**
   * Get all active trading pairs based on current account balances
   * Returns pairs for ALL assets with non-zero balances
   */
  async getActiveTradingPairs(): Promise<string[]> {
    try {
      // Use cache if fresh
      const now = Date.now();
      if (this.cachedPairs.length > 0 && now - this.lastUpdate < this.CACHE_TTL_MS) {
        return this.cachedPairs;
      }

      logger.info('[PairDiscovery] Discovering trading pairs from account balances...');

      // 1. Get all account balances from Binance
      const balances = await binanceService.getAllBalances();
      
      // 2. Filter to assets with non-zero balances
      const assets = balances
        .filter(b => {
          const total = parseFloat(b.free) + parseFloat(b.locked);
          return total > 0;
        })
        .map(b => b.asset);

      logger.info(`[PairDiscovery] Found ${assets.length} assets with non-zero balances:`, assets);

      // 3. Generate trading pairs for each asset
      const pairs: string[] = [];
      const exchangeInfo = await exchangeInfoCache.getExchangeInfo();
      const tradingSymbols = new Set(
        exchangeInfo.symbols
          .filter(s => s.status === 'TRADING')
          .map(s => s.symbol)
      );

      for (const asset of assets) {
        // Skip stablecoins and quote currencies
        if (['USD', 'USDT', 'BUSD', 'USDC', 'DAI'].includes(asset)) {
          continue;
        }

        // Try USD first (preferred on Binance.US for better liquidity)
        const usdPair = `${asset}USD`;
        if (tradingSymbols.has(usdPair)) {
          pairs.push(usdPair);
          logger.info(`[PairDiscovery] ✅ Added ${usdPair}`);
        }

        // Try USDT as fallback
        const usdtPair = `${asset}USDT`;
        if (tradingSymbols.has(usdtPair)) {
          pairs.push(usdtPair);
          logger.info(`[PairDiscovery] ✅ Added ${usdtPair}`);
        }

        // Try BUSD as second fallback
        const busdPair = `${asset}BUSD`;
        if (tradingSymbols.has(busdPair)) {
          pairs.push(busdPair);
          logger.info(`[PairDiscovery] ✅ Added ${busdPair}`);
        }
      }

      // Remove duplicates
      const uniquePairs = Array.from(new Set(pairs));

      logger.info(`[PairDiscovery] ✅ Discovered ${uniquePairs.length} trading pairs dynamically`);

      // Update cache
      this.cachedPairs = uniquePairs;
      this.lastUpdate = now;

      return uniquePairs;
    } catch (error) {
      logger.error('[PairDiscovery] Error discovering trading pairs:', error);
      
      // Return cached pairs if available, otherwise empty array
      if (this.cachedPairs.length > 0) {
        logger.warn('[PairDiscovery] Using cached pairs due to error');
        return this.cachedPairs;
      }
      
      return [];
    }
  }

  /**
   * Force refresh of pair cache
   */
  async refresh(): Promise<string[]> {
    this.lastUpdate = 0; // Invalidate cache
    return this.getActiveTradingPairs();
  }

  /**
   * Get cached pairs without refresh
   */
  getCachedPairs(): string[] {
    return this.cachedPairs;
  }
}

// Export singleton instance
export const pairDiscovery = new PairDiscovery();
export default pairDiscovery;
