# Testing Guide

## Quick Start with TestSprite

After you restart your IDE to load the TestSprite MCP server, you can use it to test the restaurant system.

## Running Manual Tests

### 1. Start All Services

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - POS
cd pos
npm run dev

# Terminal 3 - Website
cd website
npm run dev

# Terminal 4 - KDS
cd kds
npm run dev
```

### 2. Run API Tests

```bash
cd backend
node test-api.js
```

Expected output:
```
🧪 Starting API Tests...

✓ Login with valid credentials
✓ Get all menu items
✓ Get all categories
✓ Create menu item (authenticated)
✓ Update menu item price
✓ Create walk-in order
✓ Get all orders
✓ Update order status to preparing
✓ Update order status to ready
✓ Update order status to completed
✓ Delete test menu item

========================================
Tests Complete: 11 passed, 0 failed
========================================
```

## Manual Testing Checklist

### POS Testing
- [ ] Login with `admin` / `admin123`
- [ ] View dashboard statistics
- [ ] Create a new walk-in order
- [ ] View orders list
- [ ] Update order status
- [ ] Add menu item
- [ ] Edit menu item
- [ ] Edit menu item
- [ ] Toggle item availability

### Shift Management
- [ ] Open a shift (Enter starting cash)
- [ ] Try creating order without shift (Should block)
- [ ] Close shift (Enter actual cash)
- [ ] Review Shift History (Admin)
- [ ] Export Shift Report (Admin)

### User Management (Admin Only)
- [ ] Login as `admin`
- [ ] Navigate to "Users" page
- [ ] Create new cashier user
- [ ] Edit existing user
- [ ] Toggle user status (Active/Inactive)
- [ ] Verify cashier cannot access "Users" page

### Cashier Performance
- [ ] Navigate to "Cashier Performance" page (Admin/Manager)
- [ ] View daily summary cards
- [ ] Check individual cashier metrics
- [ ] Verify data accuracy against completed orders

### Website Testing
- [ ] Browse menu items
- [ ] Filter by category
- [ ] Add items to cart
- [ ] View cart
- [ ] Checkout with customer info
- [ ] Track order by ID
- [ ] Receive real-time status updates

### KDS Testing
- [ ] View active orders on load
- [ ] Receive new order (create from POS/Website)
- [ ] Click "بدء التحضير" - verify status changes
- [ ] Click "جاهز" - verify status changes
- [ ] Click "تم التسليم" - verify order disappears

## Common Issues

### Backend not starting
- Check if port 3001 is already in use
- Run: `taskkill /F /IM node.exe` to kill all Node processes

### Frontend not loading data
- Verify backend is running
- Check browser console for errors
- Verify API_URL in vite.config.js

### Socket.io not connecting
- Check CORS settings in backend
- Verify socket URL matches backend URL

## Test Scenarios

### Full Order Flow
1. Open Website (localhost:3000)
2. Add items to cart
3. Checkout with phone/name
4. Open KDS (localhost:3003) - order should appear
5. Click "بدء التحضير" in KDS
6. Check order tracking page - status should update
7. Click "جاهز" in KDS
8. Open POS (localhost:3002) - mark as completed

### Concurrent Orders
1. Create 3 orders simultaneously from Website
2. Verify all appear in KDS
3. Verify order numbers are unique
4. Process each order through KDS

## Performance Testing

```bash
# Install Apache Bench
# Windows: Download from https://www.apachelounge.com/

# Test API endpoint
ab -n 100 -c 10 http://localhost:3001/api/menu

# Expected: All requests successful, avg time < 100ms
```

## TestSprite Usage

Once TestSprite MCP is loaded, you can:

1. Ask me to "Test the login API"
2. Ask me to "Run all API tests"
3. Ask me to "Test order creation flow"
4. Ask me to "Generate test report"

I'll use TestSprite to automatically validate endpoints and verify responses.

For more details, see [TESTING.md](./TESTING.md)
