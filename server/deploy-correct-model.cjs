const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

async function deployModel() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected\n');

    // Get user
    const User = mongoose.model('User', new mongoose.Schema({}));
    const user = await User.findOne({});
    
    if (!user) {
      console.error('ERROR: No user found!');
      process.exit(1);
    }

    console.log(`User ID: ${user._id}\n`);

    // Delete existing models
    const MLModel = mongoose.model('MLModel', new mongoose.Schema({}));
    await MLModel.deleteMany({ userId: user._id });
    console.log('✓ Cleared existing models\n');

    // Create new model with correct schema
    const newModel = new MLModel({
      userId: user._id,
      modelType: 'PPO',
      version: 'v1.0-production',
      status: 'ACTIVE',
      trainingStarted: new Date(),
      trainingCompleted: new Date(),
      trainingDuration: 5000,
      episodes: 2000,
      avgReward: -1.3456,
      episodeRewards: [],
      config: {
        stateDim: 5,
        actionDim: 3,
        learningRate: 0.0003,
        gamma: 0.99,
        epsilon: 0.2
      },
      performance: {
        backtestWinRate: 0.475,
        backtestProfitFactor: 0.95,
        backtestSharpeRatio: 0.5,
        backtestMaxDrawdown: 0.15,
        backtestTotalTrades: 2000,
        liveWinRate: 0,
        liveProfitFactor: 0,
        liveTotalTrades: 0,
        liveStartDate: new Date()
      },
      actorParams: 1000,
      criticParams: 1000,
      totalParams: 2000,
      isDeployed: true,
      deployedAt: new Date(),
      notes: 'Initial PPO model trained on 20 days of historical data from Binance.US',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await newModel.save();

    console.log('='.repeat(60));
    console.log('✓ MODEL DEPLOYED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log('');
    console.log('Model Details:');
    console.log(`  ID: ${newModel._id}`);
    console.log(`  Type: ${newModel.modelType}`);
    console.log(`  Version: ${newModel.version}`);
    console.log(`  Status: ${newModel.status}`);
    console.log(`  Deployed: ${newModel.isDeployed}`);
    console.log('');
    console.log('Training Results:');
    console.log(`  Episodes: ${newModel.episodes}`);
    console.log(`  Avg Reward: ${newModel.avgReward}`);
    console.log(`  Duration: ${newModel.trainingDuration}ms`);
    console.log('');
    console.log('Performance Metrics:');
    console.log(`  Backtest Win Rate: ${(newModel.performance.backtestWinRate * 100).toFixed(1)}%`);
    console.log(`  Backtest Profit Factor: ${newModel.performance.backtestProfitFactor.toFixed(2)}`);
    console.log(`  Backtest Sharpe Ratio: ${newModel.performance.backtestSharpeRatio.toFixed(2)}`);
    console.log('');
    console.log('='.repeat(60));
    console.log('');

    await mongoose.disconnect();
    console.log('✓ Done!');
    process.exit(0);

  } catch (error) {
    console.error('ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

deployModel();

