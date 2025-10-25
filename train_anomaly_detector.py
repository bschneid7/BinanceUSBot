#!/usr/bin/env python3
"""
Train Anomaly Detector using Isolation Forest
Detects unusual market conditions
"""

import numpy as np
import pandas as pd
import sqlite3
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import pickle
import os

def load_data(db_path='/opt/binance-bot/data/training_data.db'):
    """Load training data"""
    
    conn = sqlite3.connect(db_path)
    
    # Load OHLCV data
    df = pd.read_sql_query("""
        SELECT timestamp, open, high, low, close, volume
        FROM deduplicated_ohlcv
        ORDER BY timestamp
    """, conn)
    
    conn.close()
    
    # Convert to numeric
    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    df = df.dropna()
    
    return df

def engineer_features(df):
    """Engineer features for anomaly detection"""
    
    features = pd.DataFrame()
    
    # Price features
    features['price'] = df['close']
    features['price_change'] = df['close'].pct_change()
    features['high_low_range'] = (df['high'] - df['low']) / df['close']
    
    # Volume features
    features['volume'] = df['volume']
    features['volume_change'] = df['volume'].pct_change()
    
    # Volatility (rolling std of returns)
    features['volatility'] = df['close'].pct_change().rolling(20).std()
    
    # Price position in range
    features['price_position'] = (df['close'] - df['low'].rolling(20).min()) / \
                                  (df['high'].rolling(20).max() - df['low'].rolling(20).min())
    
    # Volume ratio
    features['volume_ratio'] = df['volume'] / df['volume'].rolling(20).mean()
    
    # Returns
    features['returns_1h'] = df['close'].pct_change(1)
    features['returns_4h'] = df['close'].pct_change(4)
    features['returns_24h'] = df['close'].pct_change(24)
    
    # Drop NaN
    features = features.dropna()
    
    return features

def train_anomaly_detector(X, contamination=0.05):
    """Train Isolation Forest"""
    
    print(f"[AnomalyDetector] Training on {len(X)} samples...")
    
    # Standardize features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    # Train Isolation Forest
    model = IsolationForest(
        contamination=contamination,  # Expected proportion of anomalies
        random_state=42,
        n_estimators=100,
        max_samples='auto',
        n_jobs=-1
    )
    
    model.fit(X_scaled)
    
    # Predict on training data
    predictions = model.predict(X_scaled)
    scores = model.score_samples(X_scaled)
    
    # Count anomalies
    n_anomalies = (predictions == -1).sum()
    anomaly_rate = n_anomalies / len(predictions)
    
    print(f"[AnomalyDetector] Detected {n_anomalies} anomalies ({anomaly_rate*100:.2f}%)")
    print(f"[AnomalyDetector] Score range: [{scores.min():.3f}, {scores.max():.3f}]")
    
    return model, scaler

def save_model(model, scaler, output_dir='/opt/binance-bot/ml_models/anomaly'):
    """Save model and scaler"""
    
    os.makedirs(output_dir, exist_ok=True)
    
    with open(f'{output_dir}/isolation_forest.pkl', 'wb') as f:
        pickle.dump(model, f)
    
    with open(f'{output_dir}/scaler.pkl', 'wb') as f:
        pickle.dump(scaler, f)
    
    print(f"[AnomalyDetector] 💾 Saved to {output_dir}/")

def main():
    """Main training pipeline"""
    
    print("="*70)
    print("  ANOMALY DETECTOR TRAINING")
    print("="*70)
    
    # Load data
    print("\n[1/4] Loading data...")
    df = load_data()
    print(f"  Loaded {len(df)} records")
    
    # Engineer features
    print("\n[2/4] Engineering features...")
    X = engineer_features(df)
    print(f"  Created {X.shape[1]} features, {len(X)} samples")
    
    # Train model
    print("\n[3/4] Training Isolation Forest...")
    model, scaler = train_anomaly_detector(X, contamination=0.05)
    
    # Save model
    print("\n[4/4] Saving model...")
    save_model(model, scaler)
    
    print("\n" + "="*70)
    print("  ✅ ANOMALY DETECTOR TRAINING COMPLETE!")
    print("="*70)

if __name__ == '__main__':
    main()

