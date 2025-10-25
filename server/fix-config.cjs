const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

// Valid Binance.US trading pairs (verified as of Oct 2025)
const BINANCE_US_SYMBOLS = [
  'BTCUSD',
  'ETHUSD',
  'BNBUSD',
  'SOLUSD',
  'XRPUSD',
  'ADAUSD',
  'AVAXUSD',
  'LINKUSD',
  'DOTUSD',
  'DOGEUSD',
  'LTCUSD',
  'BCHUSD',
  'UNIUSD',
  'ATOMUSD',
  'ALGOUSD',
  'VETUSD',
  'XLMUSD',
  'FILUSD',
  'TRXUSD',
  'ETCUSD'
];

async function fixConfig() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully\n');

    const db = mongoose.connection.db;
    const configs = db.collection('botconfigs');
    
    // Get current config
    const config = await configs.findOne({});
    if (!config) {
      console.log('❌ No configuration found');
      return;
    }

    console.log('📋 Current configuration:');
    console.log(`  Pairs: ${config.scanner?.pairs?.length || 0}`);
    console.log(`  Symbols: ${config.scanner?.symbols?.length || 0}`);
    console.log(`  Playbook A: ${config.playbook_A?.enable ? 'Enabled' : 'Disabled'}`);
    console.log(`  Playbook B: ${config.playbook_B?.enable ? 'Enabled' : 'Disabled'}`);
    console.log(`  Playbook C: ${config.playbook_C?.enable ? 'Enabled' : 'Disabled'}`);
    console.log(`  Playbook D: ${config.playbook_D?.enable ? 'Enabled' : 'Disabled'}`);

    // Prepare update
    const update = {
      $set: {
        'scanner.symbols': BINANCE_US_SYMBOLS,
        'scanner.pairs': BINANCE_US_SYMBOLS, // Keep both for compatibility
        
        // Ensure playbooks are properly configured
        'playbooks.A': {
          enabled: true,
          name: 'Breakout',
          description: 'Volume breakout with trailing stops',
          ...config.playbook_A
        },
        'playbooks.B': {
          enabled: true,
          name: 'VWAP Mean-Revert',
          description: 'Mean reversion from VWAP',
          ...config.playbook_B
        },
        'playbooks.C': {
          enabled: true,
          name: 'Event Burst',
          description: 'Event-driven momentum',
          ...config.playbook_C
        },
        'playbooks.D': {
          enabled: true,
          name: 'Dip Pullback',
          description: 'Buy dips with tight stops',
          ...config.playbook_D
        },
        
        updatedAt: new Date()
      }
    };

    // Apply update
    console.log('\n🔧 Applying configuration fixes...');
    const result = await configs.updateOne({ _id: config._id }, update);
    
    if (result.modifiedCount > 0) {
      console.log('✅ Configuration updated successfully!');
      
      // Verify update
      const updated = await configs.findOne({ _id: config._id });
      console.log('\n📊 Updated configuration:');
      console.log(`  Symbols: ${updated.scanner?.symbols?.length || 0}`);
      console.log(`  Symbols list: ${updated.scanner?.symbols?.slice(0, 5).join(', ')}...`);
      console.log(`  Playbooks: ${Object.keys(updated.playbooks || {}).length}`);
      
      console.log('\n✅ Configuration is now ready for signal generation!');
      console.log('   Restart the bot service to apply changes.');
    } else {
      console.log('⚠️  No changes were made (configuration may already be correct)');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

fixConfig();

