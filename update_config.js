// Update BotConfig to match user requirements
// Run with: node update_config.js

const mongoose = require('mongoose');

async function updateConfig() {
  try {
    await mongoose.connect('mongodb://localhost:27017/binance_bot');
    console.log('Connected to MongoDB');

    const BotConfig = mongoose.connection.collection('botconfigs');
    
    // Update configuration
    const result = await BotConfig.updateOne(
      {}, // Update first config found
      {
        $set: {
          'risk.max_positions': 18,
          'risk.max_exposure_pct': 0.90,
          'scanner.pairs': [], // Will be populated dynamically
          'reserve.target_pct': 0.30,
          'reserve.floor_pct': 0.20,
        }
      }
    );

    console.log('✅ Configuration updated:', result);
    
    // Verify update
    const config = await BotConfig.findOne({});
    console.log('\n📊 Current configuration:');
    console.log('  Max positions:', config.risk.max_positions);
    console.log('  Max exposure:', (config.risk.max_exposure_pct * 100) + '%');
    console.log('  Trading pairs:', config.scanner.pairs.length, 'pairs');
    console.log('  Reserve target:', (config.reserve.target_pct * 100) + '%');
    
    await mongoose.disconnect();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateConfig();
