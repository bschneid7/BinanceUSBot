#!/usr/bin/env python3
"""
Ensemble ML Training - Week 1: Random Forest + XGBoost

Trains Random Forest and XGBoost models on engineered features.
"""

import sys
import os
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import json
import pickle

# ML libraries
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.metrics import classification_report, confusion_matrix
import xgboost as xgb

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from train_enhanced_ppo import CDDDataLoader


class FeatureEngineer:
    """Feature engineering for ensemble models"""
    
    def __init__(self):
        self.loader = CDDDataLoader()
    
    def calculate_technical_indicators(self, df):
        """Calculate technical indicators"""
        
        # RSI (Relative Strength Index)
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / (loss + 1e-10)
        df['rsi'] = 100 - (100 / (1 + rs))
        
        # MACD (Moving Average Convergence Divergence)
        ema12 = df['close'].ewm(span=12, adjust=False).mean()
        ema26 = df['close'].ewm(span=26, adjust=False).mean()
        df['macd'] = ema12 - ema26
        df['macd_signal'] = df['macd'].ewm(span=9, adjust=False).mean()
        df['macd_hist'] = df['macd'] - df['macd_signal']
        
        # Bollinger Bands
        sma20 = df['close'].rolling(window=20).mean()
        std20 = df['close'].rolling(window=20).std()
        df['bb_upper'] = sma20 + (std20 * 2)
        df['bb_lower'] = sma20 - (std20 * 2)
        df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / sma20
        df['bb_position'] = (df['close'] - df['bb_lower']) / (df['bb_upper'] - df['bb_lower'] + 1e-10)
        
        # Moving Averages
        df['sma_5'] = df['close'].rolling(window=5).mean()
        df['sma_10'] = df['close'].rolling(window=10).mean()
        df['sma_20'] = df['close'].rolling(window=20).mean()
        df['ema_5'] = df['close'].ewm(span=5, adjust=False).mean()
        df['ema_10'] = df['close'].ewm(span=10, adjust=False).mean()
        
        # Price momentum
        df['momentum_1h'] = df['close'].pct_change(1)
        df['momentum_4h'] = df['close'].pct_change(4)
        df['momentum_24h'] = df['close'].pct_change(24)
        
        # Volume indicators
        df['volume_sma_20'] = df['volume'].rolling(window=20).mean()
        df['volume_ratio'] = df['volume'] / (df['volume_sma_20'] + 1e-10)
        
        # ATR (Average True Range)
        high_low = df['high'] - df['low']
        high_close = np.abs(df['high'] - df['close'].shift())
        low_close = np.abs(df['low'] - df['close'].shift())
        true_range = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
        df['atr'] = true_range.rolling(window=14).mean()
        df['atr_pct'] = df['atr'] / df['close']
        
        return df
    
    def add_cdd_features(self, df, funding_df, vwap_df):
        """Add CryptoDataDownload features"""
        
        # Funding rate features
        if len(funding_df) > 0:
            # Merge funding rates
            funding_dict = dict(zip(funding_df['unix'], funding_df['last_funding_rate']))
            df['funding_rate'] = df['unix'].map(funding_dict).fillna(0)
            df['funding_trend'] = df['funding_rate'].rolling(window=8).mean()
        else:
            df['funding_rate'] = 0
            df['funding_trend'] = 0
        
        # VWAP features
        if len(vwap_df) > 0:
            vwap_dict = dict(zip(vwap_df['unix'], vwap_df['vwap']))
            df['vwap'] = df['unix'].map(vwap_dict).fillna(df['close'])
            df['vwap_deviation'] = (df['close'] - df['vwap']) / df['vwap']
        else:
            df['vwap'] = df['close']
            df['vwap_deviation'] = 0
        
        return df
    
    def create_target(self, df, horizon=1, threshold=0.001):
        """
        Create target variable for classification
        
        horizon: Number of hours ahead to predict
        threshold: Minimum return to consider as UP/DOWN (0.1%)
        
        Returns:
            0 = DOWN (return < -threshold)
            1 = SIDEWAYS (abs(return) <= threshold)
            2 = UP (return > threshold)
        """
        future_return = df['close'].shift(-horizon) / df['close'] - 1
        
        target = np.where(future_return > threshold, 2,  # UP
                         np.where(future_return < -threshold, 0,  # DOWN
                                 1))  # SIDEWAYS
        
        df['target'] = target
        df['future_return'] = future_return
        
        return df
    
    def prepare_features(self, symbol='BTCUSDT', days=90):
        """Prepare full feature set"""
        
        print(f"[FeatureEngineer] Loading data for {symbol} ({days} days)...")
        
        # Load data
        self.loader.connect()
        ohlcv_df = self.loader.load_ohlcv(symbol, days=days)
        funding_df = self.loader.load_funding_rates(symbol)
        vwap_df = self.loader.load_vwap(symbol)
        self.loader.close()
        
        print(f"[FeatureEngineer] Loaded {len(ohlcv_df)} OHLCV records")
        
        # Convert to numeric
        print(f"[FeatureEngineer] Converting data types...")
        for col in ['open', 'high', 'low', 'close', 'volume']:
            ohlcv_df[col] = pd.to_numeric(ohlcv_df[col], errors='coerce')
        
        # Calculate features
        print(f"[FeatureEngineer] Calculating technical indicators...")
        df = self.calculate_technical_indicators(ohlcv_df)
        
        print(f"[FeatureEngineer] Adding CDD features...")
        df = self.add_cdd_features(df, funding_df, vwap_df)
        
        print(f"[FeatureEngineer] Creating target variable...")
        df = self.create_target(df, horizon=1, threshold=0.001)
        
        # Drop NaN rows (from rolling calculations)
        df = df.dropna()
        
        print(f"[FeatureEngineer] ✅ Final dataset: {len(df)} samples")
        
        return df


class RandomForestTrainer:
    """Train Random Forest classifier"""
    
    def __init__(self, n_estimators=500, max_depth=10):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.model = None
        self.feature_names = None
    
    def train(self, X_train, y_train, X_val, y_val):
        """Train Random Forest"""
        
        print(f"\n{'='*70}")
        print(f"  Random Forest Training")
        print(f"{'='*70}\n")
        
        print(f"[RF] Training samples: {len(X_train)}")
        print(f"[RF] Validation samples: {len(X_val)}")
        print(f"[RF] Features: {X_train.shape[1]}")
        print(f"[RF] Classes: {len(np.unique(y_train))}")
        
        # Train
        print(f"\n[RF] Training Random Forest ({self.n_estimators} trees, max_depth={self.max_depth})...")
        self.model = RandomForestClassifier(
            n_estimators=self.n_estimators,
            max_depth=self.max_depth,
            min_samples_split=10,
            min_samples_leaf=5,
            random_state=42,
            n_jobs=-1,
            verbose=1
        )
        
        self.model.fit(X_train, y_train)
        print(f"[RF] ✅ Training complete")
        
        # Validation
        print(f"\n[RF] Evaluating on validation set...")
        y_pred = self.model.predict(X_val)
        accuracy = (y_pred == y_val).mean()
        
        print(f"\n[RF] Validation Accuracy: {accuracy:.3f}")
        print(f"\n[RF] Classification Report:")
        print(classification_report(y_val, y_pred, target_names=['DOWN', 'SIDEWAYS', 'UP']))
        
        # Cross-validation
        print(f"\n[RF] Running 5-fold cross-validation...")
        cv_scores = cross_val_score(self.model, X_train, y_train, cv=5, scoring='accuracy')
        print(f"[RF] CV Accuracy: {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")
        
        return {
            'val_accuracy': accuracy,
            'cv_mean': cv_scores.mean(),
            'cv_std': cv_scores.std()
        }
    
    def get_feature_importance(self, feature_names, top_n=20):
        """Get feature importance"""
        
        if self.model is None:
            return None
        
        importances = self.model.feature_importances_
        indices = np.argsort(importances)[::-1]
        
        print(f"\n[RF] Top {top_n} Feature Importances:")
        print(f"{'='*70}")
        for i in range(min(top_n, len(feature_names))):
            idx = indices[i]
            print(f"  {i+1:2d}. {feature_names[idx]:<30} {importances[idx]:.4f}")
        print(f"{'='*70}\n")
        
        return list(zip([feature_names[i] for i in indices], importances[indices]))
    
    def save(self, path):
        """Save model"""
        with open(path, 'wb') as f:
            pickle.dump(self.model, f)
        print(f"[RF] 💾 Model saved to: {path}")


class XGBoostTrainer:
    """Train XGBoost regressor for expected return prediction"""
    
    def __init__(self, n_estimators=1000, max_depth=6, learning_rate=0.01):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.learning_rate = learning_rate
        self.model = None
    
    def train(self, X_train, y_train, X_val, y_val):
        """Train XGBoost"""
        
        print(f"\n{'='*70}")
        print(f"  XGBoost Training")
        print(f"{'='*70}\n")
        
        print(f"[XGB] Training samples: {len(X_train)}")
        print(f"[XGB] Validation samples: {len(X_val)}")
        print(f"[XGB] Features: {X_train.shape[1]}")
        
        # Train
        print(f"\n[XGB] Training XGBoost ({self.n_estimators} rounds, lr={self.learning_rate})...")
        self.model = xgb.XGBRegressor(
            n_estimators=self.n_estimators,
            max_depth=self.max_depth,
            learning_rate=self.learning_rate,
            objective='reg:squarederror',
            random_state=42,
            n_jobs=-1,
            verbosity=1
        )
        
        # XGBoost 3.x sklearn API
        self.model.set_params(early_stopping_rounds=50)
        self.model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            verbose=True
        )
        
        print(f"[XGB] ✅ Training complete (best iteration: {self.model.best_iteration})")
        
        # Validation
        print(f"\n[XGB] Evaluating on validation set...")
        y_pred = self.model.predict(X_val)
        
        # Metrics
        mae = np.mean(np.abs(y_pred - y_val))
        rmse = np.sqrt(np.mean((y_pred - y_val)**2))
        
        # Direction accuracy (did we predict the right direction?)
        direction_correct = ((y_pred > 0) == (y_val > 0)).mean()
        
        print(f"\n[XGB] Validation Metrics:")
        print(f"  MAE:  {mae:.6f}")
        print(f"  RMSE: {rmse:.6f}")
        print(f"  Direction Accuracy: {direction_correct:.3f}")
        
        return {
            'val_mae': mae,
            'val_rmse': rmse,
            'direction_accuracy': direction_correct,
            'best_iteration': self.model.best_iteration
        }
    
    def get_feature_importance(self, feature_names, top_n=20):
        """Get feature importance"""
        
        if self.model is None:
            return None
        
        importances = self.model.feature_importances_
        indices = np.argsort(importances)[::-1]
        
        print(f"\n[XGB] Top {top_n} Feature Importances:")
        print(f"{'='*70}")
        for i in range(min(top_n, len(feature_names))):
            idx = indices[i]
            print(f"  {i+1:2d}. {feature_names[idx]:<30} {importances[idx]:.4f}")
        print(f"{'='*70}\n")
        
        return list(zip([feature_names[i] for i in indices], importances[indices]))
    
    def save(self, path):
        """Save model"""
        self.model.save_model(path)
        print(f"[XGB] 💾 Model saved to: {path}")


def main():
    """Main training routine"""
    
    print("\n" + "="*70)
    print("  Ensemble ML Training - Week 1")
    print("  Random Forest + XGBoost")
    print("="*70 + "\n")
    
    # Configuration
    SYMBOL = 'BTCUSDT'
    DAYS = 90  # 90 days of data
    TEST_SIZE = 0.2
    OUTPUT_DIR = '/opt/binance-bot/ml_models/ensemble'
    
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Step 1: Feature Engineering
    engineer = FeatureEngineer()
    df = engineer.prepare_features(SYMBOL, days=DAYS)
    
    # Step 2: Prepare train/val split
    feature_cols = [col for col in df.columns if col not in ['target', 'future_return', 'unix']]
    
    X = df[feature_cols].values
    y_class = df['target'].values  # For Random Forest (classification)
    y_reg = df['future_return'].values  # For XGBoost (regression)
    
    # Train/val split (chronological)
    split_idx = int(len(X) * (1 - TEST_SIZE))
    X_train, X_val = X[:split_idx], X[split_idx:]
    y_class_train, y_class_val = y_class[:split_idx], y_class[split_idx:]
    y_reg_train, y_reg_val = y_reg[:split_idx], y_reg[split_idx:]
    
    print(f"\n[Data] Train/Val Split:")
    print(f"  Training: {len(X_train)} samples")
    print(f"  Validation: {len(X_val)} samples")
    print(f"  Features: {len(feature_cols)}")
    
    # Step 3: Train Random Forest
    rf_trainer = RandomForestTrainer(n_estimators=500, max_depth=10)
    rf_metrics = rf_trainer.train(X_train, y_class_train, X_val, y_class_val)
    rf_trainer.get_feature_importance(feature_cols, top_n=20)
    rf_trainer.save(f'{OUTPUT_DIR}/random_forest.pkl')
    
    # Step 4: Train XGBoost
    xgb_trainer = XGBoostTrainer(n_estimators=1000, max_depth=6, learning_rate=0.01)
    xgb_metrics = xgb_trainer.train(X_train, y_reg_train, X_val, y_reg_val)
    xgb_trainer.get_feature_importance(feature_cols, top_n=20)
    xgb_trainer.save(f'{OUTPUT_DIR}/xgboost.json')
    
    # Step 5: Save metadata
    metadata = {
        'symbol': SYMBOL,
        'days': DAYS,
        'train_samples': len(X_train),
        'val_samples': len(X_val),
        'features': feature_cols,
        'rf_metrics': rf_metrics,
        'xgb_metrics': xgb_metrics,
        'timestamp': datetime.now().isoformat()
    }
    
    with open(f'{OUTPUT_DIR}/metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"\n[Metadata] 💾 Saved to: {OUTPUT_DIR}/metadata.json")
    
    # Summary
    print(f"\n{'='*70}")
    print(f"  TRAINING SUMMARY")
    print(f"{'='*70}")
    print(f"  Random Forest:")
    print(f"    Validation Accuracy: {rf_metrics['val_accuracy']:.3f}")
    print(f"    CV Accuracy: {rf_metrics['cv_mean']:.3f} ± {rf_metrics['cv_std']:.3f}")
    print(f"\n  XGBoost:")
    print(f"    MAE: {xgb_metrics['val_mae']:.6f}")
    print(f"    RMSE: {xgb_metrics['val_rmse']:.6f}")
    print(f"    Direction Accuracy: {xgb_metrics['direction_accuracy']:.3f}")
    print(f"{'='*70}\n")
    
    print(f"[Complete] ✅ Week 1 training complete!")
    print(f"[Complete] Models saved to: {OUTPUT_DIR}/")
    print(f"\n{'='*70}\n")


if __name__ == '__main__':
    main()

