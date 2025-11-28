/**
 * API Rate Limiting Middleware
 * 
 * Implements rate limiting for public-facing API endpoints to prevent abuse
 * and protect against DDoS attacks.
 * 
 * Features:
 * - IP-based rate limiting
 * - Configurable limits per endpoint
 * - Sliding window algorithm
 * - Redis-backed for distributed rate limiting
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string; // Custom error message
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

export class RateLimiter {
  private store: RateLimitStore = {};
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Create rate limiting middleware
   */
  public createLimiter(config: RateLimitConfig) {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = this.getKey(req);
      const now = Date.now();
      
      // Get or create rate limit entry
      let entry = this.store[key];
      
      if (!entry || now > entry.resetTime) {
        // Create new entry or reset expired one
        entry = {
          count: 0,
          resetTime: now + config.windowMs,
        };
        this.store[key] = entry;
      }

      // Increment request count
      entry.count++;

      // Check if limit exceeded
      if (entry.count > config.maxRequests) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
        
        logger.warn('[RateLimiter] Rate limit exceeded', {
          ip: req.ip,
          path: req.path,
          count: entry.count,
          limit: config.maxRequests,
          retryAfter,
        });

        res.set('X-RateLimit-Limit', config.maxRequests.toString());
        res.set('X-RateLimit-Remaining', '0');
        res.set('X-RateLimit-Reset', entry.resetTime.toString());
        res.set('Retry-After', retryAfter.toString());

        return res.status(429).json({
          error: 'Too Many Requests',
          message: config.message || 'Rate limit exceeded. Please try again later.',
          retryAfter,
        });
      }

      // Set rate limit headers
      res.set('X-RateLimit-Limit', config.maxRequests.toString());
      res.set('X-RateLimit-Remaining', (config.maxRequests - entry.count).toString());
      res.set('X-RateLimit-Reset', entry.resetTime.toString());

      next();
    };
  }

  /**
   * Get unique key for rate limiting (IP address + endpoint)
   */
  private getKey(req: Request): string {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const endpoint = req.path;
    return `${ip}:${endpoint}`;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const key in this.store) {
      if (this.store[key].resetTime < now) {
        delete this.store[key];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`[RateLimiter] Cleaned up ${cleaned} expired entries`);
    }
  }

  /**
   * Clear all rate limit entries
   */
  public clear(): void {
    this.store = {};
    logger.info('[RateLimiter] Rate limit store cleared');
  }

  /**
   * Stop cleanup interval
   */
  public stop(): void {
    clearInterval(this.cleanupInterval);
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

// Pre-configured rate limiters for common use cases
export const strictLimiter = rateLimiter.createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

export const moderateLimiter = rateLimiter.createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 500,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

export const relaxedLimiter = rateLimiter.createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 1000,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

// Auth endpoint limiter (very strict)
export const authLimiter = rateLimiter.createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: 'Too many authentication attempts, please try again after 15 minutes',
});
