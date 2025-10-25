#!/usr/bin/env python3
"""
Ensemble ML Training - Week 2: LSTM

Trains LSTM model for time series prediction.
"""

import sys
import os
import numpy as np
import pandas as pd
from datetime import datetime
import json

# TensorFlow/Keras
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # Suppress TF warnings
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout, BatchNormalization
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
from tensorflow.keras.optimizers import Adam

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from train_enhanced_ppo import CDDDataLoader


class LSTMDataPreparator:
    """Prepare sequence data for LSTM"""
    
    def __init__(self, sequence_length=20):
        self.sequence_length = sequence_length
        self.loader = CDDDataLoader()
    
    def load_and_prepare_data(self, symbol='BTCUSDT', days=90):
        """Load and prepare LSTM training data"""
        
        print(f"[LSTM Data] Loading data for {symbol} ({days} days)...")
        
        # Load data
        self.loader.connect()
        ohlcv_df = self.loader.load_ohlcv(symbol, days=days)
        funding_df = self.loader.load_funding_rates(symbol)
        vwap_df = self.loader.load_vwap(symbol)
        self.loader.close()
        
        print(f"[LSTM Data] Loaded {len(ohlcv_df)} OHLCV records")
        
        # Convert to numeric
        for col in ['open', 'high', 'low', 'close', 'volume']:
            ohlcv_df[col] = pd.to_numeric(ohlcv_df[col], errors='coerce')
        
        # Add CDD features
        if len(funding_df) > 0:
            funding_dict = dict(zip(funding_df['unix'], funding_df['last_funding_rate']))
            ohlcv_df['funding_rate'] = ohlcv_df['unix'].map(funding_dict).fillna(0)
        else:
            ohlcv_df['funding_rate'] = 0
        
        if len(vwap_df) > 0:
            vwap_dict = dict(zip(vwap_df['unix'], vwap_df['vwap']))
            ohlcv_df['vwap'] = ohlcv_df['unix'].map(vwap_dict).fillna(ohlcv_df['close'])
        else:
            ohlcv_df['vwap'] = ohlcv_df['close']
        
        # Calculate features
        df = self.calculate_features(ohlcv_df)
        
        # Create sequences
        X, y = self.create_sequences(df)
        
        print(f"[LSTM Data] ✅ Created {len(X)} sequences")
        
        return X, y, df
    
    def calculate_features(self, df):
        """Calculate features for LSTM"""
        
        print(f"[LSTM Data] Calculating features...")
        
        # Price features (normalized)
        df['price_change'] = df['close'].pct_change()
        df['high_low_range'] = (df['high'] - df['low']) / df['close']
        df['close_open_change'] = (df['close'] - df['open']) / df['open']
        
        # Volume features
        df['volume_change'] = df['volume'].pct_change()
        df['volume_ma'] = df['volume'].rolling(window=10).mean()
        df['volume_ratio'] = df['volume'] / (df['volume_ma'] + 1e-10)
        
        # Moving averages
        df['sma_5'] = df['close'].rolling(window=5).mean()
        df['sma_10'] = df['close'].rolling(window=10).mean()
        df['sma_20'] = df['close'].rolling(window=20).mean()
        
        # MA ratios (normalized)
        df['price_sma5_ratio'] = df['close'] / (df['sma_5'] + 1e-10) - 1
        df['price_sma10_ratio'] = df['close'] / (df['sma_10'] + 1e-10) - 1
        df['price_sma20_ratio'] = df['close'] / (df['sma_20'] + 1e-10) - 1
        
        # RSI
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / (loss + 1e-10)
        df['rsi'] = 100 - (100 / (1 + rs))
        df['rsi_normalized'] = (df['rsi'] - 50) / 50  # Normalize to [-1, 1]
        
        # VWAP deviation
        df['vwap_deviation'] = (df['close'] - df['vwap']) / df['vwap']
        
        # Funding rate (already normalized)
        # df['funding_rate'] already added
        
        # Drop NaN
        df = df.dropna()
        
        return df
    
    def create_sequences(self, df, horizon=1, threshold=0.001):
        """
        Create sequences for LSTM
        
        horizon: Hours ahead to predict
        threshold: Minimum return to consider as UP/DOWN
        
        Returns:
            X: (samples, sequence_length, features)
            y: (samples, 3) - one-hot encoded [DOWN, SIDEWAYS, UP]
        """
        
        print(f"[LSTM Data] Creating sequences (length={self.sequence_length})...")
        
        # Feature columns for sequences
        feature_cols = [
            'price_change', 'high_low_range', 'close_open_change',
            'volume_change', 'volume_ratio',
            'price_sma5_ratio', 'price_sma10_ratio', 'price_sma20_ratio',
            'rsi_normalized', 'vwap_deviation', 'funding_rate'
        ]
        
        # Create sequences
        X_list = []
        y_list = []
        
        for i in range(len(df) - self.sequence_length - horizon):
            # Input sequence
            sequence = df[feature_cols].iloc[i:i+self.sequence_length].values
            X_list.append(sequence)
            
            # Target (future return)
            current_price = df['close'].iloc[i + self.sequence_length - 1]
            future_price = df['close'].iloc[i + self.sequence_length + horizon - 1]
            future_return = (future_price - current_price) / current_price
            
            # Classify
            if future_return > threshold:
                target = [0, 0, 1]  # UP
            elif future_return < -threshold:
                target = [1, 0, 0]  # DOWN
            else:
                target = [0, 1, 0]  # SIDEWAYS
            
            y_list.append(target)
        
        X = np.array(X_list)
        y = np.array(y_list)
        
        print(f"[LSTM Data] X shape: {X.shape}")
        print(f"[LSTM Data] y shape: {y.shape}")
        print(f"[LSTM Data] Class distribution: DOWN={y[:,0].sum()}, SIDEWAYS={y[:,1].sum()}, UP={y[:,2].sum()}")
        
        return X, y


class LSTMTrainer:
    """Train LSTM model"""
    
    def __init__(self, sequence_length=20, n_features=11):
        self.sequence_length = sequence_length
        self.n_features = n_features
        self.model = None
        self.history = None
    
    def build_model(self, lstm_units=64, dropout=0.2, learning_rate=0.001):
        """Build LSTM architecture"""
        
        print(f"\n{'='*70}")
        print(f"  LSTM Model Architecture")
        print(f"{'='*70}\n")
        
        model = Sequential([
            # First LSTM layer
            LSTM(lstm_units, return_sequences=True, 
                 input_shape=(self.sequence_length, self.n_features)),
            BatchNormalization(),
            Dropout(dropout),
            
            # Second LSTM layer
            LSTM(lstm_units, return_sequences=False),
            BatchNormalization(),
            Dropout(dropout),
            
            # Dense layers
            Dense(32, activation='relu'),
            Dropout(dropout),
            
            # Output layer (3 classes: DOWN, SIDEWAYS, UP)
            Dense(3, activation='softmax')
        ])
        
        # Compile
        optimizer = Adam(learning_rate=learning_rate)
        model.compile(
            optimizer=optimizer,
            loss='categorical_crossentropy',
            metrics=['accuracy', 'categorical_crossentropy']
        )
        
        self.model = model
        
        print(model.summary())
        print(f"\n[LSTM] ✅ Model built successfully\n")
        
        return model
    
    def train(self, X_train, y_train, X_val, y_val, epochs=50, batch_size=32):
        """Train LSTM model"""
        
        print(f"\n{'='*70}")
        print(f"  LSTM Training")
        print(f"{'='*70}\n")
        
        print(f"[LSTM] Training samples: {len(X_train)}")
        print(f"[LSTM] Validation samples: {len(X_val)}")
        print(f"[LSTM] Epochs: {epochs}")
        print(f"[LSTM] Batch size: {batch_size}")
        
        # Callbacks
        callbacks = [
            EarlyStopping(
                monitor='val_loss',
                patience=10,
                restore_best_weights=True,
                verbose=1
            ),
            ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.5,
                patience=5,
                min_lr=1e-6,
                verbose=1
            )
        ]
        
        # Train
        print(f"\n[LSTM] Starting training...\n")
        self.history = self.model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=epochs,
            batch_size=batch_size,
            callbacks=callbacks,
            verbose=1
        )
        
        print(f"\n[LSTM] ✅ Training complete\n")
        
        # Evaluate
        print(f"[LSTM] Evaluating on validation set...")
        val_loss, val_accuracy, val_ce = self.model.evaluate(X_val, y_val, verbose=0)
        
        # Predictions
        y_pred_probs = self.model.predict(X_val, verbose=0)
        y_pred = np.argmax(y_pred_probs, axis=1)
        y_true = np.argmax(y_val, axis=1)
        
        # Direction accuracy (UP vs DOWN, ignoring SIDEWAYS)
        up_down_mask = (y_true != 1) & (y_pred != 1)  # Not SIDEWAYS
        if up_down_mask.sum() > 0:
            direction_accuracy = (y_pred[up_down_mask] == y_true[up_down_mask]).mean()
        else:
            direction_accuracy = 0.0
        
        # Class-wise accuracy
        class_names = ['DOWN', 'SIDEWAYS', 'UP']
        print(f"\n[LSTM] Validation Results:")
        print(f"  Overall Accuracy: {val_accuracy:.3f}")
        print(f"  Direction Accuracy (UP vs DOWN): {direction_accuracy:.3f}")
        print(f"  Validation Loss: {val_loss:.4f}")
        
        print(f"\n[LSTM] Class-wise Accuracy:")
        for i, name in enumerate(class_names):
            mask = y_true == i
            if mask.sum() > 0:
                class_acc = (y_pred[mask] == i).mean()
                print(f"  {name}: {class_acc:.3f} ({mask.sum()} samples)")
        
        return {
            'val_accuracy': float(val_accuracy),
            'direction_accuracy': float(direction_accuracy),
            'val_loss': float(val_loss),
            'epochs_trained': len(self.history.history['loss'])
        }
    
    def save(self, path):
        """Save model"""
        self.model.save(path)
        print(f"\n[LSTM] 💾 Model saved to: {path}")


def main():
    """Main training routine"""
    
    print("\n" + "="*70)
    print("  Ensemble ML Training - Week 2")
    print("  LSTM for Time Series Prediction")
    print("="*70 + "\n")
    
    # Configuration
    SYMBOL = 'BTCUSDT'
    DAYS = 90
    SEQUENCE_LENGTH = 20
    TEST_SIZE = 0.2
    EPOCHS = 50
    BATCH_SIZE = 32
    OUTPUT_DIR = '/opt/binance-bot/ml_models/ensemble'
    
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Step 1: Prepare data
    preparator = LSTMDataPreparator(sequence_length=SEQUENCE_LENGTH)
    X, y, df = preparator.load_and_prepare_data(SYMBOL, days=DAYS)
    
    # Step 2: Train/val split (chronological)
    split_idx = int(len(X) * (1 - TEST_SIZE))
    X_train, X_val = X[:split_idx], X[split_idx:]
    y_train, y_val = y[:split_idx], y[split_idx:]
    
    print(f"\n[Data] Train/Val Split:")
    print(f"  Training: {len(X_train)} sequences")
    print(f"  Validation: {len(X_val)} sequences")
    print(f"  Sequence length: {SEQUENCE_LENGTH}")
    print(f"  Features: {X.shape[2]}")
    
    # Step 3: Build and train LSTM
    trainer = LSTMTrainer(sequence_length=SEQUENCE_LENGTH, n_features=X.shape[2])
    trainer.build_model(lstm_units=64, dropout=0.2, learning_rate=0.001)
    metrics = trainer.train(X_train, y_train, X_val, y_val, epochs=EPOCHS, batch_size=BATCH_SIZE)
    trainer.save(f'{OUTPUT_DIR}/lstm_model.keras')
    
    # Step 4: Save metadata
    metadata = {
        'symbol': SYMBOL,
        'days': DAYS,
        'sequence_length': SEQUENCE_LENGTH,
        'train_samples': len(X_train),
        'val_samples': len(X_val),
        'n_features': int(X.shape[2]),
        'metrics': metrics,
        'timestamp': datetime.now().isoformat()
    }
    
    with open(f'{OUTPUT_DIR}/lstm_metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"\n[Metadata] 💾 Saved to: {OUTPUT_DIR}/lstm_metadata.json")
    
    # Summary
    print(f"\n{'='*70}")
    print(f"  TRAINING SUMMARY")
    print(f"{'='*70}")
    print(f"  Overall Accuracy: {metrics['val_accuracy']:.3f}")
    print(f"  Direction Accuracy: {metrics['direction_accuracy']:.3f}")
    print(f"  Validation Loss: {metrics['val_loss']:.4f}")
    print(f"  Epochs Trained: {metrics['epochs_trained']}")
    print(f"{'='*70}\n")
    
    print(f"[Complete] ✅ Week 2 LSTM training complete!")
    print(f"[Complete] Model saved to: {OUTPUT_DIR}/lstm_model.keras")
    print(f"\n{'='*70}\n")


if __name__ == '__main__':
    main()

