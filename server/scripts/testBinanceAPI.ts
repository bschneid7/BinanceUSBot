import dotenv from 'dotenv';
dotenv.config({ path: '/opt/binance-bot/.env.production' });

console.log('Environment check:');
console.log('BINANCE_US_API_KEY:', process.env.BINANCE_US_API_KEY?.substring(0, 10) + '...');
console.log('BINANCE_US_API_SECRET:', process.env.BINANCE_US_API_SECRET?.substring(0, 10) + '...');

// Now test the import
import binanceService from '../services/binanceService';

console.log('\nBinanceService configured:', (binanceService as any).isConfigured());
console.log('API Key in service:', (binanceService as any).apiKey?.substring(0, 10) + '...');
