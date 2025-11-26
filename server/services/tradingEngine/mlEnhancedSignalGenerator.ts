import { Types } from 'mongoose';
import PPOAgent from './PPOAgent';
import signalGenerator, { Signal } from './signalGenerator';
import mlModelService from '../mlModelService';
import BotConfig from '../../models/BotConfig';
import BotState from '../../models/BotState';
import MLPerformanceLog from '../../models/MLPerformanceLog';

/**
 * ML-Enhanced Signal Generator
 * Combines rule-based signals with ML model predictions to improve signal quality
 */

class MLEnhancedSignalGenerator {
  private ppoAgents: Map<string, PPOAgent> = new Map();

  /**
   * Get or create PPO agent for user
   */
  private async getPPOAgent(userId: Types.ObjectId): Promise<PPOAgent | null> {
    try {
      const userIdStr = userId.toString();

      // Check if agent already exists in memory
      if (this.ppoAgents.has(userIdStr)) {
        return this.ppoAgents.get(userIdStr)!;
      }

      // Check if user has a deployed ML model
      const deployedModel = await mlModelService.getDeployedModel(userId);

      if (!deployedModel) {
        console.log(`[MLEnhancedSigGen] No deployed ML model for user ${userId}`);
        return null;
      }

      console.log(
        `[MLEnhancedSigGen] Loading deployed model ${deployedModel._id} for user ${userId}`
      );

      // Create agent with deployed model config
      const agent = new PPOAgent(
        deployedModel.config.stateDim,
        deployedModel.config.actionDim,
        {
          learningRate: deployedModel.config.learningRate,
          gamma: deployedModel.config.gamma,
          epsilon: deployedModel.config.epsilon,
        }
      );

      // Note: In production, you would load the trained model weights here
      // if (deployedModel.modelPath) {
      //   await agent.loadModel(deployedModel.modelPath);
      // }

      // Store agent in memory
      this.ppoAgents.set(userIdStr, agent);

      return agent;
    } catch (error) {
      console.error('[MLEnhancedSigGen] Error getting PPO agent:', error);
      return null;
    }
  }

  /**
   * Validate if price adjustment is within ML tolerance
   * Called after maker-first adjusts price
   */
  async validatePriceAdjustment(
    userId: Types.ObjectId,
    signal: Signal,
    originalPrice: number,
    adjustedPrice: number
  ): Promise<{
    approved: boolean;
    reason: string;
    slippageBps: number;
  }> {
    try {
      // Calculate price difference in basis points
      const slippageBps = Math.abs((adjustedPrice - originalPrice) / originalPrice) * 10000;

      // Get user config for ML price tolerance
      const config = await BotConfig.findOne({ userId });
      const mlPriceTolerance = config?.execution?.ml_price_tolerance_bps || 15;

      // Check if within tolerance
      if (slippageBps <= mlPriceTolerance) {
        return {
          approved: true,
          reason: `Price adjustment ${slippageBps.toFixed(2)}bps within ML tolerance ${mlPriceTolerance}bps`,
          slippageBps,
        };
      }

      // Price shift exceeds ML tolerance
      console.log(
        `[MLEnhancedSigGen] Price adjustment ${slippageBps.toFixed(2)}bps exceeds ML tolerance ${mlPriceTolerance}bps for ${signal.symbol}`
      );

      return {
        approved: false,
        reason: `Price adjustment ${slippageBps.toFixed(2)}bps exceeds ML tolerance ${mlPriceTolerance}bps`,
        slippageBps,
      };
    } catch (error) {
      console.error('[MLEnhancedSigGen] Error validating price adjustment:', error);
      // On error, approve to avoid blocking trades
      return {
        approved: true,
        reason: 'Error in validation, defaulting to approve',
        slippageBps: 0,
      };
    }
  }

  /**
   * Prepare state vector for ML model
   */
  private prepareState(
    marketData: {
      symbol: string;
      price: number;
      volume: number;
      volatility: number;
    },
    currentPosition: number // 0 = no position, 1 = long
  ): number[] {
    // FIXED: Return 17 dimensions to match trained model
    // Normalize features
    const normalizedPrice = marketData.price / 100000; // Normalize to ~0-1 range
    const normalizedVolume = marketData.volume / 10000000; // Normalize volume
    const normalizedVolatility = Math.min(marketData.volatility, 1.0); // Cap at 1.0

    // Mock values for features not available in real-time (would be calculated from market data)
    const latestReturn = 0.0; // Would calculate from price history
    const avgReturn5 = 0.0; // 5-period average return
    const volatility5 = normalizedVolatility; // Use provided volatility
    const rsi = 0.5; // Neutral RSI (would calculate from price history)
    const macd = 0.0; // MACD indicator
    const signal = 0.0; // MACD signal
    const fundingRate = 0.0; // CDD: Current funding rate (not available for spot)
    const fundingTrend = 0.0; // CDD: 7-day funding trend
    const vwapDeviation = 0.0; // CDD: VWAP deviation
    const orderFlow = 0.0; // CDD: Order flow imbalance
    const correlation = 0.5; // CDD: Correlation score (neutral)
    const hasPosition = currentPosition; // 0 or 1
    const positionPnl = 0.0; // Position PnL (would calculate from actual position)
    const normalizedEquity = 0.0; // Account equity change
    const drawdown = 0.0; // Account drawdown

    // Return 17-dimensional state vector matching training
    return [
      normalizedPrice,    // 1. Latest normalized price
      latestReturn,       // 2. Latest return
      normalizedVolume,   // 3. Latest normalized volume
      avgReturn5,         // 4. 5-period avg return
      volatility5,        // 5. 5-period volatility
      rsi,                // 6. RSI indicator
      macd,               // 7. MACD
      signal,             // 8. MACD signal
      fundingRate,        // 9. CDD: Current funding rate
      fundingTrend,       // 10. CDD: 7-day funding trend
      vwapDeviation,      // 11. CDD: VWAP deviation
      orderFlow,          // 12. CDD: Order flow imbalance
      correlation,        // 13. CDD: Correlation score
      hasPosition,        // 14. Position indicator
      positionPnl,        // 15. Position PnL
      normalizedEquity,   // 16. Account equity
      drawdown            // 17. Account drawdown
    ];
  }

  /**
   * Get ML model prediction for a signal
   */
  private async getMLPrediction(
    userId: Types.ObjectId,
    signal: Signal,
    marketData: {
      symbol: string;
      price: number;
      volume: number;
      volatility: number;
    }
  ): Promise<{
    action: number;
    actionName: string;
    confidence: number;
  } | null> {
    try {
      const agent = await this.getPPOAgent(userId);

      if (!agent) {
        return null;
      }

      // Check if user has open position in this symbol
      const state = await BotState.findOne({ userId });
      const currentPosition = 0; // Simplified: 0 for now, would check actual positions

      // Prepare state
      const stateVector = this.prepareState(marketData, currentPosition);

      // Get action from agent
      const action = await agent.getAction(stateVector);

      const actionNames = ['hold', 'buy', 'sell'];
      const actionName = actionNames[action] || 'unknown';

      // Calculate confidence (simplified - would use action probabilities in production)
      const confidence = 0.7 + Math.random() * 0.3; // Mock confidence 70-100%

      console.log(
        `[MLEnhancedSigGen] ML prediction for ${signal.symbol}: ${actionName} (confidence: ${(confidence * 100).toFixed(1)}%)`
      );

      return {
        action,
        actionName,
        confidence,
      };
    } catch (error) {
      console.error('[MLEnhancedSigGen] Error getting ML prediction:', error);
      return null;
    }
  }

  /**
   * Generate ML-enhanced signals
   * Combines rule-based signals with ML predictions for better quality
   */
  async generateSignals(
    userId: Types.ObjectId,
    marketData: Array<{
      symbol: string;
      price: number;
      volume: number;
      spread_bps: number;
      depth_usd: number;
      atr: number;
      volatility: number;
      vwap?: number;
    }>
  ): Promise<Signal[]> {
    try {
      console.log('[MLEnhancedSigGen] Generating ML-enhanced signals...');

      // Get config to check if ML enhancement is enabled
      const config = await BotConfig.findOne({ userId });

      // Generate rule-based signals
      const ruleBasedSignals = await signalGenerator.generateSignals(userId, marketData);

      console.log(`[MLEnhancedSigGen] Generated ${ruleBasedSignals.length} rule-based signals`);

      // If ML enhancement is disabled, return rule-based signals
      if (!config || !process.env.ML_ENHANCED_SIGNALS || process.env.ML_ENHANCED_SIGNALS !== 'true') {
        console.log('[MLEnhancedSigGen] ML enhancement disabled, returning rule-based signals');
        return ruleBasedSignals;
      }

      // Check if user has a deployed model
      const deployedModel = await mlModelService.getDeployedModel(userId);

      if (!deployedModel) {
        console.log('[MLEnhancedSigGen] No deployed model, returning rule-based signals');
        return ruleBasedSignals;
      }

      // Filter signals using ML predictions
      const enhancedSignals: Signal[] = [];

      for (const signal of ruleBasedSignals) {
        // Find market data for this symbol
        const symbolData = marketData.find(m => m.symbol === signal.symbol);

        if (!symbolData) {
          // If no market data, keep the signal
          enhancedSignals.push(signal);
          continue;
        }

        // Get ML prediction
        const mlStartTime = Date.now();
        const mlPrediction = await this.getMLPrediction(userId, signal, symbolData);
        const mlProcessingTime = Date.now() - mlStartTime;

        if (!mlPrediction) {
          // If ML prediction fails, keep the signal
          enhancedSignals.push(signal);
          continue;
        }

        // Determine if ML approves this signal
        let approved = false;
        let rejectionReason: string | undefined;

        // Filter based on ML prediction
        if (signal.action === 'BUY' && mlPrediction.actionName === 'buy') {
          // ML agrees with buy signal - boost confidence
          console.log(
            `[MLEnhancedSigGen] ✓ ML confirms BUY signal for ${signal.symbol} (confidence: ${(mlPrediction.confidence * 100).toFixed(1)}%)`
          );
          approved = true;
          enhancedSignals.push(signal);
        } else if (signal.action === 'BUY' && mlPrediction.actionName === 'hold') {
          // ML suggests hold - reduce confidence but keep if high ML confidence
          if (mlPrediction.confidence < 0.8) {
            console.log(
              `[MLEnhancedSigGen] ✓ ML suggests HOLD for ${signal.symbol}, but low confidence - keeping signal`
            );
            approved = true;
            enhancedSignals.push(signal);
          } else {
            console.log(
              `[MLEnhancedSigGen] ✗ ML strongly suggests HOLD for ${signal.symbol} - filtering out`
            );
            approved = false;
            rejectionReason = `ML strongly suggests HOLD (confidence: ${(mlPrediction.confidence * 100).toFixed(1)}%)`;
          }
        } else if (signal.action === 'BUY' && mlPrediction.actionName === 'sell') {
          // ML strongly disagrees - filter out
          console.log(
            `[MLEnhancedSigGen] ✗ ML predicts SELL for ${signal.symbol} - filtering out BUY signal`
          );
          approved = false;
          rejectionReason = `ML predicts opposite direction (SELL)`;
        } else {
          // Default: keep signal
          approved = true;
          enhancedSignals.push(signal);
        }

        // Log ML performance for this signal
        try {
          await MLPerformanceLog.create({
            userId,
            timestamp: new Date(),
            signal: {
              symbol: signal.symbol,
              action: signal.action,
              playbook: signal.playbook,
              price: signal.entryPrice,
              atr: symbolData.atr,
              volatility: symbolData.volatility,
              volume: symbolData.volume,
              spread_bps: symbolData.spread_bps,
            },
            ml: {
              modelId: deployedModel._id,
              modelVersion: deployedModel.version,
              prediction: mlPrediction.actionName === 'unknown' ? 'hold' : mlPrediction.actionName,
              confidence: mlPrediction.confidence,
              approved,
              rejectionReason,
              processingTimeMs: mlProcessingTime,
            },
            marketContext: {
              priceAtSignal: symbolData.price,
              vwap: symbolData.vwap,
            },
          });
        } catch (logError) {
          console.error('[MLEnhancedSigGen] Error logging ML performance:', logError);
          // Don't fail signal generation if logging fails
        }
      }

      console.log(
        `[MLEnhancedSigGen] After ML enhancement: ${enhancedSignals.length}/${ruleBasedSignals.length} signals`
      );

      // Update live performance periodically
      if (Math.random() < 0.1) {
        // 10% chance to update
        await mlModelService.updateLivePerformance(userId).catch(err => {
          console.error('[MLEnhancedSigGen] Error updating live performance:', err);
        });
      }

      return enhancedSignals;
    } catch (error) {
      console.error('[MLEnhancedSigGen] Error generating ML-enhanced signals:', error);
      // Fall back to rule-based signals on error
      return signalGenerator.generateSignals(userId, marketData);
    }
  }

  /**
   * Clear agent from memory
   */
  clearAgent(userId: Types.ObjectId): void {
    const userIdStr = userId.toString();
    if (this.ppoAgents.has(userIdStr)) {
      this.ppoAgents.delete(userIdStr);
      console.log(`[MLEnhancedSigGen] Cleared PPO agent for user ${userId}`);
    }
  }

  /**
   * Clear all agents from memory
   */
  clearAllAgents(): void {
    this.ppoAgents.clear();
    console.log('[MLEnhancedSigGen] Cleared all PPO agents');
  }
}

export default new MLEnhancedSignalGenerator();
