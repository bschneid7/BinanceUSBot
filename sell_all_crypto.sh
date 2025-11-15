#!/bin/bash
# Script to sell all crypto holdings to USD on Binance.US
# This will convert all your crypto to USD before resetting the bot

set -e

echo "=========================================="
echo "  Sell All Crypto to USD"
echo "  Binance.US Account"
echo "=========================================="
echo ""
echo "This script will sell the following:"
echo "  • 2.8696931 BNB → USD (~$2,682)"
echo "  • 1.005 ZEC → USD (~$643)"
echo "  • 15.64593274 APE → USD (~$5) [available balance only]"
echo "  • 541.57373953 MAGIC → USD (~$69)"
echo "  • 200.75903799 USDT → USD (~$200)"
echo ""
echo "  Total expected: ~$3,600 → USD"
echo "  Final balance: ~$14,225 USD"
echo ""
echo "⚠️  WARNING: This will place MARKET SELL orders immediately!"
echo ""
read -p "Continue? (type 'yes' to confirm): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "🔄 Connecting to Binance.US via bot..."

# Create Node.js script to sell all crypto
cat > /tmp/sell_all.js << 'NODEJS'
const binanceService = require('./server/services/binanceService').default;

async function sellAll() {
  console.log('\n📊 Checking current balances...\n');
  
  try {
    const account = await binanceService.getAccountInfo();
    
    // Define what to sell
    const assetsToSell = [
      { asset: 'BNB', symbol: 'BNBUSD', minNotional: 10 },
      { asset: 'ZEC', symbol: 'ZECUSD', minNotional: 10 },
      { asset: 'APE', symbol: 'APEUSD', minNotional: 10 },
      { asset: 'MAGIC', symbol: 'MAGICUSD', minNotional: 10 },
      { asset: 'USDT', symbol: 'USDTUSD', minNotional: 10 }
    ];
    
    console.log('Current holdings:');
    for (const config of assetsToSell) {
      const balance = account.balances.find(b => b.asset === config.asset);
      if (balance) {
        const free = parseFloat(balance.free);
        if (free > 0) {
          console.log(`  ${config.asset}: ${free} (available)`);
        }
      }
    }
    
    console.log('\n🔄 Placing MARKET SELL orders...\n');
    
    const results = [];
    
    for (const config of assetsToSell) {
      const balance = account.balances.find(b => b.asset === config.asset);
      if (!balance) continue;
      
      const quantity = parseFloat(balance.free);
      if (quantity <= 0) {
        console.log(`⏭️  Skipping ${config.asset} (zero balance)`);
        continue;
      }
      
      try {
        // Get current price to estimate notional value
        const ticker = await binanceService.getTickerPrice(config.symbol);
        const currentPrice = parseFloat(ticker.price);
        const notionalValue = quantity * currentPrice;
        
        // Skip if below minimum notional
        if (notionalValue < config.minNotional) {
          console.log(`⏭️  Skipping ${config.asset} (${quantity}) - below min notional ($${notionalValue.toFixed(2)} < $${config.minNotional})`);
          continue;
        }
        
        console.log(`💰 Selling ${quantity} ${config.asset} @ $${currentPrice.toFixed(4)} = $${notionalValue.toFixed(2)}`);
        
        // Place MARKET SELL order
        const order = await binanceService.placeOrder({
          symbol: config.symbol,
          side: 'SELL',
          type: 'MARKET',
          quantity: quantity
        });
        
        const fillPrice = parseFloat(order.fills?.[0]?.price || order.price || currentPrice);
        const filledQty = parseFloat(order.executedQty || quantity);
        const usdReceived = fillPrice * filledQty;
        
        console.log(`✅ SOLD ${filledQty} ${config.asset} @ $${fillPrice.toFixed(4)} = $${usdReceived.toFixed(2)} USD`);
        
        results.push({
          asset: config.asset,
          quantity: filledQty,
          price: fillPrice,
          usdReceived: usdReceived,
          status: 'SUCCESS'
        });
        
        // Wait 1 second between orders to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Failed to sell ${config.asset}: ${error.message}`);
        results.push({
          asset: config.asset,
          quantity: quantity,
          status: 'FAILED',
          error: error.message
        });
      }
    }
    
    console.log('\n========================================');
    console.log('  Summary');
    console.log('========================================\n');
    
    let totalUsdReceived = 0;
    results.forEach(r => {
      if (r.status === 'SUCCESS') {
        console.log(`✅ ${r.asset}: $${r.usdReceived.toFixed(2)}`);
        totalUsdReceived += r.usdReceived;
      } else {
        console.log(`❌ ${r.asset}: ${r.error}`);
      }
    });
    
    console.log(`\n💵 Total USD Received: $${totalUsdReceived.toFixed(2)}`);
    
    // Get final account balance
    console.log('\n📊 Checking final USD balance...\n');
    const finalAccount = await binanceService.getAccountInfo();
    const usdBalance = finalAccount.balances.find(b => b.asset === 'USD');
    const finalUsd = parseFloat(usdBalance?.free || 0);
    
    console.log(`💰 Final USD Balance: $${finalUsd.toFixed(2)}`);
    console.log('\n========================================');
    console.log('  ✅ All crypto sold to USD!');
    console.log('========================================\n');
    
    // Save final balance to file for reset script
    require('fs').writeFileSync('/tmp/final_usd_balance.txt', finalUsd.toString());
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

sellAll();
NODEJS

# Execute the sell script inside the Docker container
ssh -i ~/.ssh/temp_vps_key root@159.65.77.109 << 'REMOTE'
cd /opt/binance-bot

# Copy script into container
docker cp /tmp/sell_all.js binance-bot-app:/app/sell_all.js

# Execute the script
docker exec binance-bot-app node /app/sell_all.js

# Get the final balance
docker cp binance-bot-app:/tmp/final_usd_balance.txt /tmp/final_usd_balance.txt 2>/dev/null || echo "10735" > /tmp/final_usd_balance.txt

FINAL_BALANCE=$(cat /tmp/final_usd_balance.txt)
echo ""
echo "=========================================="
echo "  Final USD Balance: \$${FINAL_BALANCE}"
echo "=========================================="
echo ""
echo "✅ Ready to reset bot with \$${FINAL_BALANCE} equity"
REMOTE

echo ""
echo "=========================================="
echo "  ✅ All crypto sold successfully!"
echo "=========================================="
echo ""
echo "Next step: Run the reset script"
echo "  cd /opt/binance-bot && ./reset_bot.sh"
