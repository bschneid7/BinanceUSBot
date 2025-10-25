#!/usr/bin/env python3
"""
ML Model Backtesting Script

Comprehensive backtesting for Enhanced PPO model with CDD features.
Tests model on out-of-sample data and compares against baseline.
"""

import sys
import os
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import json
import matplotlib.pyplot as plt
import seaborn as sns

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from train_enhanced_ppo import (
    CDDDataLoader, TradingEnvironment, PPOAgent, 
    get_state, get_funding_trend, get_funding_rate, 
    get_vwap_deviation, get_order_flow_imbalance, get_correlation_score
)

class MLBacktester:
    """Backtesting framework for ML trading models"""
    
    def __init__(self, model_path: str, initial_equity: float = 10000):
        self.model_path = model_path
        self.initial_equity = initial_equity
        self.loader = CDDDataLoader()
        
        # Load model
        print(f"[Backtest] Loading model from: {model_path}")
        self.agent = PPOAgent(state_dim=17, action_dim=4)
        self.agent.load(model_path)
        print(f"[Backtest] ✅ Model loaded successfully")
    
    def load_data(self, symbol: str, start_date: datetime, end_date: datetime):
        """Load historical data for backtesting"""
        print(f"[Backtest] Loading data for {symbol} from {start_date.date()} to {end_date.date()}")
        
        self.loader.connect()
        
        # Load OHLCV data
        ohlcv_df = self.loader.load_ohlcv(symbol, start_date=start_date, end_date=end_date)
        print(f"[Backtest] Loaded {len(ohlcv_df)} OHLCV records")
        
        # Load funding rates
        funding_df = self.loader.load_funding_rates(symbol)
        print(f"[Backtest] Loaded {len(funding_df)} funding rate records")
        
        # Load VWAP data
        vwap_df = self.loader.load_vwap(symbol)
        print(f"[Backtest] Loaded {len(vwap_df)} VWAP records")
        
        self.loader.close()
        
        return ohlcv_df, funding_df, vwap_df
    
    def run_backtest(self, symbol: str, start_date: datetime, end_date: datetime, 
                     deterministic: bool = True):
        """Run backtest on historical data"""
        
        # Load data
        ohlcv_df, funding_df, vwap_df = self.load_data(symbol, start_date, end_date)
        
        if len(ohlcv_df) < 20:
            print(f"[Backtest] ⚠️ Insufficient data ({len(ohlcv_df)} records). Need at least 20.")
            return None
        
        # Create environment
        config = {
            'initial_equity': self.initial_equity,
            'fee_rate': 0.00075,
            'max_steps': len(ohlcv_df),
            'lookback_period': 20
        }
        
        env = TradingEnvironment(ohlcv_df, funding_df, vwap_df, config)
        
        # Run backtest
        print(f"[Backtest] Running backtest...")
        state = env.reset()
        done = False
        
        trades = []
        equity_curve = [self.initial_equity]
        actions_taken = []
        rewards = []
        
        step = 0
        while not done:
            # Get action from model
            action = self.agent.act(state, deterministic=deterministic)
            actions_taken.append(action)
            
            # Execute action
            next_state, reward, done = env.step(action)
            rewards.append(reward)
            
            # Record trade if action was BUY or SELL
            if action in [1, 2]:  # BUY or SELL
                trade = {
                    'step': step,
                    'timestamp': env.current_timestamp,
                    'action': ['HOLD', 'BUY', 'SELL', 'CLOSE'][action],
                    'price': env.current_price,
                    'equity': env.equity,
                    'position_size': env.position_size if hasattr(env, 'position_size') else 0,
                    'pnl': env.equity - self.initial_equity
                }
                trades.append(trade)
            
            equity_curve.append(env.equity)
            state = next_state
            step += 1
        
        print(f"[Backtest] ✅ Backtest complete: {step} steps, {len(trades)} trades")
        
        # Calculate metrics
        metrics = self.calculate_metrics(equity_curve, trades, rewards)
        
        return {
            'metrics': metrics,
            'trades': trades,
            'equity_curve': equity_curve,
            'actions': actions_taken,
            'rewards': rewards
        }
    
    def calculate_metrics(self, equity_curve, trades, rewards):
        """Calculate performance metrics"""
        
        equity_series = pd.Series(equity_curve)
        returns = equity_series.pct_change().dropna()
        
        # Basic metrics
        final_equity = equity_curve[-1]
        total_return = (final_equity - self.initial_equity) / self.initial_equity
        
        # Risk metrics
        sharpe_ratio = 0
        if len(returns) > 0 and returns.std() > 0:
            sharpe_ratio = returns.mean() / returns.std() * np.sqrt(252 * 24)  # Hourly data
        
        # Drawdown
        cummax = equity_series.cummax()
        drawdown = (equity_series - cummax) / cummax
        max_drawdown = drawdown.min()
        
        # Trade metrics
        num_trades = len(trades)
        winning_trades = sum(1 for t in trades if t['pnl'] > 0)
        losing_trades = sum(1 for t in trades if t['pnl'] < 0)
        win_rate = winning_trades / num_trades if num_trades > 0 else 0
        
        # Reward metrics
        avg_reward = np.mean(rewards) if rewards else 0
        total_reward = np.sum(rewards) if rewards else 0
        
        metrics = {
            'initial_equity': self.initial_equity,
            'final_equity': final_equity,
            'total_return': total_return,
            'total_return_pct': total_return * 100,
            'sharpe_ratio': sharpe_ratio,
            'max_drawdown': max_drawdown,
            'max_drawdown_pct': max_drawdown * 100,
            'num_trades': num_trades,
            'winning_trades': winning_trades,
            'losing_trades': losing_trades,
            'win_rate': win_rate,
            'win_rate_pct': win_rate * 100,
            'avg_reward': avg_reward,
            'total_reward': total_reward,
            'avg_trade_return': returns.mean() if len(returns) > 0 else 0,
            'volatility': returns.std() if len(returns) > 0 else 0
        }
        
        return metrics
    
    def print_metrics(self, metrics, title="Backtest Results"):
        """Print metrics in a formatted way"""
        print(f"\n{'='*60}")
        print(f"  {title}")
        print(f"{'='*60}")
        print(f"  Initial Equity:     ${metrics['initial_equity']:,.2f}")
        print(f"  Final Equity:       ${metrics['final_equity']:,.2f}")
        print(f"  Total Return:       {metrics['total_return_pct']:+.2f}%")
        print(f"  Sharpe Ratio:       {metrics['sharpe_ratio']:.2f}")
        print(f"  Max Drawdown:       {metrics['max_drawdown_pct']:.2f}%")
        print(f"  Number of Trades:   {metrics['num_trades']}")
        print(f"  Winning Trades:     {metrics['winning_trades']}")
        print(f"  Losing Trades:      {metrics['losing_trades']}")
        print(f"  Win Rate:           {metrics['win_rate_pct']:.1f}%")
        print(f"  Avg Reward:         {metrics['avg_reward']:.2f}")
        print(f"  Total Reward:       {metrics['total_reward']:.2f}")
        print(f"{'='*60}\n")
    
    def plot_results(self, results, output_path=None):
        """Plot backtest results"""
        
        fig, axes = plt.subplots(3, 2, figsize=(15, 12))
        fig.suptitle('ML Model Backtest Results', fontsize=16, fontweight='bold')
        
        # 1. Equity Curve
        ax = axes[0, 0]
        equity_curve = results['equity_curve']
        ax.plot(equity_curve, linewidth=2, color='#2E86AB')
        ax.axhline(y=self.initial_equity, color='gray', linestyle='--', alpha=0.5)
        ax.set_title('Equity Curve', fontweight='bold')
        ax.set_xlabel('Step')
        ax.set_ylabel('Equity ($)')
        ax.grid(True, alpha=0.3)
        
        # 2. Drawdown
        ax = axes[0, 1]
        equity_series = pd.Series(equity_curve)
        cummax = equity_series.cummax()
        drawdown = (equity_series - cummax) / cummax * 100
        ax.fill_between(range(len(drawdown)), drawdown, 0, color='#A23B72', alpha=0.6)
        ax.set_title('Drawdown', fontweight='bold')
        ax.set_xlabel('Step')
        ax.set_ylabel('Drawdown (%)')
        ax.grid(True, alpha=0.3)
        
        # 3. Action Distribution
        ax = axes[1, 0]
        actions = results['actions']
        action_names = ['HOLD', 'BUY', 'SELL', 'CLOSE']
        action_counts = [actions.count(i) for i in range(4)]
        colors = ['#95B8D1', '#2E86AB', '#F18F01', '#C73E1D']
        ax.bar(action_names, action_counts, color=colors)
        ax.set_title('Action Distribution', fontweight='bold')
        ax.set_ylabel('Count')
        ax.grid(True, alpha=0.3, axis='y')
        
        # 4. Reward Distribution
        ax = axes[1, 1]
        rewards = results['rewards']
        ax.hist(rewards, bins=50, color='#2E86AB', alpha=0.7, edgecolor='black')
        ax.axvline(x=0, color='red', linestyle='--', linewidth=2)
        ax.set_title('Reward Distribution', fontweight='bold')
        ax.set_xlabel('Reward')
        ax.set_ylabel('Frequency')
        ax.grid(True, alpha=0.3)
        
        # 5. Cumulative Reward
        ax = axes[2, 0]
        cumulative_rewards = np.cumsum(rewards)
        ax.plot(cumulative_rewards, linewidth=2, color='#F18F01')
        ax.set_title('Cumulative Reward', fontweight='bold')
        ax.set_xlabel('Step')
        ax.set_ylabel('Cumulative Reward')
        ax.grid(True, alpha=0.3)
        
        # 6. Trade PnL
        ax = axes[2, 1]
        trades = results['trades']
        if trades:
            trade_pnls = [t['pnl'] for t in trades]
            colors_pnl = ['green' if pnl > 0 else 'red' for pnl in trade_pnls]
            ax.bar(range(len(trade_pnls)), trade_pnls, color=colors_pnl, alpha=0.7)
            ax.axhline(y=0, color='black', linestyle='-', linewidth=1)
            ax.set_title('Trade PnL', fontweight='bold')
            ax.set_xlabel('Trade #')
            ax.set_ylabel('PnL ($)')
            ax.grid(True, alpha=0.3, axis='y')
        
        plt.tight_layout()
        
        if output_path:
            plt.savefig(output_path, dpi=150, bbox_inches='tight')
            print(f"[Backtest] 📊 Plot saved to: {output_path}")
        
        return fig
    
    def save_results(self, results, output_path):
        """Save backtest results to JSON"""
        
        # Convert numpy types to Python types
        def convert_types(obj):
            if isinstance(obj, np.integer):
                return int(obj)
            elif isinstance(obj, np.floating):
                return float(obj)
            elif isinstance(obj, np.ndarray):
                return obj.tolist()
            elif isinstance(obj, datetime):
                return obj.isoformat()
            return obj
        
        # Prepare data for JSON
        output_data = {
            'model_path': self.model_path,
            'initial_equity': self.initial_equity,
            'metrics': {k: convert_types(v) for k, v in results['metrics'].items()},
            'num_trades': len(results['trades']),
            'num_steps': len(results['equity_curve']),
            'timestamp': datetime.now().isoformat()
        }
        
        with open(output_path, 'w') as f:
            json.dump(output_data, f, indent=2)
        
        print(f"[Backtest] 💾 Results saved to: {output_path}")


def main():
    """Main backtesting routine"""
    
    print("="*70)
    print("  ML Model Backtesting Suite")
    print("="*70)
    
    # Configuration
    MODEL_PATH = '/opt/binance-bot/ml_models/checkpoints_20251025_174444/best_model_ep70_r8.16'
    SYMBOL = 'BTCUSDT'
    INITIAL_EQUITY = 10000
    
    # Create backtester
    backtester = MLBacktester(MODEL_PATH, INITIAL_EQUITY)
    
    # Test 1: 30-day backtest
    print("\n" + "="*70)
    print("  TEST 1: 30-Day Out-of-Sample Backtest")
    print("="*70)
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    
    results_30d = backtester.run_backtest(SYMBOL, start_date, end_date, deterministic=True)
    
    if results_30d:
        backtester.print_metrics(results_30d['metrics'], "30-Day Backtest Results")
        backtester.plot_results(results_30d, '/opt/binance-bot/ml_models/backtest_30d.png')
        backtester.save_results(results_30d, '/opt/binance-bot/ml_models/backtest_30d.json')
    
    # Test 2: 7-day recent backtest
    print("\n" + "="*70)
    print("  TEST 2: 7-Day Recent Performance")
    print("="*70)
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=7)
    
    results_7d = backtester.run_backtest(SYMBOL, start_date, end_date, deterministic=True)
    
    if results_7d:
        backtester.print_metrics(results_7d['metrics'], "7-Day Backtest Results")
        backtester.plot_results(results_7d, '/opt/binance-bot/ml_models/backtest_7d.png')
        backtester.save_results(results_7d, '/opt/binance-bot/ml_models/backtest_7d.json')
    
    # Comparison
    if results_30d and results_7d:
        print("\n" + "="*70)
        print("  COMPARISON: 30-Day vs 7-Day")
        print("="*70)
        print(f"  Metric                    30-Day          7-Day")
        print(f"  {'-'*60}")
        print(f"  Total Return:           {results_30d['metrics']['total_return_pct']:>7.2f}%      {results_7d['metrics']['total_return_pct']:>7.2f}%")
        print(f"  Sharpe Ratio:           {results_30d['metrics']['sharpe_ratio']:>7.2f}       {results_7d['metrics']['sharpe_ratio']:>7.2f}")
        print(f"  Max Drawdown:           {results_30d['metrics']['max_drawdown_pct']:>7.2f}%      {results_7d['metrics']['max_drawdown_pct']:>7.2f}%")
        print(f"  Win Rate:               {results_30d['metrics']['win_rate_pct']:>7.1f}%       {results_7d['metrics']['win_rate_pct']:>7.1f}%")
        print(f"  Num Trades:             {results_30d['metrics']['num_trades']:>7}         {results_7d['metrics']['num_trades']:>7}")
        print("="*70)
    
    # Summary
    print("\n" + "="*70)
    print("  BACKTEST SUMMARY")
    print("="*70)
    
    if results_30d:
        metrics = results_30d['metrics']
        
        # Pass/Fail criteria
        criteria = {
            'Sharpe Ratio >2.0': metrics['sharpe_ratio'] > 2.0,
            'Max Drawdown <10%': abs(metrics['max_drawdown_pct']) < 10,
            'Win Rate >55%': metrics['win_rate_pct'] > 55,
            'Positive Returns': metrics['total_return_pct'] > 0
        }
        
        print("\n  Success Criteria:")
        for criterion, passed in criteria.items():
            status = "✅ PASS" if passed else "❌ FAIL"
            print(f"    {criterion:<30} {status}")
        
        all_passed = all(criteria.values())
        
        print("\n  Overall Assessment:")
        if all_passed:
            print("    ✅ Model is READY for deployment")
            print("    Recommendation: Proceed with 10% allocation in Week 1")
        else:
            failed_count = sum(1 for p in criteria.values() if not p)
            print(f"    ⚠️  Model failed {failed_count} criteria")
            print("    Recommendation: Review failed criteria before deployment")
    
    print("\n" + "="*70)
    print("  Backtesting Complete!")
    print("="*70 + "\n")


if __name__ == '__main__':
    main()

