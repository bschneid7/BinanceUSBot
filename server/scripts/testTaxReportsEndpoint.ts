import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

/**
 * Test tax reports endpoints
 */
async function testTaxReportsEndpoint() {
  const results: TestResult[] = [];
  let accessToken = '';

  console.log('='.repeat(60));
  console.log('TESTING TAX REPORTS ENDPOINTS');
  console.log('='.repeat(60));

  try {
    // Test 1: Login
    console.log('\n[Test 1] Login...');
    try {
      const loginResponse = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        email: 'test@example.com',
        password: 'password123'
      });

      accessToken = loginResponse.data.accessToken;
      console.log('✓ Login successful');
      results.push({ name: 'Login', passed: true });
    } catch (error: any) {
      console.error('✗ Login failed:', error.response?.data || error.message);
      results.push({ name: 'Login', passed: false, error: error.message });
      return;
    }

    // Test 2: Get all tax reports
    console.log('\n[Test 2] GET /api/tax/reports - Get all tax reports...');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/tax/reports`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      console.log(`✓ Retrieved ${response.data.reports.length} tax reports`);

      if (response.data.reports.length > 0) {
        const report = response.data.reports[0];
        console.log(`  Sample report: ${report.month}, Equity: $${report.equity}, PnL: $${report.realizedPnl}`);
      }

      results.push({ name: 'Get all tax reports', passed: true });
    } catch (error: any) {
      console.error('✗ Get all tax reports failed:', error.response?.data || error.message);
      results.push({ name: 'Get all tax reports', passed: false, error: error.message });
    }

    // Test 3: Get tax reports filtered by year
    console.log('\n[Test 3] GET /api/tax/reports?year=2025 - Get reports for 2025...');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/tax/reports`, {
        params: { year: 2025 },
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      console.log(`✓ Retrieved ${response.data.reports.length} tax reports for 2025`);
      results.push({ name: 'Get tax reports by year', passed: true });
    } catch (error: any) {
      console.error('✗ Get tax reports by year failed:', error.response?.data || error.message);
      results.push({ name: 'Get tax reports by year', passed: false, error: error.message });
    }

    // Test 4: Get tax reports filtered by status
    console.log('\n[Test 4] GET /api/tax/reports?status=balanced - Get balanced reports...');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/tax/reports`, {
        params: { status: 'balanced' },
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      console.log(`✓ Retrieved ${response.data.reports.length} balanced tax reports`);
      results.push({ name: 'Get tax reports by status', passed: true });
    } catch (error: any) {
      console.error('✗ Get tax reports by status failed:', error.response?.data || error.message);
      results.push({ name: 'Get tax reports by status', passed: false, error: error.message });
    }

    // Test 5: Get a specific tax report by month
    console.log('\n[Test 5] GET /api/tax/reports/:month - Get specific month report...');
    try {
      const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

      const response = await axios.get(`${API_BASE_URL}/api/tax/reports/${currentMonth}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      console.log(`✓ Retrieved tax report for ${currentMonth}`);
      console.log(`  Equity: $${response.data.report.equity}`);
      console.log(`  Realized PnL: $${response.data.report.realizedPnl}`);
      console.log(`  Fees: $${response.data.report.feesPaid}`);
      console.log(`  Status: ${response.data.report.reconciliationStatus}`);
      console.log(`  Frozen: ${response.data.report.frozen}`);

      results.push({ name: 'Get tax report by month', passed: true });
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log('ℹ No report found for current month (this is expected if not seeded)');
        results.push({ name: 'Get tax report by month', passed: true });
      } else {
        console.error('✗ Get tax report by month failed:', error.response?.data || error.message);
        results.push({ name: 'Get tax report by month', passed: false, error: error.message });
      }
    }

    // Test 6: Get tax report statistics
    console.log('\n[Test 6] GET /api/tax/stats - Get tax report statistics...');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/tax/stats`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      console.log('✓ Retrieved tax report statistics:');
      console.log(`  Total Reports: ${response.data.stats.totalReports}`);
      console.log(`  Total Realized PnL: $${response.data.stats.totalRealizedPnl.toFixed(2)}`);
      console.log(`  Total Fees: $${response.data.stats.totalFees.toFixed(2)}`);
      console.log(`  Latest Month: ${response.data.stats.latestMonth || 'N/A'}`);
      console.log(`  Balanced Reports: ${response.data.stats.balancedReports}`);
      console.log(`  Pending Reports: ${response.data.stats.pendingReports}`);
      console.log(`  Discrepancy Reports: ${response.data.stats.discrepancyReports}`);

      results.push({ name: 'Get tax report statistics', passed: true });
    } catch (error: any) {
      console.error('✗ Get tax report statistics failed:', error.response?.data || error.message);
      results.push({ name: 'Get tax report statistics', passed: false, error: error.message });
    }

    // Test 7: Create a new tax report
    console.log('\n[Test 7] POST /api/tax/reports - Create new tax report...');
    try {
      const testMonth = '2024-12';

      const response = await axios.post(
        `${API_BASE_URL}/api/tax/reports`,
        {
          month: testMonth,
          equity: 6850.00,
          realizedPnl: -150.00,
          feesPaid: 25.50,
          balances: {
            BTC: 0.075,
            ETH: 1.5,
            USDT: 2050.00
          },
          contentHash: 'test123abc',
          frozen: true,
          reconciliationStatus: 'balanced',
          notes: 'Test report created by test script'
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      console.log(`✓ Created tax report for ${testMonth}`);
      console.log(`  Report ID: ${response.data.report._id}`);

      results.push({ name: 'Create tax report', passed: true });

      // Clean up - delete the test report
      console.log('\n[Test 8] DELETE /api/tax/reports/:month - Delete test report...');
      try {
        await axios.delete(`${API_BASE_URL}/api/tax/reports/${testMonth}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        console.log('✗ Should not be able to delete frozen report');
        results.push({ name: 'Delete frozen tax report (should fail)', passed: false, error: 'Deletion succeeded when it should have failed' });
      } catch (deleteError: any) {
        if (deleteError.response?.status === 500 && deleteError.response?.data?.error?.includes('frozen')) {
          console.log('✓ Correctly prevented deletion of frozen report');
          results.push({ name: 'Delete frozen tax report (should fail)', passed: true });
        } else {
          console.error('✗ Unexpected error:', deleteError.response?.data || deleteError.message);
          results.push({ name: 'Delete frozen tax report (should fail)', passed: false, error: deleteError.message });
        }
      }
    } catch (error: any) {
      if (error.response?.status === 500 && error.response?.data?.error?.includes('already exists')) {
        console.log('ℹ Report already exists (run seed script to clear)');
        results.push({ name: 'Create tax report', passed: true });
      } else {
        console.error('✗ Create tax report failed:', error.response?.data || error.message);
        results.push({ name: 'Create tax report', passed: false, error: error.message });
      }
    }

    // Test 9: Invalid month format
    console.log('\n[Test 9] GET /api/tax/reports/invalid-month - Test invalid month format...');
    try {
      await axios.get(`${API_BASE_URL}/api/tax/reports/invalid-month`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      console.error('✗ Should have rejected invalid month format');
      results.push({ name: 'Invalid month format validation', passed: false, error: 'Validation did not reject invalid format' });
    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log('✓ Correctly rejected invalid month format');
        results.push({ name: 'Invalid month format validation', passed: true });
      } else {
        console.error('✗ Unexpected error:', error.response?.data || error.message);
        results.push({ name: 'Invalid month format validation', passed: false, error: error.message });
      }
    }

  } catch (error: any) {
    console.error('\n✗ Unexpected error during testing:', error.message);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const passedTests = results.filter(r => r.passed).length;
  const totalTests = results.length;

  results.forEach(result => {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`${status}: ${result.name}`);
    if (result.error) {
      console.log(`       Error: ${result.error}`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log(`TOTAL: ${passedTests}/${totalTests} tests passed`);
  console.log('='.repeat(60));

  if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed.');
    process.exit(1);
  }
}

// Run the tests
testTaxReportsEndpoint();
