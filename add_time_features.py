import sqlite3
import numpy as np
from datetime import datetime

DB_PATH = '/opt/binance-bot/data/cdd_data.db'

def create_time_features_table(conn):
    """Create time features table"""
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS time_features (
            unix INTEGER PRIMARY KEY,
            hour_sin REAL,
            hour_cos REAL,
            day_of_week_sin REAL,
            day_of_week_cos REAL,
            day_of_month REAL,
            month_of_year REAL,
            is_weekend INTEGER
        )
    ''')
    conn.commit()

def calculate_time_features(unix_ms):
    """Calculate cyclical time features"""
    dt = datetime.fromtimestamp(unix_ms / 1000)
    
    # Hour (0-23) - cyclical encoding
    hour = dt.hour
    hour_sin = np.sin(2 * np.pi * hour / 24)
    hour_cos = np.cos(2 * np.pi * hour / 24)
    
    # Day of week (0-6) - cyclical encoding
    day_of_week = dt.weekday()
    day_of_week_sin = np.sin(2 * np.pi * day_of_week / 7)
    day_of_week_cos = np.cos(2 * np.pi * day_of_week / 7)
    
    # Day of month (1-31) - normalized
    day_of_month = dt.day / 31.0
    
    # Month of year (1-12) - normalized
    month_of_year = dt.month / 12.0
    
    # Is weekend (0 or 1)
    is_weekend = 1 if day_of_week >= 5 else 0
    
    return {
        'hour_sin': hour_sin,
        'hour_cos': hour_cos,
        'day_of_week_sin': day_of_week_sin,
        'day_of_week_cos': day_of_week_cos,
        'day_of_month': day_of_month,
        'month_of_year': month_of_year,
        'is_weekend': is_weekend
    }

def main():
    print('[TimeFeatures] Adding time-based features to historical data')
    
    conn = sqlite3.connect(DB_PATH)
    create_time_features_table(conn)
    
    # Get all unique timestamps from OHLCV data
    cursor = conn.cursor()
    cursor.execute('SELECT DISTINCT unix FROM spot_ohlcv ORDER BY unix')
    timestamps = [row[0] for row in cursor.fetchall()]
    
    print(f'[TimeFeatures] Processing {len(timestamps)} timestamps...')
    
    # Calculate and store time features
    for i, unix_ms in enumerate(timestamps):
        unix_ms = int(unix_ms)
        features = calculate_time_features(unix_ms)
        
        cursor.execute('''
            INSERT OR REPLACE INTO time_features
            (unix, hour_sin, hour_cos, day_of_week_sin, day_of_week_cos,
             day_of_month, month_of_year, is_weekend)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (unix_ms, features['hour_sin'], features['hour_cos'],
              features['day_of_week_sin'], features['day_of_week_cos'],
              features['day_of_month'], features['month_of_year'],
              features['is_weekend']))
        
        if (i + 1) % 500 == 0:
            print(f'[TimeFeatures] Processed {i+1}/{len(timestamps)}...', end='\r')
    
    conn.commit()
    conn.close()
    
    print(f'\n[TimeFeatures] Complete! Added 7 time features for {len(timestamps)} timestamps')

if __name__ == '__main__':
    main()
