/**
 * API Testing Script
 *
 * This script tests all major API endpoints to ensure they're working correctly.
 * Useful for:
 * - Verifying deployment
 * - Testing after updates
 * - Debugging API issues
 *
 * Usage: npm run api:test
 */

import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../server/.env') });

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Test123!@#';

let api: AxiosInstance;
let accessToken: string | null = null;
let testResults: { name: string; status: 'PASS' | 'FAIL'; message: string; duration: number }[] = [];

async function runTest(
  name: string,
  testFn: () => Promise<void>
): Promise<void> {
  const startTime = Date.now();
  try {
    console.log(`\n🧪 Testing: ${name}...`);
    await testFn();
    const duration = Date.now() - startTime;
    console.log(`✅ PASS: ${name} (${duration}ms)`);
    testResults.push({ name, status: 'PASS', message: 'Success', duration });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const message = error.response?.data?.error || error.message;
    console.error(`❌ FAIL: ${name} (${duration}ms)`);
    console.error(`   Error: ${message}`);
    testResults.push({ name, status: 'FAIL', message, duration });
  }
}

async function setupApiClient() {
  api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });

  // Add request interceptor for auth token
  api.interceptors.request.use((config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  });
}

// Test: Health Check
async function testHealthCheck() {
  const response = await api.get('/api/ping');
  if (response.data.message !== 'pong') {
    throw new Error('Unexpected response from health check');
  }
}

// Test: User Registration
async function testRegister() {
  try {
    const response = await api.post('/api/auth/register', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    if (!response.data.accessToken) {
      throw new Error('No access token returned');
    }

    accessToken = response.data.accessToken;
  } catch (error: any) {
    // If user already exists, try to login instead
    if (error.response?.status === 400 && error.response?.data?.error?.includes('already exists')) {
      console.log('   ℹ️  User already exists, will try login...');
      return;
    }
    throw error;
  }
}

// Test: User Login
async function testLogin() {
  const response = await api.post('/api/auth/login', {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (!response.data.accessToken) {
    throw new Error('No access token returned');
  }

  accessToken = response.data.accessToken;
}

// Test: Get Current User
async function testGetCurrentUser() {
  const response = await api.get('/api/auth/me');

  if (!response.data.user || !response.data.user.email) {
    throw new Error('Invalid user data returned');
  }

  if (response.data.user.email !== TEST_EMAIL) {
    throw new Error('User email mismatch');
  }
}

// Test: Get Bot Status
async function testGetBotStatus() {
  const response = await api.get('/api/bot/status');

  if (!response.data || typeof response.data.status !== 'string') {
    throw new Error('Invalid bot status data');
  }
}

// Test: Get Dashboard
async function testGetDashboard() {
  const response = await api.get('/api/bot/dashboard');

  if (!response.data || typeof response.data.equity !== 'number') {
    throw new Error('Invalid dashboard data');
  }
}

// Test: Get Bot Configuration
async function testGetBotConfig() {
  const response = await api.get('/api/config');

  if (!response.data || !response.data.scanner) {
    throw new Error('Invalid config data');
  }
}

// Test: Get Positions
async function testGetPositions() {
  const response = await api.get('/api/positions');

  if (!Array.isArray(response.data)) {
    throw new Error('Positions should be an array');
  }
}

// Test: Get Signals
async function testGetSignals() {
  const response = await api.get('/api/signals/recent');

  if (!Array.isArray(response.data)) {
    throw new Error('Signals should be an array');
  }
}

// Test: Get Alerts
async function testGetAlerts() {
  const response = await api.get('/api/alerts');

  if (!Array.isArray(response.data)) {
    throw new Error('Alerts should be an array');
  }
}

// Test: Get Trade History
async function testGetTradeHistory() {
  const response = await api.get('/api/trades/history');

  if (!Array.isArray(response.data.trades)) {
    throw new Error('Trade history should contain trades array');
  }
}

// Test: Get Analytics Performance
async function testGetAnalyticsPerformance() {
  const response = await api.get('/api/analytics/performance');

  if (!response.data || typeof response.data.totalTrades !== 'number') {
    throw new Error('Invalid analytics performance data');
  }
}

// Test: Get Tax Reports
async function testGetTaxReports() {
  const response = await api.get('/api/tax-reports');

  if (!Array.isArray(response.data)) {
    throw new Error('Tax reports should be an array');
  }
}

// Test: Get PPO Stats
async function testGetPPOStats() {
  const response = await api.get('/api/ppo/stats');

  if (typeof response.data.exists !== 'boolean') {
    throw new Error('Invalid PPO stats response');
  }
}

// Test: Get PPO Action
async function testGetPPOAction() {
  const response = await api.post('/api/ppo/action', {
    state: [0.5, 0.6, 0.02, 1, 0], // Mock state
  });

  if (typeof response.data.action !== 'number') {
    throw new Error('Invalid PPO action response');
  }

  if (!['hold', 'buy', 'sell'].includes(response.data.actionName)) {
    throw new Error('Invalid action name');
  }
}

// Test: Train PPO (short training)
async function testTrainPPO() {
  const response = await api.post('/api/ppo/train', {
    episodes: 10, // Short training for test
  });

  if (typeof response.data.avgReward !== 'number') {
    throw new Error('Invalid PPO training response');
  }

  if (!Array.isArray(response.data.episodeRewards)) {
    throw new Error('Episode rewards should be an array');
  }
}

// Test: User Logout
async function testLogout() {
  await api.post('/api/auth/logout');
  accessToken = null;
}

function printSummary() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));

  const passed = testResults.filter((r) => r.status === 'PASS').length;
  const failed = testResults.filter((r) => r.status === 'FAIL').length;
  const total = testResults.length;

  console.log(`\nTotal Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    testResults
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => {
        console.log(`   - ${r.name}: ${r.message}`);
      });
  }

  const totalDuration = testResults.reduce((sum, r) => sum + r.duration, 0);
  console.log(`\n⏱️  Total Duration: ${totalDuration}ms`);

  console.log('\n' + '='.repeat(80) + '\n');
}

async function main() {
  try {
    console.log('🚀 Starting API Tests...');
    console.log(`📍 API Base URL: ${API_BASE_URL}\n`);

    setupApiClient();

    // Run all tests
    await runTest('Health Check', testHealthCheck);
    await runTest('User Registration', testRegister);
    await runTest('User Login', testLogin);
    await runTest('Get Current User', testGetCurrentUser);
    await runTest('Get Bot Status', testGetBotStatus);
    await runTest('Get Dashboard', testGetDashboard);
    await runTest('Get Bot Configuration', testGetBotConfig);
    await runTest('Get Positions', testGetPositions);
    await runTest('Get Signals', testGetSignals);
    await runTest('Get Alerts', testGetAlerts);
    await runTest('Get Trade History', testGetTradeHistory);
    await runTest('Get Analytics Performance', testGetAnalyticsPerformance);
    await runTest('Get Tax Reports', testGetTaxReports);
    await runTest('Get PPO Stats', testGetPPOStats);
    await runTest('Get PPO Action', testGetPPOAction);
    await runTest('Train PPO (10 episodes)', testTrainPPO);
    await runTest('User Logout', testLogout);

    // Print summary
    printSummary();

    const failedCount = testResults.filter((r) => r.status === 'FAIL').length;
    process.exit(failedCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

main();
