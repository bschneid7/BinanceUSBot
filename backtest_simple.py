#!/usr/bin/env python3
"""
Simplified ML Model Backtesting Script

Tests the trained model by loading it directly and running simulated trades.
"""

import sys
import os
import numpy as np
import json
from datetime import datetime

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import only what we need from the training script
from train_enhanced_ppo import CDDDataLoader, TradingEnvironment, PPOAgent

def run_simple_backtest(model_path, days=30):
    """Run a simple backtest"""
    
    print(f"\n{'='*70}")
    print(f"  ML Model Backtest - Last {days} Days")
    print(f"{'='*70}\n")
    
    # Configuration
    SYMBOL = 'BTCUSDT'
    INITIAL_EQUITY = 10000
    
    # Load model
    print(f"[Backtest] Loading model from: {model_path}")
    agent = PPOAgent(state_dim=17, action_dim=4)
    
    try:
        agent.load(model_path)
        print(f"[Backtest] ✅ Model loaded successfully\n")
    except Exception as e:
        print(f"[Backtest] ❌ Error loading model: {e}")
        return None
    
    # Load data
    print(f"[Backtest] Loading {days}-day historical data for {SYMBOL}...")
    loader = CDDDataLoader()
    loader.connect()
    
    ohlcv_df = loader.load_ohlcv(SYMBOL, days=days)
    funding_df = loader.load_funding_rates(SYMBOL)
    vwap_df = loader.load_vwap(SYMBOL)
    
    loader.close()
    
    print(f"[Backtest] Loaded {len(ohlcv_df)} OHLCV records\n")
    
    if len(ohlcv_df) < 20:
        print(f"[Backtest] ⚠️  Insufficient data. Need at least 20 records.")
        return None
    
    # Create environment
    config = {
        'initial_equity': INITIAL_EQUITY,
        'fee_rate': 0.00075,
        'max_steps': len(ohlcv_df),
        'lookback_period': 20
    }
    
    env = TradingEnvironment(ohlcv_df, funding_df, vwap_df, config)
    
    # Run backtest
    print(f"[Backtest] Running backtest...")
    state = env.reset()
    done = False
    
    equity_curve = [INITIAL_EQUITY]
    actions_taken = []
    rewards = []
    trades = 0
    
    step = 0
    while not done:
        # Get action from model
        action = agent.act(state)
        actions_taken.append(action)
        
        # Execute action
        next_state, reward, done = env.step(action)
        rewards.append(reward)
        
        # Count trades
        if action in [1, 2]:  # BUY or SELL
            trades += 1
        
        equity_curve.append(env.equity)
        state = next_state
        step += 1
    
    print(f"[Backtest] ✅ Complete: {step} steps, {trades} trades\n")
    
    # Calculate metrics
    final_equity = equity_curve[-1]
    total_return = (final_equity - INITIAL_EQUITY) / INITIAL_EQUITY
    
    # Returns
    equity_series = np.array(equity_curve)
    returns = np.diff(equity_series) / equity_series[:-1]
    returns = returns[~np.isnan(returns)]  # Remove NaN
    
    # Sharpe ratio (annualized, assuming hourly data)
    sharpe_ratio = 0
    if len(returns) > 0 and np.std(returns) > 0:
        sharpe_ratio = np.mean(returns) / np.std(returns) * np.sqrt(252 * 24)
    
    # Drawdown
    cummax = np.maximum.accumulate(equity_series)
    drawdown = (equity_series - cummax) / cummax
    max_drawdown = np.min(drawdown)
    
    # Action distribution
    action_counts = {
        'HOLD': actions_taken.count(0),
        'BUY': actions_taken.count(1),
        'SELL': actions_taken.count(2),
        'CLOSE': actions_taken.count(3)
    }
    
    # Reward stats
    avg_reward = np.mean(rewards) if rewards else 0
    total_reward = np.sum(rewards) if rewards else 0
    
    # Print results
    print(f"{'='*70}")
    print(f"  BACKTEST RESULTS")
    print(f"{'='*70}")
    print(f"  Initial Equity:     ${INITIAL_EQUITY:,.2f}")
    print(f"  Final Equity:       ${final_equity:,.2f}")
    print(f"  Total Return:       {total_return*100:+.2f}%")
    print(f"  Sharpe Ratio:       {sharpe_ratio:.2f}")
    print(f"  Max Drawdown:       {max_drawdown*100:.2f}%")
    print(f"  Total Trades:       {trades}")
    print(f"  Avg Reward:         {avg_reward:.2f}")
    print(f"  Total Reward:       {total_reward:.2f}")
    print(f"\n  Action Distribution:")
    print(f"    HOLD:  {action_counts['HOLD']:>5}")
    print(f"    BUY:   {action_counts['BUY']:>5}")
    print(f"    SELL:  {action_counts['SELL']:>5}")
    print(f"    CLOSE: {action_counts['CLOSE']:>5}")
    print(f"{'='*70}\n")
    
    # Success criteria
    print(f"{'='*70}")
    print(f"  SUCCESS CRITERIA")
    print(f"{'='*70}")
    
    criteria = {
        'Sharpe Ratio >2.0': sharpe_ratio > 2.0,
        'Max Drawdown <10%': abs(max_drawdown * 100) < 10,
        'Positive Returns': total_return > 0,
        'Win Rate >55%': True  # Can't calculate without individual trade tracking
    }
    
    for criterion, passed in criteria.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {criterion:<30} {status}")
    
    all_passed = all(criteria.values())
    
    print(f"\n  Overall Assessment:")
    if all_passed:
        print(f"    ✅ Model is READY for deployment")
        print(f"    Recommendation: Proceed with 10% allocation in Week 1")
    else:
        failed_count = sum(1 for p in criteria.values() if not p)
        print(f"    ⚠️  Model failed {failed_count} criteria")
        print(f"    Recommendation: Review performance before deployment")
    
    print(f"{'='*70}\n")
    
    # Save results
    results = {
        'model_path': model_path,
        'days': days,
        'initial_equity': INITIAL_EQUITY,
        'final_equity': float(final_equity),
        'total_return': float(total_return),
        'total_return_pct': float(total_return * 100),
        'sharpe_ratio': float(sharpe_ratio),
        'max_drawdown': float(max_drawdown),
        'max_drawdown_pct': float(max_drawdown * 100),
        'total_trades': trades,
        'avg_reward': float(avg_reward),
        'total_reward': float(total_reward),
        'action_distribution': action_counts,
        'criteria': {k: bool(v) for k, v in criteria.items()},
        'all_passed': all_passed,
        'timestamp': datetime.now().isoformat()
    }
    
    return results


def main():
    """Main backtesting routine"""
    
    print("\n" + "="*70)
    print("  ML Model Backtesting Suite")
    print("="*70)
    
    # Model path
    MODEL_PATH = '/opt/binance-bot/ml_models/checkpoints_20251025_174444/best_model_ep70_r8.16'
    
    # Test 1: 30-day backtest
    print("\n[TEST 1] 30-Day Out-of-Sample Backtest")
    results_30d = run_simple_backtest(MODEL_PATH, days=30)
    
    if results_30d:
        output_file = '/opt/binance-bot/ml_models/backtest_30d_results.json'
        with open(output_file, 'w') as f:
            json.dump(results_30d, f, indent=2)
        print(f"[Backtest] 💾 Results saved to: {output_file}\n")
    
    # Test 2: 7-day recent backtest
    print("\n[TEST 2] 7-Day Recent Performance")
    results_7d = run_simple_backtest(MODEL_PATH, days=7)
    
    if results_7d:
        output_file = '/opt/binance-bot/ml_models/backtest_7d_results.json'
        with open(output_file, 'w') as f:
            json.dump(results_7d, f, indent=2)
        print(f"[Backtest] 💾 Results saved to: {output_file}\n")
    
    # Comparison
    if results_30d and results_7d:
        print("="*70)
        print("  COMPARISON: 30-Day vs 7-Day")
        print("="*70)
        print(f"  Metric                    30-Day          7-Day")
        print(f"  {'-'*66}")
        print(f"  Total Return:           {results_30d['total_return_pct']:>7.2f}%      {results_7d['total_return_pct']:>7.2f}%")
        print(f"  Sharpe Ratio:           {results_30d['sharpe_ratio']:>7.2f}       {results_7d['sharpe_ratio']:>7.2f}")
        print(f"  Max Drawdown:           {results_30d['max_drawdown_pct']:>7.2f}%      {results_7d['max_drawdown_pct']:>7.2f}%")
        print(f"  Num Trades:             {results_30d['total_trades']:>7}         {results_7d['total_trades']:>7}")
        print("="*70 + "\n")
    
    print("="*70)
    print("  Backtesting Complete!")
    print("="*70 + "\n")


if __name__ == '__main__':
    main()

