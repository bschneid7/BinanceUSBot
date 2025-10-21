/**
 * Historical Data Service
 * Downloads, stores, and serves historical market data from Binance.US
 * Used for both backtesting and ML training
 */

import axios from 'axios';
import { parse } from 'csv-parse/sync';
import AdmZip from 'adm-zip';
import logger from '../utils/logger';
import HistoricalCandle from '../models/HistoricalCandle';

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface DownloadOptions {
  symbol: string;
  interval: string;
  startDate: Date;
  endDate: Date;
}

/**
 * Historical Data Service
 * Manages historical market data for backtesting and ML training
 */
class HistoricalDataService {
  private baseUrl = 'https://data.binance.us/public_data';

  /**
   * Get historical candles from local storage or download if missing
   */
  async getCandles(
    symbol: string,
    interval: string,
    startDate: Date,
    endDate: Date
  ): Promise<Candle[]> {
    // Try to get from database first
    const cachedCandles = await this.getCachedCandles(symbol, interval, startDate, endDate);
    
    if (cachedCandles.length > 0) {
      logger.info(`[HistoricalData] Found ${cachedCandles.length} cached candles for ${symbol}`);
      return cachedCandles;
    }

    // If not in cache, download from Binance.US
    logger.info(`[HistoricalData] Downloading historical data for ${symbol} from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    const downloadedCandles = await this.downloadAndStore({ symbol, interval, startDate, endDate });
    
    return downloadedCandles;
  }

  /**
   * Get cached candles from MongoDB
   */
  private async getCachedCandles(
    symbol: string,
    interval: string,
    startDate: Date,
    endDate: Date
  ): Promise<Candle[]> {
    try {
      const candles = await HistoricalCandle.find({
        symbol,
        interval,
        timestamp: {
          $gte: startDate.getTime(),
          $lte: endDate.getTime(),
        },
      })
        .sort({ timestamp: 1 })
        .lean();

      return candles.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
    } catch (error) {
      logger.error('[HistoricalData] Error fetching cached candles:', error);
      return [];
    }
  }

  /**
   * Download historical data from Binance.US and store in MongoDB
   */
  private async downloadAndStore(options: DownloadOptions): Promise<Candle[]> {
    const { symbol, interval, startDate, endDate } = options;
    const candles: Candle[] = [];

    // Binance.US provides data in monthly files
    // We need to download each month separately
    const months = this.getMonthsBetween(startDate, endDate);

    for (const month of months) {
      try {
        const monthlyCandles = await this.downloadMonthlyData(symbol, interval, month);
        
        // Filter to requested date range
        const filteredCandles = monthlyCandles.filter(
          c => c.timestamp >= startDate.getTime() && c.timestamp <= endDate.getTime()
        );

        candles.push(...filteredCandles);

        // Store in MongoDB for future use
        await this.storeCandles(symbol, interval, filteredCandles);

        logger.info(`[HistoricalData] Downloaded and stored ${filteredCandles.length} candles for ${symbol} ${month}`);
      } catch (error) {
        logger.warn(`[HistoricalData] Failed to download data for ${symbol} ${month}:`, error);
        // Continue with next month even if one fails
      }
    }

    return candles;
  }

  /**
   * Download monthly candlestick data from Binance.US
   * URL format: https://data.binance.us/data/spot/monthly/klines/BTCUSD/1h/BTCUSD-1h-2024-01.zip
   */
  private async downloadMonthlyData(
    symbol: string,
    interval: string,
    month: string
  ): Promise<Candle[]> {
    const url = `${this.baseUrl}/data/spot/monthly/klines/${symbol}/${interval}/${symbol}-${interval}-${month}.zip`;
    
    logger.info(`[HistoricalData] Downloading from: ${url}`);

    try {
      // Download the ZIP file
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000, // 60 second timeout
      });

      // Binance.US data is in ZIP format containing a CSV file
      // We need to extract and parse the CSV
      const candles = await this.parseZippedCSV(response.data);
      
      return candles;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          logger.warn(`[HistoricalData] No data available for ${symbol} ${month}`);
        } else {
          logger.error(`[HistoricalData] Error downloading ${url}:`, error.message);
        }
      }
      throw error;
    }
  }

  /**
   * Extract ZIP file and parse CSV data from Binance.US
   */
  private async extractAndParseZip(zipData: Buffer): Promise<Candle[]> {
    try {
      const zip = new AdmZip(zipData);
      const zipEntries = zip.getEntries();
      
      if (zipEntries.length === 0) {
        logger.warn('[HistoricalData] ZIP file is empty');
        return [];
      }
      
      // Get the first CSV file in the ZIP
      const csvEntry = zipEntries.find(entry => entry.entryName.endsWith('.csv'));
      
      if (!csvEntry) {
        logger.warn('[HistoricalData] No CSV file found in ZIP');
        return [];
      }
      
      const csvData = csvEntry.getData().toString('utf8');
      return this.parseCSV(csvData);
    } catch (error) {
      logger.error('[HistoricalData] Error extracting ZIP:', error);
      return [];
    }
  }

  /**
   * Download daily candlestick data from Binance.US (alternative to monthly ZIP files)
   * URL format: https://data.binance.us/data/spot/daily/klines/BTCUSD/1h/BTCUSD-1h-2024-01-01.csv
   */
  private async downloadDailyData(
    symbol: string,
    interval: string,
    date: string
  ): Promise<Candle[]> {
    // Binance.US provides data in ZIP format, not CSV
    const url = `${this.baseUrl}/spot/daily/klines/${symbol}/${interval}/${symbol}-${interval}-${date}.zip`;
    
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      // Extract ZIP and parse CSV
      const candles = await this.extractAndParseZip(response.data);
      return candles;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        // Data not available for this date
        return [];
      }
      throw error;
    }
  }

  /**
   * Parse CSV data from Binance.US
   * Format: open_time,open,high,low,close,volume,close_time,quote_volume,count,taker_buy_volume,taker_buy_quote_volume,ignore
   */
  private parseCSV(csvData: string): Candle[] {
    try {
      const records = parse(csvData, {
        skip_empty_lines: true,
        relax_column_count: true,
        from_line: 2, // Skip header row
      });

      const candles = records.map((row: string[]) => ({
        timestamp: parseInt(row[0]),
        open: parseFloat(row[1]),
        high: parseFloat(row[2]),
        low: parseFloat(row[3]),
        close: parseFloat(row[4]),
        volume: parseFloat(row[5]),
      }));

      // Filter out invalid candles (NaN values)
      return candles.filter(c => 
        !isNaN(c.timestamp) && 
        !isNaN(c.open) && 
        !isNaN(c.high) && 
        !isNaN(c.low) && 
        !isNaN(c.close) && 
        !isNaN(c.volume)
      );
    } catch (error) {
      logger.error('[HistoricalData] Error parsing CSV:', error);
      return [];
    }
  }

  /**
   * Store candles in MongoDB
   */
  private async storeCandles(symbol: string, interval: string, candles: Candle[]): Promise<void> {
    if (candles.length === 0) return;

    try {
      // Use bulk upsert to avoid duplicates
      const bulkOps = candles.map(candle => ({
        updateOne: {
          filter: {
            symbol,
            interval,
            timestamp: candle.timestamp,
          },
          update: {
            $set: {
              symbol,
              interval,
              timestamp: candle.timestamp,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
              volume: candle.volume,
            },
          },
          upsert: true,
        },
      }));

      await HistoricalCandle.bulkWrite(bulkOps);
    } catch (error: any) {
      // Log full error for debugging
      console.error('[HistoricalData] Full error object:', JSON.stringify(error, null, 2));
      logger.error('[HistoricalData] Error storing candles:', {
        message: error.message,
        name: error.name,
        code: error.code,
        stack: error.stack?.split('\n')[0],
      });
    }
  }

  /**
   * Get list of months between two dates
   * Returns array of strings in format "YYYY-MM"
   */
  private getMonthsBetween(startDate: Date, endDate: Date): string[] {
    const months: string[] = [];
    const current = new Date(startDate);
    current.setDate(1); // Start from first day of month

    while (current <= endDate) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      months.push(`${year}-${month}`);
      
      // Move to next month
      current.setMonth(current.getMonth() + 1);
    }

    return months;
  }

  /**
   * Get list of days between two dates
   * Returns array of strings in format "YYYY-MM-DD"
   */
  private getDaysBetween(startDate: Date, endDate: Date): string[] {
    const days: string[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      days.push(`${year}-${month}-${day}`);
      
      // Move to next day
      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  /**
   * Download historical data using daily files (more reliable than monthly ZIPs)
   */
  async downloadDailyRange(options: DownloadOptions): Promise<Candle[]> {
    const { symbol, interval, startDate, endDate } = options;
    const candles: Candle[] = [];
    const days = this.getDaysBetween(startDate, endDate);

    logger.info(`[HistoricalData] Downloading ${days.length} days of data for ${symbol}`);

    for (const day of days) {
      try {
        const dailyCandles = await this.downloadDailyData(symbol, interval, day);
        
        if (dailyCandles.length > 0) {
          candles.push(...dailyCandles);
          
          // Store in MongoDB
          await this.storeCandles(symbol, interval, dailyCandles);
          
          logger.info(`[HistoricalData] Downloaded ${dailyCandles.length} candles for ${symbol} ${day}`);
        }

        // Rate limiting: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.warn(`[HistoricalData] Failed to download ${symbol} ${day}`);
        // Continue with next day
      }
    }

    return candles;
  }

  /**
   * Clear cached data for a symbol
   */
  async clearCache(symbol: string, interval?: string): Promise<void> {
    const filter: any = { symbol };
    if (interval) filter.interval = interval;

    await HistoricalCandle.deleteMany(filter);
    logger.info(`[HistoricalData] Cleared cache for ${symbol}${interval ? ` ${interval}` : ''}`);
  }
}

export default new HistoricalDataService();

