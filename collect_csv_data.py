#!/usr/bin/env python3
"""
Collect historical data from CSV sources
"""

import requests
import pandas as pd
import sqlite3
import os
from datetime import datetime
import io


class CryptoDataDownloadCollector:
    """Collect data from CryptoDataDownload.com CSV files"""
    
    def __init__(self):
        self.base_url = "https://www.cryptodatadownload.com/cdd"
        
    def get_binance_hourly(self, symbol='BTCUSDT'):
        """Download Binance hourly CSV"""
        
        print(f"[CDD] Downloading Binance {symbol} hourly data...")
        
        # CryptoDataDownload URLs
        urls = [
            f"https://www.cryptodatadownload.com/cdd/Binance_{symbol}_1h.csv",
            f"https://www.cryptodatadownload.com/cdd/Binance_{symbol}_d.csv",
        ]
        
        for url in urls:
            try:
                print(f"[CDD] Trying {url}...")
                response = requests.get(url, timeout=30)
                
                if response.status_code == 200:
                    # Parse CSV (skip first row which is metadata)
                    df = pd.read_csv(io.StringIO(response.text), skiprows=1)
                    
                    # Standardize column names
                    df.columns = df.columns.str.lower().str.strip()
                    
                    # Convert timestamp
                    if 'unix' in df.columns:
                        df['timestamp'] = pd.to_datetime(df['unix'], unit='s')
                    elif 'date' in df.columns:
                        df['timestamp'] = pd.to_datetime(df['date'])
                    
                    print(f"[CDD] ✅ Downloaded {len(df)} records")
                    return df
                    
            except Exception as e:
                print(f"[CDD] Error with {url}: {e}")
                continue
        
        print(f"[CDD] ❌ Failed to download from all URLs")
        return None


class AlternativeDataCollector:
    """Collect from alternative free sources"""
    
    def get_yahoo_finance(self, ticker='BTC-USD', period='1y', interval='1h'):
        """Get data from Yahoo Finance (via yfinance)"""
        
        try:
            import yfinance as yf
            print(f"[Yahoo] Downloading {ticker} data...")
            
            df = yf.download(ticker, period=period, interval=interval, progress=False)
            df = df.reset_index()
            df.columns = df.columns.str.lower()
            df = df.rename(columns={'datetime': 'timestamp', 'date': 'timestamp'})
            
            print(f"[Yahoo] ✅ Downloaded {len(df)} records")
            return df
            
        except ImportError:
            print(f"[Yahoo] yfinance not installed. Install with: pip install yfinance")
            return None
        except Exception as e:
            print(f"[Yahoo] Error: {e}")
            return None


def collect_from_binance_direct():
    """Direct Binance data collection without API"""
    
    print(f"\n[Binance Direct] Attempting direct data collection...")
    
    # Try using public data endpoint
    urls = [
        "https://data.binance.vision/data/spot/monthly/klines/BTCUSDT/1h/",
        "https://data.binance.vision/data/spot/daily/klines/BTCUSDT/1h/",
    ]
    
    all_data = []
    
    for base_url in urls:
        try:
            print(f"[Binance Direct] Trying {base_url}...")
            
            # Try to get recent files
            # Binance Vision has files like: BTCUSDT-1h-2024-10-25.zip
            from datetime import timedelta
            
            for days_ago in range(0, 30):  # Last 30 days
                date = datetime.now() - timedelta(days=days_ago)
                date_str = date.strftime('%Y-%m-%d')
                
                file_url = f"{base_url}BTCUSDT-1h-{date_str}.zip"
                
                try:
                    response = requests.head(file_url, timeout=5)
                    if response.status_code == 200:
                        print(f"[Binance Direct] Found: {file_url}")
                        # Download and extract
                        # (skipping actual download for now)
                except:
                    pass
                    
        except Exception as e:
            print(f"[Binance Direct] Error: {e}")
    
    return None


def main():
    """Main collection routine"""
    
    print("\n" + "="*70)
    print("  CSV Data Collection")
    print("="*70 + "\n")
    
    # Connect to database
    db_path = '/opt/binance-bot/data/historical_data.db'
    conn = sqlite3.connect(db_path)
    print(f"[DB] Connected to {db_path}")
    
    # 1. Try CryptoDataDownload
    print(f"\n{'='*70}")
    print(f"  Source: CryptoDataDownload")
    print(f"{'='*70}\n")
    
    cdd = CryptoDataDownloadCollector()
    df_cdd = cdd.get_binance_hourly('BTCUSDT')
    
    if df_cdd is not None and len(df_cdd) > 0:
        # Store in database
        df_store = df_cdd.copy()
        df_store['source'] = 'cryptodatadownload'
        df_store['symbol'] = 'BTCUSDT'
        df_store['timestamp'] = df_store['timestamp'].astype(int) // 10**9
        
        cols = ['source', 'symbol', 'timestamp', 'open', 'high', 'low', 'close', 'volume']
        df_store = df_store[cols]
        df_store.to_sql('ohlcv', conn, if_exists='append', index=False)
        
        print(f"[DB] ✅ Stored {len(df_store)} records from CryptoDataDownload")
    
    # 2. Try Yahoo Finance
    print(f"\n{'='*70}")
    print(f"  Source: Yahoo Finance")
    print(f"{'='*70}\n")
    
    alt = AlternativeDataCollector()
    df_yahoo = alt.get_yahoo_finance('BTC-USD', period='1y', interval='1h')
    
    if df_yahoo is not None and len(df_yahoo) > 0:
        df_store = df_yahoo.copy()
        df_store['source'] = 'yahoo_finance'
        df_store['symbol'] = 'BTCUSDT'
        df_store['timestamp'] = df_store['timestamp'].astype(int) // 10**9
        
        cols = ['source', 'symbol', 'timestamp', 'open', 'high', 'low', 'close', 'volume']
        df_store = df_store[cols]
        df_store.to_sql('ohlcv', conn, if_exists='append', index=False)
        
        print(f"[DB] ✅ Stored {len(df_store)} records from Yahoo Finance")
    
    # Show final statistics
    print(f"\n{'='*70}")
    print(f"  Final Database Statistics")
    print(f"{'='*70}\n")
    
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM ohlcv")
    total = cursor.fetchone()[0]
    
    cursor.execute("""
    SELECT source, COUNT(*), MIN(timestamp), MAX(timestamp)
    FROM ohlcv
    GROUP BY source
    """)
    
    stats = cursor.fetchall()
    
    print(f"  Total records: {total:,}\n")
    for source, count, min_ts, max_ts in stats:
        min_date = datetime.fromtimestamp(min_ts).strftime('%Y-%m-%d')
        max_date = datetime.fromtimestamp(max_ts).strftime('%Y-%m-%d')
        print(f"    {source:20} {count:6,} records  ({min_date} to {max_date})")
    
    conn.close()
    
    print(f"\n{'='*70}")
    print(f"  ✅ Collection complete!")
    print(f"{'='*70}\n")


if __name__ == '__main__':
    main()

