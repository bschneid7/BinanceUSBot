/**
 * PPO (Proximal Policy Optimization) Trading Agent
 * 
 * Reinforcement learning agent that learns optimal trading decisions
 * Runs in shadow mode to validate performance before live deployment
 */

import logger from '../../utils/logger';
import { metricsService } from '../metricsService';
import { Types } from 'mongoose';

export interface TradingState {
  // Price features
  currentPrice: number;
  priceChange1h: number;
  priceChange4h: number;
  priceChange24h: number;
  
  // Technical indicators
  rsi: number;
  macd: number;
  macdSignal: number;
  atr: number;
  
  // Volume features
  volume24h: number;
  volumeChange: number;
  
  // Position features
  hasPosition: boolean;
  positionSize: number;
  positionPnl: number;
  positionAge: number;
  
  // Portfolio features
  equity: number;
  openPositions: number;
  portfolioHeat: number;
  
  // Market regime
  volatility: number;
  trend: number; // -1 to 1
  correlation: number;
}

export interface TradingAction {
  action: 'HOLD' | 'BUY' | 'SELL' | 'CLOSE';
  positionSize?: number; // 0 to 1 (percentage of equity)
  confidence: number; // 0 to 1
}

export interface PPOPrediction {
  symbol: string;
  timestamp: Date;
  state: TradingState;
  action: TradingAction;
  expectedReward: number;
  shadowMode: boolean;
}

export interface PPOTrainingConfig {
  learningRate: number;
  gamma: number; // Discount factor
  epsilon: number; // Clip parameter
  epochs: number;
  batchSize: number;
  horizon: number; // Steps per episode
}

class PPOAgent {
  private static instance: PPOAgent;
  private isInitialized: boolean = false;
  private shadowMode: boolean = true; // Always start in shadow mode
  private predictions: PPOPrediction[] = [];
  
  // PPO hyperparameters
  private config: PPOTrainingConfig = {
    learningRate: 0.0003,
    gamma: 0.99,
    epsilon: 0.2,
    epochs: 10,
    batchSize: 64,
    horizon: 2048
  };

  // Model state (in production, this would be loaded from a trained model)
  private modelVersion: string = 'v1.0.0-untrained';
  private trainingSteps: number = 0;

  private constructor() {
    logger.info('[PPOAgent] Initialized in shadow mode');
  }

  static getInstance(): PPOAgent {
    if (!PPOAgent.instance) {
      PPOAgent.instance = new PPOAgent();
    }
    return PPOAgent.instance;
  }

  /**
   * Initialize PPO agent
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('[PPOAgent] Already initialized');
      return;
    }

    try {
      logger.info('[PPOAgent] Initializing PPO agent...');
      
      // In production, load trained model weights here
      // For now, we'll use a rule-based proxy until training is complete
      
      this.isInitialized = true;
      logger.info('[PPOAgent] Initialization complete');
      
    } catch (error: any) {
      logger.error('[PPOAgent] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get trading action for current state
   */
  async getAction(
    symbol: string,
    state: TradingState
  ): Promise<TradingAction> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // In production, this would use the trained PPO model
      // For now, use a rule-based proxy that mimics PPO behavior
      const action = this.ruleBasedProxy(state);
      
      // Record prediction for shadow mode tracking
      const prediction: PPOPrediction = {
        symbol,
        timestamp: new Date(),
        state,
        action,
        expectedReward: this.estimateReward(state, action),
        shadowMode: this.shadowMode
      };
      
      this.predictions.push(prediction);
      
      // Keep only last 1000 predictions
      if (this.predictions.length > 1000) {
        this.predictions.shift();
      }
      
      // Update metrics
      metricsService.incrementCounter('ppo_predictions_total', 1);
      metricsService.setGauge('ppo_shadow_mode', this.shadowMode ? 1 : 0);
      
      return action;
      
    } catch (error: any) {
      logger.error('[PPOAgent] Error getting action:', error);
      
      // Return safe default action
      return {
        action: 'HOLD',
        confidence: 0
      };
    }
  }

  /**
   * Rule-based proxy (placeholder until PPO model is trained)
   * This mimics what a trained PPO agent might learn
   */
  private ruleBasedProxy(state: TradingState): TradingAction {
    // Strong uptrend + low RSI + no position = BUY
    if (
      !state.hasPosition &&
      state.trend > 0.5 &&
      state.rsi < 40 &&
      state.openPositions < 15 &&
      state.portfolioHeat < 0.5
    ) {
      return {
        action: 'BUY',
        positionSize: 0.02, // 2% of equity
        confidence: 0.7
      };
    }

    // Strong downtrend + high RSI + no position = SELL
    if (
      !state.hasPosition &&
      state.trend < -0.5 &&
      state.rsi > 60 &&
      state.openPositions < 15 &&
      state.portfolioHeat < 0.5
    ) {
      return {
        action: 'SELL',
        positionSize: 0.02,
        confidence: 0.7
      };
    }

    // Has position + good profit = CLOSE
    if (
      state.hasPosition &&
      state.positionPnl > 0.02 // 2% profit
    ) {
      return {
        action: 'CLOSE',
        confidence: 0.8
      };
    }

    // Has position + stop loss = CLOSE
    if (
      state.hasPosition &&
      state.positionPnl < -0.01 // 1% loss
    ) {
      return {
        action: 'CLOSE',
        confidence: 0.9
      };
    }

    // Default: HOLD
    return {
      action: 'HOLD',
      confidence: 0.5
    };
  }

  /**
   * Estimate expected reward for state-action pair
   */
  private estimateReward(state: TradingState, action: TradingAction): number {
    // Simple reward estimation
    // In production, this would use the value function from PPO
    
    if (action.action === 'CLOSE' && state.positionPnl > 0) {
      return state.positionPnl; // Realized profit
    }
    
    if (action.action === 'BUY' || action.action === 'SELL') {
      // Estimate based on trend strength and RSI
      const trendReward = state.trend * 0.02;
      const rsiReward = (action.action === 'BUY' ? (50 - state.rsi) : (state.rsi - 50)) / 1000;
      return trendReward + rsiReward;
    }
    
    return 0;
  }

  /**
   * Record actual outcome for learning
   */
  async recordOutcome(
    symbol: string,
    prediction: PPOPrediction,
    actualReward: number
  ): Promise<void> {
    try {
      // In production, this would update the PPO model
      // For now, just track for comparison
      
      const predictionError = Math.abs(prediction.expectedReward - actualReward);
      
      logger.info('[PPOAgent] Outcome recorded', {
        symbol,
        action: prediction.action.action,
        expectedReward: prediction.expectedReward.toFixed(4),
        actualReward: actualReward.toFixed(4),
        error: predictionError.toFixed(4)
      });
      
      // Update metrics
      metricsService.setGauge('ppo_prediction_error', predictionError);
      metricsService.setGauge('ppo_actual_reward', actualReward);
      
    } catch (error: any) {
      logger.error('[PPOAgent] Error recording outcome:', error);
    }
  }

  /**
   * Get shadow mode predictions for comparison
   */
  getShadowPredictions(limit: number = 100): PPOPrediction[] {
    return this.predictions.slice(-limit);
  }

  /**
   * Enable/disable shadow mode
   */
  setShadowMode(enabled: boolean): void {
    this.shadowMode = enabled;
    logger.info(`[PPOAgent] Shadow mode ${enabled ? 'enabled' : 'disabled'}`);
    metricsService.setGauge('ppo_shadow_mode', enabled ? 1 : 0);
  }

  /**
   * Get shadow mode status
   */
  isShadowMode(): boolean {
    return this.shadowMode;
  }

  /**
   * Get agent statistics
   */
  getStats(): {
    modelVersion: string;
    trainingSteps: number;
    shadowMode: boolean;
    totalPredictions: number;
    recentPredictions: number;
  } {
    return {
      modelVersion: this.modelVersion,
      trainingSteps: this.trainingSteps,
      shadowMode: this.shadowMode,
      totalPredictions: this.predictions.length,
      recentPredictions: this.predictions.filter(
        p => Date.now() - p.timestamp.getTime() < 3600000 // Last hour
      ).length
    };
  }

  /**
   * Update model version (after training)
   */
  updateModel(version: string, steps: number): void {
    this.modelVersion = version;
    this.trainingSteps = steps;
    logger.info(`[PPOAgent] Model updated to ${version} (${steps} steps)`);
  }
}

export const ppoAgent = PPOAgent.getInstance();
