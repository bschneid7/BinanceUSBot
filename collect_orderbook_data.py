import requests
import sqlite3
import time
from datetime import datetime

# Configuration
SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT']
DB_PATH = '/opt/binance-bot/data/cdd_data.db'
DEPTH_LIMIT = 20  # Top 20 levels

def create_orderbook_table(conn):
    """Create order book table if not exists"""
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS orderbook_depth (
            symbol TEXT,
            unix INTEGER,
            bid_depth_5 REAL,
            ask_depth_5 REAL,
            bid_depth_10 REAL,
            ask_depth_10 REAL,
            bid_depth_20 REAL,
            ask_depth_20 REAL,
            order_imbalance REAL,
            spread REAL,
            mid_price REAL,
            PRIMARY KEY (symbol, unix)
        )
    ''')
    conn.commit()

def fetch_orderbook(symbol):
    """Fetch current order book from Binance"""
    url = 'https://api.binance.us/api/v3/depth'
    params = {'symbol': symbol, 'limit': DEPTH_LIMIT}
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f'Error fetching orderbook for {symbol}: {e}')
        return None

def calculate_depth_metrics(orderbook):
    """Calculate order book depth metrics"""
    bids = orderbook['bids']
    asks = orderbook['asks']
    
    # Calculate depth at different levels
    bid_depth_5 = sum(float(bid[0]) * float(bid[1]) for bid in bids[:5])
    ask_depth_5 = sum(float(ask[0]) * float(ask[1]) for ask in asks[:5])
    
    bid_depth_10 = sum(float(bid[0]) * float(bid[1]) for bid in bids[:10])
    ask_depth_10 = sum(float(ask[0]) * float(ask[1]) for ask in asks[:10])
    
    bid_depth_20 = sum(float(bid[0]) * float(bid[1]) for bid in bids[:20])
    ask_depth_20 = sum(float(ask[0]) * float(ask[1]) for ask in asks[:20])
    
    # Best bid/ask
    best_bid = float(bids[0][0])
    best_ask = float(asks[0][0])
    mid_price = (best_bid + best_ask) / 2
    
    # Order imbalance
    total_bid = bid_depth_20
    total_ask = ask_depth_20
    order_imbalance = (total_bid - total_ask) / (total_bid + total_ask) if (total_bid + total_ask) > 0 else 0
    
    # Spread
    spread = (best_ask - best_bid) / mid_price if mid_price > 0 else 0
    
    return {
        'bid_depth_5': bid_depth_5,
        'ask_depth_5': ask_depth_5,
        'bid_depth_10': bid_depth_10,
        'ask_depth_10': ask_depth_10,
        'bid_depth_20': bid_depth_20,
        'ask_depth_20': ask_depth_20,
        'order_imbalance': order_imbalance,
        'spread': spread,
        'mid_price': mid_price
    }

def store_orderbook_data(conn, symbol, metrics):
    """Store order book metrics in database"""
    cursor = conn.cursor()
    unix_time = int(time.time() * 1000)
    
    cursor.execute('''
        INSERT OR REPLACE INTO orderbook_depth
        (symbol, unix, bid_depth_5, ask_depth_5, bid_depth_10, ask_depth_10,
         bid_depth_20, ask_depth_20, order_imbalance, spread, mid_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (symbol, unix_time, metrics['bid_depth_5'], metrics['ask_depth_5'],
          metrics['bid_depth_10'], metrics['ask_depth_10'],
          metrics['bid_depth_20'], metrics['ask_depth_20'],
          metrics['order_imbalance'], metrics['spread'], metrics['mid_price']))
    
    conn.commit()

def main():
    print('[OrderBookCollector] Starting order book data collection')
    
    # Connect to database
    conn = sqlite3.connect(DB_PATH)
    create_orderbook_table(conn)
    
    # Collect current snapshot
    for symbol in SYMBOLS:
        print(f'[OrderBookCollector] Fetching {symbol}...')
        
        orderbook = fetch_orderbook(symbol)
        if orderbook:
            metrics = calculate_depth_metrics(orderbook)
            store_orderbook_data(conn, symbol, metrics)
            print(f'[OrderBookCollector] {symbol}: Imbalance={metrics["order_imbalance"]:.4f}, Spread={metrics["spread"]:.6f}')
        
        time.sleep(0.2)  # Rate limit
    
    conn.close()
    print('[OrderBookCollector] Complete!')

if __name__ == '__main__':
    main()
