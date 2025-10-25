import mongoose from 'mongoose';
import BotConfig from './models/BotConfig';
import dotenv from 'dotenv';

dotenv.config();

async function enableAggressivePlaybooks() {
  try {
    // Connect using bot's connection string
    const mongoUri = process.env.MONGODB_URI || 'mongodb://mongo:27017/trading_bot';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    
    const config = await BotConfig.findOne();
    if (!config) {
      console.log('No config found');
      process.exit(1);
    }
    
    // Enable all playbooks with aggressive settings
    config.playbook_A = {
      enable: true,
      min_volume: 50000,
      min_breakout_strength: 1.5,
      position_size_pct: 0.08
    };
    
    config.playbook_B = {
      enable: true,
      min_volume: 50000,
      min_deviation_pct: 1.5,
      position_size_pct: 0.08
    };
    
    config.playbook_C = {
      enable: true,
      min_volume: 100000,
      min_event_strength: 2.0,
      position_size_pct: 0.10
    };
    
    config.playbook_D = {
      enable: true,
      min_volume: 50000,
      min_dip_pct: 2.0,
      position_size_pct: 0.08
    };
    
    // Aggressive risk settings
    config.max_open_positions = 10;
    config.max_daily_risk_R = 3.0;
    config.max_weekly_risk_R = 10.0;
    config.max_total_open_risk_R = 3.0;
    config.reserve_target_pct = 0.25;
    
    await config.save();
    
    console.log('✅ All 4 playbooks enabled with AGGRESSIVE settings');
    console.log('- Playbook A (Breakout): ENABLED - 8% position size');
    console.log('- Playbook B (Mean Reversion): ENABLED - 8% position size');
    console.log('- Playbook C (Event Burst): ENABLED - 10% position size');
    console.log('- Playbook D (Dip Pullback): ENABLED - 8% position size');
    console.log('- Max Open Positions: 10');
    console.log('- Daily Risk Limit: 3.0R');
    console.log('- Reserve Target: 25% (75% deployable)');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

enableAggressivePlaybooks();

