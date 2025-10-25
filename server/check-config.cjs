const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

async function checkConfig() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully\n');

    const db = mongoose.connection.db;
    
    // Get bot config
    const config = await db.collection('botconfigs').findOne({});
    if (!config) {
      console.log('❌ No bot configuration found');
      return;
    }

    console.log('📋 Bot Configuration:');
    console.log(`  Bot Status: ${config.botStatus}`);
    console.log(`  Scan Interval: ${config.scanner?.refresh_ms}ms`);
    console.log(`  Symbols to scan: ${config.scanner?.symbols?.length || 0}`);
    
    if (config.scanner?.symbols) {
      console.log('\n📊 Configured symbols:');
      console.log(`  ${config.scanner.symbols.join(', ')}`);
    }

    // Get bot state
    const state = await db.collection('botstates').findOne({});
    if (state) {
      console.log('\n💰 Bot State:');
      console.log(`  Running: ${state.isRunning}`);
      console.log(`  Equity: $${state.equity?.toFixed(2) || 'N/A'}`);
      console.log(`  Current R: $${state.currentR?.toFixed(2) || 'N/A'}`);
      console.log(`  Daily PnL: $${state.dailyPnl?.toFixed(2) || 'N/A'}`);
    }

    // Get open positions
    const positions = await db.collection('positions').find({ status: 'OPEN' }).toArray();
    console.log(`\n📈 Open Positions: ${positions.length}`);
    if (positions.length > 0) {
      for (const pos of positions) {
        console.log(`  - ${pos.symbol}: ${pos.quantity} @ $${pos.entryPrice} (${pos.playbook})`);
      }
    }

    // Check playbook configuration
    console.log('\n📚 Playbook Configuration:');
    const playbooks = config.playbooks || {};
    for (const [name, pb] of Object.entries(playbooks)) {
      console.log(`  ${name}: ${pb.enabled ? '✅ Enabled' : '❌ Disabled'} - ${pb.description || 'No description'}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

checkConfig();

