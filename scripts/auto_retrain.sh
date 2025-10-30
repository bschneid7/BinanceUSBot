
echo "[Tue Oct 28 23:56:01 EDT 2025] Automation script started"

# Wait for current training to complete
TRAIN_PID=272468
echo "[Tue Oct 28 23:56:01 EDT 2025] Waiting for training PID  to complete..."

while kill -0  2>/dev/null; do
    sleep 60
done

echo "[Tue Oct 28 23:56:01 EDT 2025] Training completed! Starting post-processing..."

# Give it a moment
sleep 10

# Check training results
echo "[Tue Oct 28 23:56:01 EDT 2025] Checking training results..."
tail -50 /tmp/training_90days.log > /opt/binance-bot/logs/training_results_20251028.log

# Calculate additional features
echo "[Tue Oct 28 23:56:01 EDT 2025] Calculating derived features..."
cd /opt/binance-bot
python3 << 'PYEOF'
import sqlite3
import numpy as np

print("Calculating volatility and momentum features...")

conn = sqlite3.connect('/opt/binance-bot/data/cdd_data.db')
c = conn.cursor()

# Get OHLCV data
c.execute("SELECT symbol, timestamp, close, volume FROM spot_ohlcv ORDER BY symbol, timestamp")
rows = c.fetchall()

print(f"Processing {len(rows)} OHLCV records...")

# Group by symbol
from collections import defaultdict
symbol_data = defaultdict(list)
for row in rows:
    symbol_data[row[0]].append(row)

# Calculate features for each symbol
for symbol, data in symbol_data.items():
    print(f"  {symbol}: {len(data)} records")
    
    for i in range(min(30, len(data)), len(data)):
        timestamp = data[i][1]
        prices = [d[2] for d in data[max(0,i-30):i+1]]
        
        # Simple volatility
        if len(prices) > 1:
            returns = [np.log(prices[j]/prices[j-1]) for j in range(1, len(prices))]
            vol = np.std(returns) if len(returns) > 0 else 0
            
            c.execute('''INSERT OR REPLACE INTO volatility_features 
                        (symbol, timestamp, volatility_24h) 
                        VALUES (?, ?, ?)''', (symbol, timestamp, vol))

conn.commit()
print("✓ Features calculated")

# Summary
c.execute("SELECT COUNT(*) FROM volatility_features")
print(f"Total volatility records: {c.fetchone()[0]}")

conn.close()
PYEOF

echo "[Tue Oct 28 23:56:01 EDT 2025] ✅ Feature calculation complete"

# Start new training with all features
echo "[Tue Oct 28 23:56:01 EDT 2025] Starting new training run with enhanced features..."
cd /opt/binance-bot
nohup python3 train_enhanced_ppo_90days.py > /tmp/training_enhanced_20251028_235601.log 2>&1 &
NEW_PID=
echo "[Tue Oct 28 23:56:01 EDT 2025] New training started with PID: "

echo "[Tue Oct 28 23:56:01 EDT 2025] ✅ Automation complete! Check logs in the morning."
