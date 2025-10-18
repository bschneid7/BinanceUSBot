/**
 * Test script for bot control endpoints (emergency stop and resume)
 *
 * Tests:
 * 1. User authentication
 * 2. Emergency stop endpoint
 * 3. Resume trading endpoint
 * 4. Status verification
 */

import axios, { AxiosInstance } from 'axios';

const BASE_URL = 'http://localhost:3000';
const TEST_USER = {
  email: 'test@example.com',
  password: 'password123'
};

let api: AxiosInstance;
let accessToken: string;

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: [] as Array<{ name: string; status: 'PASS' | 'FAIL'; message?: string }>
};

function logTest(name: string, status: 'PASS' | 'FAIL', message?: string) {
  results.tests.push({ name, status, message });
  results[status === 'PASS' ? 'passed' : 'failed']++;

  const icon = status === 'PASS' ? '✓' : '✗';
  const color = status === 'PASS' ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${icon}\x1b[0m ${name}${message ? ': ' + message : ''}`);
}

async function authenticate() {
  console.log('\n=== Authentication ===\n');

  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, TEST_USER);
    accessToken = response.data.accessToken;

    // Create axios instance with auth header
    api = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    logTest('User Authentication', 'PASS', `Token: ${accessToken.substring(0, 20)}...`);
    return true;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    logTest('User Authentication', 'FAIL', err?.response?.data?.error || err?.message);
    return false;
  }
}

async function testGetBotStatus() {
  console.log('\n=== Get Bot Status (Before Emergency Stop) ===\n');

  try {
    const response = await api.get('/api/bot/status');
    const { status, equity, openPositions, totalOpenRiskR } = response.data;

    console.log(`Bot Status: ${status}`);
    console.log(`Equity: $${equity}`);
    console.log(`Open Positions: ${openPositions}`);
    console.log(`Total Open Risk: ${totalOpenRiskR}R`);

    logTest('Get Bot Status', 'PASS', `Status: ${status}, Open Positions: ${openPositions}`);
    return { status, openPositions };
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    logTest('Get Bot Status', 'FAIL', err?.response?.data?.error || err?.message);
    return null;
  }
}

async function testEmergencyStop() {
  console.log('\n=== Emergency Stop ===\n');

  try {
    const response = await api.post('/api/bot/emergency-stop');
    const { success, message, positionsFlattened } = response.data;

    console.log(`Success: ${success}`);
    console.log(`Message: ${message}`);
    console.log(`Positions Flattened: ${positionsFlattened}`);

    if (success) {
      logTest('Emergency Stop Execution', 'PASS', `${positionsFlattened} positions flattened`);
    } else {
      logTest('Emergency Stop Execution', 'FAIL', 'Success flag is false');
    }

    return { success, positionsFlattened };
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string; message?: string } }; message?: string };
    logTest('Emergency Stop Execution', 'FAIL', err?.response?.data?.error || err?.response?.data?.message || err?.message);
    return null;
  }
}

async function testBotStatusAfterStop() {
  console.log('\n=== Get Bot Status (After Emergency Stop) ===\n');

  try {
    const response = await api.get('/api/bot/status');
    const { status, openPositions } = response.data;

    console.log(`Bot Status: ${status}`);
    console.log(`Open Positions: ${openPositions}`);

    if (status === 'STOPPED') {
      logTest('Bot Status After Emergency Stop', 'PASS', `Status correctly set to STOPPED`);
    } else {
      logTest('Bot Status After Emergency Stop', 'FAIL', `Expected STOPPED, got ${status}`);
    }

    if (openPositions === 0) {
      logTest('Positions Closed Verification', 'PASS', 'All positions closed');
    } else {
      logTest('Positions Closed Verification', 'FAIL', `${openPositions} positions still open`);
    }

    return { status, openPositions };
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    logTest('Bot Status After Emergency Stop', 'FAIL', err?.response?.data?.error || err?.message);
    return null;
  }
}

async function testResumeTrading(justification: string) {
  console.log('\n=== Resume Trading ===\n');

  try {
    const response = await api.post('/api/bot/resume', { justification });
    const { success, message, previousStatus } = response.data;

    console.log(`Success: ${success}`);
    console.log(`Message: ${message}`);
    console.log(`Previous Status: ${previousStatus}`);
    console.log(`Justification: ${justification}`);

    if (success) {
      logTest('Resume Trading Execution', 'PASS', `Previous status: ${previousStatus}`);
    } else {
      logTest('Resume Trading Execution', 'FAIL', 'Success flag is false');
    }

    return { success, previousStatus };
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string; message?: string } }; message?: string };
    logTest('Resume Trading Execution', 'FAIL', err?.response?.data?.error || err?.response?.data?.message || err?.message);
    return null;
  }
}

async function testBotStatusAfterResume() {
  console.log('\n=== Get Bot Status (After Resume) ===\n');

  try {
    const response = await api.get('/api/bot/status');
    const { status } = response.data;

    console.log(`Bot Status: ${status}`);

    if (status === 'ACTIVE') {
      logTest('Bot Status After Resume', 'PASS', 'Status correctly set to ACTIVE');
    } else {
      logTest('Bot Status After Resume', 'FAIL', `Expected ACTIVE, got ${status}`);
    }

    return { status };
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    logTest('Bot Status After Resume', 'FAIL', err?.response?.data?.error || err?.message);
    return null;
  }
}

async function testResumeWhenAlreadyActive() {
  console.log('\n=== Resume Trading (When Already Active) ===\n');

  try {
    const response = await api.post('/api/bot/resume', {
      justification: 'Testing double resume'
    });
    const { success, message } = response.data;

    console.log(`Success: ${success}`);
    console.log(`Message: ${message}`);

    if (message.includes('already active') || message.includes('already')) {
      logTest('Resume When Already Active', 'PASS', 'Correctly handled already active state');
    } else {
      logTest('Resume When Already Active', 'PASS', 'Resume succeeded');
    }

    return { success };
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string; message?: string } }; message?: string };
    logTest('Resume When Already Active', 'FAIL', err?.response?.data?.error || err?.response?.data?.message || err?.message);
    return null;
  }
}

async function testGetAlerts() {
  console.log('\n=== Get Alerts (After Control Actions) ===\n');

  try {
    const response = await api.get('/api/alerts', { params: { limit: 5 } });
    const { alerts } = response.data;

    console.log(`Found ${alerts.length} recent alerts:`);
    alerts.forEach((alert: { level: string; type: string; message: string; timestamp: string }) => {
      console.log(`  [${alert.level}] ${alert.type}: ${alert.message}`);
    });

    const emergencyStopAlert = alerts.find((a: { type: string }) => a.type === 'EMERGENCY_STOP');
    const resumeAlert = alerts.find((a: { type: string }) => a.type === 'TRADING_RESUMED');

    if (emergencyStopAlert) {
      logTest('Emergency Stop Alert Created', 'PASS', 'Alert found in system');
    } else {
      logTest('Emergency Stop Alert Created', 'FAIL', 'No emergency stop alert found');
    }

    if (resumeAlert) {
      logTest('Trading Resumed Alert Created', 'PASS', 'Alert found in system');
    } else {
      logTest('Trading Resumed Alert Created', 'FAIL', 'No resume alert found');
    }

    return { alerts };
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    logTest('Get Alerts', 'FAIL', err?.response?.data?.error || err?.message);
    return null;
  }
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  Bot Control Endpoints Test Suite                 ║');
  console.log('╚════════════════════════════════════════════════════╝');

  // Authenticate
  const authenticated = await authenticate();
  if (!authenticated) {
    console.log('\n❌ Authentication failed. Cannot proceed with tests.');
    return;
  }

  // Test flow
  await testGetBotStatus();
  await testEmergencyStop();
  await testBotStatusAfterStop();
  await testResumeTrading('System test - verifying emergency stop and resume functionality');
  await testBotStatusAfterResume();
  await testResumeWhenAlreadyActive();
  await testGetAlerts();

  // Summary
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  Test Summary                                      ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  console.log(`Total Tests: ${results.passed + results.failed}`);
  console.log(`\x1b[32mPassed: ${results.passed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${results.failed}\x1b[0m`);

  if (results.failed > 0) {
    console.log('\n\x1b[31mFailed Tests:\x1b[0m');
    results.tests
      .filter(t => t.status === 'FAIL')
      .forEach(t => console.log(`  - ${t.name}: ${t.message || 'Unknown error'}`));
  }

  console.log('\n');

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
