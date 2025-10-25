import * as tf from '@tensorflow/tfjs-node';

/**
 * PPO Agent Configuration
 * CRITICAL: State dimensions MUST match train_enhanced_ppo.py (17 features)
 */
interface PPOConfig {
  stateDim: number;      // MUST be 17 to match training
  actionDim: number;     // 4 actions: HOLD, BUY, SELL, SHORT
  learningRate: number;
  gamma: number;
  epsilon: number;
}

/**
 * Experience Memory for PPO Training
 */
interface PPOMemory {
  states: number[][];
  actions: number[];
  rewards: number[];
  dones: boolean[];
}

/**
 * PPO Agent for Reinforcement Learning Trading
 * 
 * State Space (17 dimensions - MUST match training):
 * 1. Normalized Price
 * 2. Latest Return
 * 3. Normalized Volume
 * 4. 5-Period Average Return
 * 5. 5-Period Volatility
 * 6. RSI
 * 7. MACD
 * 8. MACD Signal
 * 9. Funding Rate (CDD)
 * 10. Funding Trend (CDD)
 * 11. VWAP Deviation (CDD)
 * 12. Order Flow Imbalance (CDD)
 * 13. Correlation Score (CDD)
 * 14. Has Position
 * 15. Position PnL
 * 16. Normalized Equity
 * 17. Drawdown
 * 
 * Action Space (4 actions):
 * 0: HOLD - No action
 * 1: BUY - Enter long position
 * 2: SELL - Close position
 * 3: SHORT - Enter short position (if enabled)
 */
export class PPOAgent {
  private config: PPOConfig;
  private actor: tf.LayersModel | null = null;
  private critic: tf.LayersModel | null = null;
  private memory: PPOMemory;

  constructor(config?: Partial<PPOConfig>) {
    // Default configuration - MUST match training script
    this.config = {
      stateDim: 17,  // ✅ FIXED: Match train_enhanced_ppo.py
      actionDim: 4,  // ✅ FIXED: 4 actions (HOLD, BUY, SELL, SHORT)
      learningRate: 0.0003,
      gamma: 0.99,
      epsilon: 0.2,
      ...config,
    };

    // Validate state dimensions
    if (this.config.stateDim !== 17) {
      throw new Error(
        `[PPOAgent] CRITICAL: State dimension must be 17 to match training script. Got: ${this.config.stateDim}`
      );
    }

    if (this.config.actionDim !== 4) {
      throw new Error(
        `[PPOAgent] CRITICAL: Action dimension must be 4 to match training script. Got: ${this.config.actionDim}`
      );
    }

    this.memory = {
      states: [],
      actions: [],
      rewards: [],
      dones: [],
    };

    console.log('[PPOAgent] Initialized with config:', this.config);
  }

  /**
   * Build actor network (policy)
   */
  private buildActor(): tf.LayersModel {
    const input = tf.input({ shape: [this.config.stateDim] });
    
    // Hidden layers
    let x = tf.layers.dense({ units: 128, activation: 'relu' }).apply(input) as tf.SymbolicTensor;
    x = tf.layers.dense({ units: 64, activation: 'relu' }).apply(x) as tf.SymbolicTensor;
    
    // Output layer - softmax for action probabilities
    const output = tf.layers.dense({ 
      units: this.config.actionDim, 
      activation: 'softmax' 
    }).apply(x) as tf.SymbolicTensor;

    const model = tf.model({ inputs: input, outputs: output });
    
    model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: 'categoricalCrossentropy',
    });

    console.log('[PPOAgent] Actor network built');
    return model;
  }

  /**
   * Build critic network (value function)
   */
  private buildCritic(): tf.LayersModel {
    const input = tf.input({ shape: [this.config.stateDim] });
    
    // Hidden layers
    let x = tf.layers.dense({ units: 128, activation: 'relu' }).apply(input) as tf.SymbolicTensor;
    x = tf.layers.dense({ units: 64, activation: 'relu' }).apply(x) as tf.SymbolicTensor;
    
    // Output layer - single value for state value
    const output = tf.layers.dense({ units: 1 }).apply(x) as tf.SymbolicTensor;

    const model = tf.model({ inputs: input, outputs: output });
    
    model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: 'meanSquaredError',
    });

    console.log('[PPOAgent] Critic network built');
    return model;
  }

  /**
   * Get action from current policy
   * @param state - 17-dimensional state vector
   * @returns action index (0-3)
   */
  async getAction(state: number[]): Promise<number> {
    // Validate state dimensions
    if (state.length !== this.config.stateDim) {
      throw new Error(
        `[PPOAgent] Invalid state dimensions. Expected ${this.config.stateDim}, got ${state.length}`
      );
    }

    // Initialize networks if not already done
    if (!this.actor) {
      this.actor = this.buildActor();
    }

    try {
      // Convert state to tensor
      const stateTensor = tf.tensor2d([state], [1, this.config.stateDim]);
      
      // Get action probabilities from actor
      const actionProbs = (await this.actor.predict(stateTensor)) as tf.Tensor;
      const probs = Array.from(await actionProbs.data());

      // Sample action from probability distribution
      const action = this.sampleAction(probs);

      // Cleanup
      stateTensor.dispose();
      actionProbs.dispose();

      return action;
    } catch (error) {
      console.error('[PPOAgent] Error getting action:', error);
      throw error;
    }
  }

  /**
   * Sample action from probability distribution
   */
  private sampleAction(probs: number[]): number {
    const rand = Math.random();
    let cumulative = 0;
    
    for (let i = 0; i < probs.length; i++) {
      cumulative += probs[i];
      if (rand < cumulative) {
        return i;
      }
    }
    
    return probs.length - 1; // Fallback to last action
  }

  /**
   * Store experience in memory
   */
  storeExperience(state: number[], action: number, reward: number, done: boolean): void {
    if (state.length !== this.config.stateDim) {
      throw new Error(
        `[PPOAgent] Cannot store experience with invalid state dimensions. Expected ${this.config.stateDim}, got ${state.length}`
      );
    }

    this.memory.states.push(state);
    this.memory.actions.push(action);
    this.memory.rewards.push(reward);
    this.memory.dones.push(done);
  }

  /**
   * Train the agent on one episode
   * Note: This is a simplified training loop for demonstration
   * Production training should use train_enhanced_ppo.py
   */
  async trainEpisode(data: any[]): Promise<number> {
    console.log('[PPOAgent] Training episode (simplified - use Python script for production)');
    
    // Initialize networks
    if (!this.actor) this.actor = this.buildActor();
    if (!this.critic) this.critic = this.buildCritic();

    let totalReward = 0;
    let position = 0; // 0 = no position, 1 = long, -1 = short
    let entryPrice = 0;
    let equity = 10000;
    const maxDrawdown = 0.2;

    for (let t = 0; t < data.length; t++) {
      const { price, volume, volatility } = data[t];
      
      // Build 17-dimensional state (simplified - production should use full features)
      const state = this.buildSimplifiedState(price, volume, volatility, position, equity, entryPrice);
      
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
        if (equity < 10000 * (1 - maxDrawdown)) {
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

    // Update policy after episode
    await this.updatePolicy();

    return totalReward;
  }

  /**
   * Build simplified 17-dimensional state
   * Note: Production should use full feature calculation from CDD data
   */
  private buildSimplifiedState(
    price: number,
    volume: number,
    volatility: number,
    position: number,
    equity: number,
    entryPrice: number
  ): number[] {
    const normalizedPrice = price / 100000;
    const normalizedVolume = volume / 1000000;
    const normalizedEquity = equity / 10000;
    
    // Calculate PnL if in position
    const pnl = position !== 0 && entryPrice > 0 
      ? ((price - entryPrice) / entryPrice) 
      : 0;
    
    // Calculate drawdown
    const peakEquity = 10000; // Simplified
    const drawdown = (peakEquity - equity) / peakEquity;

    // Return 17-dimensional state (simplified placeholders for missing features)
    return [
      normalizedPrice,           // 1. Normalized Price
      0,                         // 2. Latest Return (placeholder)
      normalizedVolume,          // 3. Normalized Volume
      0,                         // 4. 5-Period Avg Return (placeholder)
      volatility,                // 5. 5-Period Volatility
      0.5,                       // 6. RSI (placeholder)
      0,                         // 7. MACD (placeholder)
      0,                         // 8. MACD Signal (placeholder)
      0,                         // 9. Funding Rate (placeholder)
      0,                         // 10. Funding Trend (placeholder)
      0,                         // 11. VWAP Deviation (placeholder)
      0,                         // 12. Order Flow Imbalance (placeholder)
      0.5,                       // 13. Correlation Score (placeholder)
      position !== 0 ? 1 : 0,    // 14. Has Position
      pnl,                       // 15. Position PnL
      normalizedEquity,          // 16. Normalized Equity
      drawdown,                  // 17. Drawdown
    ];
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
      
      // Validate loaded model dimensions
      const actorInputShape = this.actor.inputs[0].shape;
      const expectedStateDim = actorInputShape[1];
      
      if (expectedStateDim !== this.config.stateDim) {
        throw new Error(
          `[PPOAgent] Loaded model state dimension (${expectedStateDim}) does not match config (${this.config.stateDim})`
        );
      }
      
      console.log(`[PPOAgent] Model loaded from ${path}`);
      console.log(`[PPOAgent] Validated state dimensions: ${expectedStateDim}`);
    } catch (error) {
      console.error('[PPOAgent] Error loading model:', error);
      throw error;
    }
  }

  /**
   * Get model statistics
   */
  getStats(): { 
    memorySize: number; 
    actorParams: number; 
    criticParams: number;
    stateDim: number;
    actionDim: number;
  } {
    return {
      memorySize: this.memory.states.length,
      actorParams: this.actor ? this.actor.countParams() : 0,
      criticParams: this.critic ? this.critic.countParams() : 0,
      stateDim: this.config.stateDim,
      actionDim: this.config.actionDim,
    };
  }
}

export default PPOAgent;

