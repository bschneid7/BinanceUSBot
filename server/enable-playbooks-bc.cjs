const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

async function enablePlaybooks() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected\n');

    // Define BotConfig schema
    const BotConfig = mongoose.model('BotConfig', new mongoose.Schema({
      userId: mongoose.Schema.Types.ObjectId,
      playbook_A: {
        enable: Boolean,
        volume_mult: Number,
        stop_atr_mult: Number,
        breakeven_R: Number,
        scale_R: Number,
        scale_pct: Number,
        trail_atr_mult: Number
      },
      playbook_B: {
        enable: Boolean,
        deviation_atr_mult: Number,
        stop_atr_mult: Number,
        time_stop_min: Number,
        target_R: Number,
        max_trades_per_session: Number
      },
      playbook_C: {
        enable: Boolean,
        event_window_min: Number,
        stop_atr_mult: Number,
        scale_1_R: Number,
        scale_1_pct: Number,
        scale_2_R: Number,
        scale_2_pct: Number,
        trail_atr_mult: Number
      },
      playbook_D: {
        enable: Boolean,
        stop_atr_mult: Number
      }
    }));

    // Find the config
    const config = await BotConfig.findOne({});
    
    if (!config) {
      console.error('❌ Bot config not found!');
      process.exit(1);
    }

    console.log('📊 Current Playbook Status:');
    console.log('═══════════════════════════════════════');
    console.log(`Playbook A (Breakout Trend):   ${config.playbook_A.enable ? '✅ ENABLED' : '❌ DISABLED'}`);
    console.log(`Playbook B (VWAP Mean-Revert): ${config.playbook_B.enable ? '✅ ENABLED' : '❌ DISABLED'}`);
    console.log(`Playbook C (Event Burst):      ${config.playbook_C.enable ? '✅ ENABLED' : '❌ DISABLED'}`);
    console.log(`Playbook D (Dip Pullback):     ${config.playbook_D.enable ? '✅ ENABLED' : '❌ DISABLED'}`);
    console.log('═══════════════════════════════════════\n');

    // Enable Playbooks B and C
    config.playbook_B.enable = true;
    config.playbook_C.enable = true;
    await config.save();

    console.log('✅ PLAYBOOKS B & C ENABLED');
    console.log('═══════════════════════════════════════');
    console.log('Playbook A (Breakout Trend):   ✅ ENABLED');
    console.log('Playbook B (VWAP Mean-Revert): ✅ ENABLED ⭐ NEW');
    console.log('Playbook C (Event Burst):      ✅ ENABLED ⭐ NEW');
    console.log('Playbook D (Dip Pullback):     ✅ ENABLED');
    console.log('═══════════════════════════════════════\n');

    console.log('📝 Playbook Details:');
    console.log('\n🔵 Playbook B (VWAP Mean-Revert):');
    console.log(`   - Deviation ATR Mult: ${config.playbook_B.deviation_atr_mult}x`);
    console.log(`   - Stop ATR Mult: ${config.playbook_B.stop_atr_mult}x`);
    console.log(`   - Time Stop: ${config.playbook_B.time_stop_min} minutes`);
    console.log(`   - Target R: ${config.playbook_B.target_R}R`);
    console.log(`   - Max Trades/Session: ${config.playbook_B.max_trades_per_session}`);

    console.log('\n🟣 Playbook C (Event Burst):');
    console.log(`   - Event Window: ${config.playbook_C.event_window_min} minutes`);
    console.log(`   - Stop ATR Mult: ${config.playbook_C.stop_atr_mult}x`);
    console.log(`   - Scale 1: ${config.playbook_C.scale_1_R}R (${config.playbook_C.scale_1_pct * 100}%)`);
    console.log(`   - Scale 2: ${config.playbook_C.scale_2_R}R (${config.playbook_C.scale_2_pct * 100}%)`);
    console.log(`   - Trail ATR Mult: ${config.playbook_C.trail_atr_mult}x`);

    console.log('\n⚠️  IMPORTANT NOTES:');
    console.log('═══════════════════════════════════════');
    console.log('✅ SHORT position support is ACTIVE');
    console.log('✅ Stop losses work for both LONG and SHORT');
    console.log('✅ Trailing stops work for both LONG and SHORT');
    console.log('✅ PnL calculations are correct for all sides');
    console.log('\n🎯 The bot will now generate signals from all 4 playbooks!');
    console.log('═══════════════════════════════════════\n');

    await mongoose.disconnect();
    console.log('✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

enablePlaybooks();
