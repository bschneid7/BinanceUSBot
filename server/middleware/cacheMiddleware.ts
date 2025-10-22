/**
 * Cache Middleware
 * 
 * Express middleware for caching API responses
 */

import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../services/cacheService';

interface CacheOptions {
  ttl: number; // Time to live in seconds
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request) => boolean;
}

/**
 * Cache middleware factory
 * 
 * @param options Cache configuration
 * @returns Express middleware
 */
export function cacheMiddleware(options: CacheOptions) {
  const { ttl, keyGenerator, condition } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Check condition if provided
    if (condition && !condition(req)) {
      return next();
    }

    // Generate cache key
    const cacheKey = keyGenerator 
      ? keyGenerator(req)
      : `${req.method}:${req.originalUrl}`;

    // Try to get from cache
    const cachedData = cacheService.get(cacheKey);
    
    if (cachedData) {
      // Add cache hit header
      res.set('X-Cache', 'HIT');
      res.set('X-Cache-Key', cacheKey);
      return res.json(cachedData);
    }

    // Cache miss - intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    
    res.json = function(data: any) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cacheService.set(cacheKey, data, ttl);
      }
      
      // Add cache miss header
      res.set('X-Cache', 'MISS');
      res.set('X-Cache-Key', cacheKey);
      
      return originalJson(data);
    };

    next();
  };
}

/**
 * Invalidate cache by pattern
 * 
 * @param pattern Cache key pattern to invalidate
 */
export function invalidateCache(pattern: string): number {
  return cacheService.deletePattern(pattern);
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return cacheService.getStats();
}

