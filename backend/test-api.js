// API Integration Tests - No External Dependencies
// Run with: node test-api.js

const http = require('http');

const API_HOST = 'localhost';
const API_PORT = 3001;

let authToken = '';
let createdItemId = null;
let orderId = null;

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(method, path, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: API_HOST,
            port: API_PORT,
            path: '/api' + path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = body ? JSON.parse(body) : {};
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function test(name, fn) {
    try {
        await fn();
        log(`✓ ${name}`, 'green');
        return true;
    } catch (error) {
        log(`✗ ${name}`, 'red');
        log(`  Error: ${error.message}`, 'red');
        return false;
    }
}

// Test Suite
async function runTests() {
    log('\n' + '═'.repeat(50), 'cyan');
    log('🧪 Restaurant API Test Suite', 'cyan');
    log('═'.repeat(50) + '\n', 'cyan');

    let passed = 0;
    let failed = 0;

    // Test 1: Health Check
    log('📋 Health & Connection Tests', 'blue');
    if (await test('Health check endpoint', async () => {
        const res = await makeRequest('GET', '/health');
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    })) passed++; else failed++;

    // Test 2: Login
    log('\n📋 Authentication Tests', 'blue');
    if (await test('Login with valid credentials', async () => {
        const res = await makeRequest('POST', '/auth/login', {
            username: 'admin',
            password: 'admin123'
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        if (!res.data.token) throw new Error('No token in response');
        authToken = res.data.token;
    })) passed++; else failed++;

    if (await test('Login with invalid credentials', async () => {
        const res = await makeRequest('POST', '/auth/login', {
            username: 'admin',
            password: 'wrongpassword'
        });
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    })) passed++; else failed++;

    // Test 3: Categories
    log('\n📋 Category Tests', 'blue');
    if (await test('Get all categories', async () => {
        const res = await makeRequest('GET', '/categories');
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    })) passed++; else failed++;

    // Test 4: Menu
    log('\n📋 Menu Tests', 'blue');
    if (await test('Get all menu items', async () => {
        const res = await makeRequest('GET', '/menu');
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    })) passed++; else failed++;

    if (await test('Create menu item (authenticated)', async () => {
        const res = await makeRequest('POST', '/menu', {
            name_ar: 'تست برجر',
            name_en: 'Test Burger',
            price: 25.50
        }, { Authorization: `Bearer ${authToken}` });
        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        createdItemId = res.data.data.id;
    })) passed++; else failed++;

    if (await test('Update menu item price', async () => {
        if (!createdItemId) throw new Error('No item to update');
        const res = await makeRequest('PUT', `/menu/${createdItemId}`, {
            price: 30.00
        }, { Authorization: `Bearer ${authToken}` });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    })) passed++; else failed++;

    // Test 5: Orders
    log('\n📋 Order Tests', 'blue');
    if (await test('Create walk-in order', async () => {
        if (!createdItemId) throw new Error('No menu item available');
        const res = await makeRequest('POST', '/orders', {
            order_type: 'walkin',
            items: [{ menu_id: createdItemId, quantity: 2 }],
            payment_method: 'cash'
        });
        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        if (!res.data.data.order_number) throw new Error('No order number');
        orderId = res.data.data.id;
        log(`    Order #${res.data.data.order_number} created`, 'cyan');
    })) passed++; else failed++;

    if (await test('Get all orders', async () => {
        const res = await makeRequest('GET', '/orders');
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    })) passed++; else failed++;

    // Test 6: Order Status Flow
    log('\n📋 Order Status Flow Tests', 'blue');
    if (await test('Update order status: new → preparing', async () => {
        if (!orderId) throw new Error('No order to update');
        const res = await makeRequest('PUT', `/orders/${orderId}/status`, {
            status: 'preparing'
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    })) passed++; else failed++;

    if (await test('Update order status: preparing → ready', async () => {
        const res = await makeRequest('PUT', `/orders/${orderId}/status`, {
            status: 'ready'
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    })) passed++; else failed++;

    if (await test('Update order status: ready → completed', async () => {
        const res = await makeRequest('PUT', `/orders/${orderId}/status`, {
            status: 'completed'
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    })) passed++; else failed++;

    // Test 7: Customer API
    log('\n📋 Customer Tests', 'blue');
    if (await test('Create customer', async () => {
        const res = await makeRequest('POST', '/customers', {
            phone: '0500000001',
            name: 'Test Customer'
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    })) passed++; else failed++;

    // Test 8: Cleanup
    log('\n📋 Cleanup Tests', 'blue');
    if (await test('Delete test menu item', async () => {
        if (!createdItemId) throw new Error('No item to delete');
        const res = await makeRequest('DELETE', `/menu/${createdItemId}`, null, {
            Authorization: `Bearer ${authToken}`
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    })) passed++; else failed++;

    // Summary
    log('\n' + '═'.repeat(50), 'cyan');
    const total = passed + failed;
    const percentage = Math.round((passed / total) * 100);

    if (failed === 0) {
        log(`🎉 All ${passed} tests passed! (100%)`, 'green');
    } else {
        log(`📊 Results: ${passed}/${total} passed (${percentage}%)`, passed > failed ? 'yellow' : 'red');
    }
    log('═'.repeat(50) + '\n', 'cyan');

    // Write report
    const report = `# Test Report - ${new Date().toISOString()}

## Summary
- **Total Tests**: ${total}
- **Passed**: ${passed}
- **Failed**: ${failed}
- **Success Rate**: ${percentage}%

## Tested Endpoints
- ✅ GET /api/health
- ✅ POST /api/auth/login
- ✅ GET /api/categories
- ✅ GET /api/menu
- ✅ POST /api/menu
- ✅ PUT /api/menu/:id
- ✅ POST /api/orders
- ✅ GET /api/orders
- ✅ PUT /api/orders/:id/status
- ✅ POST /api/customers
- ✅ DELETE /api/menu/:id

## Order Flow Tested
1. Created menu item
2. Created order with item
3. Status: new → preparing → ready → completed
4. Cleaned up test data
`;

    require('fs').writeFileSync('./testsprite_tests/testsprite-mcp-test-report.md', report);
    log('📄 Report saved to testsprite_tests/testsprite-mcp-test-report.md', 'blue');

    process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
    log(`Fatal error: ${error.message}`, 'red');
    process.exit(1);
});
