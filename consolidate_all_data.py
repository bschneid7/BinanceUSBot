#!/usr/bin/env python3
"""
Consolidate all available data sources into a unified training dataset
"""

import sqlite3
import pandas as pd
from datetime import datetime
import os


def main():
    print("\n" + "="*70)
    print("  Data Consolidation - All Sources")
    print("="*70 + "\n")
    
    # Paths
    cdd_db = '/opt/binance-bot/data/cdd_data.db'
    hist_db = '/opt/binance-bot/data/historical_data.db'
    output_db = '/opt/binance-bot/data/training_data.db'
    
    # Create output database
    conn_out = sqlite3.connect(output_db)
    cursor_out = conn_out.cursor()
    
    # Create consolidated table
    cursor_out.execute("""
    CREATE TABLE IF NOT EXISTS consolidated_ohlcv (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        symbol TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        open REAL,
        high REAL,
        low REAL,
        close REAL,
        volume REAL,
        UNIQUE(source, symbol, timestamp)
    )
    """)
    
    cursor_out.execute("""
    CREATE INDEX IF NOT EXISTS idx_consolidated_symbol_timestamp 
    ON consolidated_ohlcv(symbol, timestamp)
    """)
    
    print(f"[Output] Created database: {output_db}\n")
    
    # 1. Load from CDD database
    print(f"{'='*70}")
    print(f"  Source 1: CDD Database (spot_ohlcv)")
    print(f"{'='*70}\n")
    
    conn_cdd = sqlite3.connect(cdd_db)
    df_cdd = pd.read_sql_query("""
        SELECT symbol, unix as timestamp, open, high, low, close, volume
        FROM spot_ohlcv
        WHERE symbol = 'BTCUSDT'
        ORDER BY unix
    """, conn_cdd)
    
    if len(df_cdd) > 0:
        df_cdd['source'] = 'cdd'
        # Convert to numeric
        df_cdd['timestamp'] = pd.to_numeric(df_cdd['timestamp'])
        # Check if milliseconds or seconds
        if df_cdd['timestamp'].max() > 10**10:  # Milliseconds
            df_cdd['timestamp'] = df_cdd['timestamp'] // 1000
        
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df_cdd[col] = pd.to_numeric(df_cdd[col], errors='coerce')
        
        print(f"[CDD] Loaded {len(df_cdd)} records")
        print(f"[CDD] Date range: {datetime.fromtimestamp(df_cdd['timestamp'].min())} to {datetime.fromtimestamp(df_cdd['timestamp'].max())}")
        print(f"[CDD] Days: {(df_cdd['timestamp'].max() - df_cdd['timestamp'].min()) / 86400:.1f}")
        
        # Deduplicate
        df_cdd = df_cdd.drop_duplicates(subset=['source', 'symbol', 'timestamp'], keep='last')
        print(f"[CDD] After dedup: {len(df_cdd)} records")
        
        # Store
        df_cdd.to_sql('consolidated_ohlcv', conn_out, if_exists='append', index=False)
        print(f"[CDD] ✅ Stored\n")
    
    conn_cdd.close()
    
    # 2. Load from historical database
    print(f"{'='*70}")
    print(f"  Source 2: Historical Database")
    print(f"{'='*70}\n")
    
    if os.path.exists(hist_db):
        conn_hist = sqlite3.connect(hist_db)
        df_hist = pd.read_sql_query("""
            SELECT source, symbol, timestamp, open, high, low, close, volume
            FROM ohlcv
            WHERE symbol = 'BTCUSDT'
            ORDER BY timestamp
        """, conn_hist)
        
        if len(df_hist) > 0:
            print(f"[Historical] Loaded {len(df_hist)} records from {df_hist['source'].nunique()} sources")
            for source in df_hist['source'].unique():
                source_df = df_hist[df_hist['source'] == source]
                print(f"  - {source}: {len(source_df)} records")
            
            # Deduplicate
            df_hist = df_hist.drop_duplicates(subset=['source', 'symbol', 'timestamp'], keep='last')
            print(f"[Historical] After dedup: {len(df_hist)} records")
            
            # Store
            df_hist.to_sql('consolidated_ohlcv', conn_out, if_exists='append', index=False)
            print(f"[Historical] ✅ Stored\n")
        
        conn_hist.close()
    
    # 3. Get final statistics
    print(f"{'='*70}")
    print(f"  Consolidated Database Statistics")
    print(f"{'='*70}\n")
    
    # Total records
    cursor_out.execute("SELECT COUNT(*) FROM consolidated_ohlcv")
    total = cursor_out.fetchone()[0]
    
    # By source
    cursor_out.execute("""
    SELECT source, COUNT(*), MIN(timestamp), MAX(timestamp)
    FROM consolidated_ohlcv
    GROUP BY source
    ORDER BY source
    """)
    
    stats = cursor_out.fetchall()
    
    print(f"  Total records: {total:,}\n")
    print(f"  By source:")
    for source, count, min_ts, max_ts in stats:
        min_date = datetime.fromtimestamp(min_ts).strftime('%Y-%m-%d %H:%M')
        max_date = datetime.fromtimestamp(max_ts).strftime('%Y-%m-%d %H:%M')
        days = (max_ts - min_ts) / 86400
        print(f"    {source:20} {count:6,} records  {days:6.1f} days  ({min_date} to {max_date})")
    
    # Overall date range
    cursor_out.execute("SELECT MIN(timestamp), MAX(timestamp) FROM consolidated_ohlcv")
    overall_min, overall_max = cursor_out.fetchone()
    overall_days = (overall_max - overall_min) / 86400
    
    print(f"\n  Overall date range:")
    print(f"    From: {datetime.fromtimestamp(overall_min)}")
    print(f"    To:   {datetime.fromtimestamp(overall_max)}")
    print(f"    Days: {overall_days:.1f}")
    
    # Deduplicate (keep most recent source for each timestamp)
    print(f"\n{'='*70}")
    print(f"  Deduplication")
    print(f"{'='*70}\n")
    
    cursor_out.execute("""
    CREATE TABLE IF NOT EXISTS deduplicated_ohlcv AS
    SELECT * FROM (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY symbol, timestamp ORDER BY id DESC) as rn
        FROM consolidated_ohlcv
    )
    WHERE rn = 1
    """)
    
    cursor_out.execute("SELECT COUNT(*) FROM deduplicated_ohlcv")
    dedup_total = cursor_out.fetchone()[0]
    
    print(f"  Before: {total:,} records")
    print(f"  After:  {dedup_total:,} records")
    print(f"  Removed: {total - dedup_total:,} duplicates")
    
    # Create index on deduplicated table
    cursor_out.execute("""
    CREATE INDEX IF NOT EXISTS idx_dedup_symbol_timestamp 
    ON deduplicated_ohlcv(symbol, timestamp)
    """)
    
    conn_out.commit()
    conn_out.close()
    
    print(f"\n{'='*70}")
    print(f"  ✅ Consolidation Complete!")
    print(f"  Output: {output_db}")
    print(f"  Total unique records: {dedup_total:,}")
    print(f"  Date range: {overall_days:.1f} days")
    print(f"{'='*70}\n")


if __name__ == '__main__':
    main()

