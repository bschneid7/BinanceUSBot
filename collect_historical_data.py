import requests
import sqlite3
import time
from datetime import datetime, timedelta

# Configuration
SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT']
DAYS = 90
INTERVAL = '1h'
DB_PATH = '/opt/binance-bot/data/cdd_data.db'

def fetch_klines(symbol, interval, start_time, end_time):
    """Fetch klines from Binance API"""
    url = 'https://api.binance.us/api/v3/klines'
    params = {
        'symbol': symbol,
        'interval': interval,
        'startTime': start_time,
        'endTime': end_time,
        'limit': 1000
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f'Error fetching {symbol}: {e}')
        return []

def store_klines(conn, symbol, klines):
    """Store klines in database"""
    cursor = conn.cursor()
    
    for kline in klines:
        unix_time = kline[0]
        open_price = float(kline[1])
        high_price = float(kline[2])
        low_price = float(kline[3])
        close_price = float(kline[4])
        volume = float(kline[5])
        
        cursor.execute('''
            INSERT OR REPLACE INTO spot_ohlcv 
            (Symbol, unix, open, high, low, close, volume)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (symbol, unix_time, open_price, high_price, low_price, close_price, volume))
    
    conn.commit()

def main():
    print(f'[DataCollector] Starting data collection for {DAYS} days')
    print(f'[DataCollector] Symbols: {SYMBOLS}')
    
    # Connect to database
    conn = sqlite3.connect(DB_PATH)
    
    # Calculate time range
    end_time = int(time.time() * 1000)
    start_time = end_time - (DAYS * 24 * 60 * 60 * 1000)
    
    total_records = 0
    
    for symbol in SYMBOLS:
        print(f'\n[DataCollector] Fetching {symbol}...')
        
        current_start = start_time
        symbol_records = 0
        
        while current_start < end_time:
            # Fetch up to 1000 candles at a time
            klines = fetch_klines(symbol, INTERVAL, current_start, end_time)
            
            if not klines:
                break
            
            # Store in database
            store_klines(conn, symbol, klines)
            symbol_records += len(klines)
            
            # Update start time for next batch
            current_start = klines[-1][0] + 1
            
            print(f'[DataCollector] {symbol}: {symbol_records} records collected', end='\r')
            
            # Rate limit: 1200 requests/minute = ~50ms per request
            time.sleep(0.1)
            
            # If we got less than 1000, we're done
            if len(klines) < 1000:
                break
        
        print(f'[DataCollector] {symbol}: {symbol_records} records collected ✓')
        total_records += symbol_records
    
    conn.close()
    
    print(f'\n[DataCollector] Complete! Total records: {total_records}')
    print(f'[DataCollector] Data stored in: {DB_PATH}')

if __name__ == '__main__':
    main()
