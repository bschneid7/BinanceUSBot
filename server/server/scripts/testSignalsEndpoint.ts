import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables
dotenv.config();

const API_BASE_URL = 'http://localhost:3000';

/**
 * Test script for signals endpoints
 * Tests the GET /api/signals/recent endpoint with authentication
 */
async function testSignalsEndpoint() {
  try {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  Testing Signals Endpoints                             ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    // Step 1: Login to get access token
    console.log('🔐 Step 1: Logging in as test user...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/auth/login`, {
      email: 'test@example.com',
      password: 'password123',
    });

    const accessToken = loginResponse.data.accessToken;
    console.log('✅ Login successful, got access token\n');

    // Step 2: Test GET /api/signals/recent with default limit
    console.log('📡 Step 2: Testing GET /api/signals/recent (default limit)...');
    const response1 = await axios.get(`${API_BASE_URL}/api/signals/recent`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    console.log(`✅ Response status: ${response1.status}`);
    console.log(`   Signals returned: ${response1.data.signals.length}`);
    console.log('\n   Recent signals:');
    response1.data.signals.forEach((signal: any, index: number) => {
      const timestamp = new Date(signal.timestamp).toLocaleString();
      console.log(`   ${index + 1}. ${signal.symbol} - ${signal.playbook} - ${signal.action} (${timestamp})`);
      if (signal.entry_price) {
        console.log(`      Entry Price: $${signal.entry_price.toLocaleString()}`);
      }
      if (signal.reason) {
        console.log(`      Reason: ${signal.reason}`);
      }
    });
    console.log('');

    // Step 3: Test GET /api/signals/recent with custom limit
    console.log('📡 Step 3: Testing GET /api/signals/recent with limit=5...');
    const response2 = await axios.get(`${API_BASE_URL}/api/signals/recent`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { limit: 5 },
    });

    console.log(`✅ Response status: ${response2.status}`);
    console.log(`   Signals returned: ${response2.data.signals.length}`);
    console.log('');

    // Step 4: Test GET /api/signals/stats
    console.log('📊 Step 4: Testing GET /api/signals/stats...');
    const response3 = await axios.get(`${API_BASE_URL}/api/signals/stats`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    console.log(`✅ Response status: ${response3.status}`);
    console.log('   Statistics:');
    console.log(`   - Total: ${response3.data.stats.total}`);
    console.log(`   - Executed: ${response3.data.stats.executed}`);
    console.log(`   - Skipped: ${response3.data.stats.skipped}`);
    console.log('   - By Playbook:');
    Object.entries(response3.data.stats.byPlaybook).forEach(([playbook, count]) => {
      console.log(`     ${playbook}: ${count}`);
    });
    console.log('');

    // Step 5: Test GET /api/signals with filters
    console.log('📡 Step 5: Testing GET /api/signals with filters (action=EXECUTED)...');
    const response4 = await axios.get(`${API_BASE_URL}/api/signals`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { action: 'EXECUTED' },
    });

    console.log(`✅ Response status: ${response4.status}`);
    console.log(`   Executed signals: ${response4.data.signals.length}`);
    console.log('');

    // Step 6: Test GET /api/signals with filters
    console.log('📡 Step 6: Testing GET /api/signals with filters (action=SKIPPED)...');
    const response5 = await axios.get(`${API_BASE_URL}/api/signals`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { action: 'SKIPPED' },
    });

    console.log(`✅ Response status: ${response5.status}`);
    console.log(`   Skipped signals: ${response5.data.signals.length}`);
    console.log('');

    // Summary
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  All Tests Passed! ✅                                  ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log('✨ Summary:');
    console.log(`   - GET /api/signals/recent: ✅ Working`);
    console.log(`   - GET /api/signals/stats: ✅ Working`);
    console.log(`   - GET /api/signals (with filters): ✅ Working`);
    console.log('');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (axios.isAxiosError(error)) {
      console.error('Status:', error.response?.status);
      console.error('Response:', error.response?.data);
    }
    process.exit(1);
  }
}

// Run the test
testSignalsEndpoint();
