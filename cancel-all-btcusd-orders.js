// Script to cancel all open BTCUSD orders
const axios = require('axios');
const crypto = require('crypto');

const API_KEY = process.env.BINANCE_US_API_KEY;
const API_SECRET = process.env.BINANCE_US_API_SECRET;
const BASE_URL = 'https://api.binance.us';

function sign(queryString) {
  return crypto
    .createHmac('sha256', API_SECRET)
    .update(queryString)
    .digest('hex');
}

async function cancelAllOrders(symbol) {
  try {
    const timestamp = Date.now();
    const queryString = `symbol=${symbol}&timestamp=${timestamp}`;
    const signature = sign(queryString);
    
    const response = await axios.delete(`${BASE_URL}/api/v3/openOrders?${queryString}&signature=${signature}`, {
      headers: {
        'X-MBX-APIKEY': API_KEY
      }
    });
    
    console.log(`Canceled ${response.data.length} orders for ${symbol}`);
    return response.data;
  } catch (error) {
    console.error('Error canceling orders:', error.response?.data || error.message);
    throw error;
  }
}

async function main() {
  console.log('Canceling all BTCUSD orders...');
  const canceled = await cancelAllOrders('BTCUSD');
  console.log('Done!');
  console.log(JSON.stringify(canceled, null, 2));
}

main().catch(console.error);

