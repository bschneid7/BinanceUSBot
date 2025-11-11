/**
 * Rate Limit Manager for Binance API
 * 
 * Prevents API bans by enforcing Binance.US rate limits:
 * - Max 1200 weight per minute
 * - Max 10 requests per second
 * 
 * Features:
 * - Automatic request queuing
 * - Weight-based throttling
 * - Per-second request limiting
 * - Usage monitoring
 * - Auto-retry with backoff
 */

import logger from '../utils/logger';

interface RateLimitConfig {
  maxWeightPerMinute: number; // 1200 for Binance.US
  maxRequestsPerSecond: number; // 10 for Binance.US
  enableLogging: boolean;
}

interface RateLimitUsage {
  currentWeight: number;
  maxWeight: number;
  requestsThisSecond: number;
  maxRequestsPerSecond: number;
  utilizationPercent: number;
  minuteResetIn: number; // seconds until weight resets
}

class RateLimitManager {
  private config: RateLimitConfig;
  private currentMinuteWeight: number = 0;
  private minuteStartTime: number = Date.now();
  private requestTimestamps: number[] = [];
  private totalRequestsBlocked: number = 0;
  private totalRequestsAllowed: number = 0;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      maxWeightPerMinute: config.maxWeightPerMinute || 1200,
      maxRequestsPerSecond: config.maxRequestsPerSecond || 10,
      enableLogging: config.enableLogging !== undefined ? config.enableLogging : true,
    };

    if (this.config.enableLogging) {
      logger.info('[RateLimitManager] Initialized with config:', {
        maxWeightPerMinute: this.config.maxWeightPerMinute,
        maxRequestsPerSecond: this.config.maxRequestsPerSecond,
      });
    }

    // Log usage stats every 5 minutes
    setInterval(() => {
      this.logUsageStats();
    }, 5 * 60 * 1000);
  }

  /**
   * Acquire permission to make an API request
   * Blocks until rate limits allow the request
   */
  async acquire(weight: number = 1): Promise<void> {
    const startTime = Date.now();
    let attempts = 0;

    while (true) {
      attempts++;
      const now = Date.now();

      // Reset minute window if 60 seconds passed
      if (now - this.minuteStartTime >= 60000) {
        this.minuteStartTime = now;
        this.currentMinuteWeight = 0;
        
        if (this.config.enableLogging && this.currentMinuteWeight > 0) {
          logger.info('[RateLimitManager] Minute window reset');
        }
      }

      // Check weight limit
      const weightAvailable = this.config.maxWeightPerMinute - this.currentMinuteWeight;
      
      if (weightAvailable >= weight) {
        // Check per-second limit
        this.requestTimestamps = this.requestTimestamps.filter(ts => now - ts < 1000);
        
        if (this.requestTimestamps.length < this.config.maxRequestsPerSecond) {
          // Grant permission
          this.currentMinuteWeight += weight;
          this.requestTimestamps.push(now);
          this.totalRequestsAllowed++;

          const waitTime = now - startTime;
          if (waitTime > 100 && this.config.enableLogging) {
            logger.warn(`[RateLimitManager] Request delayed ${waitTime}ms (weight: ${weight}, attempts: ${attempts})`);
          }

          return;
        }
      }

      // Request blocked - wait before retrying
      this.totalRequestsBlocked++;
      
      if (attempts === 1 && this.config.enableLogging) {
        logger.warn(`[RateLimitManager] Rate limit reached, queuing request (weight: ${weight})`);
      }

      // Calculate optimal wait time
      const waitTime = this.calculateWaitTime(weight);
      await this.sleep(waitTime);
    }
  }

  /**
   * Execute a function with rate limiting
   */
  async rateLimitedCall<T>(
    func: () => Promise<T>,
    weight: number = 1,
    description?: string
  ): Promise<T> {
    await this.acquire(weight);
    
    try {
      const result = await func();
      return result;
    } catch (error) {
      if (this.config.enableLogging) {
        logger.error(`[RateLimitManager] Error in rate-limited call${description ? ` (${description})` : ''}:`, error);
      }
      throw error;
    }
  }

  /**
   * Calculate optimal wait time based on current state
   */
  private calculateWaitTime(weight: number): number {
    const now = Date.now();
    
    // Check weight limit
    const weightAvailable = this.config.maxWeightPerMinute - this.currentMinuteWeight;
    if (weightAvailable < weight) {
      // Need to wait for minute window to reset
      const timeUntilReset = 60000 - (now - this.minuteStartTime);
      return Math.min(timeUntilReset + 100, 5000); // Max 5 seconds
    }

    // Check per-second limit
    this.requestTimestamps = this.requestTimestamps.filter(ts => now - ts < 1000);
    if (this.requestTimestamps.length >= this.config.maxRequestsPerSecond) {
      // Wait until oldest request is >1 second old
      const oldestRequest = Math.min(...this.requestTimestamps);
      const timeUntilAvailable = 1000 - (now - oldestRequest);
      return Math.max(timeUntilAvailable + 50, 100); // At least 100ms
    }

    // Default wait
    return 100;
  }

  /**
   * Get current rate limit usage
   */
  getUsage(): RateLimitUsage {
    const now = Date.now();
    const recentRequests = this.requestTimestamps.filter(ts => now - ts < 1000);
    const minuteResetIn = Math.ceil((60000 - (now - this.minuteStartTime)) / 1000);
    
    return {
      currentWeight: this.currentMinuteWeight,
      maxWeight: this.config.maxWeightPerMinute,
      requestsThisSecond: recentRequests.length,
      maxRequestsPerSecond: this.config.maxRequestsPerSecond,
      utilizationPercent: (this.currentMinuteWeight / this.config.maxWeightPerMinute) * 100,
      minuteResetIn: Math.max(minuteResetIn, 0),
    };
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalRequestsAllowed: number;
    totalRequestsBlocked: number;
    blockRate: number;
    currentUsage: RateLimitUsage;
  } {
    const blockRate = this.totalRequestsAllowed > 0
      ? (this.totalRequestsBlocked / (this.totalRequestsAllowed + this.totalRequestsBlocked)) * 100
      : 0;

    return {
      totalRequestsAllowed: this.totalRequestsAllowed,
      totalRequestsBlocked: this.totalRequestsBlocked,
      blockRate,
      currentUsage: this.getUsage(),
    };
  }

  /**
   * Log usage statistics
   */
  private logUsageStats(): void {
    const stats = this.getStats();
    
    if (this.config.enableLogging) {
      logger.info('[RateLimitManager] Usage stats:', {
        allowed: stats.totalRequestsAllowed,
        blocked: stats.totalRequestsBlocked,
        blockRate: `${stats.blockRate.toFixed(2)}%`,
        currentWeight: stats.currentUsage.currentWeight,
        utilization: `${stats.currentUsage.utilizationPercent.toFixed(1)}%`,
      });
    }
  }

  /**
   * Reset statistics (for testing)
   */
  resetStats(): void {
    this.totalRequestsAllowed = 0;
    this.totalRequestsBlocked = 0;
    this.currentMinuteWeight = 0;
    this.minuteStartTime = Date.now();
    this.requestTimestamps = [];
    
    if (this.config.enableLogging) {
      logger.info('[RateLimitManager] Statistics reset');
    }
  }

  /**
   * Check if a request would be allowed without blocking
   */
  wouldAllow(weight: number = 1): boolean {
    const now = Date.now();
    
    // Check minute window
    if (now - this.minuteStartTime >= 60000) {
      return true; // Window would reset
    }

    // Check weight limit
    const weightAvailable = this.config.maxWeightPerMinute - this.currentMinuteWeight;
    if (weightAvailable < weight) {
      return false;
    }

    // Check per-second limit
    const recentRequests = this.requestTimestamps.filter(ts => now - ts < 1000);
    if (recentRequests.length >= this.config.maxRequestsPerSecond) {
      return false;
    }

    return true;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
const rateLimitManager = new RateLimitManager();
export default rateLimitManager;
