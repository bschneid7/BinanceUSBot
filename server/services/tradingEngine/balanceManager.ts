/**
 * Balance Manager
 * 
 * Prevents order conflicts by tracking reserved balance for pending orders.
 * Ensures sequential order execution and prevents multiple orders from
 * competing for the same capital.
 */

import logger from '../../utils/logger';
import binanceService from '../binanceService';

interface BalanceReservation {
  orderId: string;
  symbol: string;
  amount: number;
  timestamp: Date;
}

class BalanceManager {
  private reservations: Map<string, BalanceReservation> = new Map();
  private orderLock: Promise<void> = Promise.resolve();
  
  /**
   * Reserve balance for an order
   * Returns false if insufficient balance available
   */
  async reserveBalance(orderId: string, symbol: string, amount: number): Promise<boolean> {
    try {
      // Get current account balance
      const accountInfo = await binanceService.getAccountInfo();
      const usdBalance = accountInfo.balances.find(b => b.asset === 'USD' || b.asset === 'USDT');
      const availableBalance = parseFloat(usdBalance?.free || '0');
      
      // Calculate total reserved balance
      const totalReserved = Array.from(this.reservations.values())
        .reduce((sum, res) => sum + res.amount, 0);
      
      // Calculate available balance after reservations
      const effectiveBalance = availableBalance - totalReserved;
      
      logger.info(
        `[BalanceManager] Balance check: Available=$${availableBalance.toFixed(2)}, ` +
        `Reserved=$${totalReserved.toFixed(2)}, Effective=$${effectiveBalance.toFixed(2)}, ` +
        `Requested=$${amount.toFixed(2)}`
      );
      
      // Check if enough balance available
      if (effectiveBalance < amount) {
        logger.warn(
          `[BalanceManager] Insufficient balance for ${symbol}: ` +
          `Need $${amount.toFixed(2)}, have $${effectiveBalance.toFixed(2)}`
        );
        return false;
      }
      
      // Reserve the balance
      this.reservations.set(orderId, {
        orderId,
        symbol,
        amount,
        timestamp: new Date(),
      });
      
      logger.info(
        `[BalanceManager] Reserved $${amount.toFixed(2)} for ${symbol} (order: ${orderId})`
      );
      
      return true;
    } catch (error) {
      logger.error('[BalanceManager] Error reserving balance:', error);
      return false;
    }
  }
  
  /**
   * Release reserved balance after order completes
   */
  releaseBalance(orderId: string): void {
    const reservation = this.reservations.get(orderId);
    if (reservation) {
      logger.info(
        `[BalanceManager] Released $${reservation.amount.toFixed(2)} for ${reservation.symbol} (order: ${orderId})`
      );
      this.reservations.delete(orderId);
    }
  }
  
  /**
   * Get total reserved balance
   */
  getTotalReserved(): number {
    return Array.from(this.reservations.values())
      .reduce((sum, res) => sum + res.amount, 0);
  }
  
  /**
   * Get all active reservations
   */
  getReservations(): BalanceReservation[] {
    return Array.from(this.reservations.values());
  }
  
  /**
   * Clean up old reservations (older than 5 minutes)
   */
  cleanupOldReservations(): void {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    let cleaned = 0;
    
    for (const [orderId, reservation] of this.reservations.entries()) {
      if (reservation.timestamp < fiveMinutesAgo) {
        this.reservations.delete(orderId);
        cleaned++;
        logger.warn(
          `[BalanceManager] Cleaned up stale reservation: ${orderId} (${reservation.symbol}, $${reservation.amount.toFixed(2)})`
        );
      }
    }
    
    if (cleaned > 0) {
      logger.info(`[BalanceManager] Cleaned up ${cleaned} stale reservations`);
    }
  }
  
  /**
   * Execute an order with balance locking
   * Ensures orders are processed sequentially
   */
  async executeWithLock<T>(fn: () => Promise<T>): Promise<T> {
    // Wait for previous order to complete
    const previousLock = this.orderLock;
    
    // Create new lock for this order
    let resolveLock: () => void;
    this.orderLock = new Promise(resolve => {
      resolveLock = resolve;
    });
    
    try {
      // Wait for previous order
      await previousLock;
      
      // Execute this order
      const result = await fn();
      
      return result;
    } finally {
      // Release lock
      resolveLock!();
    }
  }
}

export default new BalanceManager();
