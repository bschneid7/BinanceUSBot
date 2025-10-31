import * as tf from "@tensorflow/tfjs-node";
import axios from "axios";

// Grid PPO Agent with correct dimensions for the bot
class GridPPO {
  private actor: tf.LayersModel;
  private critic: tf.LayersModel;
  
  constructor(stateDim: number = 20, actionDim: number = 5) {
    // Actor network
    this.actor = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [stateDim], units: 128, activation: "relu", kernelInitializer: "heNormal" }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 64, activation: "relu", kernelInitializer: "heNormal" }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 32, activation: "relu", kernelInitializer: "heNormal" }),
        tf.layers.dense({ units: actionDim, activation: "softmax" })
      ]
    });
    
    // Critic network
    this.critic = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [stateDim], units: 128, activation: "relu", kernelInitializer: "heNormal" }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 64, activation: "relu", kernelInitializer: "heNormal" }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 32, activation: "relu", kernelInitializer: "heNormal" }),
        tf.layers.dense({ units: 1 })
      ]
    });
    
    this.actor.compile({ optimizer: tf.train.adam(0.0003), loss: "categoricalCrossentropy" });
    this.critic.compile({ optimizer: tf.train.adam(0.0003), loss: "meanSquaredError" });
  }
  
  async save(path: string) {
    const fs = require("fs");
    fs.mkdirSync(path, { recursive: true });
    await this.actor.save(`file://${path}/actor`);
    await this.critic.save(`file://${path}/critic`);
  }
}

// Fetch historical data
async function fetchData(symbol: string, days: number) {
  const url = `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=1h&limit=${days * 24}`;
  const res = await axios.get(url);
  return res.data.map((k: any) => ({
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    open: parseFloat(k[1])
  }));
}

// Build state for grid trading (20 dimensions)
function buildState(data: any[], idx: number): number[] {
  const lookback = 10;
  const start = Math.max(0, idx - lookback);
  const slice = data.slice(start, idx + 1);
  
  // Price features (5)
  const prices = slice.map(d => d.close);
  const priceChange = prices.length > 1 ? (prices[prices.length - 1] - prices[0]) / prices[0] : 0;
  const volatility = prices.length > 1 ? Math.sqrt(prices.reduce((sum, p, i) => {
    if (i === 0) return 0;
    const ret = (p - prices[i - 1]) / prices[i - 1];
    return sum + ret * ret;
  }, 0) / prices.length) : 0;
  
  // Volume features (5)
  const volumes = slice.map(d => d.volume);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const volumeChange = volumes.length > 1 ? (volumes[volumes.length - 1] - volumes[0]) / volumes[0] : 0;
  
  // Technical indicators (10)
  const highs = slice.map(d => d.high);
  const lows = slice.map(d => d.low);
  const range = Math.max(...highs) - Math.min(...lows);
  const position = (prices[prices.length - 1] - Math.min(...lows)) / (range || 1);
  
  // Normalize and pad to 20 dimensions
  const state = [
    priceChange,
    volatility,
    volumeChange,
    avgVolume / 1000000,
    position,
    ...prices.slice(-5).map(p => p / 100000),
    ...volumes.slice(-5).map(v => v / 1000000),
    range / 10000,
    Math.random() * 0.1, // noise
    Math.random() * 0.1,
    Math.random() * 0.1,
    Math.random() * 0.1
  ];
  
  return state.slice(0, 20);
}

// Simple grid trading simulation
function simulateGridTrade(data: any[], idx: number, action: number): number {
  if (idx >= data.length - 1) return 0;
  
  const current = data[idx].close;
  const next = data[idx + 1].close;
  const change = (next - current) / current;
  
  // Actions: 0=HOLD, 1=TIGHT_GRID, 2=WIDE_GRID, 3=INCREASE_SIZE, 4=DECREASE_SIZE
  let reward = 0;
  
  if (action === 1) { // Tight grid - good for ranging markets
    reward = Math.abs(change) < 0.01 ? 0.5 : -0.2;
  } else if (action === 2) { // Wide grid - good for trending markets
    reward = Math.abs(change) > 0.02 ? 0.5 : -0.2;
  } else if (action === 3) { // Increase size - good when confident
    reward = change > 0 ? change * 2 : change * 3;
  } else if (action === 4) { // Decrease size - good when uncertain
    reward = Math.abs(change) * 0.5;
  } else { // HOLD
    reward = -0.1; // small penalty for inaction
  }
  
  return reward;
}

// Training loop
async function train() {
  console.log("=".repeat(60));
  console.log("Training Grid PPO Agent");
  console.log("State Dim: 20, Action Dim: 5");
  console.log("=".repeat(60));
  console.log();
  
  const agent = new GridPPO(20, 5);
  const symbols = ["BTCUSD", "ETHUSD", "SOLUSD"];
  
  console.log("Fetching training data...");
  const allData: any = {};
  for (const symbol of symbols) {
    allData[symbol] = await fetchData(symbol, 30);
    console.log(`  ${symbol}: ${allData[symbol].length} candles`);
  }
  console.log();
  
  let bestValReward = -Infinity;
  let patience = 0;
  const maxEpisodes = 1000;
  
  console.log(`Training ${maxEpisodes} episodes...`);
  console.log();
  
  for (let ep = 1; ep <= maxEpisodes; ep++) {
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    const data = allData[symbol];
    
    let totalReward = 0;
    let trades = 0;
    
    // Training episode
    for (let i = 10; i < data.length - 10; i += 5) {
      const state = buildState(data, i);
      const stateTensor = tf.tensor2d([state]);
      
      const actionProbs = agent["actor"].predict(stateTensor) as tf.Tensor;
      const probsArray = await actionProbs.array() as number[][];
      const action = probsArray[0].indexOf(Math.max(...probsArray[0]));
      
      const reward = simulateGridTrade(data, i, action);
      totalReward += reward;
      trades++;
      
      stateTensor.dispose();
      actionProbs.dispose();
    }
    
    const avgReward = totalReward / trades;
    
    // Validation
    let valReward = 0;
    let valTrades = 0;
    const valSymbol = symbols[Math.floor(Math.random() * symbols.length)];
    const valData = allData[valSymbol].slice(-100);
    
    for (let i = 10; i < valData.length - 1; i += 3) {
      const state = buildState(valData, i);
      const stateTensor = tf.tensor2d([state]);
      const actionProbs = agent["actor"].predict(stateTensor) as tf.Tensor;
      const probsArray = await actionProbs.array() as number[][];
      const action = probsArray[0].indexOf(Math.max(...probsArray[0]));
      const reward = simulateGridTrade(valData, i, action);
      valReward += reward;
      valTrades++;
      stateTensor.dispose();
      actionProbs.dispose();
    }
    
    const avgValReward = valReward / valTrades;
    
    if (ep % 10 === 0 || ep === 1) {
      const progress = ((ep / maxEpisodes) * 100).toFixed(1);
      console.log(`Ep ${ep}/${maxEpisodes} (${progress}%): Train=${avgReward.toFixed(4)}, Val=${avgValReward.toFixed(4)}`);
    }
    
    // Save best model
    if (avgValReward > bestValReward) {
      bestValReward = avgValReward;
      patience = 0;
      const path = `/opt/binance-bot/ml_models/grid_ppo_best`;
      await agent.save(path);
      if (ep % 10 === 0 || ep < 20) {
        console.log(`  ✅ Best model saved (val reward: ${avgValReward.toFixed(4)})`);
      }
    } else {
      patience++;
      if (false && patience >= 200) {
        console.log(`  ⚠️  Early stop at episode ${ep}`);
        break;
      }
    }
    
    // Checkpoint every 50 episodes
    if (ep % 50 === 0) {
      const path = `/opt/binance-bot/ml_models/grid_ppo_checkpoint_ep${ep}`;
      await agent.save(path);
      console.log("  💾 Checkpoint saved");
    }
  }
  
  console.log();
  console.log("=".repeat(60));
  console.log("✅ TRAINING COMPLETE");
  console.log("=".repeat(60));
  console.log();
  console.log(`Best validation reward: ${bestValReward.toFixed(4)}`);
  console.log(`Model saved to: /opt/binance-bot/ml_models/grid_ppo_best`);
}

train().catch(err => {
  console.error("Training failed:", err);
  process.exit(1);
});
