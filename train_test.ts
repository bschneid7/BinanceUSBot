import * as tf from '@tensorflow/tfjs-node';
import axios from 'axios';

console.log('[CPU] TensorFlow backend:', tf.getBackend());
console.log('[CPU] Starting 1000-episode training with Binance.US data...\n');

class PPO {
  private actor: tf.LayersModel;
  private critic: tf.LayersModel;
  
  constructor(stateDim: number, actionDim: number) {
    this.actor = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [stateDim], units: 256, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 128, activation: 'relu' }),
        tf.layers.dense({ units: 64, activation: 'relu' }),
        tf.layers.dense({ units: actionDim, activation: 'softmax' })
      ]
    });
    
    this.critic = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [stateDim], units: 256, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 128, activation: 'relu' }),
        tf.layers.dense({ units: 64, activation: 'relu' }),
        tf.layers.dense({ units: 1 })
      ]
    });
    
    this.actor.compile({ optimizer: tf.train.adam(0.0001), loss: 'categoricalCrossentropy' });
    this.critic.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
  }
  
  async getAction(state: number[]): Promise<number> {
    return tf.tidy(() => {
      const probs = this.actor.predict(tf.tensor2d([state])) as tf.Tensor;
      return tf.multinomial(probs, 1).dataSync()[0];
    });
  }
  
  async train(states: number[][], actions: number[], rewards: number[]) {
    // Simple policy gradient update
    const statesTensor = tf.tensor2d(states);
    const actionsTensor = tf.tensor1d(actions, 'int32');
    const rewardsTensor = tf.tensor1d(rewards);
    
    // Update critic (value function)
    await this.critic.fit(statesTensor, rewardsTensor, {
      epochs: 1,
      verbose: 0
    });
    
    // Update actor (policy)
    const actionOneHot = tf.oneHot(actionsTensor, 4);
    await this.actor.fit(statesTensor, actionOneHot, {
      epochs: 1,
      verbose: 0
    });
    
    statesTensor.dispose();
    actionsTensor.dispose();
    rewardsTensor.dispose();
    actionOneHot.dispose();
  }
  
  async save(path: string) {
    const fs = require('fs');
    fs.mkdirSync(path, {recursive: true});
    await this.actor.save(`file://${path}/actor`);
    await this.critic.save(`file://${path}/critic`);
  }
}

async function fetchData(symbol: string, days: number) {
  const url = `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=1h&limit=${days * 24}`;
  console.log('[CPU] Fetching from:', url);
  const res = await axios.get(url);
  return res.data.map((k: any) => ({
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3])
  }));
}

function buildState(candles: any[], idx: number): number[] {
  const state: number[] = [];
  
  // Price history (20 values)
  for (let i = 19; i >= 0; i--) {
    state.push(candles[idx - i].close / 100000);
  }
  
  // Returns (20 values)
  for (let i = 20; i >= 1; i--) {
    const ret = (candles[idx - i + 1].close - candles[idx - i].close) / candles[idx - i].close;
    state.push(ret * 100);
  }
  
  // Volume (20 values)
  const avgVol = candles.slice(idx - 20, idx).reduce((s, c) => s + c.volume, 0) / 20;
  for (let i = 19; i >= 0; i--) {
    state.push(candles[idx - i].volume / (avgVol + 0.0001)); // Avoid division by zero
  }
  
  // Technical indicators (3 values)
  const prices = candles.slice(idx - 14, idx).map(c => c.close);
  const gains = [];
  const losses = [];
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains.push(change);
    else losses.push(Math.abs(change));
  }
  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / gains.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  const rs = avgLoss > 0 ? avgGain / avgLoss : 1;
  const rsi = 100 - (100 / (1 + rs));
  
  const returns = [];
  for (let i = 1; i < 20; i++) {
    returns.push((candles[idx - i].close - candles[idx - i - 1].close) / candles[idx - i - 1].close);
  }
  const volatility = Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length);
  const spread = (candles[idx].high - candles[idx].low) / candles[idx].close;
  
  state.push(rsi / 100, volatility * 100, spread * 100);
  
  // Additional features (20 values)
  for (let i = 0; i < 20; i++) {
    const momentum = (candles[idx - i].close - candles[idx - i - 5].close) / candles[idx - i - 5].close;
    state.push(momentum * 100);
  }
  
  return state;
}

async function main() {
  console.log('[CPU] Fetching BTC data from Binance.US...');
  const candles = await fetchData('BTCUSDT', 90);
  console.log(`[CPU] Loaded ${candles.length} candles`);
  
  const trainSize = Math.floor(candles.length * 0.7);
  const valSize = Math.floor(candles.length * 0.15);
  
  const agent = new PPO(83, 4);
  console.log('[CPU] Training 1000 episodes (est. 6-8 hours)...\n');
  
  let bestValReward = -Infinity;
  let patience = 0;
  const startTime = Date.now();
  
  for (let ep = 1; ep <= 20; ep++) {
    let totalReward = 0;
    let cash = 10000;
    let pos = 0;
    let buyPrice = 0;
    
    const states: number[][] = [];
    const actions: number[] = [];
    const rewards: number[] = [];
    
    // Training episode
    for (let i = 30; i < trainSize - 1; i++) {
      const state = buildState(candles, i);
      const action = await agent.getAction(state);
      const price = candles[i].close;
      let stepReward = 0;
      
      // Action 0: Hold
      // Action 1: Buy
      // Action 2: Sell
      // Action 3: Wait
      
      if (action === 1 && pos === 0 && cash >= price) {
        // Buy
        pos = 1;
        cash -= price;
        buyPrice = price;
        stepReward = -0.001; // Small penalty for transaction cost
      } else if (action === 2 && pos > 0) {
        // Sell
        const profit = (price - buyPrice) / buyPrice;
        cash += price;
        stepReward = profit; // Reward is the percentage return
        totalReward += profit;
        pos = 0;
        buyPrice = 0;
      } else if (action === 1 && pos > 0) {
        // Invalid: trying to buy when already in position
        stepReward = -0.01;
      } else if (action === 2 && pos === 0) {
        // Invalid: trying to sell without position
        stepReward = -0.01;
      } else {
        // Hold or wait
        if (pos > 0) {
          // Holding: reward/penalty based on unrealized P&L
          const unrealizedPnL = (price - buyPrice) / buyPrice;
          stepReward = unrealizedPnL * 0.1; // Small reward/penalty for holding
        } else {
          stepReward = 0; // Neutral for waiting in cash
        }
      }
      
      states.push(state);
      actions.push(action);
      rewards.push(stepReward);
    }
    
    // Train the model with collected experience
    if (states.length > 0) {
      await agent.train(states, actions, rewards);
    }
    
    // Validation every 10 episodes
    if (ep % 10 === 0) {
      let valReward = 0;
      let valCash = 10000;
      let valPos = 0;
      let valBuyPrice = 0;
      
      for (let i = trainSize + 30; i < trainSize + valSize - 1; i++) {
        const state = buildState(candles, i);
        const action = await agent.getAction(state);
        const price = candles[i].close;
        
        if (action === 1 && valPos === 0 && valCash >= price) {
          valPos = 1;
          valCash -= price;
          valBuyPrice = price;
        } else if (action === 2 && valPos > 0) {
          const profit = (price - valBuyPrice) / valBuyPrice;
          valCash += price;
          valReward += profit;
          valPos = 0;
          valBuyPrice = 0;
        }
      }
      
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const pctComplete = (ep / 1000 * 100).toFixed(1);
      console.log(`[CPU] Ep ${ep}/1000 (${pctComplete}%, ${elapsed}min): Train=${totalReward.toFixed(4)}, Val=${valReward.toFixed(4)}`);
      
      if (valReward > bestValReward) {
        bestValReward = valReward;
        patience = 0;
        const path = `/opt/binance-bot/ml_models_cpu_1000/best_${Date.now()}`;
        await agent.save(path);
        console.log('  ✅ Best model saved');
      } else {
        patience++;
        if (patience >= 8) {
          console.log(`  ⚠️  Early stop at episode ${ep}`);
          break;
        }
      }
    }
    
    // Checkpoint every 100 episodes
    if (ep % 100 === 0) {
      const path = `/opt/binance-bot/ml_models_cpu_1000/checkpoint_ep${ep}_${Date.now()}`;
      await agent.save(path);
      console.log('  💾 Checkpoint');
    }
  }
  
  const totalMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const totalHours = ((Date.now() - startTime) / 1000 / 3600).toFixed(2);
  console.log(`\n✅ Training complete in ${totalHours} hours!`);
  console.log(`Best validation reward: ${bestValReward.toFixed(4)}`);
  console.log('\nModels saved to: /opt/binance-bot/ml_models_cpu_1000/');
}

main().catch(console.error);
