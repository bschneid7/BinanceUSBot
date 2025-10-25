#!/usr/bin/env python3
"""
CryptoDataDownload API Integration for Binance Trading Bot
Complete implementation with all key endpoints for ML training

API Token: 784643015b96abce1b67ca094eaa4094c90aad69
Base URL: https://api.cryptodatadownload.com/v1/data/
"""

import requests
import pandas as pd
import sqlite3
import json
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, List
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# API Configuration
API_TOKEN = "784643015b96abce1b67ca094eaa4094c90aad69"
BASE_URL = "https://api.cryptodatadownload.com/v1/data"


class CryptoDataDownloadAPI:
    """Complete CryptoDataDownload API client"""
    
    def __init__(self, api_token: str = API_TOKEN, db_path: str = "cdd_data.db"):
        self.api_token = api_token
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'TOKEN {self.api_token}',
            'User-Agent': 'BinanceBot/1.0'
        })
        self.db_path = db_path
        self.conn = None
        self._init_database()
    
    def _init_database(self):
        """Initialize SQLite database - tables created dynamically by pandas"""
        self.conn = sqlite3.connect(self.db_path)
        logger.info(f"Database initialized: {self.db_path}")
    def _make_request(self, endpoint: str, params: Dict = None) -> Optional[Dict]:
        """Make API request with error handling"""
        url = f"{self.base_url}/{endpoint}"
        
        try:
            response = self.session.get(url, params=params)
            response.raise_for_status()
            
            # Handle different return formats
            content_type = response.headers.get('Content-Type', '')
            
            if 'application/json' in content_type:
                return response.json()
            elif 'text/csv' in content_type:
                return {'csv': response.text}
            else:
                return {'raw': response.text}
        
        except requests.exceptions.HTTPError as e:
            logger.error(f"HTTP Error {e.response.status_code}: {url}")
            logger.error(f"Response: {e.response.text[:200]}")
            return None
        except Exception as e:
            logger.error(f"Request failed: {e}")
            return None
    
    # ==================== SPOT OHLCV ====================
    
    def get_spot_ohlcv(
        self,
        symbol: str,
        interval: str = '1d',
        limit: int = 100,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> pd.DataFrame:
        """
        Get spot OHLCV data
        
        Args:
            symbol: Trading pair (e.g., 'BTCUSDT')
            interval: Time interval (1m, 5m, 15m, 1h, 4h, 1d)
            limit: Number of records
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
        """
        params = {
            'symbol': symbol,
            'interval': interval,
            'limit': limit,
            'return': 'JSON'
        }
        
        if start_date:
            params['start_date'] = start_date
        if end_date:
            params['end_date'] = end_date
        
        logger.info(f"Fetching spot OHLCV: {symbol} {interval}")
        data = self._make_request('ohlc/binance/spot/', params)
        
        if data and 'result' in data:
            df = pd.DataFrame(data['result'])
            
            # Store in database
            df.to_sql('spot_ohlcv', self.conn, if_exists='append', index=False)
            
            logger.info(f"✓ Retrieved {len(df)} candles for {symbol}")
            return df
        
        return pd.DataFrame()
    
    # ==================== FUNDING RATES ====================
    
    def get_funding_rates(
        self,
        symbol: str,
        limit: int = 100
    ) -> pd.DataFrame:
        """
        Get futures funding rates (daily)
        
        Args:
            symbol: Futures symbol (e.g., 'BTCUSDT')
            limit: Number of records
        """
        params = {
            'symbol': symbol,
            'limit': limit,
            'return': 'JSON'
        }
        
        logger.info(f"Fetching funding rates: {symbol}")
        data = self._make_request('summary/binance/futures/funding/', params)
        
        if data and 'result' in data:
            df = pd.DataFrame(data['result'])
            
            # Store in database
            df.to_sql('funding_rates', self.conn, if_exists='append', index=False)
            
            logger.info(f"✓ Retrieved {len(df)} funding rate records for {symbol}")
            return df
        
        return pd.DataFrame()
    
    # ==================== SPOT TRANSACTIONAL SUMMARY ====================
    
    def get_spot_summary(
        self,
        symbol: str,
        interval: str = 'daily',
        limit: int = 100
    ) -> pd.DataFrame:
        """
        Get spot transactional summary (VWAP, buy/sell volumes, largest trades)
        
        Args:
            symbol: Trading pair (BTCUSDT or ETHUSDT only)
            interval: 'daily' or 'hourly'
            limit: Number of records
        """
        params = {
            'symbol': symbol,
            'interval': interval,
            'limit': limit,
            'return': 'JSON'
        }
        
        logger.info(f"Fetching spot summary: {symbol} {interval}")
        data = self._make_request('summary/binance/spot/transactional/', params)
        
        if data and 'result' in data:
            df = pd.DataFrame(data['result'])
            
            # Store in database
            df.to_sql('spot_summary', self.conn, if_exists='append', index=False)
            
            logger.info(f"✓ Retrieved {len(df)} summary records for {symbol}")
            return df
        
        return pd.DataFrame()
    
    # ==================== FUTURES METRICS ====================
    
    def get_futures_metrics(
        self,
        symbol: str,
        limit: int = 100
    ) -> pd.DataFrame:
        """
        Get futures summary metrics (liquidations, open interest, etc.)
        
        Args:
            symbol: Futures symbol (BTCUSDT or ETHUSDT)
            limit: Number of records
        """
        params = {
            'symbol': symbol,
            'limit': limit,
            'return': 'JSON'
        }
        
        logger.info(f"Fetching futures metrics: {symbol}")
        data = self._make_request('summary/binance/futures/metrics/', params)
        
        if data and 'result' in data:
            df = pd.DataFrame(data['result'])
            logger.info(f"✓ Retrieved {len(df)} futures metrics for {symbol}")
            return df
        
        return pd.DataFrame()
    
    # ==================== CORRELATIONS ====================
    
    def get_correlations(
        self,
        symbol: str,
        limit: int = 30
    ) -> pd.DataFrame:
        """
        Get trading correlations for a symbol
        
        Args:
            symbol: Trading pair
            limit: Number of days
        """
        params = {
            'symbol': symbol,
            'limit': limit,
            'return': 'JSON'
        }
        
        logger.info(f"Fetching correlations: {symbol}")
        data = self._make_request('risk/correlations/', params)
        
        if data and 'result' in data:
            df = pd.DataFrame(data['result'])
            logger.info(f"✓ Retrieved correlations for {symbol}")
            return df
        
        return pd.DataFrame()
    
    # ==================== VALUE AT RISK ====================
    
    def get_var(
        self,
        symbol: str,
        limit: int = 30
    ) -> pd.DataFrame:
        """
        Get Value at Risk metrics
        
        Args:
            symbol: Trading pair
            limit: Number of records
        """
        params = {
            'symbol': symbol,
            'limit': limit,
            'return': 'JSON'
        }
        
        logger.info(f"Fetching VaR: {symbol}")
        data = self._make_request('risk/var/standalone/', params)
        
        if data and 'result' in data:
            try:
                # Handle both list and dict responses
                if isinstance(data['result'], dict):
                    df = pd.DataFrame([data['result']])
                else:
                    df = pd.DataFrame(data['result'])
                logger.info(f"✓ Retrieved VaR data for {symbol}")
                return df
            except Exception as e:
                logger.warning(f"Could not parse VaR data for {symbol}: {e}")
                return pd.DataFrame()
        
        return pd.DataFrame()
    
    # ==================== TICK DATA ====================
    
    def get_tick_ohlcv(
        self,
        symbol: str,
        tick_size: int = 1500,
        limit: int = 1000
    ) -> pd.DataFrame:
        """
        Get tick-based OHLCV (volume-based, not time-based)
        
        Args:
            symbol: BTCUSDT or ETHUSDT only
            tick_size: 610, 1500, or 4500
            limit: Number of records
        """
        params = {
            'symbol': symbol,
            'tick_size': tick_size,
            'limit': limit,
            'return': 'JSON'
        }
        
        logger.info(f"Fetching tick OHLCV: {symbol} tick_size={tick_size}")
        data = self._make_request('ohlc/binance/tick/', params)
        
        if data and 'result' in data:
            df = pd.DataFrame(data['result'])
            logger.info(f"✓ Retrieved {len(df)} tick candles for {symbol}")
            return df
        
        return pd.DataFrame()
    
    # ==================== AVAILABLE SYMBOLS ====================
    
    def get_available_symbols(self) -> List[str]:
        """Get list of available Binance symbols"""
        params = {'return': 'JSON'}
        
        logger.info("Fetching available symbols...")
        data = self._make_request('ohlc/binance/all/available/', params)
        
        if data and 'result' in data:
            symbols = [item['symbol'] for item in data['result']]
            logger.info(f"✓ Found {len(symbols)} available symbols")
            return symbols
        
        return []
    
    # ==================== BATCH DOWNLOAD ====================
    
    def download_complete_dataset(
        self,
        symbols: List[str],
        days: int = 90,
        include_funding: bool = True,
        include_summary: bool = True,
        include_risk: bool = True
    ):
        """
        Download complete dataset for ML training
        
        Args:
            symbols: List of trading pairs
            days: Number of days of historical data
            include_funding: Include funding rates
            include_summary: Include VWAP and buy/sell data
            include_risk: Include correlation and VaR data
        """
        logger.info(f"\n{'='*60}")
        logger.info(f"Starting complete dataset download")
        logger.info(f"Symbols: {symbols}")
        logger.info(f"Days: {days}")
        logger.info(f"{'='*60}\n")
        
        for symbol in symbols:
            logger.info(f"\n--- Processing {symbol} ---")
            
            # 1. Spot OHLCV (1-minute data)
            self.get_spot_ohlcv(symbol, interval='1m', limit=days*1440)
            time.sleep(1)
            
            # 2. Daily OHLCV
            self.get_spot_ohlcv(symbol, interval='1d', limit=days)
            time.sleep(1)
            
            # 3. Funding rates (if available)
            if include_funding:
                self.get_funding_rates(symbol, limit=days)
                time.sleep(1)
            
            # 4. Spot summary (VWAP, buy/sell) - only for BTC/ETH
            if include_summary and symbol in ['BTCUSDT', 'ETHUSDT']:
                self.get_spot_summary(symbol, interval='daily', limit=days)
                time.sleep(1)
                self.get_spot_summary(symbol, interval='hourly', limit=days*24)
                time.sleep(1)
            
            # 5. Risk metrics
            if include_risk:
                self.get_correlations(symbol, limit=days)
                time.sleep(1)
                self.get_var(symbol, limit=days)
                time.sleep(1)
        
        logger.info(f"\n{'='*60}")
        logger.info(f"✓ Complete dataset download finished!")
        logger.info(f"{'='*60}\n")
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            logger.info("Database connection closed")


# ==================== EXAMPLE USAGE ====================

def main():
    """Example usage of the API client"""
    
    # Initialize client
    api = CryptoDataDownloadAPI()
    
    # Your trading pairs
    symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'SOLUSDT']
    
    try:
        # Example 1: Get recent OHLCV data
        logger.info("\n=== Example 1: Get OHLCV Data ===")
        btc_daily = api.get_spot_ohlcv('BTCUSDT', interval='1d', limit=30)
        print(btc_daily.head())
        
        # Example 2: Get funding rates
        logger.info("\n=== Example 2: Get Funding Rates ===")
        btc_funding = api.get_funding_rates('BTCUSDT', limit=30)
        print(btc_funding.head())
        
        # Example 3: Get spot summary (VWAP, buy/sell volumes)
        logger.info("\n=== Example 3: Get Spot Summary ===")
        btc_summary = api.get_spot_summary('BTCUSDT', interval='daily', limit=30)
        print(btc_summary.head())
        
        # Example 4: Get correlations
        logger.info("\n=== Example 4: Get Correlations ===")
        btc_corr = api.get_correlations('BTCUSDT', limit=30)
        print(btc_corr.head())
        
        # Example 5: Get VaR
        logger.info("\n=== Example 5: Get Value at Risk ===")
        btc_var = api.get_var('BTCUSDT', limit=30)
        print(btc_var.head())
        
        # Example 6: Download complete dataset for all symbols
        logger.info("\n=== Example 6: Download Complete Dataset ===")
        # Uncomment to run full download
        # api.download_complete_dataset(
        #     symbols=symbols,
        #     days=90,
        #     include_funding=True,
        #     include_summary=True,
        #     include_risk=True
        # )
        
    finally:
        api.close()


if __name__ == "__main__":
    main()

