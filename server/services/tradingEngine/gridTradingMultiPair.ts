import logger from '../../utils/logger';
import binanceService from '../binanceService';
import BotConfig from '../../models/BotConfig';
import BotState from '../../models/BotState';
import GridOrder from '../../models/GridOrder';
import Transaction from '../../models/Transaction';
import gridMLAdapter from './gridMLAdapter';

/**
 * Multi-Pair Grid Trading Strategy
 * 
 * Places buy and sell orders at fixed price intervals across multiple trading pairs
 * to profit from price oscillations. Works best in ranging/sideways markets.
 */

interface PairConfig {
  symbol: string;
  lowerBound: number;
  upperBound: number;
  gridLevels: number;
  orderSize: number; // in USD
  enabled: boolean;
}

interface MultiPairGridConfig {
  pairs: PairConfig[];
  enabled: boolean;
}

interface GridLevel {
  price: number;
  side: 'BUY' | 'SELL';
  orderId?: string;
  filled: boolean;
  pairOrderId?: string; // ID of the opposite order
}

export class MultiPairGridTradingService {
  private grids: Map<string, GridLevel[]> = new Map();
  private configs: Map<string, PairConfig> = new Map();
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    logger.info('[GridTrading] Multi-pair service initialized');
  }

  /**
   * Start the multi-pair grid trading service
   */
  async start(): Promise<void> {
    try {
      logger.info('[GridTrading] Starting multi-pair grid trading service...');

      // Load configuration from database
      await this.loadConfig();

      if (this.configs.size === 0) {
        logger.info('[GridTrading] No pairs configured for grid trading');
        return;
      }

      if (!binanceService.isConfigured()) {
        logger.warn('[GridTrading] Binance API not configured, skipping grid trading');
        return;
      }

      this.isRunning = true;

      // Initialize ML adapter
      const botState = await BotState.findOne({});
      if (botState && botState.userId) {
        try {
          await gridMLAdapter.initialize(botState.userId);
          logger.info('[GridTrading] ML adapter initialized successfully');
        } catch (error) {
          logger.warn({ err: error }, '[GridTrading] Failed to initialize ML adapter, continuing without ML');
        }
      }

      // Initialize grids for all configured pairs
      for (const [symbol, config] of this.configs) {
        if (config.enabled) {
          await this.initializeGrid(symbol, config);
        }
      }

      // Start monitoring and managing all grids
      this.checkInterval = setInterval(() => {
        this.manageAllGrids().catch(err => {
          logger.error({ err }, '[GridTrading] Error managing grids');
        });
      }, 10000); // Check every 10 seconds

      logger.info({ pairCount: this.configs.size }, '[GridTrading] Multi-pair grid trading service started successfully');
    } catch (error) {
      logger.error({ err: error }, '[GridTrading] Failed to start multi-pair grid trading service');
      throw error;
    }
  }

  /**
   * Stop the grid trading service
   */
  async stop(): Promise<void> {
    logger.info('[GridTrading] Stopping multi-pair grid trading service...');
    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Cancel all open grid orders for all pairs
    for (const symbol of this.configs.keys()) {
      await this.cancelGridOrders(symbol);
    }

    logger.info('[GridTrading] Multi-pair grid trading service stopped');
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

      // Check if multi-pair grid trading config exists
      if (botConfig.gridTradingMultiPair) {
        const multiConfig = botConfig.gridTradingMultiPair as MultiPairGridConfig;
        
        if (multiConfig.enabled && multiConfig.pairs) {
          for (const pairConfig of multiConfig.pairs) {
            if (pairConfig.enabled) {
              this.configs.set(pairConfig.symbol, pairConfig);
            }
          }
          logger.info({ pairCount: this.configs.size }, '[GridTrading] Multi-pair configuration loaded');
        }
      } else {
        // Calculate dynamic grid bounds based on current prices
        // This prevents hardcoded bounds from becoming outdated
        const btcPrice = await this.getCurrentPrice('BTCUSD');
        const ethPrice = await this.getCurrentPrice('ETHUSD');
        const solPrice = await this.getCurrentPrice('SOLUSD');

        const defaultConfig: MultiPairGridConfig = {
          enabled: true,
          pairs: [
            {
              symbol: 'BTCUSD',
              lowerBound: Math.round(btcPrice * 0.92), // 8% below current
              upperBound: Math.round(btcPrice * 1.08), // 8% above current
              gridLevels: 15,
              orderSize: 200,
              enabled: true
            },
            {
              symbol: 'ETHUSD',
              lowerBound: Math.round(ethPrice * 0.90), // 10% below current
              upperBound: Math.round(ethPrice * 1.10), // 10% above current
              gridLevels: 10,
              orderSize: 100,
              enabled: true
            },
            {
              symbol: 'SOLUSD',
              lowerBound: Math.round(solPrice * 0.90), // 10% below current
              upperBound: Math.round(solPrice * 1.10), // 10% above current
              gridLevels: 8,
              orderSize: 60,
              enabled: true
            }
          ]
        };
        
        logger.info({ 
          btcBounds: [defaultConfig.pairs[0].lowerBound, defaultConfig.pairs[0].upperBound],
          ethBounds: [defaultConfig.pairs[1].lowerBound, defaultConfig.pairs[1].upperBound],
          solBounds: [defaultConfig.pairs[2].lowerBound, defaultConfig.pairs[2].upperBound]
        }, '[GridTrading] Calculated dynamic grid bounds');
        
        // Save default config to database
        botConfig.gridTradingMultiPair = defaultConfig;
        await botConfig.save();
        
        // Load into memory
        for (const pairConfig of defaultConfig.pairs) {
          this.configs.set(pairConfig.symbol, pairConfig);
        }
        
        logger.info({ pairCount: this.configs.size }, '[GridTrading] Default multi-pair configuration created');
      }
    } catch (error) {
      logger.error({ err: error }, '[GridTrading] Error loading configuration');
      throw error;
    }
  }

  /**
   * Initialize grid levels and place initial orders for a specific pair
   */
  private async initializeGrid(symbol: string, config: PairConfig): Promise<void> {
    try {
      logger.info({ symbol }, '[GridTrading] Initializing grid for pair...');

      const { lowerBound, upperBound, gridLevels } = config;
      const gridSpacing = (upperBound - lowerBound) / gridLevels;

      // Get current price
      const currentPrice = await this.getCurrentPrice(symbol);
      
      if (!currentPrice) {
        logger.error({ symbol }, '[GridTrading] Could not get current price');
        return;
      }

      logger.info({ symbol, currentPrice, lowerBound, upperBound }, '[GridTrading] Current price and bounds');

      // Check if price is within grid range
      let adjustedLowerBound = lowerBound;
      let adjustedUpperBound = upperBound;
      
      if (currentPrice < lowerBound || currentPrice > upperBound) {
        logger.warn({ symbol }, '[GridTrading] Current price is outside grid range, adjusting bounds...');
        // Adjust bounds to center around current price
        const range = upperBound - lowerBound;
        adjustedLowerBound = currentPrice - range / 2;
        adjustedUpperBound = currentPrice + range / 2;
      }

      // Create grid levels
      const gridLevels_array: GridLevel[] = [];
      const adjustedSpacing = (adjustedUpperBound - adjustedLowerBound) / gridLevels;

      for (let i = 0; i <= gridLevels; i++) {
        const price = adjustedLowerBound + (i * adjustedSpacing);
        
        // Place buy orders below current price
        if (price < currentPrice) {
          gridLevels_array.push({
            price: this.roundPrice(price, symbol),
            side: 'BUY',
            filled: false
          });
        }
        // Place sell orders above current price
        else if (price > currentPrice) {
          gridLevels_array.push({
            price: this.roundPrice(price, symbol),
            side: 'SELL',
            filled: false
          });
        }
      }

      // Load existing orders from Binance to avoid duplicates
      try {
        const existingOrders = await binanceService.getOpenOrders(symbol);
        logger.info({ symbol, existingCount: existingOrders.length }, 
          '[GridTrading] Found existing open orders');
        
        // Mark grid levels that already have orders
        for (const order of existingOrders) {
          const orderPrice = parseFloat(order.price);
          const orderSide = order.side;
          
          // Find matching grid level
          const matchingLevel = gridLevels_array.find(level => 
            Math.abs(level.price - orderPrice) < 1 && // Within $1
            level.side === orderSide &&
            !level.orderId
          );
          
          if (matchingLevel) {
            matchingLevel.orderId = order.orderId.toString();
            logger.info({ symbol, orderId: order.orderId, price: orderPrice, side: orderSide },
              '[GridTrading] Loaded existing order into grid');
          }
        }
      } catch (error) {
        logger.warn({ err: error, symbol }, '[GridTrading] Could not load existing orders, will place new ones');
      }

      this.grids.set(symbol, gridLevels_array);

      const existingOrderCount = gridLevels_array.filter(l => l.orderId).length;
      const newOrdersNeeded = gridLevels_array.filter(l => !l.orderId && !l.filled).length;

      logger.info({ 
        symbol, 
        existingOrders: existingOrderCount,
        newOrdersNeeded: newOrdersNeeded,
        buyOrders: gridLevels_array.filter(l => l.side === 'BUY').length,
        sellOrders: gridLevels_array.filter(l => l.side === 'SELL').length
      }, '[GridTrading] Grid levels created and existing orders loaded');

      // Only place orders that don't already exist
      if (newOrdersNeeded > 0) {
        await this.placeGridOrders(symbol);
      } else {
        logger.info({ symbol }, '[GridTrading] All grid orders already exist, skipping placement');
      }

    } catch (error) {
      logger.error({ err: error, symbol }, '[GridTrading] Error initializing grid');
    }
  }

  /**
   * Place grid orders on the exchange for a specific pair
   */
  private async placeGridOrders(symbol: string): Promise<void> {
    const config = this.configs.get(symbol);
    const gridLevels = this.grids.get(symbol);

    if (!config || !gridLevels) return;

    const { orderSize } = config;

    try {
      // Get account balance to determine how many orders we can place
      const balance = await this.getAvailableBalance();
      const maxOrders = Math.floor(balance / orderSize);

      logger.info({ symbol, balance, maxOrders }, '[GridTrading] Available balance for grid orders');

      let ordersPlaced = 0;

      for (const level of gridLevels) {
        if (ordersPlaced >= maxOrders) {
          logger.info({ symbol }, '[GridTrading] Reached maximum number of orders based on available balance');
          break;
        }

        if (level.orderId || level.filled) continue; // Skip if order already placed or filled

        try {
          // Calculate quantity based on order size and price
          const quantity = this.calculateQuantity(orderSize, level.price, symbol);

          if (!quantity || quantity <= 0) {
            logger.warn({ symbol, level }, '[GridTrading] Invalid quantity calculated, skipping level');
            continue;
          }

          // For SELL orders, check if we have sufficient holdings
          if (level.side === 'SELL') {
            const baseAsset = symbol.replace('USD', '');
            const accountInfo = await binanceService.getAccountInfo();
            const assetBalance = accountInfo.balances.find((b: any) => b.asset === baseAsset);
            const availableQuantity = parseFloat(assetBalance?.free || '0');
            
            if (availableQuantity < quantity) {
              logger.info({ symbol, required: quantity, available: availableQuantity }, 
                '[GridTrading] Insufficient holdings for SELL order, attempting to free up capital');
              
              // Try to free up capital by selling underperforming assets
              const capitalFreed = await this.freeUpCapitalForGrid(baseAsset, quantity);
              
              if (!capitalFreed) {
                logger.warn({ symbol }, '[GridTrading] Could not free up sufficient capital, skipping SELL order');
                continue;
              }
              
              logger.info({ symbol }, '[GridTrading] Successfully freed up capital, proceeding with SELL order');
            }
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
              symbol,
              side: level.side, 
              price: level.price, 
              quantity,
              orderId: order.orderId 
            }, '[GridTrading] Grid order placed');
          }

          // Small delay to avoid rate limits
          await this.sleep(150);

        } catch (error) {
          logger.error({ err: error, symbol, level }, '[GridTrading] Error placing grid order');
        }
      }

      logger.info({ symbol, ordersPlaced }, '[GridTrading] Grid orders placement complete');

    } catch (error) {
      logger.error({ err: error, symbol }, '[GridTrading] Error placing grid orders');
    }
  }

  /**
   * Manage all grids: check filled orders and place new ones
   */
  private async manageAllGrids(): Promise<void> {
    if (!this.isRunning) return;

    for (const symbol of this.configs.keys()) {
      // Get ML decision for this pair (every 5 minutes)
      try {
        const mlDecision = await gridMLAdapter.getMLDecision(symbol);
        if (mlDecision) {
          await this.applyMLDecision(symbol, mlDecision);
        }
      } catch (error) {
        logger.error({ err: error, symbol }, '[GridTrading] Error getting ML decision');
      }

      await this.manageGrid(symbol);
    }
  }

  /**
   * Manage grid for a specific pair: check filled orders and place new ones
   */
  private async manageGrid(symbol: string): Promise<void> {
    const gridLevels = this.grids.get(symbol);

    if (!gridLevels) return;

    try {
      // Check status of all orders
      for (const level of gridLevels) {
        if (!level.orderId || level.filled) continue;

        // Check if order is filled
        const orderStatus = await binanceService.getOrder(symbol, level.orderId);

        if (orderStatus && orderStatus.status === 'FILLED') {
          logger.info({ 
            symbol,
            side: level.side, 
            price: level.price, 
            orderId: level.orderId 
          }, '[GridTrading] Grid order filled!');

          level.filled = true;

          // Update database
          await this.updateGridOrderStatus(level.orderId, 'FILLED');

          // Record transaction for tax reporting
          await this.recordTransaction(symbol, level, orderStatus);

          // Place opposite order
          await this.placeOppositeOrder(symbol, level);
        }
      }

    } catch (error) {
      logger.error({ err: error, symbol }, '[GridTrading] Error managing grid');
    }
  }

  /**
   * Place opposite order after a grid order is filled
   */
  private async placeOppositeOrder(symbol: string, filledLevel: GridLevel): Promise<void> {
    const config = this.configs.get(symbol);
    if (!config) return;

    const { orderSize, gridLevels, lowerBound, upperBound } = config;
    const gridSpacing = (upperBound - lowerBound) / gridLevels;

    try {
      // Calculate opposite order price
      const oppositePrice = filledLevel.side === 'BUY' 
        ? filledLevel.price + gridSpacing 
        : filledLevel.price - gridSpacing;

      const oppositeSide = filledLevel.side === 'BUY' ? 'SELL' : 'BUY';

      // Calculate quantity
      const quantity = this.calculateQuantity(orderSize, oppositePrice, symbol);

      if (!quantity || quantity <= 0) {
        logger.warn({ symbol, oppositePrice }, '[GridTrading] Invalid quantity for opposite order');
        return;
      }

      // Place opposite order
      const order = await binanceService.placeOrder({
        symbol,
        side: oppositeSide,
        type: 'LIMIT',
        quantity,
        price: this.roundPrice(oppositePrice, symbol),
        timeInForce: 'GTC'
      });

      if (order && order.orderId) {
        logger.info({ 
          symbol,
          side: oppositeSide, 
          price: oppositePrice, 
          quantity,
          orderId: order.orderId 
        }, '[GridTrading] Opposite order placed');

        // Add to grid levels
        const gridLevels = this.grids.get(symbol);
        if (gridLevels) {
          gridLevels.push({
            price: this.roundPrice(oppositePrice, symbol),
            side: oppositeSide,
            orderId: order.orderId.toString(),
            filled: false,
            pairOrderId: filledLevel.orderId
          });
        }

        // Save to database
        await this.saveGridOrder(symbol, {
          price: this.roundPrice(oppositePrice, symbol),
          side: oppositeSide,
          orderId: order.orderId.toString(),
          filled: false,
          pairOrderId: filledLevel.orderId
        }, order.orderId.toString());
      }

    } catch (error) {
      logger.error({ err: error, symbol }, '[GridTrading] Error placing opposite order');
    }
  }

  /**
   * Cancel all grid orders for a specific pair
   */
  private async cancelGridOrders(symbol: string): Promise<void> {
    const gridLevels = this.grids.get(symbol);
    if (!gridLevels) return;

    try {
      for (const level of gridLevels) {
        if (level.orderId && !level.filled) {
          try {
            await binanceService.cancelOrder(symbol, level.orderId);
            logger.info({ symbol, orderId: level.orderId }, '[GridTrading] Grid order cancelled');
          } catch (error) {
            logger.error({ err: error, symbol, orderId: level.orderId }, '[GridTrading] Error cancelling order');
          }
        }
      }
    } catch (error) {
      logger.error({ err: error, symbol }, '[GridTrading] Error cancelling grid orders');
    }
  }

  /**
   * Get current price for a symbol
   */
  private async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      const ticker = await binanceService.getTickerPrice(symbol);
      return ticker ? parseFloat(ticker.price) : null;
    } catch (error) {
      logger.error({ err: error, symbol }, '[GridTrading] Error getting current price');
      return null;
    }
  }

  /**
   * Get available balance for grid trading (20% of total equity)
   */
  private async getAvailableBalance(): Promise<number> {
    try {
      const botState = await BotState.findOne();
      if (!botState) return 0;

      const totalEquity = botState.equity || 0;
      const gridAllocation = totalEquity * 0.20; // 20% of total equity

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
    const quantity = orderSize / price;
    
    // Round to appropriate decimal places based on symbol
    if (symbol.includes('BTC')) {
      return parseFloat(quantity.toFixed(5));
    } else if (symbol.includes('ETH')) {
      return parseFloat(quantity.toFixed(4));
    } else {
      return parseFloat(quantity.toFixed(3));
    }
  }

  /**
   * Round price to appropriate decimal places
   */
  private roundPrice(price: number, symbol: string): number {
    if (symbol.includes('BTC')) {
      return parseFloat(price.toFixed(2));
    } else if (symbol.includes('ETH')) {
      return parseFloat(price.toFixed(2));
    } else {
      return parseFloat(price.toFixed(2));
    }
  }

  /**
   * Save grid order to database
   */
  private async saveGridOrder(symbol: string, level: GridLevel, orderId: string): Promise<void> {
    try {
      await GridOrder.create({
        symbol,
        orderId,
        side: level.side,
        price: level.price,
        status: 'OPEN',
        pairOrderId: level.pairOrderId
      });
    } catch (error) {
      logger.error({ err: error, symbol, orderId }, '[GridTrading] Error saving grid order');
    }
  }

  /**
   * Record transaction for tax reporting
   */
  private async recordTransaction(symbol: string, level: GridLevel, orderStatus: any): Promise<void> {
    try {
      // Get user ID from bot state
      const botState = await BotState.findOne();
      if (!botState || !botState.userId) {
        logger.error('[GridTrading] Cannot record transaction: No user ID found');
        return;
      }

      // Extract order details
      const executedQty = parseFloat(orderStatus.executedQty || 0);
      const avgPrice = parseFloat(orderStatus.avgPrice || level.price);
      const commission = parseFloat(orderStatus.commission || 0);
      const total = executedQty * avgPrice;

      // Create transaction record
      await Transaction.create({
        userId: botState.userId,
        symbol,
        side: level.side,
        quantity: executedQty,
        price: avgPrice,
        total,
        fees: commission,
        type: 'GRID',
        orderId: level.orderId,
        timestamp: new Date(orderStatus.updateTime || Date.now())
      });

      logger.info({ 
        symbol, 
        side: level.side, 
        quantity: executedQty, 
        price: avgPrice,
        orderId: level.orderId 
      }, '[GridTrading] Transaction recorded');

    } catch (error) {
      logger.error({ err: error, symbol, orderId: level.orderId }, '[GridTrading] Error recording transaction');
    }
  }

  /**
   * Update grid order status in database
   */
  private async updateGridOrderStatus(orderId: string, status: string): Promise<void> {
    try {
      await GridOrder.updateOne({ orderId }, { status });
    } catch (error) {
      logger.error({ err: error, orderId }, '[GridTrading] Error updating grid order status');
    }
  }

  /**
   * Apply ML decision to grid configuration
   */
  private async applyMLDecision(symbol: string, decision: any): Promise<void> {
    try {
      const config = this.configs.get(symbol);
      if (!config) return;

      logger.info({ symbol, decision }, '[GridTrading] Applying ML decision');

      // Apply spacing multiplier (adjust grid bounds)
      if (decision.spacingMultiplier && decision.spacingMultiplier !== 1.0) {
        const range = config.upperBound - config.lowerBound;
        const newRange = range * decision.spacingMultiplier;
        const midPoint = (config.upperBound + config.lowerBound) / 2;
        config.lowerBound = midPoint - newRange / 2;
        config.upperBound = midPoint + newRange / 2;
        logger.info({ symbol, newLower: config.lowerBound, newUpper: config.upperBound }, 
          '[GridTrading] Adjusted grid bounds based on ML');
      }

      // Apply size multiplier
      if (decision.sizeMultiplier && decision.sizeMultiplier !== 1.0) {
        const newSize = config.orderSize * decision.sizeMultiplier;
        // Clamp between $50 and $500
        config.orderSize = Math.max(50, Math.min(500, newSize));
        logger.info({ symbol, newOrderSize: config.orderSize }, 
          '[GridTrading] Adjusted order size based on ML');
      }

      // Apply pair enable/disable
      if (decision.pairEnabled !== undefined && decision.pairEnabled !== config.enabled) {
        config.enabled = decision.pairEnabled;
        logger.info({ symbol, enabled: config.enabled }, 
          '[GridTrading] ML toggled pair enabled status');
        
        if (!config.enabled) {
          // Cancel all orders for this pair
          await this.cancelGridOrders(symbol);
        } else {
          // Reinitialize grid
          await this.initializeGrid(symbol, config);
        }
      }

      // Apply grid active/pause
      if (decision.gridActive !== undefined && !decision.gridActive) {
        logger.info({ symbol }, '[GridTrading] ML paused grid trading');
        await this.cancelGridOrders(symbol);
      }

      // Update config in map
      this.configs.set(symbol, config);

      // Optionally update database config (for persistence)
      // This would require updating BotConfig in MongoDB
    } catch (error) {
      logger.error({ err: error, symbol }, '[GridTrading] Error applying ML decision');
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  /**
   * Free up capital by selling underperforming assets
   * Only sells if loss is acceptable (< 10% by default)
   */
  private async freeUpCapitalForGrid(targetAsset: string, requiredQuantity: number): Promise<boolean> {
    try {
      const MAX_ACCEPTABLE_LOSS_PCT = 0.10; // 10% max loss
      
      logger.info({ targetAsset, requiredQuantity }, 
        '[GridTrading] Attempting to free up capital for grid SELL order');
      
      // Get all positions
      const positions = await Position.find({ status: 'OPEN' });
      
      if (positions.length === 0) {
        logger.warn('[GridTrading] No positions available to sell');
        return false;
      }
      
      // Calculate P&L for each position
      const positionsWithPnL = await Promise.all(
        positions.map(async (pos) => {
          try {
            const currentPrice = await this.getCurrentPrice(pos.symbol);
            if (!currentPrice) return null;
            
            const entryValue = pos.entry_price * pos.quantity;
            const currentValue = currentPrice * pos.quantity;
            const pnl = currentValue - entryValue;
            const pnlPct = pnl / entryValue;
            
            return {
              position: pos,
              currentPrice,
              pnl,
              pnlPct,
              currentValue
            };
          } catch (error) {
            return null;
          }
        })
      );
      
      // Filter out nulls and positions with significant losses
      const sellableCandidates = positionsWithPnL
        .filter(p => p !== null)
        .filter(p => {
          // Don't sell the target asset (we need to buy it for grid)
          const baseAsset = p!.position.symbol.replace('USD', '');
          if (baseAsset === targetAsset) return false;
          
          // Don't sell if loss is too significant
          if (p!.pnlPct < -MAX_ACCEPTABLE_LOSS_PCT) {
            logger.info({ 
              symbol: p!.position.symbol, 
              lossPct: (p!.pnlPct * 100).toFixed(2) 
            }, '[GridTrading] Skipping position - loss too significant');
            return false;
          }
          
          return true;
        })
        .sort((a, b) => a!.pnlPct - b!.pnlPct); // Sort by P&L (worst first)
      
      if (sellableCandidates.length === 0) {
        logger.warn('[GridTrading] No acceptable candidates to sell (all losses too significant)');
        return false;
      }
      
      // Try to sell the worst performer (but within acceptable loss range)
      const candidate = sellableCandidates[0]!;
      const position = candidate.position;
      
      logger.info({
        symbol: position.symbol,
        quantity: position.quantity,
        entryPrice: position.entry_price,
        currentPrice: candidate.currentPrice,
        pnl: candidate.pnl.toFixed(2),
        pnlPct: (candidate.pnlPct * 100).toFixed(2) + '%'
      }, '[GridTrading] Selling underperformer to free up capital');
      
      // Place market sell order
      try {
        const order = await binanceService.placeOrder({
          symbol: position.symbol,
          side: 'SELL',
          type: 'MARKET',
          quantity: position.quantity
        });
        
        if (order && order.orderId) {
          // Update position status
          position.status = 'CLOSED';
          position.exit_price = candidate.currentPrice;
          position.exit_date = new Date();
          position.realized_pnl = candidate.pnl;
          await position.save();
          
          logger.info({
            symbol: position.symbol,
            orderId: order.orderId,
            pnl: candidate.pnl.toFixed(2)
          }, '[GridTrading] Successfully sold underperformer');
          
          return true;
        }
      } catch (error) {
        logger.error({ err: error, symbol: position.symbol }, 
          '[GridTrading] Error selling underperformer');
        return false;
      }
      
      return false;
    } catch (error) {
      logger.error({ err: error }, '[GridTrading] Error in freeUpCapitalForGrid');
      return false;
    }
  }
}

export default new MultiPairGridTradingService();

