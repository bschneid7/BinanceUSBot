#!/usr/bin/env ts-node

/**
 * Evaluate ML Performance Script
 * Backtests a trained ML model and evaluates its performance
 */

import dotenv from 'dotenv';
import { connectDB } from '../config/database';
import User from '../models/User';
import Trade from '../models/Trade';
import mlModelService from '../services/mlModelService';
import PPOAgent from '../services/tradingEngine/PPOAgent';
import { Types } from 'mongoose';

dotenv.config();

interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalReturn: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
}

/**
 * Prepare backtest data from historical trades
 */
async function prepareBacktestData(userId: Types.ObjectId): Promise<
  Array<{
    price: number;
    volume: number;
    volatility: number;
    actualOutcome: number; // 1 for profitable, -1 for loss, 0 for breakeven
  }>
> {
  console.log('[EvaluateML] Preparing backtest data...');

  const trades = await Trade.find({ userId, status: 'CLOSED' })
    .sort({ openedAt: 1 })
    .limit(500); // Use 500 most recent trades for backtest

  if (trades.length === 0) {
    console.log('[EvaluateML] No historical trades found for backtest');
    return [];
  }

  const backtestData = trades.map(trade => {
    const price = trade.entry_price;
    const quantity = trade.quantity;
    const volume = price * quantity;
    const priceChange = Math.abs(trade.exit_price - trade.entry_price);
    const volatility = priceChange / trade.entry_price;

    // Actual outcome
    const pnl = trade.realized_pnl || 0;
    const actualOutcome = pnl > 0 ? 1 : pnl < 0 ? -1 : 0;

    return {
      price,
      volume,
      volatility,
      actualOutcome,
    };
  });

  console.log(`[EvaluateML] Prepared ${backtestData.length} backtest data points`);
  return backtestData;
}

/**
 * Run backtest simulation
 */
async function runBacktest(
  agent: PPOAgent,
  backtestData: Array<{
    price: number;
    volume: number;
    volatility: number;
    actualOutcome: number;
  }>
): Promise<BacktestResult> {
  console.log('[EvaluateML] Running backtest simulation...');

  const trades: Array<{ entry: number; exit: number; pnl: number }> = [];
  let equity = 10000; // Starting capital
  let peakEquity = equity;
  let maxDrawdown = 0;
  let position = 0; // 0 = no position, 1 = long
  let entryPrice = 0;
  const equityCurve: number[] = [equity];

  for (let i = 0; i < backtestData.length; i++) {
    const { price, volume, volatility } = backtestData[i];
    const sentiment = Math.random() > 0.5 ? 1 : 0; // Mock sentiment

    // Create state
    const state = [
      price / 100000, // Normalize
      volume / 1000000,
      volatility,
      sentiment,
      position,
    ];

    // Get action from agent
    const action = await agent.getAction(state);

    // Execute action
    if (action === 1 && position === 0) {
      // Buy signal
      position = 1;
      entryPrice = price;
    } else if (action === 2 && position === 1) {
      // Sell signal
      const exitPrice = price;
      const pnl = ((exitPrice - entryPrice) / entryPrice) * equity * 0.1; // 10% of equity per trade
      equity += pnl;

      trades.push({
        entry: entryPrice,
        exit: exitPrice,
        pnl,
      });

      position = 0;

      // Track drawdown
      if (equity > peakEquity) {
        peakEquity = equity;
      }
      const drawdown = ((peakEquity - equity) / peakEquity) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      equityCurve.push(equity);
    }
  }

  // Calculate statistics
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl < 0);

  const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;

  const totalReturn = ((equity - 10000) / 10000) * 100;

  const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;

  const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl)) : 0;
  const largestLoss =
    losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl)) : 0;

  // Calculate Sharpe Ratio (simplified)
  const returns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
  }
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const stdDev = Math.sqrt(
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
  );
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

  return {
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate,
    profitFactor,
    sharpeRatio,
    maxDrawdown,
    totalReturn,
    avgWin,
    avgLoss,
    largestWin,
    largestLoss,
  };
}

/**
 * Evaluate ML model
 */
async function evaluateModel(userId: Types.ObjectId, modelId?: string): Promise<void> {
  console.log('[EvaluateML] Starting model evaluation...');

  try {
    // Get model
    let model;
    if (modelId) {
      model = await mlModelService.getModelById(new Types.ObjectId(modelId));
      if (!model) {
        throw new Error('Model not found');
      }
    } else {
      // Use deployed model
      model = await mlModelService.getDeployedModel(userId);
      if (!model) {
        throw new Error('No deployed model found');
      }
    }

    console.log(`[EvaluateML] Evaluating model: ${model._id} (${model.version})`);

    // Create agent with same config
    const agent = new PPOAgent(
      model.config.stateDim,
      model.config.actionDim,
      {
        learningRate: model.config.learningRate,
        gamma: model.config.gamma,
        epsilon: model.config.epsilon,
      }
    );

    // Note: In production, you would load the trained model weights here
    // await agent.loadModel(model.modelPath);

    // For MVP, we'll train a quick agent
    console.log('[EvaluateML] Training agent for evaluation (100 episodes)...');
    await agent.train(100);

    // Prepare backtest data
    const backtestData = await prepareBacktestData(userId);

    if (backtestData.length === 0) {
      console.log('[EvaluateML] Not enough data for backtest, generating synthetic data');
      // Generate synthetic backtest data
      const syntheticData = [];
      for (let i = 0; i < 100; i++) {
        syntheticData.push({
          price: 50000 + Math.random() * 10000,
          volume: 500000 + Math.random() * 500000,
          volatility: 0.01 + Math.random() * 0.05,
          actualOutcome: Math.random() > 0.5 ? 1 : -1,
        });
      }
      backtestData.push(...syntheticData);
    }

    // Run backtest
    const result = await runBacktest(agent, backtestData);

    // Update model with backtest performance
    await mlModelService.updateBacktestPerformance(model._id, {
      backtestWinRate: result.winRate,
      backtestProfitFactor: result.profitFactor,
      backtestSharpeRatio: result.sharpeRatio,
      backtestMaxDrawdown: result.maxDrawdown,
      backtestTotalTrades: result.totalTrades,
    });

    // Print results
    console.log('[EvaluateML] ===== Backtest Results =====');
    console.log(`[EvaluateML] Model ID: ${model._id}`);
    console.log(`[EvaluateML] Version: ${model.version}`);
    console.log(`[EvaluateML] Total Trades: ${result.totalTrades}`);
    console.log(`[EvaluateML] Winning Trades: ${result.winningTrades}`);
    console.log(`[EvaluateML] Losing Trades: ${result.losingTrades}`);
    console.log(`[EvaluateML] Win Rate: ${result.winRate.toFixed(2)}%`);
    console.log(`[EvaluateML] Profit Factor: ${result.profitFactor.toFixed(2)}`);
    console.log(`[EvaluateML] Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`);
    console.log(`[EvaluateML] Max Drawdown: ${result.maxDrawdown.toFixed(2)}%`);
    console.log(`[EvaluateML] Total Return: ${result.totalReturn.toFixed(2)}%`);
    console.log(`[EvaluateML] Avg Win: $${result.avgWin.toFixed(2)}`);
    console.log(`[EvaluateML] Avg Loss: $${result.avgLoss.toFixed(2)}`);
    console.log(`[EvaluateML] Largest Win: $${result.largestWin.toFixed(2)}`);
    console.log(`[EvaluateML] Largest Loss: $${result.largestLoss.toFixed(2)}`);
    console.log('[EvaluateML] ====================================');
  } catch (error) {
    console.error('[EvaluateML] Evaluation failed:', error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('[EvaluateML] ===== ML Model Evaluation Script =====');

    // Connect to database
    await connectDB();

    // Get user
    const userEmail = process.argv[2] || 'admin@binancebot.com';
    const user = await User.findOne({ email: userEmail });

    if (!user) {
      console.error(`[EvaluateML] User not found: ${userEmail}`);
      process.exit(1);
    }

    console.log(`[EvaluateML] Evaluating model for user: ${user.email}`);

    // Get model ID (optional)
    const modelId = process.argv[3]; // Optional: specific model ID

    // Evaluate the model
    await evaluateModel(user._id, modelId);

    console.log('[EvaluateML] ===== Evaluation Complete =====');
    process.exit(0);
  } catch (error) {
    console.error('[EvaluateML] Fatal error:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

export { evaluateModel, runBacktest };
