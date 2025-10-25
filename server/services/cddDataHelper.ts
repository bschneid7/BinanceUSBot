/**
 * CryptoDataDownload Data Helper
 * Provides easy access to CDD data from SQLite database
 */

import sqlite3 from 'sqlite3';
import { promisify } from 'util';

const DB_PATH = '/app/data/cdd_data.db';

interface FundingRate {
  Unix: number;
  Date: string;
  Symbol: string;
  funding_rate: number;
  last_funding_rate: number;
}

interface VWAPData {
  date: string;
  symbol: string;
  vwap: number;
  largest_trans_buy_usd: number;
  largest_trans_sell_usd: number;
  buy_trans_count: number;
  sell_trans_count: number;
  avg_dollar_trans_size_buy: number;
  avg_dollar_trans_size_sell: number;
}

interface CorrelationData {
  Pair: string;
  CounterPair: string;
  Correlation: number;
  Window: string;
  CalcMethod: string;
}

export class CDDDataHelper {
  private db: sqlite3.Database | null = null;
  private dbAll: any;
  private dbGet: any;

  constructor() {
    this.initDatabase();
  }

  private initDatabase(): void {
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('[CDDDataHelper] Failed to open database:', err);
      } else {
        console.log('[CDDDataHelper] Database connected');
      }
    });

    // Promisify database methods
    if (this.db) {
      this.dbAll = promisify(this.db.all.bind(this.db));
      this.dbGet = promisify(this.db.get.bind(this.db));
    }
  }

  /**
   * Get the latest funding rate for a symbol
   * @param symbol Trading pair (e.g., 'BTCUSDT')
   * @returns Latest funding rate or null
   */
  async getLatestFundingRate(symbol: string): Promise<number | null> {
    try {
      const query = `
        SELECT last_funding_rate
        FROM funding_rates
        WHERE Symbol = ?
        ORDER BY Date DESC
        LIMIT 1
      `;

      const result: any = await this.dbGet(query, [symbol]);
      return result ? parseFloat(result.last_funding_rate) : null;
    } catch (error) {
      console.error(`[CDDDataHelper] Error getting funding rate for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get funding rate moving average
   * @param symbol Trading pair
   * @param periods Number of periods for MA
   * @returns Moving average of funding rate or null
   */
  async getFundingRateMA(symbol: string, periods: number = 3): Promise<number | null> {
    try {
      const query = `
        SELECT AVG(last_funding_rate) as ma
        FROM (
          SELECT last_funding_rate
          FROM funding_rates
          WHERE Symbol = ?
          ORDER BY Date DESC
          LIMIT ?
        )
      `;

      const result: any = await this.dbGet(query, [symbol, periods]);
      return result ? parseFloat(result.ma) : null;
    } catch (error) {
      console.error(`[CDDDataHelper] Error getting funding MA for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Check if funding rate is in extreme territory
   * @param symbol Trading pair
   * @returns 1 for extreme long, -1 for extreme short, 0 for normal
   */
  async getFundingExtreme(symbol: string): Promise<number> {
    const fundingRate = await this.getLatestFundingRate(symbol);
    
    if (fundingRate === null) return 0;

    // Extreme long (overheated) - funding > 0.01% (0.0001)
    if (fundingRate > 0.0001) return 1;
    
    // Extreme short (oversold) - funding < -0.01% (-0.0001)
    if (fundingRate < -0.0001) return -1;
    
    return 0;
  }

  /**
   * Get latest VWAP for a symbol
   * @param symbol Trading pair (only BTCUSDT and ETHUSDT supported)
   * @returns Latest VWAP or null
   */
  async getLatestVWAP(symbol: string): Promise<number | null> {
    try {
      // VWAP only available for BTC and ETH
      if (!['BTCUSDT', 'ETHUSDT'].includes(symbol)) {
        return null;
      }

      const query = `
        SELECT vwap
        FROM spot_summary
        WHERE symbol = ?
        ORDER BY date DESC
        LIMIT 1
      `;

      const result: any = await this.dbGet(query, [symbol]);
      return result ? parseFloat(result.vwap) : null;
    } catch (error) {
      console.error(`[CDDDataHelper] Error getting VWAP for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get buy/sell ratio from order flow
   * @param symbol Trading pair
   * @returns Buy/sell ratio or null
   */
  async getBuySellRatio(symbol: string): Promise<number | null> {
    try {
      if (!['BTCUSDT', 'ETHUSDT'].includes(symbol)) {
        return null;
      }

      const query = `
        SELECT buy_trans_count, sell_trans_count
        FROM spot_summary
        WHERE symbol = ?
        ORDER BY date DESC
        LIMIT 1
      `;

      const result: any = await this.dbGet(query, [symbol]);
      
      if (!result) return null;

      const buyCount = parseInt(result.buy_trans_count);
      const sellCount = parseInt(result.sell_trans_count);

      return sellCount > 0 ? buyCount / sellCount : null;
    } catch (error) {
      console.error(`[CDDDataHelper] Error getting buy/sell ratio for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get portfolio correlation for risk management
   * @param symbols Array of symbols currently held
   * @returns Average correlation and max correlation
   */
  async getPortfolioCorrelation(symbols: string[]): Promise<{
    avgCorrelation: number;
    maxCorrelation: number;
    diversificationScore: number;
  } | null> {
    try {
      if (symbols.length < 2) {
        return { avgCorrelation: 0, maxCorrelation: 0, diversificationScore: 1 };
      }

      // Get correlations between held positions
      const placeholders = symbols.map(() => '?').join(',');
      const query = `
        SELECT AVG(Correlation) as avg_corr, MAX(Correlation) as max_corr
        FROM (
          SELECT DISTINCT Correlation
          FROM correlations
          WHERE Pair IN (${placeholders})
            AND CounterPair IN (${placeholders})
            AND Pair != CounterPair
            AND Window = '1w'
        )
      `;

      const result: any = await this.dbGet(query, [...symbols, ...symbols]);

      if (!result || result.avg_corr === null) {
        return { avgCorrelation: 0, maxCorrelation: 0, diversificationScore: 1 };
      }

      const avgCorr = parseFloat(result.avg_corr);
      const maxCorr = parseFloat(result.max_corr);

      return {
        avgCorrelation: avgCorr,
        maxCorrelation: maxCorr,
        diversificationScore: 1 - avgCorr
      };
    } catch (error) {
      console.error('[CDDDataHelper] Error getting portfolio correlation:', error);
      return null;
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('[CDDDataHelper] Error closing database:', err);
        } else {
          console.log('[CDDDataHelper] Database closed');
        }
      });
    }
  }
}

// Singleton instance
let cddHelper: CDDDataHelper | null = null;

export function getCDDHelper(): CDDDataHelper {
  if (!cddHelper) {
    cddHelper = new CDDDataHelper();
  }
  return cddHelper;
}

export default getCDDHelper;

