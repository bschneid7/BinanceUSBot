import express from 'express';
import Position from '../models/Position';
import eventStore from '../services/eventStore';
import logger from '../utils/logger';

const router = express.Router();

/**
 * Manually create positions from known balances
 */
router.post('/create-from-balances', async (req, res) => {
  try {
    const userId = req.body.userId || '507f1f77bcf86cd799439011';
    
    // Known balances from API check
    const positions = [
      { asset: 'BTC', quantity: 0.08289169, price: 90850, symbol: 'BTCUSD' },
      { asset: 'SOL', quantity: 7.3662645, price: 139.30, symbol: 'SOLUSD' },
      { asset: 'ETH', quantity: 0.03312062, price: 3002, symbol: 'ETHUSD' },
      { asset: 'APE', quantity: 19.40265252, price: 2.27, symbol: 'APEUSD' },
      { asset: 'ZEC', quantity: 1.2444, price: 30.50, symbol: 'ZECUSD' }
    ];
    
    const created = [];
    let totalValue = 0;
    
    for (const pos of positions) {
      const notionalValue = pos.quantity * pos.price;
      
      const position = new Position({
        userId,
        symbol: pos.symbol,
        side: 'LONG',
        playbook: 'MANUAL',
        entry_price: pos.price,
        quantity: pos.quantity,
        notional_value: notionalValue,
        stop_price: pos.price * 0.95,
        target_price: pos.price * 1.10,
        status: 'OPEN',
        entry_time: new Date(),
        unrealized_pnl: 0,
        notes: 'Imported from existing holdings'
      });
      
      await position.save();
      
      // Record event
      await eventStore.recordEvent({
        type: 'PositionImported',
        aggregateType: 'Position',
        aggregateId: position._id.toString(),
        data: {
          symbol: pos.symbol,
          quantity: pos.quantity,
          entry_price: pos.price,
          notionalValue: notionalValue
        }
      });
      
      logger.info(
        `[ManualPositionCreate] ✅ Created ${pos.asset}: ${pos.quantity.toFixed(6)} @ $${pos.price.toFixed(2)} ` +
        `(notional: $${notionalValue.toFixed(2)})`
      );
      
      created.push({
        asset: pos.asset,
        quantity: pos.quantity,
        price: pos.price,
        value: notionalValue
      });
      
      totalValue += notionalValue;
    }
    
    logger.info(`[ManualPositionCreate] ✅ Created ${created.length} positions, total value: $${totalValue.toFixed(2)}`);
    
    res.json({
      success: true,
      created: created.length,
      totalValue: totalValue,
      positions: created
    });
    
  } catch (error: any) {
    logger.error('[ManualPositionCreate] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
