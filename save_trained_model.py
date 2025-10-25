import sys
import os
import json
import numpy as np
from datetime import datetime

# Add the training script directory to path
sys.path.insert(0, '/opt/binance-bot')

# Import from training script
from train_enhanced_ppo import PPOAgent, CONFIG

def save_model():
    print('[Save] Creating PPO agent...')
    agent = PPOAgent(CONFIG['state_dim'], CONFIG['action_dim'], 
                     lr=CONFIG['learning_rate'], 
                     gamma=CONFIG['gamma'], 
                     epsilon=CONFIG['epsilon'])
    
    # Note: The model was already trained but not saved due to the error
    # We'll create a fresh model directory for future training runs
    model_dir = f"/opt/binance-bot/ml_models/enhanced_ppo_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    print(f'[Save] Model directory: {model_dir}')
    print('[Save] Note: Previous training completed but model was not saved due to filename error.')
    print('[Save] The training script has been fixed for future runs.')
    print('[Save] To use the trained model, re-run training with the fixed script.')
    
    # Save training metadata
    metadata = {
        'training_date': datetime.now().isoformat(),
        'config': CONFIG,
        'status': 'Training completed but model save failed due to Keras filename requirement',
        'fix_applied': 'Updated to use .weights.h5 extension',
        'next_steps': 'Re-run training with fixed script to save model'
    }
    
    os.makedirs('/opt/binance-bot/ml_models', exist_ok=True)
    with open('/opt/binance-bot/ml_models/training_log.json', 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print('[Save] Training log saved to ml_models/training_log.json')
    print('[Save] Fixed training script ready for next run')

if __name__ == '__main__':
    save_model()
