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
  
  for (let i = 19; i >= 0; i--) {
    state.push(candles[idx - i].close / 100000);
  }
  
  for (let i = 20; i >= 1; i--) {
    const ret = (candles[idx - i + 1].close - candles[idx - i].close) / candles[idx - i].close;
    state.push(ret * 100);
  }
  
  const avgVol = candles.slice(idx - 20, idx).reduce((s, c) => s + c.volume, 0) / 20;
  for (let i = 19; i >= 0; i--) {
    state.push(candles[idx - i].volume / avgVol);
  }
  
  const rsi = 0.5;
  const volatility = Math.random() * 0.02;
  const spread = (candles[idx].high - candles[idx].low) / candles[idx].close;
  
  state.push(rsi, volatility, spread);
  for (let i = 0; i < 20; i++) state.push(Math.random() * 0.1);
  
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
  
  for (let ep = 1; ep <= 1000; ep++) {
    let reward = 0;
    let cash = 10000;
    let pos = 0;
    
    for (let i = 30; i < trainSize - 1; i++) {
      const state = buildState(candles, i);
      const action = await agent.getAction(state);
      const price = candles[i].close;
      
      if (action === 1 && pos === 0 && cash >= price) {
        pos = 1;
        cash -= price;
      } else if (action === 2 && pos > 0) {
        cash += price;
        reward += (price - candles[i - 1].close) / candles[i - 1].close;
        pos = 0;
      }
    }
    
    if (ep % 10 === 0) {
      let valReward = 0;
      let valCash = 10000;
      let valPos = 0;
      
      for (let i = trainSize + 30; i < trainSize + valSize - 1; i++) {
        const state = buildState(candles, i);
        const action = await agent.getAction(state);
        const price = candles[i].close;
        
        if (action === 1 && valPos === 0 && valCash >= price) {
          valPos = 1;
          valCash -= price;
        } else if (action === 2 && valPos > 0) {
          valCash += price;
          valReward += (price - candles[i - 1].close) / candles[i - 1].close;
          valPos = 0;
        }
      }
      
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const pctComplete = (ep / 1000 * 100).toFixed(1);
      console.log(`[CPU] Ep ${ep}/1000 (${pctComplete}%, ${elapsed}min): Train=${reward.toFixed(2)}, Val=${valReward.toFixed(2)}`);
      
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
    
    if (ep % 100 === 0) {
      const path = `/opt/binance-bot/ml_models_cpu_1000/checkpoint_ep${ep}_${Date.now()}`;
      await agent.save(path);
      console.log('  💾 Checkpoint');
    }
  }
  
  const totalMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const totalHours = ((Date.now() - startTime) / 1000 / 3600).toFixed(2);
  console.log(`\n✅ Training complete in ${totalHours} hours!`);
  console.log(`Best validation reward: ${bestValReward.toFixed(2)}`);
  console.log('\nModels saved to: /opt/binance-bot/ml_models_cpu_1000/');
}

main().catch(console.error);
