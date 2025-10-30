import * as tf from '@tensorflow/tfjs-node';
import logger from '../../utils/logger.js';

/**
 * Grid PPO Agent Configuration
 * Specifically designed for grid trading with 20 state dimensions and 5 action dimensions
 */
interface GridPPOConfig {
  stateDim: number;      // 20 dimensions for grid trading
  actionDim: number;     // 5 dimensions: spacing, sizing, enable, active, confidence
  learningRate: number;
  gamma: number;
  epsilon: number;
}

/**
 * Experience Memory for PPO Training
 */
interface GridPPOMemory {
  states: number[][];
  actions: number[][];   // Continuous actions for grid trading
  rewards: number[];
  dones: boolean[];
}

/**
 * Grid PPO Agent for Grid Trading Optimization
 * 
 * State Space (20 dimensions):
 * 1. Normalized Price
 * 2. Latest Return
 * 3. Normalized Volume
 * 4. 5-Period Average Return
 * 5. 5-Period Volatility
 * 6. RSI
 * 7. MACD
 * 8. MACD Signal
 * 9. Spread (bps)
 * 10. Order Book Depth
 * 11. Active Grid Orders
 * 12. Fill Rate
 * 13. Avg Profit per Trade
 * 14. Current Grid Spacing
 * 15. Current Order Size
 * 16. Portfolio Exposure %
 * 17. Available Capital %
 * 18. Current P&L %
 * 19. Volatility Regime (0-1)
 * 20. Market Trend (-1 to 1)
 * 
 * Action Space (5 continuous dimensions):
 * 0: Spacing Multiplier (0-1 → 0.5-1.5x)
 * 1: Size Multiplier (0-1 → 0.5-1.5x)
 * 2: Pair Enabled (0-1 → boolean)
 * 3: Grid Active (0-1 → boolean)
 * 4: Confidence (0-1)
 */
export class GridPPOAgent {
  private config: GridPPOConfig;
  private actor: tf.LayersModel | null = null;
  private critic: tf.LayersModel | null = null;
  private memory: GridPPOMemory;

  constructor(stateDim: number = 20, actionDim: number = 5, config?: Partial<GridPPOConfig>) {
    // Configuration for grid trading
    this.config = {
      stateDim,
      actionDim,
      learningRate: 0.0003,
      gamma: 0.99,
      epsilon: 0.2,
      ...config,
    };

    // Validate dimensions
    if (this.config.stateDim !== 20) {
      logger.warn(`[GridPPOAgent] Expected 20 state dimensions, got ${this.config.stateDim}. Adjusting...`);
      this.config.stateDim = 20;
    }

    if (this.config.actionDim !== 5) {
      logger.warn(`[GridPPOAgent] Expected 5 action dimensions, got ${this.config.actionDim}. Adjusting...`);
      this.config.actionDim = 5;
    }

    this.memory = {
      states: [],
      actions: [],
      rewards: [],
      dones: [],
    };

    logger.info('[GridPPOAgent] Initialized with config:', this.config);
  }

  /**
   * Build actor network (policy) for continuous actions
   */
  private buildActor(): tf.LayersModel {
    const input = tf.input({ shape: [this.config.stateDim] });
    
    // Hidden layers - deeper network for grid trading complexity
    let x = tf.layers.dense({ units: 256, activation: 'relu' }).apply(input) as tf.SymbolicTensor;
    x = tf.layers.dense({ units: 128, activation: 'relu' }).apply(x) as tf.SymbolicTensor;
    x = tf.layers.dense({ units: 64, activation: 'relu' }).apply(x) as tf.SymbolicTensor;
    
    // Output layer - sigmoid for continuous actions in [0,1]
    const output = tf.layers.dense({ 
      units: this.config.actionDim, 
      activation: 'sigmoid'  // Outputs in [0,1] range
    }).apply(x) as tf.SymbolicTensor;

    const model = tf.model({ inputs: input, outputs: output });
    
    model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: 'meanSquaredError',
    });

    logger.info('[GridPPOAgent] Actor network built');
    return model;
  }

  /**
   * Build critic network (value function)
   */
  private buildCritic(): tf.LayersModel {
    const input = tf.input({ shape: [this.config.stateDim] });
    
    // Hidden layers
    let x = tf.layers.dense({ units: 256, activation: 'relu' }).apply(input) as tf.SymbolicTensor;
    x = tf.layers.dense({ units: 128, activation: 'relu' }).apply(x) as tf.SymbolicTensor;
    x = tf.layers.dense({ units: 64, activation: 'relu' }).apply(x) as tf.SymbolicTensor;
    
    // Output layer - single value for state value
    const output = tf.layers.dense({ units: 1 }).apply(x) as tf.SymbolicTensor;

    const model = tf.model({ inputs: input, outputs: output });
    
    model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: 'meanSquaredError',
    });

    logger.info('[GridPPOAgent] Critic network built');
    return model;
  }

  /**
   * Get continuous action vector from current policy
   * @param state - 20-dimensional state vector
   * @returns 5-dimensional action vector with values in [0,1]
   */
  async getAction(state: number[]): Promise<number[]> {
    // Validate state dimensions
    if (state.length !== this.config.stateDim) {
      throw new Error(
        `[GridPPOAgent] State dimension mismatch. Expected ${this.config.stateDim}, got ${state.length}`
      );
    }

    // Initialize actor if not already done
    if (!this.actor) {
      this.actor = this.buildActor();
    }

    // Convert state to tensor and get action
    const stateTensor = tf.tensor2d([state], [1, this.config.stateDim]);
    const actionTensor = this.actor.predict(stateTensor) as tf.Tensor;
    const actionArray = await actionTensor.data();
    
    // Cleanup tensors
    stateTensor.dispose();
    actionTensor.dispose();

    // Return action vector [0,1]^5
    return Array.from(actionArray);
  }

  /**
   * Load pre-trained model from file
   */
  async loadModel(modelPath: string): Promise<void> {
    try {
      logger.info(`[GridPPOAgent] Loading model from ${modelPath}...`);
      
      // Load actor and critic models
      this.actor = await tf.loadLayersModel(`file://${modelPath}/actor/model.json`);
      this.critic = await tf.loadLayersModel(`file://${modelPath}/critic/model.json`);
      
      logger.info('[GridPPOAgent] Model loaded successfully');
    } catch (error) {
      logger.error('[GridPPOAgent] Error loading model:', error);
      // Fall back to random initialization
      logger.warn('[GridPPOAgent] Falling back to random initialization');
      this.actor = this.buildActor();
      this.critic = this.buildCritic();
    }
  }

  /**
   * Save model to file
   */
  async saveModel(modelPath: string): Promise<void> {
    try {
      if (!this.actor || !this.critic) {
        throw new Error('[GridPPOAgent] No model to save');
      }

      logger.info(`[GridPPOAgent] Saving model to ${modelPath}...`);
      
      await this.actor.save(`file://${modelPath}/actor`);
      await this.critic.save(`file://${modelPath}/critic`);
      
      logger.info('[GridPPOAgent] Model saved successfully');
    } catch (error) {
      logger.error('[GridPPOAgent] Error saving model:', error);
      throw error;
    }
  }

  /**
   * Store experience in memory for training
   */
  storeExperience(state: number[], action: number[], reward: number, done: boolean): void {
    this.memory.states.push(state);
    this.memory.actions.push(action);
    this.memory.rewards.push(reward);
    this.memory.dones.push(done);
  }

  /**
   * Clear experience memory
   */
  clearMemory(): void {
    this.memory = {
      states: [],
      actions: [],
      rewards: [],
      dones: [],
    };
  }

  /**
   * Get memory size
   */
  getMemorySize(): number {
    return this.memory.states.length;
  }

  /**
   * Train on collected experiences (simplified PPO update)
   */
  async train(epochs: number = 10): Promise<void> {
    if (this.memory.states.length === 0) {
      logger.warn('[GridPPOAgent] No experiences to train on');
      return;
    }

    if (!this.actor || !this.critic) {
      this.actor = this.buildActor();
      this.critic = this.buildCritic();
    }

    logger.info(`[GridPPOAgent] Training on ${this.memory.states.length} experiences for ${epochs} epochs`);

    // Convert experiences to tensors
    const statesTensor = tf.tensor2d(this.memory.states);
    const actionsTensor = tf.tensor2d(this.memory.actions);
    const rewardsTensor = tf.tensor1d(this.memory.rewards);

    // Calculate returns (discounted rewards)
    const returns: number[] = [];
    let runningReturn = 0;
    for (let i = this.memory.rewards.length - 1; i >= 0; i--) {
      runningReturn = this.memory.rewards[i] + this.config.gamma * runningReturn * (this.memory.dones[i] ? 0 : 1);
      returns.unshift(runningReturn);
    }
    const returnsTensor = tf.tensor1d(returns);

    // Train for multiple epochs
    for (let epoch = 0; epoch < epochs; epoch++) {
      // Train critic
      await this.critic.fit(statesTensor, returnsTensor, {
        epochs: 1,
        verbose: 0,
      });

      // Train actor (simplified - in full PPO would use advantage and clipping)
      await this.actor.fit(statesTensor, actionsTensor, {
        epochs: 1,
        verbose: 0,
      });
    }

    // Cleanup
    statesTensor.dispose();
    actionsTensor.dispose();
    rewardsTensor.dispose();
    returnsTensor.dispose();

    logger.info('[GridPPOAgent] Training complete');
  }
}

export default GridPPOAgent;

