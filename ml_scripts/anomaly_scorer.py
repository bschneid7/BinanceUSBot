#!/usr/bin/env python3
"""
Anomaly Scorer
Scores market conditions using trained Isolation Forest
"""

import sys
import json
import numpy as np
import pickle

class AnomalyScorer:
    """Score market conditions for anomalies"""
    
    def __init__(self, models_dir='/opt/binance-bot/ml_models/anomaly'):
        self.models_dir = models_dir
        self.model = None
        self.scaler = None
        
    def load_models(self):
        """Load trained model and scaler"""
        
        try:
            with open(f'{self.models_dir}/isolation_forest.pkl', 'rb') as f:
                self.model = pickle.load(f)
            
            with open(f'{self.models_dir}/scaler.pkl', 'rb') as f:
                self.scaler = pickle.load(f)
            
            return True
            
        except Exception as e:
            print(f"Error loading models: {e}", file=sys.stderr)
            return False
    
    def prepare_features(self, conditions):
        """Prepare features from market conditions"""
        
        # Extract features (matching training)
        features = [
            conditions.get('price', 0),
            conditions.get('priceChange', 0),
            conditions.get('highLowRange', 0),
            conditions.get('volume', 0),
            conditions.get('volumeChange', 0),
            conditions.get('volatility', 0),
            # Add derived features
            conditions.get('price', 0) * (1 + conditions.get('priceChange', 0)),  # price_position proxy
            conditions.get('volume', 0) * (1 + conditions.get('volumeChange', 0)),  # volume_ratio proxy
            conditions.get('priceChange', 0),  # returns_1h
            conditions.get('priceChange', 0) * 4,  # returns_4h proxy
            conditions.get('priceChange', 0) * 24,  # returns_24h proxy
        ]
        
        return np.array(features).reshape(1, -1)
    
    def score(self, conditions):
        """Score market conditions"""
        
        # Prepare features
        X = self.prepare_features(conditions)
        
        # Scale features
        X_scaled = self.scaler.transform(X)
        
        # Get anomaly score
        score = self.model.score_samples(X_scaled)[0]
        
        return {
            'score': float(score)
        }


def main():
    """Main entry point"""
    
    if len(sys.argv) < 2:
        print("Usage: anomaly_scorer.py <conditions_json>", file=sys.stderr)
        sys.exit(1)
    
    try:
        # Parse arguments
        conditions_json = sys.argv[1]
        conditions = json.loads(conditions_json)
        
        # Load and score
        scorer = AnomalyScorer()
        if not scorer.load_models():
            # Return normal score on error
            result = {'score': -0.4}
        else:
            result = scorer.score(conditions)
        
        # Output JSON
        print(json.dumps(result))
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        # Return normal score on error
        result = {'score': -0.4}
        print(json.dumps(result))


if __name__ == '__main__':
    main()

