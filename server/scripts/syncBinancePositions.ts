// Load environment variables FIRST, before any imports
import dotenv from 'dotenv';
dotenv.config({ path: '/opt/binance-bot/.env.production' });

// Now import everything else
import { connectDB } from '../config/database';
import binanceService from '../services/binanceService';
import Position from '../models/Position';
import mongoose from 'mongoose';

async function syncPositions(userId: string) {
  try {
    await connectDB();
    
    console.log('\n=== Fetching Binance.US Account Info ===\n');
    
    const accountInfo = await binanceService.getAccountInfo();
    
    // Filter non-zero balances
    const nonZeroBalances = accountInfo.balances.filter(
      b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
    );
    
    console.log('Your Current Binance.US Balances:');
    console.log('=================================');
    nonZeroBalances.forEach(balance => {
      const total = parseFloat(balance.free) + parseFloat(balance.locked);
      console.log(`${balance.asset}: ${total} (Free: ${balance.free}, Locked: ${balance.locked})`);
    });
    
    console.log(`\nTotal assets with balance: ${nonZeroBalances.length}`);
    
    // Filter out stablecoins and base currencies (USD is the base currency for Binance.US)
    const cryptoBalances = nonZeroBalances.filter(
      b => !['USD', 'USDT', 'USDC', 'BUSD', 'DAI'].includes(b.asset)
    );
    
    if (cryptoBalances.length === 0) {
      console.log('\n⚠️  No crypto positions found (only USD/stablecoins detected)');
      console.log('The Positions page will remain empty until you have open crypto positions.');
      process.exit(0);
    }
    
    console.log(`\n\n=== Creating Positions for ${cryptoBalances.length} Crypto Assets ===\n`);
    
    // Get current prices for each crypto (using USD pairs for Binance.US)
    for (const balance of cryptoBalances) {
      // Binance.US uses USD as quote currency, not USDT
      const symbol = `${balance.asset}USD`;
      const quantity = parseFloat(balance.free) + parseFloat(balance.locked);
      
      try {
        // Get current price
        const ticker = await binanceService.getTicker(symbol);
        const currentPrice = parseFloat(ticker.lastPrice);
        
        // Check if position already exists
        const existingPosition = await Position.findOne({
          userId: new mongoose.Types.ObjectId(userId),
          symbol: symbol,
          status: 'OPEN'
        });
        
        if (existingPosition) {
          console.log(`✓ Position already exists for ${symbol}`);
          continue;
        }
        
        // Create position
        const position = await Position.create({
          userId: new mongoose.Types.ObjectId(userId),
          symbol: symbol,
          side: 'LONG',
          entry_price: currentPrice,
          quantity: quantity,
          current_price: currentPrice,
          stop_price: currentPrice * 0.95,
          target_price: currentPrice * 1.15,
          status: 'OPEN',
          playbook: 'A',
          unrealized_pnl: 0,
          unrealized_r: 0
        });
        
        console.log(`✓ Created position: ${symbol} - Qty: ${quantity} @ $${currentPrice.toFixed(2)}`);
        
      } catch (error: any) {
        console.log(`✗ Skipped ${symbol}: ${error.message}`);
      }
    }
    
    console.log('\n✅ Sync complete! Check the Positions page in your dashboard.\n');
    process.exit(0);
    
  } catch (error) {
    console.error('Error syncing positions:', error);
    process.exit(1);
  }
}

// Get user ID from command line or use default
const userId = process.argv[2] || '68f44e83d8f6d83fb4db687a';
syncPositions(userId);
