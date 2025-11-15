/**
 * Exchange Filters Service - Enhanced Version
 * 
 * CHANGES FROM ORIGINAL:
 * ✅ Added scaled integer validateLotSize function (fixes critical bug)
 * ✅ Better error handling and validation
 * ✅ Added null checks throughout
 * ✅ Improved logging with more context
 * ✅ Fixed type safety issues
 * ✅ Added comprehensive JSDoc comments
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
 * - Uses integer math for exact validation (NO FLOATING-POINT ERRORS)
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
  
  // Constants for validation
  private readonly MAX_PRICE = 10000000; // $10M max sanity check
  private readonly MIN_PRICE = 0.000001;  // Minimum price sanity check

  /**
   * Load exchange filters from Binance API
   * Should be called at boot and periodically refreshed
   * 
   * @throws {Error} If API call fails or returns invalid data
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
      
      if (!exchangeInfo || !exchangeInfo.symbols || !Array.isArray(exchangeInfo.symbols)) {
        throw new Error('Invalid exchange info response: missing or invalid symbols array');
      }

      if (exchangeInfo.symbols.length === 0) {
        throw new Error('Exchange info returned zero symbols');
      }

      this.filters.clear();

      for (const symbolInfo of exchangeInfo.symbols) {
        if (!symbolInfo.symbol) {
          console.warn('[ExchangeFilters] Symbol info missing symbol name, skipping');
          continue;
        }

        const filters: SymbolFilters = {
          symbol: symbolInfo.symbol,
        };

        if (!Array.isArray(symbolInfo.filters)) {
          console.warn(`[ExchangeFilters] ${symbolInfo.symbol} has invalid filters array, skipping`);
          continue;
        }

        for (const filter of symbolInfo.filters) {
          if (!filter || !filter.filterType) {
            continue;
          }

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
      console.error('[ExchangeFilters] ❌ Failed to load filters:', error?.message || error);
      throw error;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Get filters for a specific symbol
   * 
   * @param symbol - Trading pair symbol (e.g., 'BTCUSD')
   * @returns Symbol filters or undefined if not found
   */
  getFilters(symbol: string): SymbolFilters | undefined {
    if (!symbol || typeof symbol !== 'string') {
      console.warn('[ExchangeFilters] Invalid symbol provided to getFilters');
      return undefined;
    }
    return this.filters.get(symbol);
  }

  /**
   * Calculates the precision (number of decimal places) from a step size.
   * Handles scientific notation and trailing zeros.
   * 
   * @param stepSize - The step size (typically a string from the API)
   * @returns Number of decimal places
   * 
   * @example
   * getPrecision('0.01') // Returns 2
   * getPrecision('1e-8') // Returns 8
   * getPrecision('1.000') // Returns 0 (trailing zeros ignored)
   */
  private getPrecision(stepSize: string | number): number {
    const s = typeof stepSize === 'number' ? stepSize.toString() : stepSize;

    // 1. Handle scientific notation (e.g., 1e-8)
    if (s.toLowerCase().includes('e')) {
      const match = s.toLowerCase().match(/e-(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    // 2. Handle decimal notation
    if (!s.includes('.')) {
      return 0; // Integer step size
    }
    
    // 3. Remove trailing zeros to find the effective precision
    let trimmedS = s.replace(/(\.\d*?)0+$/, '$1');
    
    // If all decimals were zeros (e.g., "1.000" -> "1."), remove the trailing dot.
    if (trimmedS.endsWith('.')) {
      trimmedS = trimmedS.substring(0, trimmedS.length - 1);
    }

    if (!trimmedS.includes('.')) {
      return 0;
    }

    return trimmedS.length - trimmedS.indexOf('.') - 1;
  }

  /**
   * Validate quantity against LOT_SIZE filter using scaled integer arithmetic
   * This eliminates floating-point precision errors
   * 
   * @param symbol - Trading pair symbol
   * @param quantity - Quantity to validate
   * @returns True if quantity is valid, false otherwise
   * 
   * @example
   * validateLotSize('DOGEUSD', 2424.24) // true (stepSize 0.01)
   * validateLotSize('DOGEUSD', 2424.243) // false (not divisible by 0.01)
   */
  validateLotSize(symbol: string, quantity: number): boolean {
    // Input validation
    if (!symbol || typeof symbol !== 'string') {
      console.error('[validateLotSize] Invalid symbol provided');
      return false;
    }

    if (typeof quantity !== 'number' || isNaN(quantity) || !isFinite(quantity)) {
      console.error(`[validateLotSize] Invalid quantity: ${quantity}`);
      return false;
    }

    const filters = this.filters.get(symbol);
    if (!filters?.lotSizeFilter) {
      console.warn(`⚠️ [validateLotSize] No LOT_SIZE filter found for ${symbol}`);
      return false;
    }

    const { minQty, maxQty, stepSize } = filters.lotSizeFilter;
    const step = parseFloat(stepSize);
    const min = parseFloat(minQty);
    const max = parseFloat(maxQty);

    // Check for invalid filter values
    if (isNaN(step) || isNaN(min) || isNaN(max)) {
      console.error(`[validateLotSize] Invalid LOT_SIZE filter values for ${symbol}`);
      return false;
    }

    console.log(`[validateLotSize] Validating ${symbol}: qty=${quantity}, step=${stepSize}`);

    // Check min/max bounds
    if (quantity < min) {
      console.error(`❌ [validateLotSize] Quantity ${quantity} < minimum ${min} for ${symbol}`);
      return false;
    }
    
    if (quantity > max) {
      console.error(`❌ [validateLotSize] Quantity ${quantity} > maximum ${max} for ${symbol}`);
      return false;
    }

    // Calculate precision from stepSize
    const precision = this.getPrecision(stepSize);
    console.log(`[validateLotSize] Precision calculated: ${precision}`);

    // Scale to integers to avoid floating-point errors
    // This is the KEY FIX for the LOT_SIZE validation bug
    const scaleFactor = Math.pow(10, precision);
    const quantityScaled = Math.round(quantity * scaleFactor);
    const stepScaled = Math.round(step * scaleFactor);

    console.log(`[validateLotSize] Scaled values: ${quantityScaled} % ${stepScaled}`);

    // Integer modulo is exact (no floating-point errors)
    const remainder = quantityScaled % stepScaled;
    const isValid = remainder === 0;

    if (!isValid) {
      console.error(`❌ [validateLotSize] FAILED for ${symbol}`);
      console.error(`   Original: ${quantity} % ${step}`);
      console.error(`   Scaled: ${quantityScaled} % ${stepScaled} = ${remainder}`);
      console.error(`   Precision: ${precision}, ScaleFactor: ${scaleFactor}`);
    } else {
      console.log(`✅ [validateLotSize] PASSED for ${symbol}: ${quantity} conforms to stepSize ${stepSize}`);
    }

    return isValid;
  }

  /**
   * Round price to correct tick size
   * Example: BTC tick size 0.01 -> 50000.123 becomes 50000.12
   * Now uses getPrecision() for proper handling of all tickSize formats
   * 
   * @param symbol - Trading pair symbol
   * @param price - Price to round
   * @returns Rounded price as string
   * @throws {Error} If no price filter found for symbol
   */
  roundPriceToTick(symbol: string, price: number): string {
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Invalid symbol provided to roundPriceToTick');
    }

    if (typeof price !== 'number' || isNaN(price) || !isFinite(price)) {
      throw new Error(`Invalid price: ${price}`);
    }

    if (price < this.MIN_PRICE || price > this.MAX_PRICE) {
      throw new Error(`Price ${price} outside reasonable bounds [${this.MIN_PRICE}, ${this.MAX_PRICE}]`);
    }

    const filters = this.filters.get(symbol);
    if (!filters?.priceFilter) {
      throw new Error(`No price filter found for ${symbol}`);
    }

    const tickSize = filters.priceFilter.tickSize;
    const precision = this.getPrecision(tickSize);

    // Use Math.floor() for consistency
    const factor = Math.pow(10, precision);
    const truncated = Math.floor(price * factor) / factor;

    return parseFloat(truncated.toFixed(precision)).toString();
  }

  /**
   * Truncates a quantity down to the specified step size.
   * Uses Math.floor to ensure we never try to sell more than we have.
   * This is the method that should be called by positionManager.
   * 
   * @param symbol - Trading pair symbol
   * @param quantity - Quantity to round
   * @returns Rounded quantity
   */
  async roundQuantity(symbol: string, quantity: number): Promise<number> {
    if (!symbol || typeof symbol !== 'string') {
      console.warn('[ExchangeFilters] Invalid symbol provided to roundQuantity');
      return quantity;
    }

    if (typeof quantity !== 'number' || isNaN(quantity) || !isFinite(quantity) || quantity < 0) {
      console.warn(`[ExchangeFilters] Invalid quantity: ${quantity}`);
      return quantity;
    }

    const filters = this.filters.get(symbol);
    if (!filters || !filters.lotSizeFilter) {
      console.warn(`[ExchangeFilters] No LOT_SIZE filter found for ${symbol}. Cannot guarantee compliance.`);
      return quantity;
    }

    const stepSize = filters.lotSizeFilter.stepSize;
    const precision = this.getPrecision(stepSize);

    // Use Math.floor() to truncate the quantity. Crucial for SELL orders.
    const factor = Math.pow(10, precision);
    const truncatedQuantity = Math.floor(quantity * factor) / factor;

    // Final formatting to mitigate floating point representation issues in JavaScript
    const finalQuantity = parseFloat(truncatedQuantity.toFixed(precision));

    if (quantity !== finalQuantity) {
      console.log(`[ExchangeFilters] Truncated quantity for ${symbol}: ${quantity} -> ${finalQuantity} (stepSize: ${stepSize}, precision: ${precision})`);
    }

    // Validate the rounded quantity
    if (!this.validateLotSize(symbol, finalQuantity)) {
      console.error(`[ExchangeFilters] Rounded quantity ${finalQuantity} failed validation for ${symbol}`);
      console.error(`[ExchangeFilters] Original quantity: ${quantity}, stepSize: ${stepSize}`);
      // Still return it, but log the error for investigation
    }

    return finalQuantity;
  }

  /**
   * Round quantity to correct step size
   * Example: BTC step size 0.00001 -> 0.0012345 becomes 0.00123
   * Now uses getPrecision() for proper handling of all stepSize formats
   * 
   * @param symbol - Trading pair symbol
   * @param qty - Quantity to round
   * @returns Rounded quantity as string
   * @throws {Error} If no lot size filter found for symbol
   */
  roundQtyToStep(symbol: string, qty: number): string {
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Invalid symbol provided to roundQtyToStep');
    }

    if (typeof qty !== 'number' || isNaN(qty) || !isFinite(qty)) {
      throw new Error(`Invalid quantity: ${qty}`);
    }

    const filters = this.filters.get(symbol);
    if (!filters?.lotSizeFilter) {
      throw new Error(`No lot size filter found for ${symbol}`);
    }

    const stepSize = filters.lotSizeFilter.stepSize;
    const precision = this.getPrecision(stepSize);

    // Use Math.floor() to truncate (same logic as roundQuantity)
    const factor = Math.pow(10, precision);
    const truncated = Math.floor(qty * factor) / factor;

    return parseFloat(truncated.toFixed(precision)).toString();
  }

  /**
   * Check if order meets MIN_NOTIONAL requirement
   * MIN_NOTIONAL = price * quantity must be >= minNotional
   * 
   * @param symbol - Trading pair symbol
   * @param price - Order price
   * @param qty - Order quantity
   * @returns True if meets minimum notional, false otherwise
   */
  meetsMinNotional(symbol: string, price: number, qty: number): boolean {
    if (!symbol || typeof symbol !== 'string') {
      console.warn('[ExchangeFilters] Invalid symbol in meetsMinNotional');
      return false;
    }

    if (typeof price !== 'number' || typeof qty !== 'number' || 
        isNaN(price) || isNaN(qty) || price <= 0 || qty <= 0) {
      console.warn('[ExchangeFilters] Invalid price or quantity in meetsMinNotional');
      return false;
    }

    const filters = this.filters.get(symbol);
    if (!filters?.minNotionalFilter) {
      // If no MIN_NOTIONAL filter, assume it's met
      return true;
    }

    const notional = price * qty;
    const minNotional = parseFloat(filters.minNotionalFilter.minNotional);
    
    if (isNaN(minNotional)) {
      console.warn(`[ExchangeFilters] Invalid minNotional value for ${symbol}`);
      return true; // Assume met if filter is invalid
    }
    
    const meets = notional >= minNotional;
    
    if (!meets) {
      console.warn(`[ExchangeFilters] MIN_NOTIONAL not met for ${symbol}: ${notional.toFixed(2)} < ${minNotional}`);
    }
    
    return meets;
  }

  /**
   * Validate and round order parameters
   * Returns rounded values and validation errors
   * 
   * @param symbol - Trading pair symbol
   * @param price - Order price
   * @param qty - Order quantity
   * @returns Validation result with rounded values and any errors
   */
  validateOrder(symbol: string, price: number, qty: number): OrderValidation {
    const errors: string[] = [];

    try {
      // Input validation
      if (!symbol || typeof symbol !== 'string') {
        errors.push('Invalid symbol');
        return {
          valid: false,
          roundedPrice: price.toString(),
          roundedQty: qty.toString(),
          errors,
        };
      }

      if (typeof price !== 'number' || isNaN(price) || !isFinite(price) || price <= 0) {
        errors.push(`Invalid price: ${price}`);
      }

      if (typeof qty !== 'number' || isNaN(qty) || !isFinite(qty) || qty <= 0) {
        errors.push(`Invalid quantity: ${qty}`);
      }

      if (errors.length > 0) {
        return {
          valid: false,
          roundedPrice: price.toString(),
          roundedQty: qty.toString(),
          errors,
        };
      }

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

        // Validate LOT_SIZE (uses scaled integer arithmetic - NO floating-point errors)
        if (!this.validateLotSize(symbol, roundedQtyNum)) {
          errors.push(`Quantity ${roundedQty} does not conform to LOT_SIZE stepSize ${filters.lotSizeFilter.stepSize}`);
        }
      }

      return {
        valid: errors.length === 0,
        roundedPrice,
        roundedQty,
        errors,
      };

    } catch (error: any) {
      console.error('[ExchangeFilters] Error in validateOrder:', error);
      errors.push(error?.message || 'Unknown validation error');
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
   * 
   * @returns Statistics about the filter cache
   */
  getStats() {
    return {
      symbolCount: this.filters.size,
      lastUpdate: this.lastUpdate,
      isLoaded: this.filters.size > 0,
      loading: this.loading,
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
        console.error('[ExchangeFilters] Daily refresh failed:', error?.message || error);
      }
    }, 24 * 60 * 60 * 1000);

    console.log('[ExchangeFilters] Daily refresh scheduled');
  }

  /**
   * Clear filter cache (for testing)
   */
  clearCache(): void {
    this.filters.clear();
    this.lastUpdate = null;
    console.log('[ExchangeFilters] Cache cleared');
  }
}

// Singleton instance
export const exchangeFilters = new ExchangeFilters();
export default exchangeFilters;
