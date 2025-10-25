#!/usr/bin/env python3
"""
ML Confidence Scorer
Loads ensemble models and scores trade confidence
"""

import sys
import json
import numpy as np
import pickle
import os

# Suppress TensorFlow warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import tensorflow as tf


class ConfidenceScorer:
    """Score trade confidence using ensemble models"""
    
    def __init__(self, models_dir='/opt/binance-bot/ml_models/ensemble_v2'):
        self.models_dir = models_dir
        self.rf_model = None
        self.xgb_model = None
        self.lstm_model = None
        
    def load_models(self):
        """Load all ensemble models"""
        
        try:
            # Load Random Forest
            with open(f'{self.models_dir}/random_forest.pkl', 'rb') as f:
                self.rf_model = pickle.load(f)
            
            # Load XGBoost
            import xgboost as xgb
            self.xgb_model = xgb.XGBClassifier()
            self.xgb_model.load_model(f'{self.models_dir}/xgboost.json')
            
            # Load LSTM
            self.lstm_model = tf.keras.models.load_model(f'{self.models_dir}/lstm_model.keras')
            
            return True
            
        except Exception as e:
            print(f"Error loading models: {e}", file=sys.stderr)
            return False
    
    def prepare_features(self, state):
        """Prepare features from market state"""
        
        # Extract features (matching training)
        features = [
            state.get('price', 0),
            state.get('volume', 0),
            state.get('volatility', 0),
            state.get('rsi', 50),
            state.get('macd', 0),
            state.get('bb_position', 0.5),
            state.get('funding_rate', 0),
            state.get('vwap_deviation', 0),
            # Add derived features
            state.get('price', 0) * 0.01,  # price_change proxy
            state.get('volatility', 0) * 2,  # high_low_range proxy
            state.get('volume', 0) * 0.01,  # volume_change proxy
        ]
        
        return np.array(features).reshape(1, -1)
    
    def score_confidence(self, state, direction):
        """Score confidence for a trade signal"""
        
        # Prepare features
        X = self.prepare_features(state)
        
        # Get predictions from each model
        rf_proba = self.rf_model.predict_proba(X)[0]
        xgb_proba = self.xgb_model.predict_proba(X)[0]
        
        # LSTM needs sequence (use current state repeated)
        X_seq = np.repeat(X, 20, axis=0).reshape(1, 20, -1)
        lstm_proba = self.lstm_model.predict(X_seq, verbose=0)[0]
        
        # Map direction to class
        # 0=DOWN, 1=SIDEWAYS, 2=UP
        if direction == 'BUY':
            target_class = 2  # UP
        else:
            target_class = 0  # DOWN
        
        # Get confidence for target class
        rf_confidence = float(rf_proba[target_class])
        xgb_confidence = float(xgb_proba[target_class])
        lstm_confidence = float(lstm_proba[target_class])
        
        return {
            'rf_confidence': rf_confidence,
            'xgb_confidence': xgb_confidence,
            'lstm_confidence': lstm_confidence
        }


def main():
    """Main entry point"""
    
    if len(sys.argv) < 3:
        print("Usage: confidence_scorer.py <state_json> <direction>", file=sys.stderr)
        sys.exit(1)
    
    try:
        # Parse arguments
        state_json = sys.argv[1]
        direction = sys.argv[2]
        
        state = json.loads(state_json)
        
        # Load and score
        scorer = ConfidenceScorer()
        if not scorer.load_models():
            # Return neutral confidence on error
            result = {
                'rf_confidence': 0.50,
                'xgb_confidence': 0.50,
                'lstm_confidence': 0.50
            }
        else:
            result = scorer.score_confidence(state, direction)
        
        # Output JSON
        print(json.dumps(result))
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        # Return neutral confidence on error
        result = {
            'rf_confidence': 0.50,
            'xgb_confidence': 0.50,
            'lstm_confidence': 0.50
        }
        print(json.dumps(result))


if __name__ == '__main__':
    main()

