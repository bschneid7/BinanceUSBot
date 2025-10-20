import binanceService from './binanceService';

interface MakerFirstResult {
  originalPrice: number;
  adjustedPrice: number;
  side: 'BUY' | 'SELL';
  adjustmentBps: number;
  isMaker: boolean;
}

class MakerFirstExecution {
  private readonly MAKER_OFFSET_BPS = 5; // 0.05% offset to maker side
  private enabled: boolean = false; // Disabled by default for safety

  /**
   * Enable or disable maker-first execution
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`[MakerFirst] ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * Check if maker-first is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Adjust order price to maker side of the book
   * For BUY orders: Place slightly below current ask (on bid side)
   * For SELL orders: Place slightly above current bid (on ask side)
   */
  async adjustPriceToMaker(
    symbol: string,
    side: 'BUY' | 'SELL',
    marketPrice: number
  ): Promise<MakerFirstResult> {
    const result: MakerFirstResult = {
      originalPrice: marketPrice,
      adjustedPrice: marketPrice,
      side,
      adjustmentBps: 0,
      isMaker: false,
    };

    // If disabled, return original price
    if (!this.enabled) {
      return result;
    }

    try {
      // Get current order book
      const orderBook = await binanceService.getOrderBook(symbol, 5);
      
      if (!orderBook || !orderBook.bids || !orderBook.asks) {
        console.warn(`[MakerFirst] No order book data for ${symbol}, using market price`);
        return result;
      }

      const bestBid = parseFloat(orderBook.bids[0][0]);
      const bestAsk = parseFloat(orderBook.asks[0][0]);
      const spread = bestAsk - bestBid;
      const spreadBps = (spread / marketPrice) * 10000;

      console.log(`[MakerFirst] ${symbol} order book:`, {
        bestBid,
        bestAsk,
        spread: spread.toFixed(8),
        spreadBps: spreadBps.toFixed(2),
      });

      if (side === 'BUY') {
        // Place buy order on bid side (below ask)
        // Use best bid + small offset to increase fill probability
        const offset = marketPrice * (this.MAKER_OFFSET_BPS / 10000);
        result.adjustedPrice = Math.min(bestBid + offset, bestAsk - (spread * 0.1));
        result.isMaker = result.adjustedPrice < bestAsk;
      } else {
        // Place sell order on ask side (above bid)
        // Use best ask - small offset to increase fill probability
        const offset = marketPrice * (this.MAKER_OFFSET_BPS / 10000);
        result.adjustedPrice = Math.max(bestAsk - offset, bestBid + (spread * 0.1));
        result.isMaker = result.adjustedPrice > bestBid;
      }

      result.adjustmentBps = ((result.adjustedPrice - marketPrice) / marketPrice) * 10000;

      console.log(`[MakerFirst] ${side} ${symbol}:`, {
        originalPrice: result.originalPrice.toFixed(8),
        adjustedPrice: result.adjustedPrice.toFixed(8),
        adjustmentBps: result.adjustmentBps.toFixed(2),
        isMaker: result.isMaker,
      });

      // Safety check: Don't adjust more than 0.5% from market
      const maxAdjustmentBps = 50; // 0.5%
      if (Math.abs(result.adjustmentBps) > maxAdjustmentBps) {
        console.warn(`[MakerFirst] Adjustment too large (${result.adjustmentBps.toFixed(2)}bps), using market price`);
        result.adjustedPrice = marketPrice;
        result.adjustmentBps = 0;
        result.isMaker = false;
      }

    } catch (error) {
      console.error(`[MakerFirst] Error adjusting price for ${symbol}:`, error);
      // On error, return original price
    }

    return result;
  }

  /**
   * Calculate potential fee savings from maker execution
   */
  calculateFeeSavings(orderValue: number): { makerFee: number; takerFee: number; savings: number } {
    const MAKER_FEE_RATE = 0.001; // 0.1%
    const TAKER_FEE_RATE = 0.001; // 0.1% (Binance.US has same maker/taker fees)
    
    // Note: On Binance.US, maker and taker fees are the same (0.1%)
    // But on Binance global, maker is 0.1% and taker is 0.1% (with BNB discount)
    // The benefit is more about price improvement than fee savings
    
    const makerFee = orderValue * MAKER_FEE_RATE;
    const takerFee = orderValue * TAKER_FEE_RATE;
    const savings = takerFee - makerFee;

    return { makerFee, takerFee, savings };
  }

  /**
   * Get maker-first statistics
   */
  getStats(): { enabled: boolean; makerOffsetBps: number } {
    return {
      enabled: this.enabled,
      makerOffsetBps: this.MAKER_OFFSET_BPS,
    };
  }
}

export default new MakerFirstExecution();

