#!/usr/bin/env python3
"""
Calculate correlation matrix from OHLCV data
Phase 3: Correlation-Based Risk Management
"""

import sqlite3
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# Database path
DB_PATH = '/opt/binance-bot/data/cdd_data.db'

# Symbols to calculate correlations for
SYMBOLS = [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
    'ADAUSDT', 'DOGEUSDT', 'MATICUSDT', 'DOTUSDT', 'AVAXUSDT',
    'LINKUSDT', 'UNIUSDT', 'ATOMUSDT', 'LTCUSDT', 'NEARUSDT'
]

def calculate_correlations():
    """Calculate correlation matrix from OHLCV data"""
    print("Connecting to database...")
    conn = sqlite3.connect(DB_PATH)
    
    # Get daily OHLCV data for last 30 days
    print("Loading OHLCV data...")
    cutoff_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    
    query = """
        SELECT symbol, date, close
        FROM spot_ohlcv
        WHERE date >= ?
        ORDER BY symbol, date
    """
    
    df = pd.read_sql_query(query, conn, params=(cutoff_date,))
    
    if df.empty:
        print("No OHLCV data found!")
        conn.close()
        return
    
    print(f"Loaded {len(df)} OHLCV records")
    
    # Convert close to numeric
    df['close'] = pd.to_numeric(df['close'], errors='coerce')
    
    # Remove duplicates by taking the last value for each date/symbol
    df = df.sort_values('date').groupby(['date', 'symbol']).last().reset_index()
    
    # Pivot to get symbol columns
    pivot_df = df.pivot(index='date', columns='symbol', values='close')
    
    # Calculate daily returns
    returns = pivot_df.pct_change().dropna()
    
    print(f"Calculating correlations for {len(returns)} days...")
    
    # Calculate correlation matrix
    corr_matrix = returns.corr()
    
    # Create correlations table
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS correlations (
            Pair TEXT,
            CounterPair TEXT,
            Correlation REAL,
            Window TEXT,
            LastUpdated TEXT,
            PRIMARY KEY (Pair, CounterPair, Window)
        )
    """)
    
    # Insert correlations
    count = 0
    now = datetime.now().isoformat()
    
    for symbol1 in corr_matrix.index:
        for symbol2 in corr_matrix.columns:
            if symbol1 != symbol2:  # Skip self-correlation
                corr_value = corr_matrix.loc[symbol1, symbol2]
                
                if not np.isnan(corr_value):
                    cursor.execute("""
                        INSERT OR REPLACE INTO correlations
                        (Pair, CounterPair, Correlation, Window, LastUpdated)
                        VALUES (?, ?, ?, ?, ?)
                    """, (symbol1, symbol2, float(corr_value), '1w', now))
                    count += 1
    
    conn.commit()
    print(f"✓ Inserted {count} correlation pairs")
    
    # Show some sample correlations
    print("\nSample correlations:")
    cursor.execute("""
        SELECT Pair, CounterPair, ROUND(Correlation, 3) as Corr
        FROM correlations
        WHERE Pair = 'BTCUSDT'
        ORDER BY ABS(Correlation) DESC
        LIMIT 10
    """)
    
    for row in cursor.fetchall():
        print(f"  {row[0]}-{row[1]}: {row[2]}")
    
    conn.close()
    print("\n✓ Correlation calculation complete!")

if __name__ == '__main__':
    calculate_correlations()

