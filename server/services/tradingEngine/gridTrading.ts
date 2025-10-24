import logger from '../../utils/logger';
import binanceService from '../binanceService';
import BotConfig from '../../models/BotConfig';
import BotState from '../../models/BotState';
import GridOrder from '../../models/GridOrder';

/**
 * Grid Trading Strategy
 * 
 * Places buy and sell orders at fixed price intervals to profit from price oscillations.
 * Works best in ranging/sideways markets.
 */

interface GridConfig {
  symbol: string;
  lowerBound: number;
  upperBound: number;
  gridLevels: number;
  orderSize: number; // in USD
  enabled: boolean;
}

interface GridLevel {
  price: number;
  side: 'BUY' | 'SELL';
  orderId?: string;
  filled: boolean;
  pairOrderId?: string; // ID of the opposite order
}

export class GridTradingService {
  private grids: Map<string, GridLevel[]> = new Map();
  private config: GridConfig | null = null;
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    logger.info('[GridTrading] Initialized');
  }

  /**
   * Start the grid trading service
   */
  async start(): Promise<void> {
    try {
      logger.info('[GridTrading] Starting grid trading service...');

      // Load configuration from database
      await this.loadConfig();

      if (!this.config || !this.config.enabled) {
        logger.info('[GridTrading] Grid trading is disabled in configuration');
        return;
      }

      if (!binanceService.isConfigured()) {
        logger.warn('[GridTrading] Binance API not configured, skipping grid trading');
        return;
      }

      this.isRunning = true;

      // Initialize grid for configured symbol
      await this.initializeGrid();

      // Start monitoring and managing grid
      this.checkInterval = setInterval(() => {
        this.manageGrid().catch(err => {
          logger.error({ err }, '[GridTrading] Error managing grid');
        });
      }, 10000); // Check every 10 seconds

      logger.info('[GridTrading] Grid trading service started successfully');
    } catch (error) {
      logger.error({ err: error }, '[GridTrading] Failed to start grid trading service');
      throw error;
    }
  }

  /**
   * Stop the grid trading service
   */
  async stop(): Promise<void> {
    logger.info('[GridTrading] Stopping grid trading service...');
    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Cancel all open grid orders
    await this.cancelAllGridOrders();

    logger.info('[GridTrading] Grid trading service stopped');
  }

  /**
   * Load configuration from database
   */
  private async loadConfig(): Promise<void> {
    try {
      const botConfig = await BotConfig.findOne();
      
      if (!botConfig) {
        logger.warn('[GridTrading] No bot configuration found');
        return;
      }

      // Check if grid trading config exists
      if (botConfig.gridTrading) {
        this.config = botConfig.gridTrading as GridConfig;
        logger.info({ config: this.config }, '[GridTrading] Configuration loaded');
      } else {
        // Set default configuration
        this.config = {
          symbol: 'BTCUSDT',
          lowerBound: 80000,
          upperBound: 90000,
          gridLevels: 20,
          orderSize: 100, // $100 per order
          enabled: true
        };
        
        // Save default config to database
        botConfig.gridTrading = this.config;
        await botConfig.save();
        
        logger.info({ config: this.config }, '[GridTrading] Default configuration created');
      }
    } catch (error) {
      logger.error({ err: error }, '[GridTrading] Error loading configuration');
      throw error;
    }
  }

  /**
   * Initialize grid levels and place initial orders
   */
  private async initializeGrid(): Promise<void> {
    if (!this.config) return;

    try {
      logger.info('[GridTrading] Initializing grid...');

      const { symbol, lowerBound, upperBound, gridLevels } = this.config;
      const gridSpacing = (upperBound - lowerBound) / gridLevels;

      // Get current price
      const currentPrice = await this.getCurrentPrice(symbol);
      
      if (!currentPrice) {
        logger.error('[GridTrading] Could not get current price');
        return;
      }

      logger.info({ currentPrice, lowerBound, upperBound }, '[GridTrading] Current price and bounds');

      // Check if price is within grid range
      if (currentPrice < lowerBound || currentPrice > upperBound) {
        logger.warn('[GridTrading] Current price is outside grid range, adjusting bounds...');
        // Adjust bounds to center around current price
        const range = upperBound - lowerBound;
        this.config.lowerBound = currentPrice - range / 2;
        this.config.upperBound = currentPrice + range / 2;
      }

      // Create grid levels
      const gridLevels_array: GridLevel[] = [];

      for (let i = 0; i <= gridLevels; i++) {
        const price = lowerBound + (i * gridSpacing);
        
        // Place buy orders below current price
        if (price < currentPrice) {
          gridLevels_array.push({
            price: this.roundPrice(price),
            side: 'BUY',
            filled: false
          });
        }
        // Place sell orders above current price
        else if (price > currentPrice) {
          gridLevels_array.push({
            price: this.roundPrice(price),
            side: 'SELL',
            filled: false
          });
        }
      }

      this.grids.set(symbol, gridLevels_array);

      logger.info({ 
        symbol, 
        buyOrders: gridLevels_array.filter(l => l.side === 'BUY').length,
        sellOrders: gridLevels_array.filter(l => l.side === 'SELL').length
      }, '[GridTrading] Grid levels created');

      // Place initial orders
      await this.placeGridOrders();

    } catch (error) {
      logger.error({ err: error }, '[GridTrading] Error initializing grid');
      throw error;
    }
  }

  /**
   * Place grid orders on the exchange
   */
  private async placeGridOrders(): Promise<void> {
    if (!this.config) return;

    const { symbol, orderSize } = this.config;
    const gridLevels = this.grids.get(symbol);

    if (!gridLevels) return;

    try {
      // Get account balance to determine how many orders we can place
      const balance = await this.getAvailableBalance();
      const maxOrders = Math.floor(balance / orderSize);

      logger.info({ balance, maxOrders }, '[GridTrading] Available balance for grid orders');

      let ordersPlaced = 0;

      for (const level of gridLevels) {
        if (ordersPlaced >= maxOrders) {
          logger.info('[GridTrading] Reached maximum number of orders based on available balance');
          break;
        }

        if (level.orderId || level.filled) continue; // Skip if order already placed or filled

        try {
          // Calculate quantity based on order size and price
          const quantity = this.calculateQuantity(orderSize, level.price, symbol);

          if (!quantity || quantity <= 0) {
            logger.warn({ level }, '[GridTrading] Invalid quantity calculated, skipping level');
            continue;
          }

          // Place limit order
          const order = await binanceService.placeOrder({
            symbol,
            side: level.side,
            type: 'LIMIT',
            quantity,
            price: level.price,
            timeInForce: 'GTC' // Good Till Cancelled
          });

          if (order && order.orderId) {
            level.orderId = order.orderId.toString();
            ordersPlaced++;

            // Save to database
            await this.saveGridOrder(symbol, level, order.orderId.toString());

            logger.info({ 
              side: level.side, 
              price: level.price, 
              quantity,
              orderId: order.orderId 
            }, '[GridTrading] Grid order placed');
          }

          // Small delay to avoid rate limits
          await this.sleep(100);

        } catch (error) {
          logger.error({ err: error, level }, '[GridTrading] Error placing grid order');
        }
      }

      logger.info({ ordersPlaced }, '[GridTrading] Grid orders placement complete');

    } catch (error) {
      logger.error({ err: error }, '[GridTrading] Error placing grid orders');
    }
  }

  /**
   * Manage grid: check filled orders and place new ones
   */
  private async manageGrid(): Promise<void> {
    if (!this.isRunning || !this.config) return;

    const { symbol } = this.config;
    const gridLevels = this.grids.get(symbol);

    if (!gridLevels) return;

    try {
      // Check status of all orders
      for (const level of gridLevels) {
        if (!level.orderId || level.filled) continue;

        // Check if order is filled
        const orderStatus = await binanceService.getOrderStatus(symbol, level.orderId);

        if (orderStatus && orderStatus.status === 'FILLED') {
          logger.info({ 
            side: level.side, 
            price: level.price, 
            orderId: level.orderId 
          }, '[GridTrading] Grid order filled!');

          level.filled = true;

          // Update database
          await this.updateGridOrderStatus(level.orderId, 'FILLED');

          // Place opposite order
          await this.placeOppositeOrder(level);
        }
      }

    } catch (error) {
      logger.error({ err: error }, '[GridTrading] Error managing grid');
    }
  }

  /**
   * Place opposite order after a grid order is filled
   */
  private async placeOppositeOrder(filledLevel: GridLevel): Promise<void> {
    if (!this.config) return;

    const { symbol, orderSize, gridLevels, lowerBound, upperBound } = this.config;
    const gridSpacing = (upperBound - lowerBound) / gridLevels;

    try {
      // Calculate opposite order price
      const oppositeSide = filledLevel.side === 'BUY' ? 'SELL' : 'BUY';
      const oppositePrice = filledLevel.side === 'BUY' 
        ? filledLevel.price + gridSpacing 
        : filledLevel.price - gridSpacing;

      // Calculate quantity
      const quantity = this.calculateQuantity(orderSize, oppositePrice, symbol);

      if (!quantity || quantity <= 0) {
        logger.warn('[GridTrading] Invalid quantity for opposite order');
        return;
      }

      // Place opposite order
      const order = await binanceService.placeOrder({
        symbol,
        side: oppositeSide,
        type: 'LIMIT',
        quantity,
        price: this.roundPrice(oppositePrice),
        timeInForce: 'GTC'
      });

      if (order && order.orderId) {
        logger.info({ 
          side: oppositeSide, 
          price: oppositePrice, 
          quantity,
          orderId: order.orderId,
          pairOrderId: filledLevel.orderId
        }, '[GridTrading] Opposite order placed');

        // Add new level to grid
        const levels = this.grids.get(symbol);
        if (levels) {
          levels.push({
            price: this.roundPrice(oppositePrice),
            side: oppositeSide,
            orderId: order.orderId.toString(),
            filled: false,
            pairOrderId: filledLevel.orderId
          });
        }

        // Save to database
        await this.saveGridOrder(symbol, {
          price: this.roundPrice(oppositePrice),
          side: oppositeSide,
          orderId: order.orderId.toString(),
          filled: false,
          pairOrderId: filledLevel.orderId
        }, order.orderId.toString());
      }

    } catch (error) {
      logger.error({ err: error }, '[GridTrading] Error placing opposite order');
    }
  }

  /**
   * Cancel all open grid orders
   */
  private async cancelAllGridOrders(): Promise<void> {
    if (!this.config) return;

    const { symbol } = this.config;
    const gridLevels = this.grids.get(symbol);

    if (!gridLevels) return;

    logger.info('[GridTrading] Cancelling all grid orders...');

    for (const level of gridLevels) {
      if (level.orderId && !level.filled) {
        try {
          await binanceService.cancelOrder(symbol, level.orderId);
          logger.info({ orderId: level.orderId }, '[GridTrading] Order cancelled');
        } catch (error) {
          logger.error({ err: error, orderId: level.orderId }, '[GridTrading] Error cancelling order');
        }
      }
    }
  }

  /**
   * Get current price for symbol
   */
  private async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      const ticker = await binanceService.getTickerPrice(symbol);
      return ticker ? parseFloat(ticker.price) : null;
    } catch (error) {
      logger.error({ err: error }, '[GridTrading] Error getting current price');
      return null;
    }
  }

  /**
   * Get available balance for grid trading
   */
  private async getAvailableBalance(): Promise<number> {
    try {
      // Get bot state to determine allocated capital
      const botState = await BotState.findOne();
      const botConfig = await BotConfig.findOne();

      if (!botState || !botConfig) {
        return 0;
      }

      // Allocate 20% of equity for grid trading (as recommended)
      const totalEquity = botState.equity || 7000;
      const gridAllocation = totalEquity * 0.20;

      return gridAllocation;
    } catch (error) {
      logger.error({ err: error }, '[GridTrading] Error getting available balance');
      return 0;
    }
  }

  /**
   * Calculate quantity based on order size and price
   */
  private calculateQuantity(orderSize: number, price: number, symbol: string): number {
    // Calculate quantity (orderSize in USD / price)
    let quantity = orderSize / price;

    // Round to appropriate precision based on symbol
    if (symbol.includes('BTC')) {
      quantity = Math.floor(quantity * 100000) / 100000; // 5 decimals for BTC
    } else if (symbol.includes('ETH')) {
      quantity = Math.floor(quantity * 10000) / 10000; // 4 decimals for ETH
    } else {
      quantity = Math.floor(quantity * 100) / 100; // 2 decimals for others
    }

    return quantity;
  }

  /**
   * Round price to 2 decimal places
   */
  private roundPrice(price: number): number {
    return Math.round(price * 100) / 100;
  }

  /**
   * Save grid order to database
   */
  private async saveGridOrder(symbol: string, level: GridLevel, orderId: string): Promise<void> {
    try {
      await GridOrder.create({
        symbol,
        side: level.side,
        price: level.price,
        orderId,
        pairOrderId: level.pairOrderId,
        status: 'OPEN',
        createdAt: new Date()
      });
    } catch (error) {
      logger.error({ err: error }, '[GridTrading] Error saving grid order to database');
    }
  }

  /**
   * Update grid order status in database
   */
  private async updateGridOrderStatus(orderId: string, status: string): Promise<void> {
    try {
      await GridOrder.updateOne(
        { orderId },
        { status, filledAt: new Date() }
      );
    } catch (error) {
      logger.error({ err: error }, '[GridTrading] Error updating grid order status');
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get grid statistics
   */
  async getStatistics(): Promise<any> {
    if (!this.config) return null;

    const { symbol } = this.config;
    const gridLevels = this.grids.get(symbol);

    if (!gridLevels) return null;

    const totalOrders = gridLevels.length;
    const filledOrders = gridLevels.filter(l => l.filled).length;
    const openOrders = gridLevels.filter(l => l.orderId && !l.filled).length;

    // Get total profit from database
    const gridOrders = await GridOrder.find({ status: 'FILLED' });
    let totalProfit = 0;

    // Calculate profit from filled pairs
    for (const order of gridOrders) {
      if (order.pairOrderId) {
        const pairOrder = gridOrders.find(o => o.orderId === order.pairOrderId);
        if (pairOrder) {
          // Profit is the difference between buy and sell prices
          if (order.side === 'SELL') {
            totalProfit += (order.price - pairOrder.price) * (this.config.orderSize / order.price);
          }
        }
      }
    }

    return {
      symbol,
      totalOrders,
      filledOrders,
      openOrders,
      totalProfit: this.roundPrice(totalProfit),
      config: this.config
    };
  }
}

export default new GridTradingService();

