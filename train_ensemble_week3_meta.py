#!/usr/bin/env python3
"""
Ensemble ML Training - Week 3: Meta-Learner

Combines all models using stacking and dynamic weighting.
"""

import sys
import os
import numpy as np
import pandas as pd
from datetime import datetime
import json
import pickle

# ML libraries
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import VotingClassifier
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
import xgboost as xgb

# TensorFlow for LSTM
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import tensorflow as tf

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from train_enhanced_ppo import CDDDataLoader, PPOAgent
from train_ensemble_week1 import FeatureEngineer
from train_ensemble_week2_lstm import LSTMDataPreparator


class EnsemblePredictor:
    """Collect predictions from all models"""
    
    def __init__(self, models_dir='/opt/binance-bot/ml_models'):
        self.models_dir = models_dir
        self.models = {}
        
    def load_models(self):
        """Load all trained models"""
        
        print(f"[Ensemble] Loading models from {self.models_dir}...")
        
        # 1. Load PPO
        try:
            ppo_path = f"{self.models_dir}/checkpoints_20251025_174444/best_model_ep70_r8.16"
            self.models['ppo'] = PPOAgent(state_dim=17, action_dim=4, learning_rate=0.0003)
            self.models['ppo'].load(ppo_path)
            print(f"[Ensemble] ✅ PPO loaded from {ppo_path}")
        except Exception as e:
            print(f"[Ensemble] ⚠️  PPO load failed: {e}")
            self.models['ppo'] = None
        
        # 2. Load Random Forest
        try:
            rf_path = f"{self.models_dir}/ensemble/random_forest.pkl"
            with open(rf_path, 'rb') as f:
                self.models['rf'] = pickle.load(f)
            print(f"[Ensemble] ✅ Random Forest loaded")
        except Exception as e:
            print(f"[Ensemble] ⚠️  Random Forest load failed: {e}")
            self.models['rf'] = None
        
        # 3. Load XGBoost
        try:
            xgb_path = f"{self.models_dir}/ensemble/xgboost.json"
            self.models['xgb'] = xgb.XGBRegressor()
            self.models['xgb'].load_model(xgb_path)
            print(f"[Ensemble] ✅ XGBoost loaded")
        except Exception as e:
            print(f"[Ensemble] ⚠️  XGBoost load failed: {e}")
            self.models['xgb'] = None
        
        # 4. Load LSTM
        try:
            lstm_path = f"{self.models_dir}/ensemble/lstm_model.keras"
            self.models['lstm'] = tf.keras.models.load_model(lstm_path)
            print(f"[Ensemble] ✅ LSTM loaded")
        except Exception as e:
            print(f"[Ensemble] ⚠️  LSTM load failed: {e}")
            self.models['lstm'] = None
        
        # 5. Rule-based system (simple heuristic for now)
        self.models['rules'] = self._create_rule_based_predictor()
        print(f"[Ensemble] ✅ Rule-based system initialized")
        
        return self.models
    
    def _create_rule_based_predictor(self):
        """Simple rule-based predictor"""
        class RulePredictor:
            def predict_proba(self, X):
                """
                Simple rules:
                - If RSI < 30: BUY (UP)
                - If RSI > 70: SELL (DOWN)
                - Else: SIDEWAYS
                """
                predictions = []
                for sample in X:
                    # Assume RSI is feature index 15 (from FeatureEngineer)
                    # For simplicity, use momentum features
                    momentum_1h = sample[8] if len(sample) > 8 else 0
                    
                    if momentum_1h > 0.005:  # Strong up momentum
                        pred = [0.1, 0.2, 0.7]  # UP
                    elif momentum_1h < -0.005:  # Strong down momentum
                        pred = [0.7, 0.2, 0.1]  # DOWN
                    else:
                        pred = [0.25, 0.5, 0.25]  # SIDEWAYS
                    
                    predictions.append(pred)
                
                return np.array(predictions)
        
        return RulePredictor()
    
    def get_predictions(self, X_features, X_sequences):
        """
        Get predictions from all models
        
        X_features: (samples, 29) for RF, XGB, Rules
        X_sequences: (samples, 20, 11) for LSTM
        
        Returns:
            meta_features: (samples, n_models * n_classes)
        """
        
        print(f"\n[Ensemble] Collecting predictions from all models...")
        
        n_samples = len(X_features)
        all_predictions = []
        
        # 1. PPO predictions (skip for now - different state format)
        # We'll use a placeholder
        ppo_preds = np.ones((n_samples, 4)) * 0.25  # Uniform distribution
        all_predictions.append(ppo_preds)
        print(f"[Ensemble] PPO: {ppo_preds.shape} (placeholder)")
        
        # 2. Random Forest
        if self.models['rf'] is not None:
            rf_preds = self.models['rf'].predict_proba(X_features)
            all_predictions.append(rf_preds)
            print(f"[Ensemble] Random Forest: {rf_preds.shape}")
        
        # 3. XGBoost (convert regression to probabilities)
        if self.models['xgb'] is not None:
            xgb_raw = self.models['xgb'].predict(X_features)
            # Convert to class probabilities
            xgb_preds = np.zeros((n_samples, 3))
            for i, val in enumerate(xgb_raw):
                if val > 0.001:
                    xgb_preds[i] = [0.1, 0.2, 0.7]  # UP
                elif val < -0.001:
                    xgb_preds[i] = [0.7, 0.2, 0.1]  # DOWN
                else:
                    xgb_preds[i] = [0.25, 0.5, 0.25]  # SIDEWAYS
            all_predictions.append(xgb_preds)
            print(f"[Ensemble] XGBoost: {xgb_preds.shape}")
        
        # 4. LSTM
        if self.models['lstm'] is not None and X_sequences is not None:
            lstm_preds = self.models['lstm'].predict(X_sequences, verbose=0)
            all_predictions.append(lstm_preds)
            print(f"[Ensemble] LSTM: {lstm_preds.shape}")
        
        # 5. Rules
        if self.models['rules'] is not None:
            rule_preds = self.models['rules'].predict_proba(X_features)
            all_predictions.append(rule_preds)
            print(f"[Ensemble] Rules: {rule_preds.shape}")
        
        # Concatenate all predictions
        meta_features = np.hstack(all_predictions)
        print(f"[Ensemble] ✅ Meta-features shape: {meta_features.shape}\n")
        
        return meta_features


class MetaLearner:
    """Train meta-learner for ensemble"""
    
    def __init__(self):
        self.meta_model = None
        self.voting_ensemble = None
    
    def train_stacking(self, X_meta, y_true):
        """Train stacking meta-learner"""
        
        print(f"\n{'='*70}")
        print(f"  Meta-Learner Training (Stacking)")
        print(f"{'='*70}\n")
        
        print(f"[Meta] Training samples: {len(X_meta)}")
        print(f"[Meta] Meta-features: {X_meta.shape[1]}")
        print(f"[Meta] Classes: {len(np.unique(y_true))}")
        
        # Logistic Regression meta-learner
        self.meta_model = LogisticRegression(
            C=1.0,
            max_iter=1000,
            multi_class='multinomial',
            solver='lbfgs',
            random_state=42
        )
        
        print(f"\n[Meta] Training Logistic Regression meta-learner...")
        self.meta_model.fit(X_meta, y_true)
        
        # Evaluate
        y_pred = self.meta_model.predict(X_meta)
        accuracy = accuracy_score(y_true, y_pred)
        
        print(f"\n[Meta] Training Accuracy: {accuracy:.3f}")
        print(f"\n[Meta] Classification Report:")
        print(classification_report(y_true, y_pred, target_names=['DOWN', 'SIDEWAYS', 'UP']))
        
        return {
            'train_accuracy': float(accuracy)
        }
    
    def create_voting_ensemble(self, X_meta, y_true):
        """Create simple voting ensemble for comparison"""
        
        print(f"\n{'='*70}")
        print(f"  Voting Ensemble (Baseline)")
        print(f"{'='*70}\n")
        
        # Simple majority vote from meta-features
        # Each model contributes 3-4 features (class probabilities)
        # Extract argmax from each model's predictions
        
        n_samples = len(X_meta)
        votes = []
        
        # PPO (4 classes, take first 3)
        ppo_votes = np.argmax(X_meta[:, :3], axis=1)
        votes.append(ppo_votes)
        
        # RF (3 classes)
        rf_votes = np.argmax(X_meta[:, 4:7], axis=1)
        votes.append(rf_votes)
        
        # XGB (3 classes)
        xgb_votes = np.argmax(X_meta[:, 7:10], axis=1)
        votes.append(xgb_votes)
        
        # LSTM (3 classes)
        lstm_votes = np.argmax(X_meta[:, 10:13], axis=1)
        votes.append(lstm_votes)
        
        # Rules (3 classes)
        rule_votes = np.argmax(X_meta[:, 13:16], axis=1)
        votes.append(rule_votes)
        
        # Majority vote
        votes_array = np.array(votes).T  # (samples, n_models)
        ensemble_pred = []
        for i in range(n_samples):
            counts = np.bincount(votes_array[i], minlength=3)
            ensemble_pred.append(np.argmax(counts))
        
        ensemble_pred = np.array(ensemble_pred)
        accuracy = accuracy_score(y_true, ensemble_pred)
        
        print(f"[Voting] Accuracy: {accuracy:.3f}")
        print(f"\n[Voting] Classification Report:")
        print(classification_report(y_true, ensemble_pred, target_names=['DOWN', 'SIDEWAYS', 'UP']))
        
        return {
            'voting_accuracy': float(accuracy),
            'predictions': ensemble_pred
        }
    
    def save(self, path):
        """Save meta-learner"""
        with open(path, 'wb') as f:
            pickle.dump(self.meta_model, f)
        print(f"\n[Meta] 💾 Meta-learner saved to: {path}")


def main():
    """Main training routine"""
    
    print("\n" + "="*70)
    print("  Ensemble ML Training - Week 3")
    print("  Meta-Learner & Ensemble Integration")
    print("="*70 + "\n")
    
    # Configuration
    SYMBOL = 'BTCUSDT'
    DAYS = 90
    SEQUENCE_LENGTH = 20
    OUTPUT_DIR = '/opt/binance-bot/ml_models/ensemble'
    
    # Step 1: Load all models
    predictor = EnsemblePredictor()
    predictor.load_models()
    
    # Step 2: Prepare data
    print(f"\n[Data] Preparing validation data...")
    
    # Features for RF, XGB, Rules
    engineer = FeatureEngineer()
    df_features = engineer.prepare_features(SYMBOL, days=DAYS)
    feature_cols = [col for col in df_features.columns if col not in ['target', 'future_return', 'unix']]
    X_features = df_features[feature_cols].values
    y_class = df_features['target'].values
    
    # Sequences for LSTM
    lstm_prep = LSTMDataPreparator(sequence_length=SEQUENCE_LENGTH)
    X_sequences, y_lstm, _ = lstm_prep.load_and_prepare_data(SYMBOL, days=DAYS)
    
    # Align samples (LSTM has fewer due to sequence creation)
    min_samples = min(len(X_features), len(X_sequences))
    X_features = X_features[-min_samples:]
    X_sequences = X_sequences[-min_samples:]
    y_true = np.argmax(y_lstm[-min_samples:], axis=1)  # Convert one-hot to class indices
    
    print(f"[Data] Aligned samples: {min_samples}")
    print(f"[Data] Features shape: {X_features.shape}")
    print(f"[Data] Sequences shape: {X_sequences.shape}")
    
    # Step 3: Get predictions from all models
    meta_features = predictor.get_predictions(X_features, X_sequences)
    
    # Step 4: Train meta-learner
    meta_learner = MetaLearner()
    stacking_metrics = meta_learner.train_stacking(meta_features, y_true)
    meta_learner.save(f'{OUTPUT_DIR}/meta_learner.pkl')
    
    # Step 5: Create voting ensemble for comparison
    voting_metrics = meta_learner.create_voting_ensemble(meta_features, y_true)
    
    # Step 6: Save metadata
    metadata = {
        'symbol': SYMBOL,
        'days': DAYS,
        'samples': int(min_samples),
        'meta_features': int(meta_features.shape[1]),
        'stacking_metrics': stacking_metrics,
        'voting_metrics': {k: v for k, v in voting_metrics.items() if k != 'predictions'},
        'timestamp': datetime.now().isoformat()
    }
    
    with open(f'{OUTPUT_DIR}/meta_learner_metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"\n[Metadata] 💾 Saved to: {OUTPUT_DIR}/meta_learner_metadata.json")
    
    # Summary
    print(f"\n{'='*70}")
    print(f"  TRAINING SUMMARY")
    print(f"{'='*70}")
    print(f"  Voting Ensemble Accuracy: {voting_metrics['voting_accuracy']:.3f}")
    print(f"  Stacking Meta-Learner Accuracy: {stacking_metrics['train_accuracy']:.3f}")
    print(f"  Improvement: {(stacking_metrics['train_accuracy'] - voting_metrics['voting_accuracy'])*100:+.1f}%")
    print(f"{'='*70}\n")
    
    print(f"[Complete] ✅ Week 3 meta-learner training complete!")
    print(f"[Complete] Meta-learner saved to: {OUTPUT_DIR}/meta_learner.pkl")
    print(f"\n{'='*70}\n")


if __name__ == '__main__':
    main()

