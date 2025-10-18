import dotenv from 'dotenv';
import axios from 'axios';
import type { AxiosInstance } from 'axios';

// Load environment variables
dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:3000';

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  data?: unknown;
}

/**
 * Comprehensive test suite for Trade History endpoints
 * Tests filtering by date, playbook, outcome, and symbol
 */
class TradeHistoryEndpointTester {
  private api: AxiosInstance;
  private accessToken: string | null = null;
  private results: TestResult[] = [];

  constructor() {
    this.api = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Add test result
   */
  private addResult(testName: string, passed: boolean, message: string, data?: unknown) {
    this.results.push({ testName, passed, message, data });
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${testName}: ${message}`);
    if (data) {
      console.log('   Data:', JSON.stringify(data, null, 2));
    }
  }

  /**
   * Authenticate with test user
   */
  async authenticate() {
    try {
      console.log('\n🔐 Authenticating with test user...');
      const response = await this.api.post('/api/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      });

      if (response.data.accessToken) {
        this.accessToken = response.data.accessToken;
        this.api.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
        this.addResult('Authentication', true, 'Successfully logged in');
        return true;
      } else {
        this.addResult('Authentication', false, 'No access token received');
        return false;
      }
    } catch (error) {
      console.error('Authentication error:', error);
      if (axios.isAxiosError(error)) {
        this.addResult('Authentication', false, `Failed: ${error.response?.data?.error || error.message}`);
      } else {
        this.addResult('Authentication', false, 'Failed with unknown error');
      }
      return false;
    }
  }

  /**
   * Test 1: Get all trade history (no filters)
   */
  async testGetAllTradeHistory() {
    try {
      console.log('\n📊 Test 1: Get all trade history...');
      const response = await this.api.get('/api/trades/history');

      if (response.status === 200 && Array.isArray(response.data.trades)) {
        this.addResult(
          'Get All Trade History',
          true,
          `Retrieved ${response.data.trades.length} trades`,
          { count: response.data.trades.length }
        );

        // Verify structure of first trade
        if (response.data.trades.length > 0) {
          const firstTrade = response.data.trades[0];
          const hasRequiredFields =
            'symbol' in firstTrade &&
            'playbook' in firstTrade &&
            'outcome' in firstTrade &&
            'pnl_usd' in firstTrade &&
            'date' in firstTrade;

          this.addResult(
            'Trade Structure Validation',
            hasRequiredFields,
            hasRequiredFields ? 'Trade object has all required fields' : 'Missing required fields',
            { sampleTrade: firstTrade }
          );
        }
      } else {
        this.addResult('Get All Trade History', false, 'Invalid response format');
      }
    } catch (error) {
      console.error('Error getting all trade history:', error);
      if (axios.isAxiosError(error)) {
        this.addResult('Get All Trade History', false, `Failed: ${error.response?.data?.error || error.message}`);
      } else {
        this.addResult('Get All Trade History', false, 'Failed with unknown error');
      }
    }
  }

  /**
   * Test 2: Filter by playbook
   */
  async testFilterByPlaybook() {
    try {
      console.log('\n📊 Test 2: Filter by playbook...');

      const playbooks = ['A', 'B', 'C', 'D'];

      for (const playbook of playbooks) {
        const response = await this.api.get('/api/trades/history', {
          params: { playbook }
        });

        if (response.status === 200) {
          const trades = response.data.trades;
          const allMatchPlaybook = trades.every((trade: { playbook: string }) => trade.playbook === playbook);

          this.addResult(
            `Filter by Playbook ${playbook}`,
            allMatchPlaybook,
            allMatchPlaybook
              ? `Found ${trades.length} trades for playbook ${playbook}`
              : `Some trades don't match playbook ${playbook}`,
            { count: trades.length, playbook }
          );
        }
      }
    } catch (error) {
      console.error('Error filtering by playbook:', error);
      if (axios.isAxiosError(error)) {
        this.addResult('Filter by Playbook', false, `Failed: ${error.response?.data?.error || error.message}`);
      } else {
        this.addResult('Filter by Playbook', false, 'Failed with unknown error');
      }
    }
  }

  /**
   * Test 3: Filter by outcome
   */
  async testFilterByOutcome() {
    try {
      console.log('\n📊 Test 3: Filter by outcome...');

      const outcomes = ['WIN', 'LOSS', 'BREAKEVEN'];

      for (const outcome of outcomes) {
        const response = await this.api.get('/api/trades/history', {
          params: { outcome }
        });

        if (response.status === 200) {
          const trades = response.data.trades;
          const allMatchOutcome = trades.every((trade: { outcome: string }) => trade.outcome === outcome);

          this.addResult(
            `Filter by Outcome ${outcome}`,
            allMatchOutcome,
            allMatchOutcome
              ? `Found ${trades.length} trades with outcome ${outcome}`
              : `Some trades don't match outcome ${outcome}`,
            { count: trades.length, outcome }
          );
        }
      }
    } catch (error) {
      console.error('Error filtering by outcome:', error);
      if (axios.isAxiosError(error)) {
        this.addResult('Filter by Outcome', false, `Failed: ${error.response?.data?.error || error.message}`);
      } else {
        this.addResult('Filter by Outcome', false, 'Failed with unknown error');
      }
    }
  }

  /**
   * Test 4: Filter by symbol
   */
  async testFilterBySymbol() {
    try {
      console.log('\n📊 Test 4: Filter by symbol...');

      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

      for (const symbol of symbols) {
        const response = await this.api.get('/api/trades/history', {
          params: { symbol }
        });

        if (response.status === 200) {
          const trades = response.data.trades;
          const allMatchSymbol = trades.every((trade: { symbol: string }) => trade.symbol === symbol);

          this.addResult(
            `Filter by Symbol ${symbol}`,
            allMatchSymbol,
            allMatchSymbol
              ? `Found ${trades.length} trades for ${symbol}`
              : `Some trades don't match symbol ${symbol}`,
            { count: trades.length, symbol }
          );
        }
      }
    } catch (error) {
      console.error('Error filtering by symbol:', error);
      if (axios.isAxiosError(error)) {
        this.addResult('Filter by Symbol', false, `Failed: ${error.response?.data?.error || error.message}`);
      } else {
        this.addResult('Filter by Symbol', false, 'Failed with unknown error');
      }
    }
  }

  /**
   * Test 5: Filter by date range
   */
  async testFilterByDateRange() {
    try {
      console.log('\n📊 Test 5: Filter by date range...');

      // Test 1: Last 24 hours
      const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
      const response1 = await this.api.get('/api/trades/history', {
        params: { startDate: oneDayAgo }
      });

      if (response1.status === 200) {
        const trades = response1.data.trades;
        const allAfterDate = trades.every((trade: { date: string }) =>
          new Date(trade.date) >= new Date(oneDayAgo)
        );

        this.addResult(
          'Filter by Date (Last 24h)',
          allAfterDate,
          allAfterDate
            ? `Found ${trades.length} trades in last 24 hours`
            : 'Some trades are outside date range',
          { count: trades.length, startDate: oneDayAgo }
        );
      }

      // Test 2: Last 7 days
      const sevenDaysAgo = new Date(Date.now() - 604800000).toISOString();
      const response2 = await this.api.get('/api/trades/history', {
        params: { startDate: sevenDaysAgo }
      });

      if (response2.status === 200) {
        const trades = response2.data.trades;
        const allAfterDate = trades.every((trade: { date: string }) =>
          new Date(trade.date) >= new Date(sevenDaysAgo)
        );

        this.addResult(
          'Filter by Date (Last 7 days)',
          allAfterDate,
          allAfterDate
            ? `Found ${trades.length} trades in last 7 days`
            : 'Some trades are outside date range',
          { count: trades.length, startDate: sevenDaysAgo }
        );
      }

      // Test 3: Date range (3 days ago to 1 day ago)
      const threeDaysAgo = new Date(Date.now() - 259200000).toISOString();
      const response3 = await this.api.get('/api/trades/history', {
        params: {
          startDate: sevenDaysAgo,
          endDate: threeDaysAgo
        }
      });

      if (response3.status === 200) {
        const trades = response3.data.trades;
        const allInRange = trades.every((trade: { date: string }) => {
          const tradeDate = new Date(trade.date);
          return tradeDate >= new Date(sevenDaysAgo) && tradeDate <= new Date(threeDaysAgo);
        });

        this.addResult(
          'Filter by Date Range (7d to 3d ago)',
          allInRange,
          allInRange
            ? `Found ${trades.length} trades in date range`
            : 'Some trades are outside date range',
          { count: trades.length, startDate: sevenDaysAgo, endDate: threeDaysAgo }
        );
      }
    } catch (error) {
      console.error('Error filtering by date range:', error);
      if (axios.isAxiosError(error)) {
        this.addResult('Filter by Date Range', false, `Failed: ${error.response?.data?.error || error.message}`);
      } else {
        this.addResult('Filter by Date Range', false, 'Failed with unknown error');
      }
    }
  }

  /**
   * Test 6: Combined filters
   */
  async testCombinedFilters() {
    try {
      console.log('\n📊 Test 6: Combined filters...');

      // Test: Playbook A + WIN outcome
      const response1 = await this.api.get('/api/trades/history', {
        params: {
          playbook: 'A',
          outcome: 'WIN'
        }
      });

      if (response1.status === 200) {
        const trades = response1.data.trades;
        const allMatch = trades.every((trade: { playbook: string; outcome: string }) =>
          trade.playbook === 'A' && trade.outcome === 'WIN'
        );

        this.addResult(
          'Combined Filter (Playbook A + WIN)',
          allMatch,
          allMatch
            ? `Found ${trades.length} winning trades for playbook A`
            : 'Some trades don\'t match combined filters',
          { count: trades.length }
        );
      }

      // Test: BTCUSDT + Last 7 days
      const sevenDaysAgo = new Date(Date.now() - 604800000).toISOString();
      const response2 = await this.api.get('/api/trades/history', {
        params: {
          symbol: 'BTCUSDT',
          startDate: sevenDaysAgo
        }
      });

      if (response2.status === 200) {
        const trades = response2.data.trades;
        const allMatch = trades.every((trade: { symbol: string; date: string }) =>
          trade.symbol === 'BTCUSDT' && new Date(trade.date) >= new Date(sevenDaysAgo)
        );

        this.addResult(
          'Combined Filter (BTCUSDT + Last 7d)',
          allMatch,
          allMatch
            ? `Found ${trades.length} BTCUSDT trades in last 7 days`
            : 'Some trades don\'t match combined filters',
          { count: trades.length }
        );
      }

      // Test: All filters combined
      const response3 = await this.api.get('/api/trades/history', {
        params: {
          symbol: 'ETHUSDT',
          playbook: 'B',
          outcome: 'WIN',
          startDate: sevenDaysAgo
        }
      });

      if (response3.status === 200) {
        const trades = response3.data.trades;
        const allMatch = trades.every((trade: { symbol: string; playbook: string; outcome: string; date: string }) =>
          trade.symbol === 'ETHUSDT' &&
          trade.playbook === 'B' &&
          trade.outcome === 'WIN' &&
          new Date(trade.date) >= new Date(sevenDaysAgo)
        );

        this.addResult(
          'Combined Filter (All filters)',
          allMatch,
          allMatch
            ? `Found ${trades.length} trades matching all filters`
            : 'Some trades don\'t match all filters',
          { count: trades.length, filters: { symbol: 'ETHUSDT', playbook: 'B', outcome: 'WIN', startDate: sevenDaysAgo } }
        );
      }
    } catch (error) {
      console.error('Error testing combined filters:', error);
      if (axios.isAxiosError(error)) {
        this.addResult('Combined Filters', false, `Failed: ${error.response?.data?.error || error.message}`);
      } else {
        this.addResult('Combined Filters', false, 'Failed with unknown error');
      }
    }
  }

  /**
   * Test 7: Edge cases
   */
  async testEdgeCases() {
    try {
      console.log('\n📊 Test 7: Edge cases...');

      // Test: Non-existent playbook
      const response1 = await this.api.get('/api/trades/history', {
        params: { playbook: 'X' }
      });

      if (response1.status === 200) {
        const trades = response1.data.trades;
        this.addResult(
          'Edge Case (Invalid Playbook)',
          trades.length === 0,
          trades.length === 0
            ? 'Correctly returned empty array for invalid playbook'
            : `Unexpectedly found ${trades.length} trades`,
          { count: trades.length }
        );
      }

      // Test: Non-existent symbol
      const response2 = await this.api.get('/api/trades/history', {
        params: { symbol: 'XYZUSDT' }
      });

      if (response2.status === 200) {
        const trades = response2.data.trades;
        this.addResult(
          'Edge Case (Non-existent Symbol)',
          trades.length === 0,
          trades.length === 0
            ? 'Correctly returned empty array for non-existent symbol'
            : `Unexpectedly found ${trades.length} trades`,
          { count: trades.length }
        );
      }

      // Test: Future date range
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const response3 = await this.api.get('/api/trades/history', {
        params: { startDate: futureDate }
      });

      if (response3.status === 200) {
        const trades = response3.data.trades;
        this.addResult(
          'Edge Case (Future Date)',
          trades.length === 0,
          trades.length === 0
            ? 'Correctly returned empty array for future date'
            : `Unexpectedly found ${trades.length} trades`,
          { count: trades.length }
        );
      }
    } catch (error) {
      console.error('Error testing edge cases:', error);
      if (axios.isAxiosError(error)) {
        this.addResult('Edge Cases', false, `Failed: ${error.response?.data?.error || error.message}`);
      } else {
        this.addResult('Edge Cases', false, 'Failed with unknown error');
      }
    }
  }

  /**
   * Print final summary
   */
  printSummary() {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  Test Suite Summary                                    ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;

    console.log(`📊 Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`📈 Success Rate: ${((passedTests / totalTests) * 100).toFixed(2)}%\n`);

    if (failedTests > 0) {
      console.log('❌ Failed Tests:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`   - ${r.testName}: ${r.message}`);
        });
      console.log();
    }
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  Trade History Endpoint Test Suite                    ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log(`📡 API URL: ${API_URL}\n`);

    // Authenticate first
    const authenticated = await this.authenticate();
    if (!authenticated) {
      console.error('\n❌ Authentication failed. Cannot continue with tests.');
      return;
    }

    // Run all test suites
    await this.testGetAllTradeHistory();
    await this.testFilterByPlaybook();
    await this.testFilterByOutcome();
    await this.testFilterBySymbol();
    await this.testFilterByDateRange();
    await this.testCombinedFilters();
    await this.testEdgeCases();

    // Print summary
    this.printSummary();

    // Exit with appropriate code
    const allPassed = this.results.every(r => r.passed);
    process.exit(allPassed ? 0 : 1);
  }
}

// Run the test suite
const tester = new TradeHistoryEndpointTester();
tester.runAllTests().catch(error => {
  console.error('\n❌ Fatal error running tests:', error);
  process.exit(1);
});
