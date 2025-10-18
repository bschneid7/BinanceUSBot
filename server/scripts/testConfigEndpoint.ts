import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

interface TestResult {
  test: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function logResult(test: string, passed: boolean, message: string) {
  results.push({ test, passed, message });
  const emoji = passed ? '✓' : '✗';
  console.log(`${emoji} ${test}: ${message}`);
}

/**
 * Test config endpoints
 */
async function testConfigEndpoints() {
  console.log('Starting config endpoint tests...\n');

  try {
    // Step 1: Login to get access token
    console.log('=== Step 1: Authentication ===');
    let accessToken = '';
    try {
      const loginResponse = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        email: 'test@example.com',
        password: 'password123'
      });

      accessToken = loginResponse.data.accessToken;
      logResult('Login', true, 'Successfully authenticated');
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown }; message?: string };
      logResult('Login', false, `Authentication failed: ${err?.response?.data || err?.message}`);
      return;
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`
    };

    // Step 2: Get bot config (should create default if not exists)
    console.log('\n=== Step 2: Get Bot Configuration ===');
    let config: unknown;
    try {
      const getResponse = await axios.get(`${API_BASE_URL}/api/config`, { headers });
      config = getResponse.data.config;
      logResult('GET /api/config', true, 'Successfully retrieved configuration');
      console.log('Config structure:', JSON.stringify(config, null, 2));
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown }; message?: string };
      logResult('GET /api/config', false, `Failed: ${err?.response?.data || err?.message}`);
      return;
    }

    // Step 3: Update risk settings
    console.log('\n=== Step 3: Update Risk Settings ===');
    try {
      const updateResponse = await axios.put(
        `${API_BASE_URL}/api/config`,
        {
          risk: {
            R_pct: 0.008,
            max_positions: 5,
            correlation_guard: false
          }
        },
        { headers }
      );
      logResult('PUT /api/config (risk)', true, updateResponse.data.message);
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown }; message?: string };
      logResult('PUT /api/config (risk)', false, `Failed: ${err?.response?.data || err?.message}`);
    }

    // Step 4: Update reserve settings
    console.log('\n=== Step 4: Update Reserve Settings ===');
    try {
      const updateResponse = await axios.put(
        `${API_BASE_URL}/api/config`,
        {
          reserve: {
            target_pct: 0.35,
            floor_pct: 0.25
          }
        },
        { headers }
      );
      logResult('PUT /api/config (reserve)', true, updateResponse.data.message);
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown }; message?: string };
      logResult('PUT /api/config (reserve)', false, `Failed: ${err?.response?.data || err?.message}`);
    }

    // Step 5: Update playbook A settings
    console.log('\n=== Step 5: Update Playbook A Settings ===');
    try {
      const updateResponse = await axios.put(
        `${API_BASE_URL}/api/config`,
        {
          playbook_A: {
            enable: true,
            volume_mult: 2.0,
            breakeven_R: 1.5
          }
        },
        { headers }
      );
      logResult('PUT /api/config (playbook_A)', true, updateResponse.data.message);
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown }; message?: string };
      logResult('PUT /api/config (playbook_A)', false, `Failed: ${err?.response?.data || err?.message}`);
    }

    // Step 6: Update playbook D (minimal config)
    console.log('\n=== Step 6: Update Playbook D Settings ===');
    try {
      const updateResponse = await axios.put(
        `${API_BASE_URL}/api/config`,
        {
          playbook_D: {
            enable: false
          }
        },
        { headers }
      );
      logResult('PUT /api/config (playbook_D)', true, updateResponse.data.message);
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown }; message?: string };
      logResult('PUT /api/config (playbook_D)', false, `Failed: ${err?.response?.data || err?.message}`);
    }

    // Step 7: Get updated config and verify changes
    console.log('\n=== Step 7: Verify Updates ===');
    try {
      const getResponse = await axios.get(`${API_BASE_URL}/api/config`, { headers });
      const updatedConfig = getResponse.data.config as {
        risk: { R_pct: number; max_positions: number; correlation_guard: boolean };
        reserve: { target_pct: number; floor_pct: number };
        playbook_A: { volume_mult: number; breakeven_R: number };
        playbook_D: { enable: boolean };
      };

      const checks = [
        { field: 'risk.R_pct', value: updatedConfig.risk.R_pct, expected: 0.008 },
        { field: 'risk.max_positions', value: updatedConfig.risk.max_positions, expected: 5 },
        { field: 'risk.correlation_guard', value: updatedConfig.risk.correlation_guard, expected: false },
        { field: 'reserve.target_pct', value: updatedConfig.reserve.target_pct, expected: 0.35 },
        { field: 'reserve.floor_pct', value: updatedConfig.reserve.floor_pct, expected: 0.25 },
        { field: 'playbook_A.volume_mult', value: updatedConfig.playbook_A.volume_mult, expected: 2.0 },
        { field: 'playbook_A.breakeven_R', value: updatedConfig.playbook_A.breakeven_R, expected: 1.5 },
        { field: 'playbook_D.enable', value: updatedConfig.playbook_D.enable, expected: false }
      ];

      let allValid = true;
      for (const check of checks) {
        const match = check.value === check.expected;
        if (!match) {
          allValid = false;
          console.log(`  ✗ ${check.field}: expected ${check.expected}, got ${check.value}`);
        } else {
          console.log(`  ✓ ${check.field}: ${check.value}`);
        }
      }

      logResult('Verify updates', allValid, allValid ? 'All fields updated correctly' : 'Some fields did not update correctly');
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown }; message?: string };
      logResult('Verify updates', false, `Failed: ${err?.response?.data || err?.message}`);
    }

    // Step 8: Test validation - invalid R_pct
    console.log('\n=== Step 8: Test Validation (Invalid R_pct) ===');
    try {
      await axios.put(
        `${API_BASE_URL}/api/config`,
        {
          risk: {
            R_pct: 0.05 // 5% - should fail (max is 2%)
          }
        },
        { headers }
      );
      logResult('Validation (R_pct too high)', false, 'Should have rejected invalid R_pct');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      if (err?.response?.data?.message?.includes('must be between')) {
        logResult('Validation (R_pct too high)', true, 'Correctly rejected invalid R_pct');
      } else {
        logResult('Validation (R_pct too high)', false, `Unexpected error: ${err?.response?.data?.message || err?.message}`);
      }
    }

    // Step 9: Test validation - floor >= target
    console.log('\n=== Step 9: Test Validation (Invalid Reserve) ===');
    try {
      await axios.put(
        `${API_BASE_URL}/api/config`,
        {
          reserve: {
            floor_pct: 0.35,
            target_pct: 0.30 // floor >= target - should fail
          }
        },
        { headers }
      );
      logResult('Validation (floor >= target)', false, 'Should have rejected invalid reserve values');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      if (err?.response?.data?.message?.includes('must be less than')) {
        logResult('Validation (floor >= target)', true, 'Correctly rejected invalid reserve values');
      } else {
        logResult('Validation (floor >= target)', false, `Unexpected error: ${err?.response?.data?.message || err?.message}`);
      }
    }

    // Step 10: Test empty update
    console.log('\n=== Step 10: Test Empty Update ===');
    try {
      await axios.put(`${API_BASE_URL}/api/config`, {}, { headers });
      logResult('Empty update', false, 'Should have rejected empty update');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      if (err?.response?.data?.error?.includes('No configuration updates')) {
        logResult('Empty update', true, 'Correctly rejected empty update');
      } else {
        logResult('Empty update', false, `Unexpected error: ${err?.response?.data?.error || err?.message}`);
      }
    }

    // Summary
    console.log('\n=== Test Summary ===');
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    console.log(`Passed: ${passed}/${total}`);

    if (passed === total) {
      console.log('✓ All tests passed!');
    } else {
      console.log('✗ Some tests failed');
      console.log('\nFailed tests:');
      results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.test}: ${r.message}`);
      });
    }
  } catch (error) {
    console.error('Unexpected error during tests:', error);
  }
}

// Run tests
testConfigEndpoints();
