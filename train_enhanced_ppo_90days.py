#!/usr/bin/env python3
"""
Enhanced PPO Training Script with CDD Features
Trains a PPO reinforcement learning agent on historical crypto data with CDD features
"""

import sqlite3
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import json
import os
import sys

# Check for required packages
try:
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers
except ImportError:
    print("ERROR: TensorFlow not installed. Installing now...")
    os.system("pip3 install tensorflow")
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers

    print(f"[Training] TensorFlow version: {tf.__version__}", flush=True)
    print(f"[Training] GPU available: {tf.config.list_physical_devices('GPU')}", flush=True)

# Configuration
CONFIG = {
    'symbol': 'BTCUSDT',
    'episodes': 500,  # Increased for better convergence
    'lookback_period': 20,
    'max_steps': 500,
    'initial_equity': 10000,
    'fee_rate': 0.00075,
    'learning_rate': 0.0003,
    'gamma': 0.99,
    'epsilon': 0.2,
    'batch_size': 64,
    'state_dim': 17,  # 12 original + 5 CDD features
    'action_dim': 4,  # HOLD, BUY, SELL, CLOSE
    'early_stopping_patience': 20,  # Stop if no improvement for 20 episodes
    'checkpoint_interval': 10,  # Save model every 10 episodes
    'min_improvement': 0.01,  # Minimum improvement to reset patience
}

class CDDDataLoader:
    """Load CDD data from SQLite database"""
    
    def __init__(self, db_path='/opt/binance-bot/data/cdd_data.db'):
        self.db_path = db_path
        self.conn = None
        
    def connect(self):
        self.conn = sqlite3.connect(self.db_path)
        print(f"[DataLoader] Connected to {self.db_path}", flush=True)
        
    def load_ohlcv(self, symbol, days=90):
        """Load OHLCV data"""
        query = f"""
        SELECT unix, open, high, low, close, volume
        FROM spot_ohlcv
        WHERE Symbol = '{symbol}'
        ORDER BY unix ASC
        LIMIT {days * 24}
        """
        df = pd.read_sql_query(query, self.conn)
        df['close'] = pd.to_numeric(df['close'], errors='coerce')
        df['volume'] = pd.to_numeric(df['volume'], errors='coerce')
        print(f"[DataLoader] Loaded {len(df)} OHLCV records for {symbol}", flush=True)
        return df
        
    def load_funding_rates(self, symbol):
        """Load funding rates"""
        query = f"""
        SELECT Unix as unix, last_funding_rate
        FROM funding_rates
        WHERE Symbol = '{symbol}'
        ORDER BY Unix ASC
        """
        df = pd.read_sql_query(query, self.conn)
        df['last_funding_rate'] = pd.to_numeric(df['last_funding_rate'], errors='coerce')
        print(f"[DataLoader] Loaded {len(df)} funding rate records", flush=True)
        return df
        
    def load_vwap(self, symbol):
        """Load VWAP data"""
        query = f"""
        SELECT date, vwap
        FROM spot_summary
        WHERE symbol = '{symbol}'
        ORDER BY date ASC
        """
        df = pd.read_sql_query(query, self.conn)
        df['vwap'] = pd.to_numeric(df['vwap'], errors='coerce')
        # Convert date to unix timestamp for consistency
        df['unix'] = pd.to_datetime(df['date']).astype(int) // 10**9 * 1000
        print(f"[DataLoader] Loaded {len(df)} VWAP records", flush=True)
        return df
        
    def close(self):
        if self.conn:
            self.conn.close()

class PPOAgent:
    """PPO Agent with Actor-Critic architecture"""
    
    def __init__(self, state_dim, action_dim, lr=0.0003, gamma=0.99, epsilon=0.2):
        self.state_dim = state_dim
        self.action_dim = action_dim
        self.lr = lr
        self.gamma = gamma
        self.epsilon = epsilon
        
        # Build actor and critic networks
        self.actor = self.build_actor()
        self.critic = self.build_critic()
        
        # Optimizers
        self.actor_optimizer = keras.optimizers.Adam(learning_rate=lr)
        self.critic_optimizer = keras.optimizers.Adam(learning_rate=lr)
        
        # Memory
        self.states = []
        self.actions = []
        self.rewards = []
        self.next_states = []
        self.dones = []
        
    def build_actor(self):
        """Build actor network (policy)"""
        inputs = layers.Input(shape=(self.state_dim,))
        x = layers.Dense(128, activation='relu')(inputs)
        x = layers.Dense(64, activation='relu')(x)
        outputs = layers.Dense(self.action_dim, activation='softmax')(x)
        model = keras.Model(inputs=inputs, outputs=outputs)
        return model
        
    def build_critic(self):
        """Build critic network (value function)"""
        inputs = layers.Input(shape=(self.state_dim,))
        x = layers.Dense(128, activation='relu')(inputs)
        x = layers.Dense(64, activation='relu')(x)
        outputs = layers.Dense(1)(x)
        model = keras.Model(inputs=inputs, outputs=outputs)
        return model
        
    def act(self, state):
        """Select action based on policy"""
        state = np.reshape(state, [1, self.state_dim])
        probs = self.actor.predict(state, verbose=0)[0]
        action = np.random.choice(self.action_dim, p=probs)
        return action
        
    def remember(self, state, action, reward, next_state, done):
        """Store experience"""
        self.states.append(state)
        self.actions.append(action)
        self.rewards.append(reward)
        self.next_states.append(next_state)
        self.dones.append(done)
        
    def train(self):
        """Train actor and critic using PPO"""
        if len(self.states) == 0:
            return 0, 0
            
        # Convert to numpy arrays
        states = np.array(self.states)
        actions = np.array(self.actions)
        rewards = np.array(self.rewards)
        next_states = np.array(self.next_states)
        dones = np.array(self.dones)
        
        # Calculate advantages
        values = self.critic.predict(states, verbose=0).flatten()
        next_values = self.critic.predict(next_states, verbose=0).flatten()
        advantages = rewards + self.gamma * next_values * (1 - dones) - values
        
        # Normalize advantages
        advantages = (advantages - np.mean(advantages)) / (np.std(advantages) + 1e-8)
        
        # Train actor
        with tf.GradientTape() as tape:
            probs = self.actor(states)
            action_probs = tf.reduce_sum(probs * tf.one_hot(actions, self.action_dim), axis=1)
            ratio = action_probs / (action_probs + 1e-10)
            clipped_ratio = tf.clip_by_value(ratio, 1 - self.epsilon, 1 + self.epsilon)
            actor_loss = -tf.reduce_mean(tf.minimum(
                ratio * advantages,
                clipped_ratio * advantages
            ))
            
        actor_grads = tape.gradient(actor_loss, self.actor.trainable_variables)
        self.actor_optimizer.apply_gradients(zip(actor_grads, self.actor.trainable_variables))
        
        # Train critic
        with tf.GradientTape() as tape:
            values = self.critic(states)
            target_values = rewards + self.gamma * next_values * (1 - dones)
            target_values = np.reshape(target_values, [-1, 1])
            critic_loss = tf.reduce_mean(tf.square(values - target_values))
            
        critic_grads = tape.gradient(critic_loss, self.critic.trainable_variables)
        self.critic_optimizer.apply_gradients(zip(critic_grads, self.critic.trainable_variables))
        
        # Clear memory
        self.states = []
        self.actions = []
        self.rewards = []
        self.next_states = []
        self.dones = []
        
        return float(actor_loss), float(critic_loss)
        
    def save(self, path):
        """Save model weights"""
        os.makedirs(path, exist_ok=True)
        self.actor.save_weights(f"{path}/actor.weights.h5")
        self.critic.save_weights(f"{path}/critic.weights.h5")
        print(f"[Agent] Model saved to {path}")
        
    def load(self, path):
        """Load model weights"""
        self.actor.load_weights(f"{path}/actor.weights.h5")
        self.critic.load_weights(f"{path}/critic.weights.h5")
        print(f"[Agent] Model loaded from {path}")

class TradingEnvironment:
    """Trading environment with CDD features"""
    
    def __init__(self, ohlcv_df, funding_df, vwap_df, config):
        self.ohlcv = ohlcv_df
        self.funding = funding_df
        self.vwap = vwap_df
        self.config = config
        self.reset()
        
    def reset(self):
        """Reset environment for new episode"""
        self.current_idx = self.config['lookback_period']
        self.equity = self.config['initial_equity']
        self.peak_equity = self.config['initial_equity']
        self.position = None
        self.steps = 0
        return self.get_state()
        
    def get_state(self):
        """Get current state with CDD features"""
        lookback = self.config['lookback_period']
        
        # Get lookback candles
        candles = self.ohlcv.iloc[max(0, self.current_idx - lookback):self.current_idx + 1]
        
        # Price features
        prices = candles['close'].values
        normalized_prices = self.normalize(prices)
        
        # Returns
        returns = np.diff(prices) / prices[:-1]
        returns = np.pad(returns, (lookback - len(returns), 0), 'constant')
        
        # Volumes
        volumes = candles['volume'].values
        normalized_volumes = self.normalize(volumes)
        
        # Technical indicators
        rsi = self.calculate_rsi(prices) / 100
        macd, signal = self.calculate_macd(prices)
        
        # CDD features
        current_time = self.ohlcv.iloc[self.current_idx]['unix']
        current_price = prices[-1]
        
        funding_rate = self.get_funding_rate(current_time)
        funding_trend = self.get_funding_trend(current_time)
        vwap_deviation = self.get_vwap_deviation(current_time, current_price)
        order_flow = 0.0  # Simplified for now
        correlation = 0.5  # Simplified for now
        
        # Position features
        has_position = 1 if self.position else 0
        position_side = 0
        position_pnl = 0
        position_duration = 0
        
        if self.position:
            position_side = 1 if self.position['side'] == 'LONG' else -1
            position_pnl = self.calculate_pnl(current_price) / self.config['initial_equity']
            position_duration = min((self.steps - self.position['entry_step']) / 100, 1)
            
        # Account features
        total_equity = self.get_total_equity(current_price)
        normalized_equity = (total_equity - self.config['initial_equity']) / self.config['initial_equity']
        drawdown = (self.peak_equity - total_equity) / self.peak_equity
        
        # Combine all features (17 total)
        # Use latest values and aggregates instead of full time series
        state = np.array([
            normalized_prices[-1],  # Latest normalized price
            returns[-1] if len(returns) > 0 else 0,  # Latest return
            normalized_volumes[-1],  # Latest normalized volume
            np.mean(returns[-5:]) if len(returns) >= 5 else 0,  # 5-period avg return
            np.std(returns[-5:]) if len(returns) >= 5 else 0,  # 5-period volatility
            rsi,  # RSI indicator
            macd,  # MACD
            signal,  # MACD signal
            funding_rate,  # CDD: Current funding rate
            funding_trend,  # CDD: 7-day funding trend
            vwap_deviation,  # CDD: VWAP deviation
            order_flow,  # CDD: Order flow imbalance
            correlation,  # CDD: Correlation score
            has_position,  # Position indicator
            position_pnl,  # Position PnL
            normalized_equity,  # Account equity
            drawdown  # Account drawdown
        ])
        
        return state
        
    def step(self, action):
        """Take action and return next state, reward, done"""
        current_price = self.ohlcv.iloc[self.current_idx]['close']
        reward = 0
        
        # Execute action
        if action == 1 and not self.position:  # BUY
            self.position = {
                'side': 'LONG',
                'entry_price': current_price,
                'quantity': (self.equity * 0.95) / current_price,
                'entry_step': self.steps
            }
            self.equity -= self.equity * 0.95 * self.config['fee_rate']
            
        elif action == 2 and not self.position:  # SELL
            self.position = {
                'side': 'SHORT',
                'entry_price': current_price,
                'quantity': (self.equity * 0.95) / current_price,
                'entry_step': self.steps
            }
            self.equity -= self.equity * 0.95 * self.config['fee_rate']
            
        elif action == 3 and self.position:  # CLOSE
            pnl = self.calculate_pnl(current_price)
            position_value = current_price * self.position['quantity']
            fees = position_value * self.config['fee_rate']
            self.equity += pnl - fees
            reward = (pnl / self.config['initial_equity']) * 100
            self.position = None
            
        # Update state
        self.current_idx += 1
        self.steps += 1
        
        # Update peak equity
        total_equity = self.get_total_equity(current_price)
        if total_equity > self.peak_equity:
            self.peak_equity = total_equity
            
        # Check if done
        done = (
            self.current_idx >= len(self.ohlcv) - 1 or
            self.steps >= self.config['max_steps'] or
            total_equity < self.config['initial_equity'] * 0.5
        )
        
        # Close position if done
        if done and self.position:
            pnl = self.calculate_pnl(current_price)
            self.equity += pnl
            reward += (pnl / self.config['initial_equity']) * 100
            self.position = None
            
        next_state = self.get_state() if not done else np.zeros(CONFIG['state_dim'])
        
        return next_state, reward, done
        
    def calculate_pnl(self, current_price):
        """Calculate unrealized PnL"""
        if not self.position:
            return 0
        if self.position['side'] == 'LONG':
            return (current_price - self.position['entry_price']) * self.position['quantity']
        else:
            return (self.position['entry_price'] - current_price) * self.position['quantity']
            
    def get_total_equity(self, current_price):
        """Get total equity including unrealized PnL"""
        return self.equity + self.calculate_pnl(current_price)
        
    def get_funding_rate(self, timestamp):
        """Get funding rate at timestamp"""
        ts = int(timestamp) if isinstance(timestamp, str) else timestamp
        matching = self.funding[pd.to_numeric(self.funding['unix'], errors='coerce') == ts]
        if len(matching) > 0:
            return matching.iloc[0]['last_funding_rate'] * 1000
        return 0
        
    def get_funding_trend(self, timestamp):
        """Get 7-day funding rate trend"""
        ts = int(timestamp) if isinstance(timestamp, str) else timestamp
        seven_days_ago = ts - (7 * 24 * 60 * 60 * 1000)
        recent = self.funding[pd.to_numeric(self.funding['unix'], errors='coerce') >= seven_days_ago]
        if len(recent) > 0:
            return recent['last_funding_rate'].mean() * 1000
        return 0
        
    def get_vwap_deviation(self, timestamp, current_price):
        """Get VWAP deviation"""
        ts = int(timestamp) if isinstance(timestamp, str) else timestamp
        matching = self.vwap[pd.to_numeric(self.vwap['unix'], errors='coerce') == ts]
        if len(matching) > 0:
            vwap = matching.iloc[0]['vwap']
            return ((current_price - vwap) / vwap) * 100
        return 0
        
    @staticmethod
    def normalize(values):
        """Normalize array to [-1, 1]"""
        values = np.array(values, dtype=float)
        min_val = np.min(values)
        max_val = np.max(values)
        range_val = max_val - min_val
        if range_val == 0:
            return np.zeros_like(values)
        return 2 * (values - min_val) / range_val - 1
        
    @staticmethod
    def calculate_rsi(prices, period=14):
        """Calculate RSI"""
        if len(prices) < period + 1:
            return 50
        changes = np.diff(prices)
        gains = changes[changes > 0]
        losses = -changes[changes < 0]
        avg_gain = np.mean(gains) if len(gains) > 0 else 0
        avg_loss = np.mean(losses) if len(losses) > 0 else 0
        if avg_loss == 0:
            return 100
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))
        
    @staticmethod
    def calculate_macd(prices):
        """Calculate MACD"""
        if len(prices) < 26:
            return 0, 0
        ema12 = pd.Series(prices).ewm(span=12).mean().iloc[-1]
        ema26 = pd.Series(prices).ewm(span=26).mean().iloc[-1]
        macd = (ema12 - ema26) / prices[-1]
        signal = macd * 0.9
        return macd, signal

def train_model(config):
    """Main training function"""
    print("[Training] ===== Enhanced PPO Training =====", flush=True)
    print(f"[Training] Config: {json.dumps(config, indent=2)}", flush=True)
    
    # Load data
    loader = CDDDataLoader()
    loader.connect()
    
    ohlcv_df = loader.load_ohlcv(config['symbol'], days=90)
    funding_df = loader.load_funding_rates(config['symbol'])
    vwap_df = loader.load_vwap(config['symbol'])
    
    loader.close()
    
    if len(ohlcv_df) < 100:
        print("[Training] ERROR: Not enough data to train")
        return
        
    # Create environment
    env = TradingEnvironment(ohlcv_df, funding_df, vwap_df, config)
    
    # Create agent
    agent = PPOAgent(config['state_dim'], config['action_dim'], 
                     lr=config['learning_rate'], 
                     gamma=config['gamma'], 
                     epsilon=config['epsilon'])
    
    # Training loop
    episode_rewards = []
    start_time = datetime.now()
    
    # Early stopping variables
    best_avg_reward = float('-inf')
    best_model_path = None
    patience_counter = 0
    checkpoint_dir = f"/opt/binance-bot/ml_models/checkpoints_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    os.makedirs(checkpoint_dir, exist_ok=True)
    
    print(f"[Training] Starting training for {config['episodes']} episodes...", flush=True)
    print(f"[Training] Early stopping patience: {config['early_stopping_patience']} episodes", flush=True)
    print(f"[Training] Checkpoint directory: {checkpoint_dir}", flush=True)
    
    for episode in range(config['episodes']):
        state = env.reset()
        episode_reward = 0
        done = False
        steps = 0
        
        while not done:
            action = agent.act(state)
            next_state, reward, done = env.step(action)
            agent.remember(state, action, reward, next_state, done)
            state = next_state
            episode_reward += reward
            steps += 1
            
        # Train agent
        actor_loss, critic_loss = agent.train()
        episode_rewards.append(episode_reward)
        
        # Log every episode for first 5, then every 5
        if episode < 5 or (episode + 1) % 5 == 0:
            print(f"[Training] Episode {episode + 1} completed | Steps: {steps} | Reward: {episode_reward:.2f}", flush=True)
        
        # Log progress and check for improvement
        if (episode + 1) % 10 == 0:
            avg_reward = np.mean(episode_rewards[-10:])
            elapsed = (datetime.now() - start_time).total_seconds()
            eta = (elapsed / (episode + 1)) * (config['episodes'] - episode - 1)
            
            print(f"[Training] ===== Episode {episode + 1}/{config['episodes']} ===== | "
                  f"Avg Reward (last 10): {avg_reward:.2f} | "
                  f"Actor Loss: {actor_loss:.4f} | "
                  f"Critic Loss: {critic_loss:.4f} | "
                  f"ETA: {int(eta//60)}m {int(eta%60)}s", flush=True)
            
            # Early stopping check
            if avg_reward > best_avg_reward + config['min_improvement']:
                improvement = avg_reward - best_avg_reward
                best_avg_reward = avg_reward
                patience_counter = 0
                
                # Save best model
                best_model_path = f"{checkpoint_dir}/best_model_ep{episode+1}_r{avg_reward:.2f}"
                agent.save(best_model_path)
                print(f"[Training] ✅ New best model! Improvement: +{improvement:.2f} | Saved to: {best_model_path}", flush=True)
            else:
                patience_counter += 1
                print(f"[Training] No improvement ({patience_counter}/{config['early_stopping_patience']})", flush=True)
                
                if patience_counter >= config['early_stopping_patience']:
                    print(f"[Training] 🛑 Early stopping triggered after {episode + 1} episodes", flush=True)
                    print(f"[Training] Best average reward: {best_avg_reward:.2f}", flush=True)
                    break
        
        # Periodic checkpoint
        if (episode + 1) % config['checkpoint_interval'] == 0:
            checkpoint_path = f"{checkpoint_dir}/checkpoint_ep{episode+1}"
            agent.save(checkpoint_path)
            print(f"[Training] 💾 Checkpoint saved: {checkpoint_path}", flush=True)
                  
    # Save model
    model_dir = f"/opt/binance-bot/ml_models/enhanced_ppo_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    agent.save(model_dir)
    
    # Save training results
    results = {
        'config': config,
        'episode_rewards': episode_rewards,
        'avg_reward': float(np.mean(episode_rewards)),
        'final_reward': float(episode_rewards[-1]),
        'best_avg_reward': float(best_avg_reward),
        'best_model_path': best_model_path,
        'training_duration': (datetime.now() - start_time).total_seconds(),
        'model_path': model_dir,
        'early_stopped': patience_counter >= config['early_stopping_patience']
    }
    
    with open(f"{model_dir}/training_results.json", 'w') as f:
        json.dump(results, f, indent=2)
        
    print("[Training] ===== Training Complete =====")
    print(f"[Training] Average Reward: {results['avg_reward']:.2f}")
    print(f"[Training] Final Reward: {results['final_reward']:.2f}")
    print(f"[Training] Training Duration: {results['training_duration']:.1f}s")
    print(f"[Training] Model saved to: {model_dir}")
    
    return results

if __name__ == '__main__':
    # Parse command line arguments
    if len(sys.argv) > 1:
        CONFIG['episodes'] = int(sys.argv[1])
    if len(sys.argv) > 2:
        CONFIG['symbol'] = sys.argv[2]
        
    # Train model
    results = train_model(CONFIG)
    
    print("\n[Training] Training completed successfully!")
    print(f"[Training] Model path: {results['model_path']}")

