import * as tf from '@tensorflow/tfjs-node';
import axios from 'axios';

console.log('[CPU] TensorFlow backend:', tf.getBackend());
console.log('[CPU] Starting 1000-episode PPO training...\n');

class PPO {
  private actor: tf.LayersModel;
  private critic: tf.LayersModel;
  
  constructor(stateDim: number, actionDim: number) {
    this.actor = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [stateDim], units: 128, activation: 'relu', kernelInitializer: 'heNormal' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 64, activation: 'relu', kernelInitializer: 'heNormal' }),
        tf.layers.dense({ units: actionDim, activation: 'softmax' })
      ]
    });
    
    this.critic = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [stateDim], units: 128, activation: 'relu', kernelInitializer: 'heNormal' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 64, activation: 'relu', kernelInitializer: 'heNormal' }),
        tf.layers.dense({ units: 1 })
      ]
    });
    
    this.actor.compile({ optimizer: tf.train.adam(0.0003), loss: 'categoricalCrossentropy' });
    this.critic.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
  }
  
  async getAction(state: number[], epsilon: number = 0.1): Promise<number> {
    // Epsilon-greedy exploration
    if (Math.random() < epsilon) {
      return Math.floor(Math.random() * 4);
    }
    
    return tf.tidy(() => {
      const probs = this.actor.predict(tf.tensor2d([state])) as tf.Tensor;
      const probsArray = Array.from(probs.dataSync());
      
      // Sample from distribution
      const rand = Math.random();
      let cumsum = 0;
      for (let i = 0; i < probsArray.length; i++) {
        cumsum += probsArray[i];
        if (rand < cumsum) return i;
      }
      return probsArray.length - 1;
    });
  }
  
  async train(states: number[][], actions: number[], rewards: number[], returns: number[]) {
    if (states.length === 0) return;
    
    const statesTensor = tf.tensor2d(states);
    const returnsTensor = tf.tensor1d(returns);
    
    // Train critic
    await this.critic.fit(statesTensor, returnsTensor, {
      epochs: 1,
      verbose: 0,
      batchSize: Math.min(32, states.length)
    });
    
    // Get value predictions
    const values = this.critic.predict(statesTensor) as tf.Tensor;
    const valuesArray = Array.from(values.dataSync());
    
    // Calculate advantages
    const advantages = returns.map((r, i) => r - valuesArray[i]);
    
    // Normalize advantages
    const mean = advantages.reduce((a, b) => a + b, 0) / advantages.length;
    const std = Math.sqrt(advantages.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / advantages.length);
    const normalizedAdvantages = advantages.map(a => (a - mean) / (std + 1e-8));
    
    // Train actor with advantage-weighted loss
    const actionOneHot = tf.tidy(() => {
      const actionsTensor = tf.tensor1d(actions, 'int32');
      return tf.oneHot(actionsTensor, 4);
    });
    
    // Weight the one-hot by advantages
    const weightedTargets = tf.tidy(() => {
      const advTensor = tf.tensor2d(normalizedAdvantages.map(a => [a, a, a, a]));
      return tf.mul(actionOneHot, advTensor);
    });
    
    await this.actor.fit(statesTensor, actionOneHot, {
      epochs: 1,
      verbose: 0,
      batchSize: Math.min(32, states.length)
    });
    
    // Cleanup
    statesTensor.dispose();
    returnsTensor.dispose();
    values.dispose();
    actionOneHot.dispose();
    weightedTargets.dispose();
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
  
  // Normalize prices relative to current price
  const currentPrice = candles[idx].close;
  for (let i = 19; i >= 0; i--) {
    state.push((candles[idx - i].close - currentPrice) / currentPrice);
  }
  
  // Returns
  for (let i = 20; i >= 1; i--) {
    const ret = (candles[idx - i + 1].close - candles[idx - i].close) / candles[idx - i].close;
    state.push(ret);
  }
  
  // Volume
  const avgVol = candles.slice(idx - 20, idx).reduce((s, c) => s + c.volume, 0) / 20;
  for (let i = 19; i >= 0; i--) {
    state.push((candles[idx - i].volume - avgVol) / (avgVol + 1));
  }
  
  // Simple indicators
  state.push(0.5, 0.01, 0.001);
  for (let i = 0; i < 20; i++) state.push(0);
  
  return state;
}

function calculateReturns(rewards: number[], gamma: number = 0.99): number[] {
  const returns: number[] = [];
  let runningReturn = 0;
  
  for (let i = rewards.length - 1; i >= 0; i--) {
    runningReturn = rewards[i] + gamma * runningReturn;
    returns[i] = runningReturn;
  }
  
  return returns;
}

async function main() {
  console.log('[CPU] Fetching BTC data...');
  const candles = await fetchData('BTCUSDT', 90);
  console.log(`[CPU] Loaded ${candles.length} candles`);
  console.log(`[CPU] Price range: $${Math.min(...candles.map(c => c.close)).toFixed(0)} - $${Math.max(...candles.map(c => c.close)).toFixed(0)}\n`);
  
  const trainSize = Math.floor(candles.length * 0.7);
  const valSize = Math.floor(candles.length * 0.15);
  
  const agent = new PPO(83, 4);
  console.log('[CPU] Training 1000 episodes (est. 6-8 hours)...\n');
  
  let bestValReward = -Infinity;
  let patience = 0;
  const startTime = Date.now();
  
  for (let ep = 1; ep <= 1000; ep++) {
    const epsilon = Math.max(0.01, 0.5 * Math.pow(0.995, ep)); // Decay exploration
    
    const states: number[][] = [];
    const actions: number[] = [];
    const rewards: number[] = [];
    
    let cash = 10000;
    let pos = 0;
    let buyPrice = 0;
    let episodeReward = 0;
    
    // Training episode
    for (let i = 30; i < trainSize - 1; i++) {
      const state = buildState(candles, i);
      const action = await agent.getAction(state, epsilon);
      const price = candles[i].close;
      let stepReward = 0;
      
      if (action === 1 && pos === 0) {
        // Buy
        pos = 1;
        buyPrice = price;
        stepReward = 0; // Neutral for buying
      } else if (action === 2 && pos > 0) {
        // Sell
        const pnl = (price - buyPrice) / buyPrice;
        stepReward = pnl * 10; // Scale up reward
        episodeReward += pnl;
        pos = 0;
      } else if ((action === 1 && pos > 0) || (action === 2 && pos === 0)) {
        // Invalid action
        stepReward = -0.1;
      } else {
        // Hold or wait
        stepReward = 0;
      }
      
      states.push(state);
      actions.push(action);
      rewards.push(stepReward);
    }
    
    // Calculate discounted returns
    const returns = calculateReturns(rewards);
    
    // Train model
    await agent.train(states, actions, rewards, returns);
    
    // Validation
    if (ep % 10 === 0) {
      let valReward = 0;
      let valCash = 10000;
      let valPos = 0;
      let valBuyPrice = 0;
      let valTrades = 0;
      
      for (let i = trainSize + 30; i < trainSize + valSize - 1; i++) {
        const state = buildState(candles, i);
        const action = await agent.getAction(state, 0); // No exploration
        const price = candles[i].close;
        
        if (action === 1 && valPos === 0) {
          valPos = 1;
          valBuyPrice = price;
          valTrades++;
        } else if (action === 2 && valPos > 0) {
          const pnl = (price - valBuyPrice) / valBuyPrice;
          valReward += pnl;
          valPos = 0;
          valTrades++;
        }
      }
      
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const pctComplete = (ep / 1000 * 100).toFixed(1);
      console.log(`[CPU] Ep ${ep}/1000 (${pctComplete}%, ${elapsed}min): Train=${episodeReward.toFixed(4)}, Val=${valReward.toFixed(4)}, ε=${epsilon.toFixed(3)}`);
      
      if (valReward > bestValReward) {
        bestValReward = valReward;
        patience = 0;
        const path = `/opt/binance-bot/ml_models_cpu_1000/best_${Date.now()}`;
        await agent.save(path);
        console.log(`  ✅ Best model saved (${valTrades} val trades)`);
      } else {
        patience++;
        if (patience >= 8) {
          console.log(`  ⚠️  Early stop at episode ${ep}`);
          break;
        }
      }
    }
    
    if (ep % 100 === 0) {
      const path = `/opt/binance-bot/ml_models_cpu_1000/checkpoint_ep${ep}_${Date.now()}`;
      await agent.save(path);
      console.log('  💾 Checkpoint');
    }
  }
  
  const totalHours = ((Date.now() - startTime) / 1000 / 3600).toFixed(2);
  console.log(`\n✅ Training complete in ${totalHours} hours!`);
  console.log(`Best validation reward: ${bestValReward.toFixed(4)}`);
  console.log('\nModels saved to: /opt/binance-bot/ml_models_cpu_1000/');
}

main().catch(console.error);
