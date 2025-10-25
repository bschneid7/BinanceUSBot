#!/usr/bin/env python3
"""
Daily CDD data update script for production
Run via cron every day at 00:05 UTC
"""

import sys
sys.path.insert(0, '/opt/binance-bot')

from cdd_api_integration import CryptoDataDownloadAPI
import logging
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/opt/binance-bot/logs/cdd_update.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

def daily_update():
    logger.info("="*60)
    logger.info(f"Starting daily CDD data update - {datetime.now()}")
    logger.info("="*60)
    
    api = CryptoDataDownloadAPI(db_path='/opt/binance-bot/data/cdd_data.db')
    
    # Your active trading symbols
    symbols = [
        'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'SOLUSDT',
        'XRPUSDT', 'DOGEUSDT', 'MATICUSDT', 'DOTUSDT', 'AVAXUSDT',
        'LINKUSDT', 'UNIUSDT', 'ATOMUSDT', 'LTCUSDT', 'NEARUSDT'
    ]
    
    try:
        for symbol in symbols:
            logger.info(f"\n--- Updating {symbol} ---")
            
            # Update daily OHLCV (last 2 days)
            api.get_spot_ohlcv(symbol, interval='1d', limit=2)
            
            # Update hourly OHLCV (last 48 hours)
            api.get_spot_ohlcv(symbol, interval='1h', limit=48)
            
            # Update funding rates
            api.get_funding_rates(symbol, limit=2)
            
            # Update VWAP and order flow (BTC/ETH only)
            if symbol in ['BTCUSDT', 'ETHUSDT']:
                api.get_spot_summary(symbol, interval='daily', limit=2)
                api.get_spot_summary(symbol, interval='hourly', limit=48)
            
            # Update correlations (weekly update)
            if datetime.now().weekday() == 0:  # Monday only
                api.get_correlations(symbol, limit=7)
        
        logger.info("\n" + "="*60)
        logger.info("✓ Daily CDD data update completed successfully")
        logger.info("="*60)
        
    except Exception as e:
        logger.error(f"❌ Error during update: {e}", exc_info=True)
        raise
    
    finally:
        api.close()

if __name__ == "__main__":
    daily_update()
