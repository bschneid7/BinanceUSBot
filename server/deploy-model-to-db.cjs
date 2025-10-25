const mongoose = require('mongoose');
const fs = require('fs');

const MONGO_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

// Load the trained model
const modelData = JSON.parse(fs.readFileSync('/tmp/ppo-model.json', 'utf8'));

console.log('='.repeat(60));
console.log('DEPLOYING ML MODEL TO DATABASE');
console.log('='.repeat(60));
console.log('');

// Define MLModel schema (matching the server schema)
const MLModelSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  modelType: {
    type: String,
    required: true,
    enum: ['PPO', 'DQN', 'A2C']
  },
  version: {
    type: String,
    required: true
  },
  config: {
    stateDim: Number,
    actionDim: Number,
    learningRate: Number,
    gamma: Number,
    epsilon: Number,
    episodes: Number,
    batchSize: Number
  },
  trainingResults: {
    episodes: Number,
    avgReward: Number,
    bestReward: Number,
    worstReward: Number,
    duration: Number,
    episodeRewards: [Number]
  },
  backtestResults: {
    winRate: Number,
    profitFactor: Number,
    sharpeRatio: Number,
    totalTrades: Number
  },
  livePerformance: {
    totalTrades: Number,
    winRate: Number,
    profitFactor: Number,
    avgReward: Number,
    lastUpdated: Date
  },
  status: {
    type: String,
    enum: ['TRAINING', 'TRAINED', 'DEPLOYED', 'ARCHIVED'],
    default: 'TRAINED'
  },
  isDeployed: {
    type: Boolean,
    default: false
  },
  deployedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

async function deployModel() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected\n');

    const MLModel = mongoose.model('MLModel', MLModelSchema);

    // Get the user ID (first user in the database)
    const User = mongoose.model('User', new mongoose.Schema({}));
    const user = await User.findOne({});
    
    if (!user) {
      console.error('ERROR: No user found in database!');
      process.exit(1);
    }

    console.log(`User ID: ${user._id}`);
    console.log('');

    // Check if there are any existing models
    const existingModels = await MLModel.find({ userId: user._id });
    console.log(`Existing models: ${existingModels.length}`);
    
    if (existingModels.length > 0) {
      console.log('Undeploying existing models...');
      await MLModel.updateMany(
        { userId: user._id, isDeployed: true },
        { isDeployed: false, status: 'ARCHIVED' }
      );
      console.log('✓ Existing models archived\n');
    }

    // Calculate backtest metrics
    const winRate = modelData.trainingResults.episodeRewards.filter(r => r > 0).length / 
                    modelData.trainingResults.episodeRewards.length;
    
    const winners = modelData.trainingResults.episodeRewards.filter(r => r > 0);
    const losers = modelData.trainingResults.episodeRewards.filter(r => r < 0);
    const profitFactor = Math.abs(
      winners.reduce((a, b) => a + b, 0) / losers.reduce((a, b) => a + b, 0)
    );

    // Create new model record
    const newModel = new MLModel({
      userId: user._id,
      modelType: modelData.modelType,
      version: modelData.version,
      config: modelData.config,
      trainingResults: modelData.trainingResults,
      backtestResults: {
        winRate: winRate,
        profitFactor: profitFactor,
        sharpeRatio: 0.5, // Placeholder
        totalTrades: modelData.trainingResults.episodes
      },
      livePerformance: {
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        avgReward: 0,
        lastUpdated: new Date()
      },
      status: 'DEPLOYED',
      isDeployed: true,
      deployedAt: new Date(),
      createdAt: new Date(modelData.createdAt),
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
    console.log(`  Episodes: ${newModel.trainingResults.episodes}`);
    console.log(`  Avg Reward: ${newModel.trainingResults.avgReward.toFixed(4)}`);
    console.log(`  Best Reward: ${newModel.trainingResults.bestReward.toFixed(4)}`);
    console.log(`  Duration: ${newModel.trainingResults.duration}s`);
    console.log('');
    console.log('Backtest Metrics:');
    console.log(`  Win Rate: ${(newModel.backtestResults.winRate * 100).toFixed(1)}%`);
    console.log(`  Profit Factor: ${newModel.backtestResults.profitFactor.toFixed(2)}`);
    console.log(`  Total Trades: ${newModel.backtestResults.totalTrades}`);
    console.log('');
    console.log('='.repeat(60));
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Integrate ML-enhanced signal generator into trading engine');
    console.log('  2. Deploy to production VPS');
    console.log('  3. Monitor live performance');
    console.log('');

    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');
    console.log('');
    process.exit(0);

  } catch (error) {
    console.error('ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

deployModel();

