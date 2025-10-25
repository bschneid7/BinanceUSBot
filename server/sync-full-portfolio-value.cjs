const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');

const MONGO_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET;

function createSignature(queryString) {
  return crypto
    .createHmac('sha256', BINANCE_API_SECRET)
    .update(queryString)
    .digest('hex');
}

async function getBinanceAccountBalances() {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = createSignature(queryString);

  const response = await axios.get('https://api.binance.us/api/v3/account', {
    headers: { 'X-MBX-APIKEY': BINANCE_API_KEY },
    params: { timestamp, signature }
  });

  return response.data.balances.filter(b => 
    parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
  );
}

async function getPrice(symbol) {
  try {
    const response = await axios.get(`https://api.binance.us/api/v3/ticker/price?symbol=${symbol}`);
    return parseFloat(response.data.price);
  } catch (error) {
    return null;
  }
}

async function syncFullPortfolioValue() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected\n');

    console.log('💰 Fetching Binance.US account balances...');
    const balances = await getBinanceAccountBalances();

    console.log('\n📊 Portfolio Holdings:');
    console.log('═══════════════════════════════════════\n');

    let totalUSD = 0;
    const holdings = [];

    for (const balance of balances) {
      const free = parseFloat(balance.free);
      const locked = parseFloat(balance.locked);
      const total = free + locked;

      let usdValue = 0;

      // USD is already in USD
      if (balance.asset === 'USD') {
        usdValue = total;
        console.log(`💵 ${balance.asset}: ${total.toFixed(2)} = $${usdValue.toFixed(2)}`);
      } 
      // Stablecoins count as $1
      else if (['USDT', 'USDC', 'BUSD'].includes(balance.asset)) {
        usdValue = total;
        console.log(`💵 ${balance.asset}: ${total.toFixed(2)} = $${usdValue.toFixed(2)}`);
      }
      // Get market price for crypto
      else {
        // Try ASSET/USD pair first (Binance.US uses USD, not USDT)
        let price = await getPrice(`${balance.asset}USD`);
        
        // If no USD pair, try USDT pair as fallback
        if (!price) {
          price = await getPrice(`${balance.asset}USDT`);
        }

        if (price) {
          usdValue = total * price;
          console.log(`🪙 ${balance.asset}: ${total.toFixed(8)} × $${price.toFixed(2)} = $${usdValue.toFixed(2)}`);
        } else {
          console.log(`⚠️  ${balance.asset}: ${total.toFixed(8)} × $?.?? = $0.00 (no price data)`);
        }
      }

      totalUSD += usdValue;
      holdings.push({
        asset: balance.asset,
        amount: total,
        usdValue: usdValue
      });
    }

    console.log('\n═══════════════════════════════════════');
    console.log(`💰 TOTAL PORTFOLIO VALUE: $${totalUSD.toFixed(2)}`);
    console.log('═══════════════════════════════════════\n');

    // Update BotState with proper rounding
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
    
    // Round to 2 decimal places consistently
    const newEquity = Math.round(totalUSD * 100) / 100;
    const newR = Math.round(newEquity * 0.006 * 100) / 100; // 0.6% R, rounded to 2 decimals
    
    botState.equity = newEquity;
    botState.currentR = newR;
    botState.lastUpdated = new Date();
    await botState.save();

    console.log('✅ BOT STATE UPDATED');
    console.log('═══════════════════════════════════════');
    console.log(`Old Equity: $${oldEquity.toFixed(2)}`);
    console.log(`New Equity: $${newEquity.toFixed(2)}`);
    console.log(`New R (0.6%): $${newR.toFixed(2)}`);
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

syncFullPortfolioValue();

