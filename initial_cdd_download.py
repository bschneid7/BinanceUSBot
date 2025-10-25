#!/usr/bin/env python3
"""
Initial historical data download for CDD API
Downloads 90 days of data for all trading symbols
"""

import sys
sys.path.insert(0, '/opt/binance-bot')

from cdd_api_integration import CryptoDataDownloadAPI
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def main():
    logger.info("="*60)
    logger.info("Starting initial CDD data download (90 days)")
    logger.info("="*60)
    
    api = CryptoDataDownloadAPI(db_path='/opt/binance-bot/data/cdd_data.db')
    
    # Your active trading symbols
    symbols = [
        'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'SOLUSDT',
        'XRPUSDT', 'DOGEUSDT', 'MATICUSDT', 'DOTUSDT', 'AVAXUSDT',
        'LINKUSDT', 'UNIUSDT', 'ATOMUSDT', 'LTCUSDT', 'NEARUSDT'
    ]
    
    try:
        api.download_complete_dataset(
            symbols=symbols,
            days=90,
            include_funding=True,
            include_summary=True,
            include_risk=True
        )
        
        logger.info("\n" + "="*60)
        logger.info("✓ Initial data download completed successfully!")
        logger.info("="*60)
        
    except Exception as e:
        logger.error(f"❌ Error during download: {e}", exc_info=True)
        raise
    
    finally:
        api.close()

if __name__ == "__main__":
    main()

