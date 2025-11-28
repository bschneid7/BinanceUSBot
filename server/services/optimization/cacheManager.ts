import { redis } from '../messageQueue';
import { databaseOptimizer } from './databaseOptimizer';

/**
 * Cache Manager
 * Provides Redis caching for frequently accessed data
 */
export class CacheManager {
  private readonly POSITION_PREFIX = 'positions:';
  private readonly BALANCE_PREFIX = 'balance:';
  private readonly STATS_PREFIX = 'stats:';
  private readonly FILTER_PREFIX = 'filter:';

  private readonly POSITION_TTL = 10; // 10 seconds
  private readonly BALANCE_TTL = 5; // 5 seconds
  private readonly STATS_TTL = 60; // 60 seconds
  private readonly FILTER_TTL = 86400; // 24 hours

  /**
   * Cache open positions
   */
  async cacheOpenPositions(userId: string, positions: any[]): Promise<void> {
    try {
      const key = `${this.POSITION_PREFIX}${userId}:open`;
      await redis.setex(key, this.POSITION_TTL, JSON.stringify(positions));
    } catch (error) {
      console.error('[CacheManager] Error caching positions:', error);
    }
  }

  /**
   * Get cached open positions
   */
  async getCachedOpenPositions(userId: string): Promise<any[] | null> {
    try {
      const key = `${this.POSITION_PREFIX}${userId}:open`;
      const cached = await redis.get(key);

      if (cached) {
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      console.error('[CacheManager] Error getting cached positions:', error);
      return null;
    }
  }

  /**
   * Get open positions with cache
   */
  async getOpenPositions(userId: string): Promise<any[]> {
    // Try cache first
    const cached = await this.getCachedOpenPositions(userId);

    if (cached) {
      return cached;
    }

    // Cache miss - fetch from database
    const positions = await databaseOptimizer.getOpenPositions(userId);

    // Cache the result
    await this.cacheOpenPositions(userId, positions);

    return positions;
  }

  /**
   * Invalidate position cache
   */
  async invalidatePositionCache(userId: string): Promise<void> {
    try {
      const key = `${this.POSITION_PREFIX}${userId}:open`;
      await redis.del(key);
    } catch (error) {
      console.error('[CacheManager] Error invalidating position cache:', error);
    }
  }

  /**
   * Cache account balance
   */
  async cacheBalance(userId: string, balance: any): Promise<void> {
    try {
      const key = `${this.BALANCE_PREFIX}${userId}`;
      await redis.setex(key, this.BALANCE_TTL, JSON.stringify(balance));
    } catch (error) {
      console.error('[CacheManager] Error caching balance:', error);
    }
  }

  /**
   * Get cached balance
   */
  async getCachedBalance(userId: string): Promise<any | null> {
    try {
      const key = `${this.BALANCE_PREFIX}${userId}`;
      const cached = await redis.get(key);

      if (cached) {
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      console.error('[CacheManager] Error getting cached balance:', error);
      return null;
    }
  }

  /**
   * Invalidate balance cache
   */
  async invalidateBalanceCache(userId: string): Promise<void> {
    try {
      const key = `${this.BALANCE_PREFIX}${userId}`;
      await redis.del(key);
    } catch (error) {
      console.error('[CacheManager] Error invalidating balance cache:', error);
    }
  }

  /**
   * Cache playbook statistics
   */
  async cachePlaybookStats(playbook: string, stats: any): Promise<void> {
    try {
      const key = `${this.STATS_PREFIX}playbook:${playbook}`;
      await redis.setex(key, this.STATS_TTL, JSON.stringify(stats));
    } catch (error) {
      console.error('[CacheManager] Error caching playbook stats:', error);
    }
  }

  /**
   * Get cached playbook statistics
   */
  async getCachedPlaybookStats(playbook: string): Promise<any | null> {
    try {
      const key = `${this.STATS_PREFIX}playbook:${playbook}`;
      const cached = await redis.get(key);

      if (cached) {
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      console.error('[CacheManager] Error getting cached playbook stats:', error);
      return null;
    }
  }

  /**
   * Get playbook stats with cache
   */
  async getPlaybookStats(playbook: string, days: number = 30): Promise<any> {
    // Try cache first
    const cached = await this.getCachedPlaybookStats(playbook);

    if (cached) {
      return cached;
    }

    // Cache miss - fetch from database
    const stats = await databaseOptimizer.getPlaybookStats(playbook, days);

    // Cache the result
    await this.cachePlaybookStats(playbook, stats);

    return stats;
  }

  /**
   * Cache exchange filter
   */
  async cacheExchangeFilter(symbol: string, filter: any): Promise<void> {
    try {
      const key = `${this.FILTER_PREFIX}${symbol}`;
      await redis.setex(key, this.FILTER_TTL, JSON.stringify(filter));
    } catch (error) {
      console.error('[CacheManager] Error caching exchange filter:', error);
    }
  }

  /**
   * Get cached exchange filter
   */
  async getCachedExchangeFilter(symbol: string): Promise<any | null> {
    try {
      const key = `${this.FILTER_PREFIX}${symbol}`;
      const cached = await redis.get(key);

      if (cached) {
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      console.error('[CacheManager] Error getting cached exchange filter:', error);
      return null;
    }
  }

  /**
   * Batch cache exchange filters
   */
  async batchCacheExchangeFilters(filters: Map<string, any>): Promise<void> {
    try {
      const pipeline = redis.pipeline();

      for (const [symbol, filter] of filters.entries()) {
        const key = `${this.FILTER_PREFIX}${symbol}`;
        pipeline.setex(key, this.FILTER_TTL, JSON.stringify(filter));
      }

      await pipeline.exec();
    } catch (error) {
      console.error('[CacheManager] Error batch caching exchange filters:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalKeys: number;
    positionKeys: number;
    balanceKeys: number;
    statsKeys: number;
    filterKeys: number;
    priceKeys: number;
  }> {
    try {
      const [
        positionKeys,
        balanceKeys,
        statsKeys,
        filterKeys,
        priceKeys,
      ] = await Promise.all([
        redis.keys(`${this.POSITION_PREFIX}*`),
        redis.keys(`${this.BALANCE_PREFIX}*`),
        redis.keys(`${this.STATS_PREFIX}*`),
        redis.keys(`${this.FILTER_PREFIX}*`),
        redis.keys('price:*'),
      ]);

      return {
        totalKeys: positionKeys.length + balanceKeys.length + statsKeys.length + filterKeys.length + priceKeys.length,
        positionKeys: positionKeys.length,
        balanceKeys: balanceKeys.length,
        statsKeys: statsKeys.length,
        filterKeys: filterKeys.length,
        priceKeys: priceKeys.length,
      };
    } catch (error) {
      console.error('[CacheManager] Error getting cache stats:', error);
      return {
        totalKeys: 0,
        positionKeys: 0,
        balanceKeys: 0,
        statsKeys: 0,
        filterKeys: 0,
        priceKeys: 0,
      };
    }
  }

  /**
   * Clear all caches
   */
  async clearAllCaches(): Promise<void> {
    try {
      const keys = await redis.keys('*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      console.log(`[CacheManager] Cleared ${keys.length} cache keys`);
    } catch (error) {
      console.error('[CacheManager] Error clearing caches:', error);
    }
  }

  /**
   * Clear specific cache type
   */
  async clearCache(prefix: string): Promise<void> {
    try {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      console.log(`[CacheManager] Cleared ${keys.length} ${prefix} cache keys`);
    } catch (error) {
      console.error(`[CacheManager] Error clearing ${prefix} cache:`, error);
    }
  }
}

// Singleton instance
export const cacheManager = new CacheManager();
