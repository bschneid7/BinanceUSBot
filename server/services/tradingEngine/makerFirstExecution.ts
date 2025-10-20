/**
 * Maker-First Execution Module
 * 
 * Adjusts order prices to stay on the maker side of the spread,
 * earning maker rebates instead of paying taker fees.
 * 
 * Typical savings: ~0.1% per trade
 */

interface OrderBookSnapshot {
  bids: Array<[string, string]>; // [price, quantity]
  asks: Array<[string, string]>;
}

interface MakerFirstParams {
  side: 'BUY' | 'SELL';
  targetPrice: number;
  orderBook: OrderBookSnapshot;
  tickSize: number;
  maxSlippageBps: number; // Maximum price adjustment in basis points
}

interface MakerFirstResult {
  adjustedPrice: number;
  slippageBps: number;
  wouldBeMaker: boolean;
  reason: string;
}

export class MakerFirstExecution {
  /**
   * Adjust order price to stay on maker side
   * 
   * For BUY orders: Place limit order at or below best bid
   * For SELL orders: Place limit order at or above best ask
   */
  static adjustPriceForMaker(params: MakerFirstParams): MakerFirstResult {
    const { side, targetPrice, orderBook, tickSize, maxSlippageBps } = params;

    if (side === 'BUY') {
      return this.adjustBuyPrice(targetPrice, orderBook, tickSize, maxSlippageBps);
    } else {
      return this.adjustSellPrice(targetPrice, orderBook, tickSize, maxSlippageBps);
    }
  }

  /**
   * Adjust BUY order to be maker
   * Place at or below best bid
   */
  private static adjustBuyPrice(
    targetPrice: number,
    orderBook: OrderBookSnapshot,
    tickSize: number,
    maxSlippageBps: number
  ): MakerFirstResult {
    const bestBid = orderBook.bids.length > 0 ? parseFloat(orderBook.bids[0][0]) : 0;
    const bestAsk = orderBook.asks.length > 0 ? parseFloat(orderBook.asks[0][0]) : 0;

    if (!bestBid || !bestAsk) {
      return {
        adjustedPrice: targetPrice,
        slippageBps: 0,
        wouldBeMaker: false,
        reason: 'No order book data',
      };
    }

    // If target is already below best bid, it's maker
    if (targetPrice <= bestBid) {
      return {
        adjustedPrice: targetPrice,
        slippageBps: 0,
        wouldBeMaker: true,
        reason: 'Already maker (below best bid)',
      };
    }

    // If target is at or above best ask, it would cross spread (taker)
    // Adjust to best bid
    if (targetPrice >= bestAsk) {
      const adjustedPrice = bestBid;
      const slippageBps = this.calculateSlippageBps(targetPrice, adjustedPrice);

      if (slippageBps > maxSlippageBps) {
        return {
          adjustedPrice: targetPrice,
          slippageBps,
          wouldBeMaker: false,
          reason: `Slippage ${slippageBps.toFixed(2)}bps exceeds max ${maxSlippageBps}bps`,
        };
      }

      return {
        adjustedPrice: this.roundToTickSize(adjustedPrice, tickSize),
        slippageBps,
        wouldBeMaker: true,
        reason: 'Adjusted to best bid',
      };
    }

    // Target is between bid and ask (in spread)
    // Place at best bid to be maker
    const adjustedPrice = bestBid;
    const slippageBps = this.calculateSlippageBps(targetPrice, adjustedPrice);

    if (slippageBps > maxSlippageBps) {
      return {
        adjustedPrice: targetPrice,
        slippageBps,
        wouldBeMaker: false,
        reason: `Slippage ${slippageBps.toFixed(2)}bps exceeds max ${maxSlippageBps}bps`,
      };
    }

    return {
      adjustedPrice: this.roundToTickSize(adjustedPrice, tickSize),
      slippageBps,
      wouldBeMaker: true,
      reason: 'Adjusted to best bid (was in spread)',
    };
  }

  /**
   * Adjust SELL order to be maker
   * Place at or above best ask
   */
  private static adjustSellPrice(
    targetPrice: number,
    orderBook: OrderBookSnapshot,
    tickSize: number,
    maxSlippageBps: number
  ): MakerFirstResult {
    const bestBid = orderBook.bids.length > 0 ? parseFloat(orderBook.bids[0][0]) : 0;
    const bestAsk = orderBook.asks.length > 0 ? parseFloat(orderBook.asks[0][0]) : 0;

    if (!bestBid || !bestAsk) {
      return {
        adjustedPrice: targetPrice,
        slippageBps: 0,
        wouldBeMaker: false,
        reason: 'No order book data',
      };
    }

    // If target is already above best ask, it's maker
    if (targetPrice >= bestAsk) {
      return {
        adjustedPrice: targetPrice,
        slippageBps: 0,
        wouldBeMaker: true,
        reason: 'Already maker (above best ask)',
      };
    }

    // If target is at or below best bid, it would cross spread (taker)
    // Adjust to best ask
    if (targetPrice <= bestBid) {
      const adjustedPrice = bestAsk;
      const slippageBps = this.calculateSlippageBps(targetPrice, adjustedPrice);

      if (slippageBps > maxSlippageBps) {
        return {
          adjustedPrice: targetPrice,
          slippageBps,
          wouldBeMaker: false,
          reason: `Slippage ${slippageBps.toFixed(2)}bps exceeds max ${maxSlippageBps}bps`,
        };
      }

      return {
        adjustedPrice: this.roundToTickSize(adjustedPrice, tickSize),
        slippageBps,
        wouldBeMaker: true,
        reason: 'Adjusted to best ask',
      };
    }

    // Target is between bid and ask (in spread)
    // Place at best ask to be maker
    const adjustedPrice = bestAsk;
    const slippageBps = this.calculateSlippageBps(targetPrice, adjustedPrice);

    if (slippageBps > maxSlippageBps) {
      return {
        adjustedPrice: targetPrice,
        slippageBps,
        wouldBeMaker: false,
        reason: `Slippage ${slippageBps.toFixed(2)}bps exceeds max ${maxSlippageBps}bps`,
      };
    }

    return {
      adjustedPrice: this.roundToTickSize(adjustedPrice, tickSize),
      slippageBps,
      wouldBeMaker: true,
      reason: 'Adjusted to best ask (was in spread)',
    };
  }

  /**
   * Calculate slippage in basis points
   */
  private static calculateSlippageBps(targetPrice: number, adjustedPrice: number): number {
    return Math.abs((adjustedPrice - targetPrice) / targetPrice) * 10000;
  }

  /**
   * Round price to exchange tick size
   */
  private static roundToTickSize(price: number, tickSize: number): number {
    return Math.round(price / tickSize) * tickSize;
  }

  /**
   * Get order book snapshot from Binance
   */
  static async getOrderBook(
    symbol: string,
    binanceService: any
  ): Promise<OrderBookSnapshot | null> {
    try {
      const depth = await binanceService.getOrderBookDepth(symbol, 5);
      return {
        bids: depth.bids,
        asks: depth.asks,
      };
    } catch (error) {
      console.error(`[MakerFirst] Failed to get order book for ${symbol}:`, error);
      return null;
    }
  }
}

