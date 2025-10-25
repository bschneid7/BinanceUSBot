#!/usr/bin/env python3
"""
Retrain Ensemble Models with Full Dataset (2,284 samples)
"""

import sys
import os
import numpy as np
import pandas as pd
from datetime import datetime
import json
import pickle

# ML libraries
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score
from sklearn.metrics import classification_report, accuracy_score
import xgboost as xgb

# TensorFlow for LSTM
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout, BatchNormalization
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from tensorflow.keras.optimizers import Adam

import sqlite3


class ConsolidatedDataLoader:
    """Load data from consolidated database"""
    
    def __init__(self, db_path='/opt/binance-bot/data/training_data.db'):
        self.db_path = db_path
        
    def load_data(self, symbol='BTCUSDT'):
        """Load all data for symbol"""
        
        print(f"[Data] Loading from {self.db_path}...")
        
        conn = sqlite3.connect(self.db_path)
        
        # Load from deduplicated table
        df = pd.read_sql_query("""
            SELECT timestamp, open, high, low, close, volume
            FROM deduplicated_ohlcv
            WHERE symbol = ?
            ORDER BY timestamp
        """, conn, params=(symbol,))
        
        conn.close()
        
        print(f"[Data] Loaded {len(df)} records")
        print(f"[Data] Date range: {datetime.fromtimestamp(df['timestamp'].min())} to {datetime.fromtimestamp(df['timestamp'].max())}")
        print(f"[Data] Days: {(df['timestamp'].max() - df['timestamp'].min()) / 86400:.1f}")
        
        return df


class FeatureEngineer:
    """Calculate features for ML models"""
    
    def calculate_features(self, df):
        """Calculate all features"""
        
        print(f"\n[Features] Calculating technical indicators...")
        
        df = df.copy()
        
        # Convert to numeric
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        
        # Price features
        df['price_change'] = df['close'].pct_change()
        df['high_low_range'] = (df['high'] - df['low']) / df['close']
        df['close_open_change'] = (df['close'] - df['open']) / df['open']
        
        # Volume features
        df['volume_change'] = df['volume'].pct_change()
        df['volume_ma_10'] = df['volume'].rolling(window=10).mean()
        df['volume_ratio'] = df['volume'] / (df['volume_ma_10'] + 1e-10)
        
        # Moving averages
        for period in [5, 10, 20]:
            df[f'sma_{period}'] = df['close'].rolling(window=period).mean()
            df[f'ema_{period}'] = df['close'].ewm(span=period).mean()
        
        # MA ratios
        df['price_sma5_ratio'] = df['close'] / (df['sma_5'] + 1e-10) - 1
        df['price_sma10_ratio'] = df['close'] / (df['sma_10'] + 1e-10) - 1
        df['price_sma20_ratio'] = df['close'] / (df['sma_20'] + 1e-10) - 1
        
        # Bollinger Bands
        df['bb_middle'] = df['close'].rolling(window=20).mean()
        df['bb_std'] = df['close'].rolling(window=20).std()
        df['bb_upper'] = df['bb_middle'] + 2 * df['bb_std']
        df['bb_lower'] = df['bb_middle'] - 2 * df['bb_std']
        df['bb_position'] = (df['close'] - df['bb_lower']) / (df['bb_upper'] - df['bb_lower'] + 1e-10)
        df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / df['bb_middle']
        
        # RSI
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / (loss + 1e-10)
        df['rsi'] = 100 - (100 / (1 + rs))
        df['rsi_normalized'] = (df['rsi'] - 50) / 50
        
        # MACD
        ema_12 = df['close'].ewm(span=12).mean()
        ema_26 = df['close'].ewm(span=26).mean()
        df['macd'] = ema_12 - ema_26
        df['macd_signal'] = df['macd'].ewm(span=9).mean()
        df['macd_hist'] = df['macd'] - df['macd_signal']
        
        # ATR
        high_low = df['high'] - df['low']
        high_close = np.abs(df['high'] - df['close'].shift())
        low_close = np.abs(df['low'] - df['close'].shift())
        ranges = pd.concat([high_low, high_close, low_close], axis=1)
        true_range = ranges.max(axis=1)
        df['atr'] = true_range.rolling(window=14).mean()
        df['atr_pct'] = df['atr'] / df['close']
        
        # Momentum
        for period in [1, 4, 24]:
            df[f'momentum_{period}h'] = df['close'].pct_change(periods=period)
        
        # Target variable (future return)
        df['future_return'] = df['close'].pct_change(periods=1).shift(-1)
        
        # Classification target (3 classes)
        threshold = 0.001  # 0.1%
        df['target'] = 1  # SIDEWAYS
        df.loc[df['future_return'] > threshold, 'target'] = 2  # UP
        df.loc[df['future_return'] < -threshold, 'target'] = 0  # DOWN
        
        # Drop NaN
        df = df.dropna()
        
        print(f"[Features] ✅ Calculated features, {len(df)} samples after cleaning")
        print(f"[Features] Class distribution: DOWN={len(df[df['target']==0])}, SIDEWAYS={len(df[df['target']==1])}, UP={len(df[df['target']==2])}")
        
        return df


def train_random_forest(X_train, y_train, X_val, y_val):
    """Train Random Forest"""
    
    print(f"\n{'='*70}")
    print(f"  Random Forest Training")
    print(f"{'='*70}\n")
    
    model = RandomForestClassifier(
        n_estimators=500,
        max_depth=10,
        min_samples_split=20,
        min_samples_leaf=10,
        random_state=42,
        n_jobs=-1
    )
    
    print(f"[RF] Training on {len(X_train)} samples...")
    model.fit(X_train, y_train)
    
    # Validation
    y_pred = model.predict(X_val)
    accuracy = accuracy_score(y_val, y_pred)
    
    # CV score
    cv_scores = cross_val_score(model, X_train, y_train, cv=5, n_jobs=-1)
    
    print(f"\n[RF] Validation Accuracy: {accuracy:.3f}")
    print(f"[RF] CV Accuracy: {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")
    print(f"\n[RF] Classification Report:")
    print(classification_report(y_val, y_pred, target_names=['DOWN', 'SIDEWAYS', 'UP']))
    
    return model, {'val_accuracy': float(accuracy), 'cv_accuracy': float(cv_scores.mean())}


def train_xgboost(X_train, y_train, X_val, y_val):
    """Train XGBoost"""
    
    print(f"\n{'='*70}")
    print(f"  XGBoost Training")
    print(f"{'='*70}\n")
    
    model = xgb.XGBClassifier(
        n_estimators=500,
        max_depth=6,
        learning_rate=0.01,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,
        early_stopping_rounds=50
    )
    
    print(f"[XGB] Training on {len(X_train)} samples...")
    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=True)
    
    # Validation
    y_pred = model.predict(X_val)
    accuracy = accuracy_score(y_val, y_pred)
    
    print(f"\n[XGB] Validation Accuracy: {accuracy:.3f}")
    print(f"\n[XGB] Classification Report:")
    print(classification_report(y_val, y_pred, target_names=['DOWN', 'SIDEWAYS', 'UP']))
    
    return model, {'val_accuracy': float(accuracy)}


def train_lstm(X_train, y_train, X_val, y_val, sequence_length=20, n_features=11):
    """Train LSTM"""
    
    print(f"\n{'='*70}")
    print(f"  LSTM Training")
    print(f"{'='*70}\n")
    
    model = Sequential([
        LSTM(64, return_sequences=True, input_shape=(sequence_length, n_features)),
        BatchNormalization(),
        Dropout(0.2),
        LSTM(64, return_sequences=False),
        BatchNormalization(),
        Dropout(0.2),
        Dense(32, activation='relu'),
        Dropout(0.2),
        Dense(3, activation='softmax')
    ])
    
    model.compile(
        optimizer=Adam(learning_rate=0.001),
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )
    
    callbacks = [
        EarlyStopping(monitor='val_loss', patience=10, restore_best_weights=True),
        ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=5, min_lr=1e-6)
    ]
    
    print(f"[LSTM] Training on {len(X_train)} sequences...")
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=50,
        batch_size=32,
        callbacks=callbacks,
        verbose=1
    )
    
    # Validation
    val_loss, val_accuracy = model.evaluate(X_val, y_val, verbose=0)
    
    print(f"\n[LSTM] Validation Accuracy: {val_accuracy:.3f}")
    
    return model, {'val_accuracy': float(val_accuracy), 'val_loss': float(val_loss)}


def main():
    """Main retraining routine"""
    
    print("\n" + "="*70)
    print("  Ensemble Retraining - Full Dataset")
    print("  2,284 samples (15x increase)")
    print("="*70 + "\n")
    
    OUTPUT_DIR = '/opt/binance-bot/ml_models/ensemble_v2'
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Load data
    loader = ConsolidatedDataLoader()
    df_raw = loader.load_data('BTCUSDT')
    
    # Calculate features
    engineer = FeatureEngineer()
    df = engineer.calculate_features(df_raw)
    
    # Prepare data for RF and XGB
    feature_cols = [col for col in df.columns if col not in ['target', 'future_return', 'timestamp']]
    X = df[feature_cols].values
    y = df['target'].values
    
    # Train/val split (80/20, chronological)
    split_idx = int(len(X) * 0.8)
    X_train, X_val = X[:split_idx], X[split_idx:]
    y_train, y_val = y[:split_idx], y[split_idx:]
    
    print(f"\n[Split] Training: {len(X_train)}, Validation: {len(X_val)}")
    
    # Train Random Forest
    rf_model, rf_metrics = train_random_forest(X_train, y_train, X_val, y_val)
    with open(f'{OUTPUT_DIR}/random_forest.pkl', 'wb') as f:
        pickle.dump(rf_model, f)
    print(f"[RF] 💾 Saved to {OUTPUT_DIR}/random_forest.pkl")
    
    # Train XGBoost  
    xgb_model, xgb_metrics = train_xgboost(X_train, y_train, X_val, y_val)
    xgb_model.save_model(f'{OUTPUT_DIR}/xgboost.json')
    print(f"[XGB] 💾 Saved to {OUTPUT_DIR}/xgboost.json")
    
    # Prepare LSTM data (sequences)
    print(f"\n[LSTM] Preparing sequence data...")
    sequence_length = 20
    lstm_feature_cols = [
        'price_change', 'high_low_range', 'close_open_change',
        'volume_change', 'volume_ratio',
        'price_sma5_ratio', 'price_sma10_ratio', 'price_sma20_ratio',
        'rsi_normalized', 'macd_hist', 'atr_pct'
    ]
    
    X_seq_list = []
    y_seq_list = []
    
    for i in range(len(df) - sequence_length):
        seq = df[lstm_feature_cols].iloc[i:i+sequence_length].values
        target = df['target'].iloc[i+sequence_length]
        X_seq_list.append(seq)
        # One-hot encode target
        target_onehot = [0, 0, 0]
        target_onehot[int(target)] = 1
        y_seq_list.append(target_onehot)
    
    X_seq = np.array(X_seq_list)
    y_seq = np.array(y_seq_list)
    
    # Split
    split_idx_lstm = int(len(X_seq) * 0.8)
    X_seq_train, X_seq_val = X_seq[:split_idx_lstm], X_seq[split_idx_lstm:]
    y_seq_train, y_seq_val = y_seq[:split_idx_lstm], y_seq[split_idx_lstm:]
    
    print(f"[LSTM] Sequences: {len(X_seq)}, Train: {len(X_seq_train)}, Val: {len(X_seq_val)}")
    
    # Train LSTM
    lstm_model, lstm_metrics = train_lstm(X_seq_train, y_seq_train, X_seq_val, y_seq_val, 
                                          sequence_length=sequence_length, n_features=len(lstm_feature_cols))
    lstm_model.save(f'{OUTPUT_DIR}/lstm_model.keras')
    print(f"[LSTM] 💾 Saved to {OUTPUT_DIR}/lstm_model.keras")
    
    # Save metadata
    metadata = {
        'dataset_size': len(df),
        'train_size': len(X_train),
        'val_size': len(X_val),
        'features': len(feature_cols),
        'lstm_sequences': len(X_seq),
        'lstm_features': len(lstm_feature_cols),
        'rf_metrics': rf_metrics,
        'xgb_metrics': xgb_metrics,
        'lstm_metrics': lstm_metrics,
        'timestamp': datetime.now().isoformat()
    }
    
    with open(f'{OUTPUT_DIR}/metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)
    
    # Summary
    print(f"\n{'='*70}")
    print(f"  RETRAINING SUMMARY")
    print(f"{'='*70}")
    print(f"  Dataset: {len(df):,} samples (15x increase!)")
    print(f"  Training: {len(X_train):,} samples")
    print(f"  Validation: {len(X_val):,} samples")
    print(f"\n  Model Performance:")
    print(f"    Random Forest:  {rf_metrics['val_accuracy']:.3f} accuracy")
    print(f"    XGBoost:        {xgb_metrics['val_accuracy']:.3f} accuracy")
    print(f"    LSTM:           {lstm_metrics['val_accuracy']:.3f} accuracy")
    print(f"{'='*70}\n")
    
    print(f"[Complete] ✅ All models retrained!")
    print(f"[Complete] Saved to: {OUTPUT_DIR}/")
    print(f"\n{'='*70}\n")


if __name__ == '__main__':
    main()

