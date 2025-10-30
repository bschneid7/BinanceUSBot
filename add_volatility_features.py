import sqlite3
import numpy as np
import pandas as pd

DB_PATH = '/opt/binance-bot/data/cdd_data.db'
SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT']

def create_volatility_table(conn):
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS volatility_features (
            symbol TEXT,
            unix INTEGER,
            realized_vol_24h REAL,
            realized_vol_7d REAL,
            atr_14 REAL,
            parkinson_vol REAL,
            PRIMARY KEY (symbol, unix)
        )
    ''')
    conn.commit()

def calculate_realized_volatility(returns, window):
    if len(returns) < window:
        return 0.0
    return np.std(returns[-window:]) * np.sqrt(24)  # Annualized hourly vol

def calculate_atr(highs, lows, closes, period=14):
    if len(highs) < period + 1:
        return 0.0
    
    tr_list = []
    for i in range(1, len(highs)):
        h_l = highs[i] - lows[i]
        h_pc = abs(highs[i] - closes[i-1])
        l_pc = abs(lows[i] - closes[i-1])
        tr = max(h_l, h_pc, l_pc)
        tr_list.append(tr)
    
    if len(tr_list) < period:
        return 0.0
    
    return np.mean(tr_list[-period:])

def calculate_parkinson_volatility(highs, lows, window=24):
    if len(highs) < window:
        return 0.0
    
    hl_ratios = np.log(np.array(highs[-window:]) / np.array(lows[-window:]))
    parkinson = np.sqrt(np.mean(hl_ratios ** 2) / (4 * np.log(2)))
    return parkinson

def main():
    print('[VolatilityFeatures] Calculating volatility features')
    
    conn = sqlite3.connect(DB_PATH)
    create_volatility_table(conn)
    cursor = conn.cursor()
    
    for symbol in SYMBOLS:
        print(f'[VolatilityFeatures] Processing {symbol}...')
        
        # Load OHLCV data
        df = pd.read_sql_query(f'''
            SELECT unix, open, high, low, close
            FROM spot_ohlcv
            WHERE Symbol = '{symbol}'
            ORDER BY unix
        ''', conn)
        
        df['close'] = pd.to_numeric(df['close'], errors='coerce')
        df['returns'] = df['close'].pct_change()
        
        # Calculate features for each timestamp
        for i in range(len(df)):
            if i < 168:  # Need at least 7 days of data
                continue
            
            unix_ms = df.iloc[i]['unix']
            
            # Realized volatility
            returns = df['returns'].iloc[:i+1].values
            rv_24h = calculate_realized_volatility(returns, 24)
            rv_7d = calculate_realized_volatility(returns, 168)
            
            # ATR
            highs = df['high'].iloc[:i+1].values
            lows = df['low'].iloc[:i+1].values
            closes = df['close'].iloc[:i+1].values
            atr = calculate_atr(highs, lows, closes)
            
            # Parkinson volatility
            parkinson = calculate_parkinson_volatility(highs, lows)
            
            cursor.execute('''
                INSERT OR REPLACE INTO volatility_features
                (symbol, unix, realized_vol_24h, realized_vol_7d, atr_14, parkinson_vol)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (symbol, unix_ms, rv_24h, rv_7d, atr, parkinson))
            
            if (i + 1) % 500 == 0:
                print(f'[VolatilityFeatures] {symbol}: {i+1}/{len(df)}...', end='\r')
        
        conn.commit()
        print(f'[VolatilityFeatures] {symbol}: Complete ({len(df)} records)    ')
    
    conn.close()
    print('[VolatilityFeatures] All volatility features calculated!')

if __name__ == '__main__':
    main()
