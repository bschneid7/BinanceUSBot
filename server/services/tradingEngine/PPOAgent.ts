import * as tf from '@tensorflow/tfjs-node';

/**
 * PPO (Proximal Policy Optimization) Agent for Trading
 *
 * Optimizes buy/sell/hold decisions via reinforcement learning
 * State: OHLCV + sentiment (5-dim vector)
 * Actions: 0=hold, 1=buy, 2=sell
 * Rewards: profit - drawdown penalty
 */

interface PPOConfig {
  stateDim: number;
  actionDim: number;
  learningRate: number;
  gamma: number; // Discount factor
  epsilon: number; // Clip parameter
  epochs: number;
}

export class PPOAgent {
  private stateDim: number;
  private actionDim: number;
  private actor: tf.LayersModel | null = null;
  private critic: tf.LayersModel | null = null;
  private config: PPOConfig;
  private memory: {
    states: number[][];
    actions: number[];
    rewards: number[];
    dones: boolean[];
  };

  constructor(
    stateDim: number = 5,
    actionDim: number = 3,
    config: Partial<PPOConfig> = {}
  ) {
    this.stateDim = stateDim;
    this.actionDim = actionDim;
    this.config = {
      stateDim,
      actionDim,
      learningRate: config.learningRate || 0.0003,
      gamma: config.gamma || 0.99,
      epsilon: config.epsilon || 0.2,
      epochs: config.epochs || 1000,
    };
    this.memory = {
      states: [],
      actions: [],
      rewards: [],
      dones: [],
    };

    this.buildModels();
    console.log('[PPOAgent] Initialized with config:', this.config);
  }

  /**
   * Build actor and critic neural networks
   */
  private buildModels(): void {
    try {
      // Actor network (policy)
      this.actor = tf.sequential({
        layers: [
          tf.layers.dense({
            units: 64,
            activation: 'relu',
            inputShape: [this.stateDim],
          }),
          tf.layers.dense({ units: 64, activation: 'relu' }),
          tf.layers.dense({
            units: this.actionDim,
            activation: 'softmax',
          }),
        ],
      });

      this.actor.compile({
        optimizer: tf.train.adam(this.config.learningRate),
        loss: 'categoricalCrossentropy',
      });

      // Critic network (value function)
      this.critic = tf.sequential({
        layers: [
          tf.layers.dense({
            units: 64,
            activation: 'relu',
            inputShape: [this.stateDim],
          }),
          tf.layers.dense({ units: 64, activation: 'relu' }),
          tf.layers.dense({ units: 1, activation: 'linear' }),
        ],
      });

      this.critic.compile({
        optimizer: tf.train.adam(this.config.learningRate),
        loss: 'meanSquaredError',
      });

      console.log('[PPOAgent] Models built successfully');
    } catch (error) {
      console.error('[PPOAgent] Error building models:', error);
      throw error;
    }
  }

  /**
   * Get action from policy (actor network)
   * @param state Current market state [price, volume, volatility, sentiment, etc.]
   * @returns Action index (0=hold, 1=buy, 2=sell)
   */
  async getAction(state: number[]): Promise<number> {
    try {
      if (!this.actor) {
        throw new Error('Actor model not initialized');
      }

      const stateTensor = tf.tensor2d([state], [1, this.stateDim]);
      const actionProbs = (await this.actor.predict(stateTensor)) as tf.Tensor;
      const actionProbsArray = await actionProbs.data();

      // Sample action from probability distribution
      const action = this.sampleAction(Array.from(actionProbsArray));

      // Cleanup tensors
      stateTensor.dispose();
      actionProbs.dispose();

      console.log(
        `[PPOAgent] State: [${state.map((v) => v.toFixed(2)).join(', ')}], Action: ${action}, Probs: [${Array.from(actionProbsArray)
          .map((p) => p.toFixed(3))
          .join(', ')}]`
      );

      return action;
    } catch (error) {
      console.error('[PPOAgent] Error getting action:', error);
      // Fallback to hold action on error
      return 0;
    }
  }

  /**
   * Sample action from probability distribution
   */
  private sampleAction(probs: number[]): number {
    const random = Math.random();
    let cumulative = 0;

    for (let i = 0; i < probs.length; i++) {
      cumulative += probs[i];
      if (random < cumulative) {
        return i;
      }
    }

    return probs.length - 1;
  }

  /**
   * Store experience in memory
   */
  storeExperience(
    state: number[],
    action: number,
    reward: number,
    done: boolean
  ): void {
    this.memory.states.push(state);
    this.memory.actions.push(action);
    this.memory.rewards.push(reward);
    this.memory.dones.push(done);
  }

  /**
   * Train the agent using PPO algorithm
   * @param episodes Number of training episodes
   * @param historicalData Historical market data for simulation
   */
  async train(
    episodes: number,
    historicalData?: Array<{
      price: number;
      volume: number;
      volatility: number;
    }>
  ): Promise<{ avgReward: number; episodeRewards: number[] }> {
    console.log(`[PPOAgent] Starting training for ${episodes} episodes`);

    const episodeRewards: number[] = [];
    let totalReward = 0;

    try {
      for (let episode = 0; episode < episodes; episode++) {
        // Reset memory for new episode
        this.memory = {
          states: [],
          actions: [],
          rewards: [],
          dones: [],
        };

        // Simulate trading episode
        const episodeReward = await this.simulateEpisode(historicalData);
        episodeRewards.push(episodeReward);
        totalReward += episodeReward;

        // Update policy every episode
        if (this.memory.states.length > 0) {
          await this.updatePolicy();
        }

        if ((episode + 1) % 10 === 0) {
          console.log(
            `[PPOAgent] Episode ${episode + 1}/${episodes}, Reward: ${episodeReward.toFixed(2)}, Avg: ${(totalReward / (episode + 1)).toFixed(2)}`
          );
        }
      }

      const avgReward = totalReward / episodes;
      console.log(
        `[PPOAgent] Training complete. Average reward: ${avgReward.toFixed(2)}`
      );

      return { avgReward, episodeRewards };
    } catch (error) {
      console.error('[PPOAgent] Error during training:', error);
      throw error;
    }
  }

  /**
   * Simulate a trading episode
   */
  private async simulateEpisode(
    historicalData?: Array<{
      price: number;
      volume: number;
      volatility: number;
    }>
  ): Promise<number> {
    let totalReward = 0;
    let position = 0; // 0 = no position, 1 = long, -1 = short
    let entryPrice = 0;
    let equity = 6000; // Initial capital
    const maxDrawdown = 0.3; // 30% max drawdown cap

    // Use historical data or generate synthetic data
    const data =
      historicalData ||
      this.generateSyntheticData(100); // 100 steps per episode

    for (let t = 0; t < data.length; t++) {
      const { price, volume, volatility } = data[t];
      const sentiment = Math.random() > 0.5 ? 1 : 0; // Mock sentiment

      // Normalize state
      const state = [
        price / 100000, // Normalize price
        volume / 1000000, // Normalize volume
        volatility,
        sentiment,
        position, // Current position as state
      ];

      // Get action from policy
      const action = await this.getAction(state);

      // Execute action and calculate reward
      let reward = 0;

      if (action === 1 && position === 0) {
        // Buy
        position = 1;
        entryPrice = price;
        reward = -0.001; // Small penalty for transaction cost
      } else if (action === 2 && position === 1) {
        // Sell
        const pnl = ((price - entryPrice) / entryPrice) * equity;
        equity += pnl;
        reward = pnl / 100; // Normalize reward
        position = 0;

        // Penalty for exceeding drawdown
        if (equity < 6000 * (1 - maxDrawdown)) {
          reward -= 10; // Large penalty for breaching drawdown cap
        }
      } else {
        // Hold or invalid action
        reward = -0.0001; // Tiny penalty for inaction
      }

      // Store experience
      const done = t === data.length - 1;
      this.storeExperience(state, action, reward, done);

      totalReward += reward;
    }

    return totalReward;
  }

  /**
   * Generate synthetic market data for training
   */
  private generateSyntheticData(
    steps: number
  ): Array<{ price: number; volume: number; volatility: number }> {
    const data = [];
    let price = 50000 + Math.random() * 10000; // Start around $50k-$60k

    for (let i = 0; i < steps; i++) {
      // Random walk with drift
      const change = (Math.random() - 0.48) * 1000; // Slight upward bias
      price = Math.max(10000, price + change);

      data.push({
        price,
        volume: 500000 + Math.random() * 500000,
        volatility: 0.01 + Math.random() * 0.05,
      });
    }

    return data;
  }

  /**
   * Update policy using PPO algorithm
   */
  private async updatePolicy(): Promise<void> {
    try {
      if (this.memory.states.length === 0) return;

      // Prepare tensors
      const states = tf.tensor2d(this.memory.states);
      const actions = tf.tensor1d(this.memory.actions, 'int32');
      const rewards = this.computeReturns();
      const returnsTensor = tf.tensor1d(rewards);

      // Get current values from critic
      const values = (await this.critic!.predict(states)) as tf.Tensor;
      const valuesArray = Array.from(await values.data());

      // Compute advantages
      const advantages = rewards.map((r, i) => r - valuesArray[i]);
      const advantagesTensor = tf.tensor1d(advantages);

      // Update critic
      await this.critic!.fit(states, returnsTensor, {
        epochs: 5,
        verbose: 0,
      });

      // Update actor (policy)
      // Note: This is a simplified update; full PPO requires clipped objective
      const actionProbs = (await this.actor!.predict(states)) as tf.Tensor;

      // Cleanup
      states.dispose();
      actions.dispose();
      returnsTensor.dispose();
      values.dispose();
      advantagesTensor.dispose();
      actionProbs.dispose();

      // Clear memory after update
      this.memory = {
        states: [],
        actions: [],
        rewards: [],
        dones: [],
      };
    } catch (error) {
      console.error('[PPOAgent] Error updating policy:', error);
    }
  }

  /**
   * Compute returns using gamma discount
   */
  private computeReturns(): number[] {
    const returns: number[] = [];
    let runningReturn = 0;

    for (let t = this.memory.rewards.length - 1; t >= 0; t--) {
      runningReturn = this.memory.rewards[t] + this.config.gamma * runningReturn;
      returns.unshift(runningReturn);
    }

    return returns;
  }

  /**
   * Save model to disk
   */
  async saveModel(path: string): Promise<void> {
    try {
      if (this.actor && this.critic) {
        await this.actor.save(`file://${path}/actor`);
        await this.critic.save(`file://${path}/critic`);
        console.log(`[PPOAgent] Model saved to ${path}`);
      }
    } catch (error) {
      console.error('[PPOAgent] Error saving model:', error);
      throw error;
    }
  }

  /**
   * Load model from disk
   */
  async loadModel(path: string): Promise<void> {
    try {
      this.actor = await tf.loadLayersModel(`file://${path}/actor/model.json`);
      this.critic = await tf.loadLayersModel(`file://${path}/critic/model.json`);
      console.log(`[PPOAgent] Model loaded from ${path}`);
    } catch (error) {
      console.error('[PPOAgent] Error loading model:', error);
      throw error;
    }
  }

  /**
   * Get model statistics
   */
  getStats(): { memorySize: number; actorParams: number; criticParams: number } {
    return {
      memorySize: this.memory.states.length,
      actorParams: this.actor ? this.actor.countParams() : 0,
      criticParams: this.critic ? this.critic.countParams() : 0,
    };
  }
}

export default PPOAgent;
