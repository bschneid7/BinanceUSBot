#!/usr/bin/env python3
"""
Historical Crypto Data Collection

Collects data from multiple sources:
1. Binance API (free, comprehensive)
2. CryptoCompare API (free tier)
3. CoinGecko API (free)
4. CryptoDataDownload (CSV files)
"""

import requests
import pandas as pd
import time
from datetime import datetime, timedelta
import sqlite3
import os
import json


class BinanceDataCollector:
    """Collect historical data from Binance API"""
    
    def __init__(self):
        self.base_url = "https://api.binance.com/api/v3"
        
    def get_historical_klines(self, symbol='BTCUSDT', interval='1h', start_date=None, end_date=None):
        """
        Get historical klines/candlestick data
        
        interval: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
        """
        
        print(f"[Binance] Fetching {symbol} {interval} data...")
        
        # Convert dates to milliseconds
        if start_date is None:
            start_date = datetime.now() - timedelta(days=365)  # 1 year ago
        
        if end_date is None:
            end_date = datetime.now()
        
        start_ts = int(start_date.timestamp() * 1000)
        end_ts = int(end_date.timestamp() * 1000)
        
        all_klines = []
        current_ts = start_ts
        
        while current_ts < end_ts:
            url = f"{self.base_url}/klines"
            params = {
                'symbol': symbol,
                'interval': interval,
                'startTime': current_ts,
                'endTime': end_ts,
                'limit': 1000  # Max 1000 per request
            }
            
            try:
                response = requests.get(url, params=params, timeout=10)
                response.raise_for_status()
                klines = response.json()
                
                if not klines:
                    break
                
                all_klines.extend(klines)
                current_ts = klines[-1][0] + 1  # Next timestamp
                
                print(f"[Binance] Fetched {len(klines)} candles (total: {len(all_klines)})")
                time.sleep(0.5)  # Rate limiting
                
            except Exception as e:
                print(f"[Binance] Error: {e}")
                break
        
        # Convert to DataFrame
        df = pd.DataFrame(all_klines, columns=[
            'timestamp', 'open', 'high', 'low', 'close', 'volume',
            'close_time', 'quote_volume', 'trades', 'taker_buy_base',
            'taker_buy_quote', 'ignore'
        ])
        
        # Convert types
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col])
        
        print(f"[Binance] ✅ Collected {len(df)} candles from {df['timestamp'].min()} to {df['timestamp'].max()}")
        
        return df


class CryptoCompareCollector:
    """Collect data from CryptoCompare API"""
    
    def __init__(self, api_key=None):
        self.base_url = "https://min-api.cryptocompare.com/data"
        self.api_key = api_key  # Optional, free tier works without key
        
    def get_historical_hourly(self, symbol='BTC', currency='USD', limit=2000):
        """Get hourly historical data"""
        
        print(f"[CryptoCompare] Fetching {symbol}/{currency} hourly data...")
        
        url = f"{self.base_url}/v2/histohour"
        params = {
            'fsym': symbol,
            'tsym': currency,
            'limit': limit  # Max 2000
        }
        
        if self.api_key:
            params['api_key'] = self.api_key
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if data['Response'] == 'Success':
                df = pd.DataFrame(data['Data']['Data'])
                df['timestamp'] = pd.to_datetime(df['time'], unit='s')
                df = df.rename(columns={
                    'volumefrom': 'volume',
                    'volumeto': 'quote_volume'
                })
                
                print(f"[CryptoCompare] ✅ Collected {len(df)} hourly candles")
                return df
            else:
                print(f"[CryptoCompare] Error: {data.get('Message', 'Unknown error')}")
                return None
                
        except Exception as e:
            print(f"[CryptoCompare] Error: {e}")
            return None


class CoinGeckoCollector:
    """Collect data from CoinGecko API"""
    
    def __init__(self):
        self.base_url = "https://api.coingecko.com/api/v3"
        
    def get_market_chart(self, coin_id='bitcoin', vs_currency='usd', days=365):
        """Get market chart data"""
        
        print(f"[CoinGecko] Fetching {coin_id} market data ({days} days)...")
        
        url = f"{self.base_url}/coins/{coin_id}/market_chart"
        params = {
            'vs_currency': vs_currency,
            'days': days,
            'interval': 'hourly' if days <= 90 else 'daily'
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            # Convert to DataFrame
            prices = pd.DataFrame(data['prices'], columns=['timestamp', 'price'])
            volumes = pd.DataFrame(data['total_volumes'], columns=['timestamp', 'volume'])
            
            df = prices.merge(volumes, on='timestamp')
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            
            print(f"[CoinGecko] ✅ Collected {len(df)} data points")
            return df
            
        except Exception as e:
            print(f"[CoinGecko] Error: {e}")
            return None


class DataAggregator:
    """Aggregate and store data from multiple sources"""
    
    def __init__(self, db_path='/opt/binance-bot/data/historical_data.db'):
        self.db_path = db_path
        self.conn = None
        
    def connect(self):
        """Connect to database"""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self.conn = sqlite3.connect(self.db_path)
        print(f"[DB] Connected to {self.db_path}")
        
    def create_tables(self):
        """Create database tables"""
        
        cursor = self.conn.cursor()
        
        # OHLCV table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS ohlcv (
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
        
        # Create index
        cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_timestamp 
        ON ohlcv(symbol, timestamp)
        """)
        
        self.conn.commit()
        print(f"[DB] Tables created")
        
    def store_ohlcv(self, df, source, symbol):
        """Store OHLCV data"""
        
        print(f"[DB] Storing {len(df)} records from {source}...")
        
        # Prepare data
        df_store = df.copy()
        df_store['source'] = source
        df_store['symbol'] = symbol
        df_store['timestamp'] = df_store['timestamp'].astype(int) // 10**9  # Convert to Unix timestamp
        
        # Select columns
        cols = ['source', 'symbol', 'timestamp', 'open', 'high', 'low', 'close', 'volume']
        df_store = df_store[cols]
        
        # Insert with conflict handling
        df_store.to_sql('ohlcv', self.conn, if_exists='append', index=False)
        
        self.conn.commit()
        print(f"[DB] ✅ Stored {len(df)} records")
        
    def get_stats(self):
        """Get database statistics"""
        
        cursor = self.conn.cursor()
        
        # Total records
        cursor.execute("SELECT COUNT(*) FROM ohlcv")
        total = cursor.fetchone()[0]
        
        # By source
        cursor.execute("""
        SELECT source, symbol, COUNT(*), MIN(timestamp), MAX(timestamp)
        FROM ohlcv
        GROUP BY source, symbol
        """)
        
        stats = cursor.fetchall()
        
        print(f"\n[DB] Database Statistics:")
        print(f"  Total records: {total:,}")
        print(f"\n  By source:")
        for source, symbol, count, min_ts, max_ts in stats:
            min_date = datetime.fromtimestamp(min_ts).strftime('%Y-%m-%d')
            max_date = datetime.fromtimestamp(max_ts).strftime('%Y-%m-%d')
            print(f"    {source:15} {symbol:10} {count:6,} records  ({min_date} to {max_date})")
        
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            print(f"[DB] Connection closed")


def main():
    """Main data collection routine"""
    
    print("\n" + "="*70)
    print("  Historical Crypto Data Collection")
    print("="*70 + "\n")
    
    # Configuration
    SYMBOL = 'BTCUSDT'
    DAYS = 365  # 1 year of data
    
    # Initialize aggregator
    aggregator = DataAggregator()
    aggregator.connect()
    aggregator.create_tables()
    
    # 1. Collect from Binance (most comprehensive)
    print(f"\n{'='*70}")
    print(f"  Source 1: Binance API")
    print(f"{'='*70}\n")
    
    binance = BinanceDataCollector()
    start_date = datetime.now() - timedelta(days=DAYS)
    
    # Hourly data
    df_binance_1h = binance.get_historical_klines(
        symbol=SYMBOL,
        interval='1h',
        start_date=start_date
    )
    
    if df_binance_1h is not None and len(df_binance_1h) > 0:
        aggregator.store_ohlcv(df_binance_1h, 'binance', SYMBOL)
    
    # 4-hour data (for longer timeframes)
    df_binance_4h = binance.get_historical_klines(
        symbol=SYMBOL,
        interval='4h',
        start_date=start_date
    )
    
    if df_binance_4h is not None and len(df_binance_4h) > 0:
        aggregator.store_ohlcv(df_binance_4h, 'binance_4h', SYMBOL)
    
    # 2. Collect from CryptoCompare
    print(f"\n{'='*70}")
    print(f"  Source 2: CryptoCompare API")
    print(f"{'='*70}\n")
    
    crypto_compare = CryptoCompareCollector()
    df_cc = crypto_compare.get_historical_hourly(symbol='BTC', currency='USDT', limit=2000)
    
    if df_cc is not None and len(df_cc) > 0:
        # Convert to same format as Binance
        df_cc_formatted = df_cc[['timestamp', 'open', 'high', 'low', 'close', 'volume']].copy()
        aggregator.store_ohlcv(df_cc_formatted, 'cryptocompare', SYMBOL)
    
    # 3. Collect from CoinGecko
    print(f"\n{'='*70}")
    print(f"  Source 3: CoinGecko API")
    print(f"{'='*70}\n")
    
    coingecko = CoinGeckoCollector()
    df_cg = coingecko.get_market_chart(coin_id='bitcoin', vs_currency='usd', days=DAYS)
    
    if df_cg is not None and len(df_cg) > 0:
        # CoinGecko doesn't have OHLC, only price and volume
        # Create synthetic OHLC (open=close=high=low=price)
        df_cg['open'] = df_cg['price']
        df_cg['high'] = df_cg['price']
        df_cg['low'] = df_cg['price']
        df_cg['close'] = df_cg['price']
        df_cg_formatted = df_cg[['timestamp', 'open', 'high', 'low', 'close', 'volume']].copy()
        aggregator.store_ohlcv(df_cg_formatted, 'coingecko', SYMBOL)
    
    # Show statistics
    print(f"\n{'='*70}")
    print(f"  Collection Summary")
    print(f"{'='*70}")
    aggregator.get_stats()
    
    # Close
    aggregator.close()
    
    print(f"\n{'='*70}")
    print(f"  ✅ Data collection complete!")
    print(f"  Database: {aggregator.db_path}")
    print(f"{'='*70}\n")


if __name__ == '__main__':
    main()

