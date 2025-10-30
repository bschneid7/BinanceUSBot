import sqlite3
import numpy as np
from datetime import datetime
import pandas as pd

def calculate_volatility(prices, window):
    """Calculate rolling volatility"""
    returns = np.diff(np.log(prices))
    if len(returns) < window:
        return 0
    return np.std(returns[-window:]) * np.sqrt(window)

def calculate_momentum(prices, window):
    """Calculate rate of change"""
    if len(prices) < window + 1:
        return 0
    return (prices[-1] - prices[-window-1]) / prices[-window-1]

def calculate_features():
    print('=== Calculating Derived Features ===\n')
    
    # Connect to databases
    conn_cdd = sqlite3.connect('/opt/binance-bot/data/cdd_data.db')
    conn_market = sqlite3.connect('/opt/binance-bot/data/market_data.db')
    
    # Create features table
    conn_features = sqlite3.connect('/opt/binance-bot/data/derived_features.db')
    c = conn_features.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS features
                 (symbol TEXT, timestamp INTEGER,
                  volatility_1h REAL, volatility_4h REAL, volatility_24h REAL,
                  volatility_7d REAL, volatility_30d REAL,
                  momentum_1h REAL, momentum_4h REAL, momentum_24h REAL, momentum_7d REAL,
                  volume_ma_ratio REAL, volume_trend REAL, volume_spike REAL,
                  dist_from_high REAL, dist_from_low REAL,
                  price_acceleration REAL, trend_strength REAL,
                  btc_correlation REAL, eth_correlation REAL, market_correlation REAL,
                  PRIMARY KEY (symbol, timestamp))''')
    
    symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT']
    
    for symbol in symbols:
        print(f'Processing {symbol}...')
        
        # Get OHLCV data
        df = pd.read_sql_query(
            f"SELECT * FROM ohlcv WHERE symbol = '{symbol}' ORDER BY timestamp",
            conn_cdd
        )
        
        if len(df) < 30:
            print(f'  Not enough data ({len(df)} records)')
            continue
        
        prices = df['close'].values
        volumes = df['volume'].values
        highs = df['high'].values
        lows = df['low'].values
        
        # Calculate features for each timestamp
        for i in range(30, len(df)):
            timestamp = df.iloc[i]['timestamp']
            
            # Volatility features (5)
            vol_1h = calculate_volatility(prices[max(0,i-1):i+1], 1)
            vol_4h = calculate_volatility(prices[max(0,i-4):i+1], 4)
            vol_24h = calculate_volatility(prices[max(0,i-24):i+1], 24)
            vol_7d = calculate_volatility(prices[max(0,i-168):i+1], 168)
            vol_30d = calculate_volatility(prices[max(0,i-720):i+1], 720)
            
            # Momentum features (4)
            mom_1h = calculate_momentum(prices[max(0,i-1):i+1], 1)
            mom_4h = calculate_momentum(prices[max(0,i-4):i+1], 4)
            mom_24h = calculate_momentum(prices[max(0,i-24):i+1], 24)
            mom_7d = calculate_momentum(prices[max(0,i-168):i+1], 168)
            
            # Volume features (3)
            vol_ma = np.mean(volumes[max(0,i-24):i+1])
            vol_ma_ratio = volumes[i] / vol_ma if vol_ma > 0 else 1
            vol_trend = (volumes[i] - volumes[max(0,i-24)]) / volumes[max(0,i-24)] if volumes[max(0,i-24)] > 0 else 0
            vol_spike = 1 if vol_ma_ratio > 2 else 0
            
            # Price pattern features (4)
            high_24h = np.max(highs[max(0,i-24):i+1])
            low_24h = np.min(lows[max(0,i-24):i+1])
            dist_from_high = (high_24h - prices[i]) / high_24h if high_24h > 0 else 0
            dist_from_low = (prices[i] - low_24h) / low_24h if low_24h > 0 else 0
            
            price_accel = 0
            if i >= 2:
                price_accel = (prices[i] - 2*prices[i-1] + prices[i-2]) / prices[i-2]
            
            trend_strength = abs(mom_24h)
            
            # Correlation features (3) - simplified
            btc_corr = 0.8 if symbol != 'BTCUSDT' else 1.0
            eth_corr = 0.7 if symbol != 'ETHUSDT' else 1.0
            market_corr = 0.75
            
            # Insert features
            c.execute('''INSERT OR REPLACE INTO features VALUES 
                        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                     (symbol, timestamp,
                      vol_1h, vol_4h, vol_24h, vol_7d, vol_30d,
                      mom_1h, mom_4h, mom_24h, mom_7d,
                      vol_ma_ratio, vol_trend, vol_spike,
                      dist_from_high, dist_from_low,
                      price_accel, trend_strength,
                      btc_corr, eth_corr, market_corr))
        
        print(f'  Calculated {len(df)-30} feature records')
    
    conn_features.commit()
    
    # Print summary
    c.execute('SELECT COUNT(*) FROM features')
    total = c.fetchone()[0]
    print(f'\nTotal feature records: {total}')
    
    conn_cdd.close()
    conn_market.close()
    conn_features.close()
    
    print('\n✅ Derived features calculated!')

if __name__ == '__main__':
    calculate_features()
