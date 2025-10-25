const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');

const MONGO_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

// Load from environment (will be set when running on VPS)
const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET;

async function syncBalance() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected\n');

    // Get Binance account balance
    console.log('💰 Fetching Binance.US account balance...');
    
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = crypto
      .createHmac('sha256', BINANCE_API_SECRET)
      .update(queryString)
      .digest('hex');

    const response = await axios.get('https://api.binance.us/api/v3/account', {
      headers: {
        'X-MBX-APIKEY': BINANCE_API_KEY
      },
      params: {
        timestamp,
        signature
      }
    });

    const balances = response.data.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
    
    console.log('\n📊 Account Balances:');
    let totalUSD = 0;
    for (const balance of balances) {
      const free = parseFloat(balance.free);
      const locked = parseFloat(balance.locked);
      const total = free + locked;
      console.log(`   ${balance.asset}: ${total.toFixed(8)} (Free: ${free.toFixed(8)}, Locked: ${locked.toFixed(8)})`);
      
      // For USD/USDT/USDC, count as $1
      if (['USD', 'USDT', 'USDC', 'BUSD'].includes(balance.asset)) {
        totalUSD += total;
      }
    }

    console.log(`\n💵 Total USD Value: $${totalUSD.toFixed(2)}\n`);

    // Update BotState
    const BotState = mongoose.model('BotState', new mongoose.Schema({
      userId: mongoose.Schema.Types.ObjectId,
      isActive: Boolean,
      equity: Number,
      currentR: Number,
      lastUpdated: Date
    }));

    const botState = await BotState.findOne({});
    
    if (!botState) {
      console.error('❌ Bot state not found!');
      process.exit(1);
    }

    const oldEquity = botState.equity;
    botState.equity = totalUSD;
    botState.currentR = totalUSD * 0.006; // 0.6% R
    botState.lastUpdated = new Date();
    await botState.save();

    console.log('═══════════════════════════════════════');
    console.log('✅ BALANCE SYNCED SUCCESSFULLY');
    console.log('═══════════════════════════════════════');
    console.log(`Old Equity: $${oldEquity.toFixed(2)}`);
    console.log(`New Equity: $${totalUSD.toFixed(2)}`);
    console.log(`New R: $${(totalUSD * 0.006).toFixed(2)}`);
    console.log('═══════════════════════════════════════\n');

    await mongoose.disconnect();
    console.log('✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
    console.error(error.stack);
    process.exit(1);
  }
}

syncBalance();

