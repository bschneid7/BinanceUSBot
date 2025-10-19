import dotenv from 'dotenv';
dotenv.config({ path: '/opt/binance-bot/.env.production' });

console.log('BINANCE_US_API_KEY:', process.env.BINANCE_US_API_KEY ? 'SET' : 'NOT SET');
console.log('BINANCE_US_API_SECRET:', process.env.BINANCE_US_API_SECRET ? 'SET' : 'NOT SET');
