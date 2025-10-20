import binanceService from './binanceService';

interface SymbolFilter {
  filterType: string;
  [key: string]: any;
}

interface SymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  filters: SymbolFilter[];
  // Parsed filter values
  minPrice?: number;
  maxPrice?: number;
  tickSize?: number;
  minQty?: number;
  maxQty?: number;
  stepSize?: number;
  minNotional?: number;
}

class ExchangeInfoCache {
  private cache: Map<string, SymbolInfo> = new Map();
  private lastUpdate: Date | null = null;
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Get symbol info from cache or fetch if stale
   */
  async getSymbolInfo(symbol: string): Promise<SymbolInfo | null> {
    // Check if cache needs refresh
    if (this.needsRefresh()) {
      await this.refresh();
    }

    return this.cache.get(symbol) || null;
  }

  /**
   * Check if cache needs refresh
   */
  private needsRefresh(): boolean {
    if (!this.lastUpdate) return true;
    const age = Date.now() - this.lastUpdate.getTime();
    return age > this.CACHE_TTL_MS;
  }

  /**
   * Refresh exchange info cache
   */
  async refresh(): Promise<void> {
    try {
      console.log('[ExchangeInfoCache] Refreshing exchange info...');
      
      if (!binanceService.isConfigured()) {
        console.warn('[ExchangeInfoCache] Binance not configured - using defaults');
        return;
      }

      const exchangeInfo = await binanceService.getExchangeInfo();
      
      // Parse and cache symbol info
      for (const symbolData of exchangeInfo.symbols) {
        if (symbolData.status !== 'TRADING') continue;

        const info: SymbolInfo = {
          symbol: symbolData.symbol,
          status: symbolData.status,
          baseAsset: symbolData.baseAsset,
          quoteAsset: symbolData.quoteAsset,
          filters: symbolData.filters,
        };

        // Parse PRICE_FILTER
        const priceFilter = symbolData.filters.find((f: any) => f.filterType === 'PRICE_FILTER');
        if (priceFilter) {
          info.minPrice = parseFloat(priceFilter.minPrice);
          info.maxPrice = parseFloat(priceFilter.maxPrice);
          info.tickSize = parseFloat(priceFilter.tickSize);
        }

        // Parse LOT_SIZE
        const lotSizeFilter = symbolData.filters.find((f: any) => f.filterType === 'LOT_SIZE');
        if (lotSizeFilter) {
          info.minQty = parseFloat(lotSizeFilter.minQty);
          info.maxQty = parseFloat(lotSizeFilter.maxQty);
          info.stepSize = parseFloat(lotSizeFilter.stepSize);
        }

        // Parse MIN_NOTIONAL
        const notionalFilter = symbolData.filters.find((f: any) => f.filterType === 'MIN_NOTIONAL' || f.filterType === 'NOTIONAL');
        if (notionalFilter) {
          info.minNotional = parseFloat(notionalFilter.minNotional || notionalFilter.notional);
        }

        this.cache.set(symbolData.symbol, info);
      }

      this.lastUpdate = new Date();
      console.log(`[ExchangeInfoCache] Cached ${this.cache.size} symbols`);
    } catch (error) {
      console.error('[ExchangeInfoCache] Failed to refresh:', error);
    }
  }

  /**
   * Validate and adjust price to meet exchange filters
   */
  adjustPrice(symbol: string, price: number): number {
    const info = this.cache.get(symbol);
    if (!info || !info.tickSize) return price;

    // Round to tick size
    const adjusted = Math.round(price / info.tickSize) * info.tickSize;

    // Clamp to min/max
    if (info.minPrice && adjusted < info.minPrice) return info.minPrice;
    if (info.maxPrice && adjusted > info.maxPrice) return info.maxPrice;

    return adjusted;
  }

  /**
   * Validate and adjust quantity to meet exchange filters
   */
  adjustQuantity(symbol: string, quantity: number): number {
    const info = this.cache.get(symbol);
    if (!info || !info.stepSize) return quantity;

    // Round to step size
    const adjusted = Math.floor(quantity / info.stepSize) * info.stepSize;

    // Clamp to min/max
    if (info.minQty && adjusted < info.minQty) return info.minQty;
    if (info.maxQty && adjusted > info.maxQty) return info.maxQty;

    return adjusted;
  }

  /**
   * Validate order meets all exchange requirements
   */
  validateOrder(symbol: string, price: number, quantity: number): { valid: boolean; error?: string } {
    const info = this.cache.get(symbol);
    if (!info) {
      return { valid: false, error: 'Symbol info not found in cache' };
    }

    // Check price filters
    if (info.minPrice && price < info.minPrice) {
      return { valid: false, error: `Price ${price} below minimum ${info.minPrice}` };
    }
    if (info.maxPrice && price > info.maxPrice) {
      return { valid: false, error: `Price ${price} above maximum ${info.maxPrice}` };
    }
    if (info.tickSize && price % info.tickSize !== 0) {
      return { valid: false, error: `Price ${price} not a multiple of tick size ${info.tickSize}` };
    }

    // Check quantity filters
    if (info.minQty && quantity < info.minQty) {
      return { valid: false, error: `Quantity ${quantity} below minimum ${info.minQty}` };
    }
    if (info.maxQty && quantity > info.maxQty) {
      return { valid: false, error: `Quantity ${quantity} above maximum ${info.maxQty}` };
    }
    if (info.stepSize && quantity % info.stepSize !== 0) {
      return { valid: false, error: `Quantity ${quantity} not a multiple of step size ${info.stepSize}` };
    }

    // Check notional (price * quantity)
    const notional = price * quantity;
    if (info.minNotional && notional < info.minNotional) {
      return { valid: false, error: `Notional ${notional} below minimum ${info.minNotional}` };
    }

    return { valid: true };
  }

  /**
   * Get precision for price (number of decimal places)
   */
  getPricePrecision(symbol: string): number {
    const info = this.cache.get(symbol);
    if (!info || !info.tickSize) return 2; // default

    const tickSizeStr = info.tickSize.toString();
    const decimalIndex = tickSizeStr.indexOf('.');
    if (decimalIndex === -1) return 0;

    return tickSizeStr.length - decimalIndex - 1;
  }

  /**
   * Get precision for quantity (number of decimal places)
   */
  getQuantityPrecision(symbol: string): number {
    const info = this.cache.get(symbol);
    if (!info || !info.stepSize) return 8; // default

    const stepSizeStr = info.stepSize.toString();
    const decimalIndex = stepSizeStr.indexOf('.');
    if (decimalIndex === -1) return 0;

    return stepSizeStr.length - decimalIndex - 1;
  }

  /**
   * Format price with correct precision
   */
  formatPrice(symbol: string, price: number): string {
    const precision = this.getPricePrecision(symbol);
    return price.toFixed(precision);
  }

  /**
   * Format quantity with correct precision
   */
  formatQuantity(symbol: string, quantity: number): string {
    const precision = this.getQuantityPrecision(symbol);
    return quantity.toFixed(precision);
  }
}

export default new ExchangeInfoCache();

