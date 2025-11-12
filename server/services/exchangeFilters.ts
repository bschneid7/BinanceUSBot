/**
 * Exchange Filters Service
 * 
 * Handles precision-aware order validation using Binance exchange filters.
 * Prevents order rejections due to incorrect price/quantity precision.
 * 
 * Key Features:
 * - Loads exchange info from Binance API
 * - Rounds prices to correct tick size
 * - Rounds quantities to correct step size
 * - Validates MIN_NOTIONAL requirements
 * - Caches filters for performance
 * 
 * Usage:
 *   await exchangeFilters.loadFilters();
 *   const validation = exchangeFilters.validateOrder('BTCUSD', 50000.123, 0.0012345);
 *   // Use validation.roundedPrice and validation.roundedQty for order
 */

import binanceService from './binanceService';

interface PriceFilter {
  filterType: 'PRICE_FILTER';
  minPrice: string;
  maxPrice: string;
  tickSize: string;
}

interface LotSizeFilter {
  filterType: 'LOT_SIZE';
  minQty: string;
  maxQty: string;
  stepSize: string;
}

interface MinNotionalFilter {
  filterType: 'MIN_NOTIONAL';
  minNotional: string;
}

interface SymbolFilters {
  symbol: string;
  priceFilter?: PriceFilter;
  lotSizeFilter?: LotSizeFilter;
  minNotionalFilter?: MinNotionalFilter;
}

interface OrderValidation {
  valid: boolean;
  roundedPrice: string;
  roundedQty: string;
  errors: string[];
}

class ExchangeFilters {
  private filters: Map<string, SymbolFilters> = new Map();
  private lastUpdate: Date | null = null;
  private loading: boolean = false;

  /**
   * Load exchange filters from Binance API
   * Should be called at boot and periodically refreshed
   */
  async loadFilters(): Promise<void> {
    if (this.loading) {
      console.log('[ExchangeFilters] Already loading filters, skipping...');
      return;
    }

    this.loading = true;

    try {
      console.log('[ExchangeFilters] Loading exchange info from Binance API...');
      
      const exchangeInfo = await binanceService.getExchangeInfo();
      
      if (!exchangeInfo || !exchangeInfo.symbols) {
        throw new Error('Invalid exchange info response');
      }

      this.filters.clear();

      for (const symbolInfo of exchangeInfo.symbols) {
        const filters: SymbolFilters = {
          symbol: symbolInfo.symbol,
        };

        for (const filter of symbolInfo.filters) {
          if (filter.filterType === 'PRICE_FILTER') {
            filters.priceFilter = filter as PriceFilter;
          } else if (filter.filterType === 'LOT_SIZE') {
            filters.lotSizeFilter = filter as LotSizeFilter;
          } else if (filter.filterType === 'MIN_NOTIONAL') {
            filters.minNotionalFilter = filter as MinNotionalFilter;
          }
        }

        this.filters.set(symbolInfo.symbol, filters);
      }

      this.lastUpdate = new Date();
      console.log(`[ExchangeFilters] ✅ Loaded filters for ${this.filters.size} symbols`);
      console.log(`[ExchangeFilters] Last update: ${this.lastUpdate.toISOString()}`);
      
    } catch (error: any) {
      console.error('[ExchangeFilters] ❌ Failed to load filters:', error.message);
      throw error;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Get filters for a specific symbol
   */
  getFilters(symbol: string): SymbolFilters | undefined {
    return this.filters.get(symbol);
  }

  /**
   * Round price to correct tick size
   * Example: BTC tick size 0.01 -> 50000.123 becomes 50000.12
   */
  roundPriceToTick(symbol: string, price: number): string {
    const filters = this.filters.get(symbol);
    if (!filters?.priceFilter) {
      throw new Error(`No price filter found for ${symbol}`);
    }

    const tickSize = parseFloat(filters.priceFilter.tickSize);
    const rounded = Math.floor(price / tickSize) * tickSize;

    // Determine precision from tickSize
    // e.g., 0.01 -> 2 decimals, 0.00001 -> 5 decimals
    const tickSizeStr = filters.priceFilter.tickSize;
    const precision = tickSizeStr.includes('.')
      ? tickSizeStr.split('.')[1].length
      : 0;

    return rounded.toFixed(precision);
  }

  /**
   * Round quantity to correct step size
   * Example: BTC step size 0.00001 -> 0.0012345 becomes 0.00123
   */
  roundQtyToStep(symbol: string, qty: number): string {
    const filters = this.filters.get(symbol);
    if (!filters?.lotSizeFilter) {
      throw new Error(`No lot size filter found for ${symbol}`);
    }

    const stepSize = parseFloat(filters.lotSizeFilter.stepSize);
    const rounded = Math.floor(qty / stepSize) * stepSize;

    // Determine precision from stepSize
    const stepSizeStr = filters.lotSizeFilter.stepSize;
    const precision = stepSizeStr.includes('.')
      ? stepSizeStr.split('.')[1].length
      : 0;

    return rounded.toFixed(precision);
  }

  /**
   * Check if order meets MIN_NOTIONAL requirement
   * MIN_NOTIONAL = price * quantity must be >= minNotional
   */
  meetsMinNotional(symbol: string, price: number, qty: number): boolean {
    const filters = this.filters.get(symbol);
    if (!filters?.minNotionalFilter) {
      // If no MIN_NOTIONAL filter, assume it's met
      return true;
    }

    const notional = price * qty;
    const minNotional = parseFloat(filters.minNotionalFilter.minNotional);
    
    return notional >= minNotional;
  }

  /**
   * Validate and round order parameters
   * Returns rounded values and validation errors
   */
  validateOrder(symbol: string, price: number, qty: number): OrderValidation {
    const errors: string[] = [];

    try {
      // Check if filters exist for symbol
      const filters = this.filters.get(symbol);
      if (!filters) {
        errors.push(`No filters found for ${symbol}`);
        return {
          valid: false,
          roundedPrice: price.toString(),
          roundedQty: qty.toString(),
          errors,
        };
      }

      // Round price and quantity
      const roundedPrice = this.roundPriceToTick(symbol, price);
      const roundedQty = this.roundQtyToStep(symbol, qty);

      const roundedPriceNum = parseFloat(roundedPrice);
      const roundedQtyNum = parseFloat(roundedQty);

      // Check MIN_NOTIONAL
      if (!this.meetsMinNotional(symbol, roundedPriceNum, roundedQtyNum)) {
        const minNotional = filters.minNotionalFilter?.minNotional || 'unknown';
        const actualNotional = (roundedPriceNum * roundedQtyNum).toFixed(2);
        errors.push(
          `Does not meet MIN_NOTIONAL: ${actualNotional} < ${minNotional}`
        );
      }

      // Check price bounds
      if (filters.priceFilter) {
        const minPrice = parseFloat(filters.priceFilter.minPrice);
        const maxPrice = parseFloat(filters.priceFilter.maxPrice);
        
        if (roundedPriceNum < minPrice) {
          errors.push(`Price ${roundedPrice} < min ${minPrice}`);
        }
        if (roundedPriceNum > maxPrice) {
          errors.push(`Price ${roundedPrice} > max ${maxPrice}`);
        }
      }

      // Check quantity bounds
      if (filters.lotSizeFilter) {
        const minQty = parseFloat(filters.lotSizeFilter.minQty);
        const maxQty = parseFloat(filters.lotSizeFilter.maxQty);
        
        if (roundedQtyNum < minQty) {
          errors.push(`Quantity ${roundedQty} < min ${minQty}`);
        }
        if (roundedQtyNum > maxQty) {
          errors.push(`Quantity ${roundedQty} > max ${maxQty}`);
        }
      }

      return {
        valid: errors.length === 0,
        roundedPrice,
        roundedQty,
        errors,
      };

    } catch (error: any) {
      errors.push(error.message);
      return {
        valid: false,
        roundedPrice: price.toString(),
        roundedQty: qty.toString(),
        errors,
      };
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      symbolCount: this.filters.size,
      lastUpdate: this.lastUpdate,
      isLoaded: this.filters.size > 0,
    };
  }

  /**
   * Schedule daily filter refresh
   * Binance exchange info doesn't change often, but we refresh daily to be safe
   */
  startDailyRefresh(): void {
    // Refresh every 24 hours
    setInterval(async () => {
      console.log('[ExchangeFilters] Running daily filter refresh...');
      try {
        await this.loadFilters();
      } catch (error: any) {
        console.error('[ExchangeFilters] Daily refresh failed:', error.message);
      }
    }, 24 * 60 * 60 * 1000);

    console.log('[ExchangeFilters] Daily refresh scheduled');
  }
}

// Singleton instance
export const exchangeFilters = new ExchangeFilters();
export default exchangeFilters;
