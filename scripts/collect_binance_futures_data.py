import requests
import json
import time
from datetime import datetime, timedelta
import sqlite3

# Binance Futures API endpoints (no key needed for public data)
FUTURES_BASE = 'https://fapi.binance.com'

def get_funding_rate_history(symbol, limit=1000):
    """Get historical funding rates"""
    url = f'{FUTURES_BASE}/fapi/v1/fundingRate'
    params = {'symbol': symbol, 'limit': limit}
    response = requests.get(url, params=params)
    return response.json()

def get_open_interest(symbol):
    """Get current open interest"""
    url = f'{FUTURES_BASE}/fapi/v1/openInterest'
    params = {'symbol': symbol}
    response = requests.get(url, params=params)
    return response.json()

def get_long_short_ratio(symbol, period='1h', limit=500):
    """Get long/short account ratio"""
    url = f'{FUTURES_BASE}/futures/data/globalLongShortAccountRatio'
    params = {'symbol': symbol, 'period': period, 'limit': limit}
    response = requests.get(url, params=params)
    return response.json()

def get_top_trader_ratio(symbol, period='1h', limit=500):
    """Get top trader long/short ratio"""
    url = f'{FUTURES_BASE}/futures/data/topLongShortPositionRatio'
    params = {'symbol': symbol, 'period': period, 'limit': limit}
    response = requests.get(url, params=params)
    return response.json()

def get_taker_buy_sell_volume(symbol, period='1h', limit=500):
    """Get taker buy/sell volume"""
    url = f'{FUTURES_BASE}/futures/data/takerlongshortRatio'
    params = {'symbol': symbol, 'period': period, 'limit': limit}
    response = requests.get(url, params=params)
    return response.json()

def collect_all_data():
    symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT']
    
    # Create database
    conn = sqlite3.connect('/opt/binance-bot/data/binance_futures.db')
    c = conn.cursor()
    
    # Create tables
    c.execute('''CREATE TABLE IF NOT EXISTS funding_rates
                 (symbol TEXT, timestamp INTEGER, funding_rate REAL, 
                  PRIMARY KEY (symbol, timestamp))''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS open_interest
                 (symbol TEXT, timestamp INTEGER, open_interest REAL, 
                  PRIMARY KEY (symbol, timestamp))''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS long_short_ratio
                 (symbol TEXT, timestamp INTEGER, long_ratio REAL, short_ratio REAL,
                  long_account REAL, short_account REAL,
                  PRIMARY KEY (symbol, timestamp))''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS top_trader_ratio
                 (symbol TEXT, timestamp INTEGER, long_ratio REAL, short_ratio REAL,
                  PRIMARY KEY (symbol, timestamp))''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS taker_volume
                 (symbol TEXT, timestamp INTEGER, buy_ratio REAL, sell_ratio REAL,
                  PRIMARY KEY (symbol, timestamp))''')
    
    for symbol in symbols:
        print(f'Collecting data for {symbol}...')
        
        try:
            # Funding rates
            funding = get_funding_rate_history(symbol)
            for item in funding:
                c.execute('INSERT OR REPLACE INTO funding_rates VALUES (?, ?, ?)',
                         (symbol, item['fundingTime'], float(item['fundingRate'])))
            print(f'  Funding rates: {len(funding)} records')
            time.sleep(0.5)
            
            # Open interest
            oi = get_open_interest(symbol)
            timestamp = int(datetime.now().timestamp() * 1000)
            c.execute('INSERT OR REPLACE INTO open_interest VALUES (?, ?, ?)',
                     (symbol, timestamp, float(oi['openInterest'])))
            print(f'  Open interest: {oi["openInterest"]}')
            time.sleep(0.5)
            
            # Long/short ratio
            ls_ratio = get_long_short_ratio(symbol)
            for item in ls_ratio:
                c.execute('INSERT OR REPLACE INTO long_short_ratio VALUES (?, ?, ?, ?, ?, ?)',
                         (symbol, item['timestamp'], 
                          float(item['longShortRatio']), 0,
                          float(item['longAccount']), float(item['shortAccount'])))
            print(f'  Long/short ratio: {len(ls_ratio)} records')
            time.sleep(0.5)
            
            # Top trader ratio
            tt_ratio = get_top_trader_ratio(symbol)
            for item in tt_ratio:
                c.execute('INSERT OR REPLACE INTO top_trader_ratio VALUES (?, ?, ?, ?)',
                         (symbol, item['timestamp'],
                          float(item['longShortRatio']), 0))
            print(f'  Top trader ratio: {len(tt_ratio)} records')
            time.sleep(0.5)
            
            # Taker volume
            tv = get_taker_buy_sell_volume(symbol)
            for item in tv:
                c.execute('INSERT OR REPLACE INTO taker_volume VALUES (?, ?, ?, ?)',
                         (symbol, item['timestamp'],
                          float(item['buySellRatio']), 0))
            print(f'  Taker volume: {len(tv)} records')
            time.sleep(0.5)
            
        except Exception as e:
            print(f'  Error: {e}')
            continue
    
    conn.commit()
    conn.close()
    print('\nData collection complete!')
    
    # Print summary
    conn = sqlite3.connect('/opt/binance-bot/data/binance_futures.db')
    c = conn.cursor()
    c.execute('SELECT COUNT(*) FROM funding_rates')
    print(f'Total funding rate records: {c.fetchone()[0]}')
    c.execute('SELECT COUNT(*) FROM long_short_ratio')
    print(f'Total long/short ratio records: {c.fetchone()[0]}')
    c.execute('SELECT COUNT(*) FROM top_trader_ratio')
    print(f'Total top trader ratio records: {c.fetchone()[0]}')
    c.execute('SELECT COUNT(*) FROM taker_volume')
    print(f'Total taker volume records: {c.fetchone()[0]}')
    conn.close()

if __name__ == '__main__':
    collect_all_data()
