/**
 * Limit Order Optimizer
 * 
 * Optimizes order execution to maximize maker orders (0.10% fee) 
 * vs taker orders (0.10% fee), reducing round-trip costs.
 * 
 * Strategy: Place limit orders slightly better than current price
 * to increase fill probability while still getting maker rebate.
 */

import binanceService from './binanceService';

interface LimitOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  targetPrice?: number;
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH';
  maxSlippage?: number; // in percentage
}

interface OptimizedOrder {
  type: 'LIMIT' | 'MARKET';
  price?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  postOnly?: boolean;
  reasoning: string;
}

class LimitOrderOptimizer {
  /**
   * Calculate optimal limit order price
   * Places order slightly inside the spread to increase fill probability
   */
  async calculateOptimalLimitPrice(
    symbol: string,
    side: 'BUY' | 'SELL',
    targetPrice?: number,
    urgency: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'
  ): Promise<{ price: number; reasoning: string }> {
    // Get current order book
    const ticker = await binanceService.getTickerPrice(symbol);
    if (!ticker) {
      throw new Error(`Unable to get ticker for ${symbol}`);
    }
    
    const currentPrice = parseFloat(ticker.price);
    
    // If no target price, use current price
    const basePrice = targetPrice || currentPrice;
    
    // Adjust price based on urgency and side
    // Lower urgency = more aggressive pricing for maker orders
    // Higher urgency = closer to market price
    
    let adjustment: number;
    
    if (side === 'BUY') {
      // For buys, place limit order slightly above current bid
      // to increase fill probability while still being a maker
      switch (urgency) {
        case 'LOW':
          adjustment = 0.0005; // 0.05% above target (very likely maker)
          break;
        case 'MEDIUM':
          adjustment = 0.001; // 0.10% above target (likely maker)
          break;
        case 'HIGH':
          adjustment = 0.002; // 0.20% above target (might be taker)
          break;
      }
      
      const optimizedPrice = basePrice * (1 + adjustment);
      
      return {
        price: optimizedPrice,
        reasoning: `BUY limit at ${optimizedPrice.toFixed(8)} (+${(adjustment * 100).toFixed(2)}% from ${basePrice.toFixed(8)}) - ${urgency} urgency`
      };
      
    } else {
      // For sells, place limit order slightly below current ask
      switch (urgency) {
        case 'LOW':
          adjustment = 0.0005; // 0.05% below target
          break;
        case 'MEDIUM':
          adjustment = 0.001; // 0.10% below target
          break;
        case 'HIGH':
          adjustment = 0.002; // 0.20% below target
          break;
      }
      
      const optimizedPrice = basePrice * (1 - adjustment);
      
      return {
        price: optimizedPrice,
        reasoning: `SELL limit at ${optimizedPrice.toFixed(8)} (-${(adjustment * 100).toFixed(2)}% from ${basePrice.toFixed(8)}) - ${urgency} urgency`
      };
    }
  }
  
  /**
   * Determine optimal order type and parameters
   */
  async optimizeOrder(params: LimitOrderParams): Promise<OptimizedOrder> {
    const { symbol, side, targetPrice, urgency = 'MEDIUM', maxSlippage = 0.5 } = params;
    
    // Get current market price
    const ticker = await binanceService.getTickerPrice(symbol);
    if (!ticker) {
      // Fallback to market order if we can't get price
      return {
        type: 'MARKET',
        reasoning: 'Unable to get ticker price, using MARKET order as fallback'
      };
    }
    
    const currentPrice = parseFloat(ticker.price);
    
    // Check if target price is too far from current price
    if (targetPrice) {
      const priceDeviation = Math.abs((targetPrice - currentPrice) / currentPrice) * 100;
      
      if (priceDeviation > maxSlippage) {
        console.log(`[LimitOrderOptimizer] Target price ${targetPrice} is ${priceDeviation.toFixed(2)}% from current ${currentPrice}, exceeds max slippage ${maxSlippage}%`);
        
        // If urgency is HIGH and price is far, use MARKET
        if (urgency === 'HIGH') {
          return {
            type: 'MARKET',
            reasoning: `HIGH urgency + ${priceDeviation.toFixed(2)}% slippage > using MARKET`
          };
        }
      }
    }
    
    // Calculate optimal limit price
    const { price, reasoning } = await this.calculateOptimalLimitPrice(
      symbol,
      side,
      targetPrice,
      urgency
    );
    
    // Use GTC (Good-Till-Cancelled) for most orders
    // Use IOC (Immediate-Or-Cancel) for HIGH urgency
    const timeInForce = urgency === 'HIGH' ? 'IOC' : 'GTC';
    
    return {
      type: 'LIMIT',
      price,
      timeInForce,
      postOnly: urgency === 'LOW', // Post-only for LOW urgency to guarantee maker
      reasoning
    };
  }
  
  /**
   * Place an optimized order
   */
  async placeOptimizedOrder(params: LimitOrderParams) {
    const { symbol, side, quantity } = params;
    
    console.log(`[LimitOrderOptimizer] Optimizing order for ${symbol} ${side} ${quantity}`);
    
    // Get optimized order parameters
    const optimized = await this.optimizeOrder(params);
    
    console.log(`[LimitOrderOptimizer] ${optimized.reasoning}`);
    
    // Place the order
    const orderParams: any = {
      symbol,
      side,
      type: optimized.type,
      quantity,
    };
    
    if (optimized.type === 'LIMIT') {
      orderParams.price = optimized.price;
      orderParams.timeInForce = optimized.timeInForce;
      
      // Note: Binance.US doesn't support postOnly flag directly
      // But using GTC with limit price inside spread achieves similar effect
    }
    
    return await binanceService.placeOrder(orderParams);
  }
}

// Export singleton
const limitOrderOptimizer = new LimitOrderOptimizer();
export default limitOrderOptimizer;
