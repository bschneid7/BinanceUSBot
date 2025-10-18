/**
 * Test script for analytics endpoints
 * Tests performance metrics and equity curve endpoints
 */
import axios from 'axios';
const BASE_URL = 'http://localhost:3000';
// Test credentials (adjust based on your setup)
const TEST_USER = {
    email: 'test@example.com',
    password: 'password123'
};
const results = [];
async function runTests() {
    console.log('='.repeat(60));
    console.log('Analytics Endpoints Test Suite');
    console.log('='.repeat(60));
    console.log('');
    let accessToken = '';
    try {
        // Test 1: Login
        console.log('Test 1: User Login');
        console.log('-'.repeat(60));
        try {
            const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, TEST_USER);
            accessToken = loginResponse.data.accessToken;
            console.log('✓ Login successful');
            console.log(`  Access token: ${accessToken.substring(0, 20)}...`);
            results.push({ name: 'User Login', passed: true });
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('✗ Login failed:', error.response?.data?.error || error.message);
                results.push({
                    name: 'User Login',
                    passed: false,
                    error: error.response?.data?.error || error.message
                });
            }
            console.log('');
            console.log('Cannot proceed without authentication. Please ensure:');
            console.log('1. Server is running on port 3000');
            console.log('2. Test user exists with credentials:', TEST_USER);
            console.log('3. Run: npm run seed:database (from server directory) to create test data');
            return;
        }
        console.log('');
        // Test 2: Get Performance Metrics
        console.log('Test 2: Get Performance Metrics');
        console.log('-'.repeat(60));
        try {
            const perfResponse = await axios.get(`${BASE_URL}/api/analytics/performance`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const { metrics } = perfResponse.data;
            console.log('✓ Performance metrics retrieved successfully');
            console.log('  Metrics:', {
                total_trades: metrics.total_trades,
                win_rate: `${metrics.win_rate}%`,
                profit_factor: metrics.profit_factor,
                average_r: `${metrics.average_r}R`,
                max_drawdown_r: `${metrics.max_drawdown_r}R`,
                sharpe_ratio: metrics.sharpe_ratio,
                best_trade_r: `${metrics.best_trade_r}R`,
                worst_trade_r: `${metrics.worst_trade_r}R`
            });
            console.log('  Time-based metrics:', {
                today: `${metrics.today_trades} trades (${metrics.today_wins}W / ${metrics.today_losses}L)`,
                week: `${metrics.week_trades} trades (${metrics.week_wins}W / ${metrics.week_losses}L)`,
                month: `${metrics.month_trades} trades (${metrics.month_wins}W / ${metrics.month_losses}L)`
            });
            // Validate metrics structure
            const requiredFields = [
                'total_trades', 'win_rate', 'profit_factor', 'average_r', 'max_drawdown_r',
                'sharpe_ratio', 'best_trade_r', 'worst_trade_r', 'today_trades', 'today_wins',
                'today_losses', 'week_trades', 'week_wins', 'week_losses', 'month_trades',
                'month_wins', 'month_losses'
            ];
            const missingFields = requiredFields.filter(field => !(field in metrics));
            if (missingFields.length > 0) {
                throw new Error(`Missing fields: ${missingFields.join(', ')}`);
            }
            results.push({ name: 'Get Performance Metrics', passed: true, data: metrics });
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('✗ Failed:', error.response?.data?.error || error.message);
                results.push({
                    name: 'Get Performance Metrics',
                    passed: false,
                    error: error.response?.data?.error || error.message
                });
            }
        }
        console.log('');
        // Test 3: Get Equity Curve (default 30 days)
        console.log('Test 3: Get Equity Curve (30 days)');
        console.log('-'.repeat(60));
        try {
            const equityResponse = await axios.get(`${BASE_URL}/api/analytics/equity-curve`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const { data } = equityResponse.data;
            console.log('✓ Equity curve retrieved successfully');
            console.log(`  Data points: ${data.length}`);
            console.log(`  Date range: ${data[0]?.date} to ${data[data.length - 1]?.date}`);
            console.log(`  Equity range: $${data[0]?.equity} to $${data[data.length - 1]?.equity}`);
            if (data.length > 0) {
                console.log('  First 3 data points:');
                data.slice(0, 3).forEach((point) => {
                    console.log(`    ${point.date}: $${point.equity.toFixed(2)}`);
                });
            }
            // Validate structure
            if (!Array.isArray(data)) {
                throw new Error('Data is not an array');
            }
            if (data.length > 0 && (!data[0].date || typeof data[0].equity !== 'number')) {
                throw new Error('Invalid data point structure');
            }
            results.push({ name: 'Get Equity Curve (30 days)', passed: true, data: { points: data.length } });
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('✗ Failed:', error.response?.data?.error || error.message);
                results.push({
                    name: 'Get Equity Curve (30 days)',
                    passed: false,
                    error: error.response?.data?.error || error.message
                });
            }
        }
        console.log('');
        // Test 4: Get Equity Curve (custom 7 days)
        console.log('Test 4: Get Equity Curve (7 days)');
        console.log('-'.repeat(60));
        try {
            const equityResponse = await axios.get(`${BASE_URL}/api/analytics/equity-curve?days=7`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const { data } = equityResponse.data;
            console.log('✓ Equity curve (7 days) retrieved successfully');
            console.log(`  Data points: ${data.length}`);
            console.log(`  Date range: ${data[0]?.date} to ${data[data.length - 1]?.date}`);
            // Should have 8 data points (day 0 to day 7)
            if (data.length !== 8) {
                console.log(`  ⚠ Warning: Expected 8 data points, got ${data.length}`);
            }
            results.push({ name: 'Get Equity Curve (7 days)', passed: true, data: { points: data.length } });
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('✗ Failed:', error.response?.data?.error || error.message);
                results.push({
                    name: 'Get Equity Curve (7 days)',
                    passed: false,
                    error: error.response?.data?.error || error.message
                });
            }
        }
        console.log('');
        // Test 5: Get Equity Curve (invalid parameter)
        console.log('Test 5: Get Equity Curve (invalid parameter)');
        console.log('-'.repeat(60));
        try {
            await axios.get(`${BASE_URL}/api/analytics/equity-curve?days=500`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            console.error('✗ Should have rejected invalid days parameter');
            results.push({
                name: 'Get Equity Curve (invalid parameter)',
                passed: false,
                error: 'Should have rejected days > 365'
            });
        }
        catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 400) {
                console.log('✓ Correctly rejected invalid days parameter');
                console.log(`  Error: ${error.response.data.error}`);
                results.push({ name: 'Get Equity Curve (invalid parameter)', passed: true });
            }
            else {
                console.error('✗ Unexpected error:', error);
                results.push({
                    name: 'Get Equity Curve (invalid parameter)',
                    passed: false,
                    error: 'Unexpected error type'
                });
            }
        }
        console.log('');
        // Test 6: Unauthorized access
        console.log('Test 6: Unauthorized Access');
        console.log('-'.repeat(60));
        try {
            await axios.get(`${BASE_URL}/api/analytics/performance`);
            console.error('✗ Should have rejected unauthorized request');
            results.push({
                name: 'Unauthorized Access',
                passed: false,
                error: 'Should have required authentication'
            });
        }
        catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 401) {
                console.log('✓ Correctly rejected unauthorized request');
                results.push({ name: 'Unauthorized Access', passed: true });
            }
            else {
                console.error('✗ Unexpected error:', error);
                results.push({
                    name: 'Unauthorized Access',
                    passed: false,
                    error: 'Unexpected error type'
                });
            }
        }
        console.log('');
    }
    catch (error) {
        console.error('Unexpected error during tests:', error);
    }
    // Print summary
    console.log('='.repeat(60));
    console.log('Test Results Summary');
    console.log('='.repeat(60));
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    console.log(`Total: ${results.length} tests`);
    console.log(`✓ Passed: ${passed}`);
    console.log(`✗ Failed: ${failed}`);
    console.log('');
    if (failed > 0) {
        console.log('Failed tests:');
        results.filter(r => !r.passed).forEach(r => {
            console.log(`  - ${r.name}: ${r.error}`);
        });
        console.log('');
    }
    console.log('='.repeat(60));
    process.exit(failed > 0 ? 1 : 0);
}
// Run tests
runTests().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=testAnalyticsEndpoints.js.map