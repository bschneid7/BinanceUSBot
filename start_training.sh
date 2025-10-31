#!/bin/bash
cd /opt/binance-bot
echo "Starting 1000-episode Grid PPO ML training at $(date)"
echo "Estimated completion: 8-10 hours"
echo "Logs will be saved to: /opt/binance-bot/training_1000.log"

# Run training in background with nohup
nohup npx ts-node train_grid_ppo_1000.ts > /opt/binance-bot/training_1000.log 2>&1 &

PID=$!
echo "Training started with PID: $PID"
echo $PID > /opt/binance-bot/training.pid
echo "Monitor progress with: tail -f /opt/binance-bot/training_1000.log"
echo "Check status with: ps -p $(cat /opt/binance-bot/training.pid)"
