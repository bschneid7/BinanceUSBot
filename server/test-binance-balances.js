const axios = require('axios');
const crypto = require('crypto');

const apiKey = '7QHG5ppXTCT1k5X6Szp50nouySgXkdPxb94bjfzlrg4ihoLvW8Q6Pm6LY0bQ3VRV';
const apiSecret = 'dBh7JwGiilQ8iRxVgdMzN3Z6DNdnYM7cEBrBauM10sNQnJYspFo2SaKNDW6Z2Lsw';

async function getAccount() {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
  
  try {
    const response = await axios.get('https://api.binance.us/api/v3/account', {
      params: { timestamp, signature },
      headers: { 'X-MBX-APIKEY': apiKey }
    });
    
    const balances = response.data.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
    console.log('\nYour Binance.US Account Balances:');
    console.log('================================');
    balances.forEach(b => {
      const total = parseFloat(b.free) + parseFloat(b.locked);
      console.log(`${b.asset}: ${total} (Free: ${b.free}, Locked: ${b.locked})`);
    });
    console.log('\nTotal assets with balance:', balances.length);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

getAccount();
