const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

async function adjustQualityGates() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully\n');

    const db = mongoose.connection.db;
    const configs = db.collection('botconfigs');
    
    const config = await configs.findOne({});
    if (!config) {
      console.log('❌ No configuration found');
      return;
    }

    console.log('📋 Current quality gates:');
    console.log(`  Min Volume (24h): $${config.scanner.min_volume_usd_24h?.toLocaleString() || 'N/A'}`);
    console.log(`  Max Spread: ${config.scanner.max_spread_bps} bps`);
    console.log(`  Min TOB Depth: $${config.scanner.tob_min_depth_usd?.toLocaleString() || 'N/A'}`);

    // Adjust for Binance.US lower liquidity
    // Based on the scan results, even BTC only has $1.3M volume
    const update = {
      $set: {
        'scanner.min_volume_usd_24h': 50000,        // Reduced from 4M to 50k
        'scanner.max_spread_bps': 100,              // Increased from 12 to 100 bps (1%)
        'scanner.max_spread_bps_event': 200,        // Increased from 30 to 200 bps (2%)
        'scanner.tob_min_depth_usd': 50,            // Reduced from 40k to $50
        updatedAt: new Date()
      }
    };

    console.log('\n🔧 Applying adjusted quality gates for Binance.US...');
    const result = await configs.updateOne({ _id: config._id }, update);
    
    if (result.modifiedCount > 0) {
      console.log('✅ Quality gates updated successfully!');
      
      const updated = await configs.findOne({ _id: config._id });
      console.log('\n📊 New quality gates:');
      console.log(`  Min Volume (24h): $${updated.scanner.min_volume_usd_24h.toLocaleString()}`);
      console.log(`  Max Spread: ${updated.scanner.max_spread_bps} bps`);
      console.log(`  Max Spread (Event): ${updated.scanner.max_spread_bps_event} bps`);
      console.log(`  Min TOB Depth: $${updated.scanner.tob_min_depth_usd.toLocaleString()}`);
      
      console.log('\n✅ Configuration ready for Binance.US trading!');
      console.log('   Restart the bot to apply changes.');
    } else {
      console.log('⚠️  No changes were made');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

adjustQualityGates();

