import * as tf from '@tensorflow/tfjs-node';
import axios from 'axios';

console.log('[DEBUG] Starting debug training...\n');

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
  for (let i = 19; i >= 0; i--) state.push(candles[idx - i].close / 100000);
  for (let i = 20; i >= 1; i--) {
    const ret = (candles[idx - i + 1].close - candles[idx - i].close) / candles[idx - i].close;
    state.push(ret * 100);
  }
  const avgVol = candles.slice(idx - 20, idx).reduce((s, c) => s + c.volume, 0) / 20;
  for (let i = 19; i >= 0; i--) state.push(candles[idx - i].volume / (avgVol + 0.0001));
  state.push(0.5, 0.01, 0.001);
  for (let i = 0; i < 20; i++) state.push(0);
  return state;
}

async function main() {
  const candles = await fetchData('BTCUSDT', 90);
  console.log(`[DEBUG] Loaded ${candles.length} candles`);
  console.log(`[DEBUG] First price: $${candles[0].close}, Last price: $${candles[candles.length-1].close}\n`);
  
  const trainSize = Math.floor(candles.length * 0.7);
  const agent = new PPO(83, 4);
  
  // Run ONE episode with detailed logging
  let cash = 10000;
  let pos = 0;
  let buyPrice = 0;
  let totalReward = 0;
  let tradeCount = 0;
  
  console.log('[DEBUG] Starting training episode...\n');
  
  for (let i = 30; i < Math.min(trainSize - 1, 100); i++) {
    const state = buildState(candles, i);
    const action = await agent.getAction(state);
    const price = candles[i].close;
    let stepReward = 0;
    
    const actionNames = ['Hold', 'Buy', 'Sell', 'Wait'];
    
    if (action === 1 && pos === 0 && cash >= price) {
      pos = 1;
      cash -= price;
      buyPrice = price;
      stepReward = -0.001;
      tradeCount++;
      console.log(`[${i}] ${actionNames[action]}: Bought at $${price.toFixed(2)}, Cash: $${cash.toFixed(2)}`);
    } else if (action === 2 && pos > 0) {
      const profit = (price - buyPrice) / buyPrice;
      cash += price;
      stepReward = profit;
      totalReward += profit;
      tradeCount++;
      console.log(`[${i}] ${actionNames[action]}: Sold at $${price.toFixed(2)}, Profit: ${(profit*100).toFixed(2)}%, Cash: $${cash.toFixed(2)}`);
      pos = 0;
      buyPrice = 0;
    } else if (action === 1 && pos > 0) {
      stepReward = -0.01;
      console.log(`[${i}] ${actionNames[action]}: INVALID (already in position), Penalty: -0.01`);
    } else if (action === 2 && pos === 0) {
      stepReward = -0.01;
      console.log(`[${i}] ${actionNames[action]}: INVALID (no position), Penalty: -0.01`);
    } else {
      if (pos > 0) {
        const unrealizedPnL = (price - buyPrice) / buyPrice;
        stepReward = unrealizedPnL * 0.1;
        if (i % 10 === 0) {
          console.log(`[${i}] ${actionNames[action]}: Holding, Unrealized P&L: ${(unrealizedPnL*100).toFixed(2)}%`);
        }
      }
    }
  }
  
  console.log(`\n[DEBUG] Episode complete!`);
  console.log(`[DEBUG] Total trades: ${tradeCount}`);
  console.log(`[DEBUG] Total reward: ${totalReward.toFixed(4)}`);
  console.log(`[DEBUG] Final cash: $${cash.toFixed(2)}`);
  console.log(`[DEBUG] Position: ${pos > 0 ? 'Long' : 'Cash'}`);
  
  if (tradeCount === 0) {
    console.log(`\n[DEBUG] ⚠️  NO TRADES EXECUTED! Model is not taking actions.`);
    console.log(`[DEBUG] This means the action probabilities are heavily skewed.`);
  }
}

main().catch(console.error);
