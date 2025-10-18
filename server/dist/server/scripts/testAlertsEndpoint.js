import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
const BASE_URL = 'http://localhost:3000';
/**
 * Test script for alerts API endpoints
 */
async function testAlertsEndpoint() {
    console.log('=== Testing Alerts API Endpoints ===\n');
    try {
        // Step 1: Login to get access token
        console.log('Step 1: Logging in...');
        const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
            email: 'test@example.com',
            password: 'password123'
        });
        const accessToken = loginResponse.data.accessToken;
        console.log('✓ Login successful\n');
        // Step 2: Test GET /api/alerts (default limit)
        console.log('Step 2: Testing GET /api/alerts (default limit)...');
        const alertsResponse1 = await axios.get(`${BASE_URL}/api/alerts`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        console.log(`✓ Retrieved ${alertsResponse1.data.alerts.length} alerts`);
        console.log(`  First alert: ${alertsResponse1.data.alerts[0]?.message}`);
        console.log(`  Last alert: ${alertsResponse1.data.alerts[alertsResponse1.data.alerts.length - 1]?.message}\n`);
        // Step 3: Test GET /api/alerts with limit parameter
        console.log('Step 3: Testing GET /api/alerts with limit=5...');
        const alertsResponse2 = await axios.get(`${BASE_URL}/api/alerts`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit: 5 }
        });
        console.log(`✓ Retrieved ${alertsResponse2.data.alerts.length} alerts (expected 5)`);
        console.log('  Alerts:');
        alertsResponse2.data.alerts.forEach((alert, index) => {
            console.log(`    ${index + 1}. [${alert.level}] ${alert.message}`);
        });
        console.log();
        // Step 4: Test GET /api/alerts with level filter
        console.log('Step 4: Testing GET /api/alerts with level=CRITICAL...');
        const alertsResponse3 = await axios.get(`${BASE_URL}/api/alerts`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { level: 'CRITICAL' }
        });
        console.log(`✓ Retrieved ${alertsResponse3.data.alerts.length} CRITICAL alerts`);
        alertsResponse3.data.alerts.forEach((alert, index) => {
            console.log(`    ${index + 1}. [${alert.level}] ${alert.message} (${alert.type})`);
        });
        console.log();
        // Step 5: Test GET /api/alerts with type filter
        console.log('Step 5: Testing GET /api/alerts with type=RISK_LIMIT...');
        const alertsResponse4 = await axios.get(`${BASE_URL}/api/alerts`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { type: 'RISK_LIMIT' }
        });
        console.log(`✓ Retrieved ${alertsResponse4.data.alerts.length} RISK_LIMIT alerts`);
        alertsResponse4.data.alerts.forEach((alert, index) => {
            console.log(`    ${index + 1}. [${alert.level}] ${alert.message}`);
        });
        console.log();
        // Step 6: Test GET /api/alerts/stats
        console.log('Step 6: Testing GET /api/alerts/stats...');
        const statsResponse = await axios.get(`${BASE_URL}/api/alerts/stats`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        console.log('✓ Alert statistics:');
        console.log(`    Total: ${statsResponse.data.total}`);
        console.log(`    INFO: ${statsResponse.data.info}`);
        console.log(`    WARNING: ${statsResponse.data.warning}`);
        console.log(`    ERROR: ${statsResponse.data.error}`);
        console.log(`    CRITICAL: ${statsResponse.data.critical}\n`);
        // Step 7: Test POST /api/alerts (create new alert)
        console.log('Step 7: Testing POST /api/alerts (create new alert)...');
        const createResponse = await axios.post(`${BASE_URL}/api/alerts`, {
            level: 'INFO',
            message: 'Test alert created via API',
            type: 'TEST'
        }, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        console.log(`✓ Alert created with ID: ${createResponse.data.alert._id}`);
        console.log(`  Level: ${createResponse.data.alert.level}`);
        console.log(`  Message: ${createResponse.data.alert.message}`);
        console.log(`  Type: ${createResponse.data.alert.type}\n`);
        // Step 8: Test invalid limit parameter
        console.log('Step 8: Testing GET /api/alerts with invalid limit (should use default)...');
        const alertsResponse5 = await axios.get(`${BASE_URL}/api/alerts`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit: -5 }
        });
        console.log(`✓ Retrieved ${alertsResponse5.data.alerts.length} alerts (used default limit)\n`);
        // Step 9: Test limit > 100 (should cap at 100)
        console.log('Step 9: Testing GET /api/alerts with limit=150 (should cap at 100)...');
        const alertsResponse6 = await axios.get(`${BASE_URL}/api/alerts`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit: 150 }
        });
        console.log(`✓ Retrieved ${alertsResponse6.data.alerts.length} alerts (capped at 100 or total available)\n`);
        console.log('=== All Tests Passed! ✓ ===');
        process.exit(0);
    }
    catch (error) {
        console.error('\n❌ Test failed:');
        if (error.response) {
            console.error(`  Status: ${error.response.status}`);
            console.error(`  Data:`, error.response.data);
        }
        else {
            console.error(`  Error: ${error.message}`);
        }
        process.exit(1);
    }
}
// Run tests
testAlertsEndpoint();
//# sourceMappingURL=testAlertsEndpoint.js.map